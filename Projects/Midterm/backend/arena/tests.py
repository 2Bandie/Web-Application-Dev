import asyncio
from datetime import timedelta
from unittest.mock import patch
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as ModelValidationError
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import AccessToken
from config.asgi import application
from .models import Room, Participation, Hit, Song, Profile, validate_chart
from .services import record_hit, finish_if_due, elapsed


class ApiTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user("host", password="Test-beat-945!")
        self.rival = User.objects.create_user("rival", password="Test-beat-945!")
        self.song = Song.objects.first()
        self.client = APIClient()
        self.client.force_authenticate(self.host)
        self.room = Room.objects.create(host=self.host, song=self.song)
        Participation.objects.create(room=self.room, user=self.host)
        self.url = f"/api/rooms/{self.room.code}/"

    def test_registration_creates_profile_and_rejects_duplicate_and_weak_password(self):
        client = APIClient()
        self.assertEqual(
            client.post(
                "/api/register/", {"username": "newbie", "password": "123"}
            ).status_code,
            400,
        )
        self.assertEqual(
            client.post(
                "/api/register/",
                {"username": "newbie", "password": "Good-password-725!"},
            ).status_code,
            201,
        )
        self.assertTrue(Profile.objects.filter(user__username="newbie").exists())
        self.assertEqual(
            client.post(
                "/api/register/",
                {"username": "newbie", "password": "Good-password-725!"},
            ).status_code,
            400,
        )

    def test_jwt_required_and_login(self):
        client = APIClient()
        self.assertEqual(client.get("/api/songs/").status_code, 401)
        response = client.post(
            "/api/token/", {"username": "host", "password": "Test-beat-945!"}
        )
        self.assertEqual(response.status_code, 200)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(client.get("/api/me/").data["username"], "host")
        self.assertEqual(
            client.post(
                "/api/token/refresh/", {"refresh": response.data["refresh"]}
            ).status_code,
            200,
        )

    def test_room_validation_and_membership(self):
        self.assertEqual(
            self.client.post("/api/rooms/", {"song_id": 999999}).status_code, 400
        )
        self.client.force_authenticate(self.rival)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.post(self.url + "join/").status_code, 200)
        self.assertEqual(self.client.post(self.url + "join/").status_code, 200)
        self.assertEqual(self.room.participants.count(), 2)

    def test_host_only_start_and_everyone_ready(self):
        self.assertEqual(self.client.post(self.url + "start/").status_code, 400)
        self.client.post(self.url + "ready/", {"ready": True})
        self.client.force_authenticate(self.rival)
        self.client.post(self.url + "join/")
        self.client.post(self.url + "ready/", {"ready": True})
        self.assertEqual(self.client.post(self.url + "start/").status_code, 403)
        self.client.force_authenticate(self.host)
        self.assertEqual(self.client.post(self.url + "start/").status_code, 200)
        self.assertEqual(
            self.client.post(self.url + "ready/", {"ready": False}).status_code, 400
        )
        self.assertEqual(self.client.post(self.url + "start/").status_code, 400)

    def test_capacity_and_late_join(self):
        for i in range(3):
            player = User.objects.create_user(f"player{i}")
            Participation.objects.create(room=self.room, user=player)
        self.client.force_authenticate(self.rival)
        self.assertEqual(self.client.post(self.url + "join/").status_code, 400)
        self.room.status = "running"
        self.room.save()
        self.assertEqual(self.client.post(self.url + "join/").status_code, 400)

    def begin(self):
        self.room.status = "running"
        self.room.starts_at = timezone.now()
        self.room.save()

    def test_authoritative_judgement_and_duplicate_protection(self):
        self.begin()
        with patch("arena.services.elapsed", return_value=1500):
            result = record_hit(self.room.code, self.host, 0, 0)
            self.assertEqual(result["grade"], "perfect")
            with self.assertRaises(ValidationError):
                record_hit(self.room.code, self.host, 0, 0)
        p = self.room.participants.get(user=self.host)
        self.assertEqual(p.score, 1000)
        self.assertEqual(Hit.objects.count(), 1)
        with patch("arena.services.elapsed", return_value=2250):
            self.assertEqual(
                record_hit(self.room.code, self.host, 1, 1)["grade"], "good"
            )
        p.refresh_from_db()
        self.assertEqual(p.score, 1600)
        self.assertEqual(p.max_combo, 2)

    def test_timing_lane_types_and_index_validation(self):
        self.begin()
        with patch("arena.services.elapsed", return_value=1500):
            for note, lane in [
                (-1, 0),
                (10000, 0),
                (True, 0),
                (0, True),
                (0, 9),
                (0, "0"),
                (0, 1),
            ]:
                with self.subTest(note=note, lane=lane), self.assertRaises(
                    ValidationError
                ):
                    record_hit(self.room.code, self.host, note, lane)
        with patch("arena.services.elapsed", return_value=0), self.assertRaises(
            ValidationError
        ):
            record_hit(self.room.code, self.host, 0, 0)
        self.assertEqual(Hit.objects.count(), 0)

    def test_skipped_notes_break_combo_and_finish_is_idempotent(self):
        self.begin()
        with patch("arena.services.elapsed", return_value=1500):
            record_hit(self.room.code, self.host, 0, 0)
        with patch("arena.services.elapsed", return_value=2700):
            record_hit(self.room.code, self.host, 2, 2)
        p = self.room.participants.get(user=self.host)
        self.assertEqual(p.combo, 1)
        self.assertEqual(p.max_combo, 1)
        self.room.starts_at = timezone.now() - timedelta(minutes=3)
        self.room.save()
        finish_if_due(self.room.code)
        finish_if_due(self.room.code)
        p.refresh_from_db()
        self.assertTrue(p.finished)
        self.assertAlmostEqual(p.accuracy, 6.25)
        board = self.client.get("/api/leaderboard/").data
        self.assertAlmostEqual(board[0]["best_accuracy"], 6.25)
        self.assertEqual(len(self.client.get("/api/history/").data), 1)

    def test_leaderboard_excludes_unfinished_and_uses_best_per_player(self):
        self.assertEqual(self.client.get("/api/leaderboard/").data, [])
        p = self.room.participants.get(user=self.host)
        p.finished = True
        p.score = 1200
        p.accuracy = 3.75
        p.save()
        second = Room.objects.create(host=self.host, song=self.song, status="finished")
        Participation.objects.create(
            room=second, user=self.host, score=500, accuracy=1.5625, finished=True
        )
        board = self.client.get("/api/leaderboard/").data
        self.assertEqual(len(board), 1)
        self.assertEqual(board[0]["best_accuracy"], 3.75)

    def test_solo_starts_selected_song_and_remains_private(self):
        song = Song.objects.get(title="Overdrive")
        response = self.client.post("/api/rooms/solo/", {"song_id": song.id})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["song"]["id"], song.id)
        self.assertEqual(response.data["mode"], "solo")
        self.assertEqual(response.data["status"], "running")
        self.assertTrue(response.data["participants"][0]["ready"])
        room = Room.objects.get(code=response.data["code"])
        self.assertGreater(room.starts_at, timezone.now())
        self.assertEqual(room.participants.count(), 1)
        self.client.force_authenticate(self.rival)
        self.assertEqual(
            self.client.post(f"/api/rooms/{room.code}/join/").status_code, 400
        )
        room.refresh_from_db()
        self.assertEqual(room.participants.count(), 1)
        self.assertEqual(
            self.client.post("/api/rooms/solo/", {"song_id": 999999}).status_code, 400
        )
        self.assertEqual(
            APIClient().post("/api/rooms/solo/", {"song_id": song.id}).status_code, 401
        )

    def test_solo_creation_rolls_back_if_start_fails(self):
        count = Room.objects.count()
        with patch(
            "arena.views.start_room", side_effect=ValidationError("Cannot start")
        ):
            self.assertEqual(
                self.client.post(
                    "/api/rooms/solo/", {"song_id": self.song.id}
                ).status_code,
                400,
            )
        self.assertEqual(Room.objects.count(), count)

    def test_longer_tracks_have_valid_musical_grids_and_expert_density(self):
        self.assertEqual(Song.objects.count(), 4)
        hard = Song.objects.get(title="Midnight Drive")
        expert = Song.objects.get(title="Overdrive")
        self.assertGreater(hard.duration_ms, 45000)
        self.assertGreater(expert.duration_ms, hard.duration_ms)
        self.assertEqual(expert.difficulty, "expert")
        self.assertGreater(
            len(expert.chart) / expert.duration_ms, len(hard.chart) / hard.duration_ms
        )
        self.assertEqual(hard.arrangement, "house")
        self.assertEqual(expert.arrangement, "breakbeat")
        for song in (hard, expert):
            song.full_clean()
            self.assertGreater(song.duration_ms, song.chart[-1]["time"] + 500)

    def test_live_accuracy_counts_judged_notes_and_misses(self):
        self.begin()
        with patch("arena.services.elapsed", return_value=1500):
            record_hit(self.room.code, self.host, 0, 0)
        self.room.starts_at = timezone.now() - timedelta(milliseconds=1600)
        self.room.save()
        response = self.client.get(self.url)
        self.assertEqual(response.data["participants"][0]["accuracy"], 100)
        self.room.starts_at = timezone.now() - timedelta(milliseconds=2400)
        self.room.save()
        response = self.client.get(self.url)
        self.assertEqual(response.data["participants"][0]["accuracy"], 50)
        self.room.starts_at = timezone.now() - timedelta(minutes=3)
        self.room.save()
        response = self.client.get(self.url)
        self.assertEqual(response.data["participants"][0]["accuracy"], 3.125)

    def test_accuracy_leaderboard_separates_songs_and_ignores_raw_score_advantage(self):
        p = self.room.participants.get(user=self.host)
        p.score, p.accuracy, p.finished = 16000, 50, True
        p.save()
        long_room = Room.objects.create(
            host=self.rival, song=Song.objects.get(title="Overdrive"), status="finished"
        )
        Participation.objects.create(
            room=long_room, user=self.rival, score=200000, accuracy=40, finished=True
        )
        Participation.objects.create(
            room=long_room, user=self.host, score=150000, accuracy=30, finished=True
        )
        board = self.client.get("/api/leaderboard/").data
        self.assertEqual(board[0]["user_id"], self.host.id)
        self.assertEqual(board[0]["best_accuracy"], 50)
        self.assertEqual(board[0]["song_title"], self.song.title)
        self.assertEqual(len(board), 3)

    def test_chart_validation(self):
        for chart in [
            [],
            [{"time": 0, "lane": 4}],
            [{"time": 5, "lane": 0}, {"time": 5, "lane": 1}],
            [{"time": True, "lane": 0}],
        ]:
            with self.assertRaises(ModelValidationError):
                validate_chart(chart)
        for song in Song.objects.all():
            song.full_clean()


class SoloControlTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user("solo-controls")
        self.other = User.objects.create_user("not-the-player")
        self.client = APIClient()
        self.client.force_authenticate(self.host)
        self.room = Room.objects.create(
            host=self.host,
            song=Song.objects.first(),
            mode="solo",
            status="running",
            starts_at=timezone.now() - timedelta(milliseconds=1500),
        )
        Participation.objects.create(room=self.room, user=self.host, ready=True)
        self.url = f"/api/rooms/{self.room.code}/"

    def test_pause_freezes_position_accuracy_and_completion_then_resume_shifts_origin(
        self,
    ):
        now = timezone.now()
        with patch("arena.services.timezone.now", return_value=now):
            record_hit(self.room.code, self.host, 0, 0)
            self.assertEqual(self.client.post(self.url + "pause/").status_code, 200)
            self.room.refresh_from_db()
            position = elapsed(self.room)
            stamp = self.room.paused_at
        later = now + timedelta(minutes=10)
        with patch("arena.services.timezone.now", return_value=later):
            self.assertEqual(elapsed(self.room), position)
            self.assertEqual(finish_if_due(self.room.code).status, "paused")
            response = self.client.get(self.url)
            self.assertEqual(response.data["participants"][0]["accuracy"], 100)
            # Duplicate pause must not move the frozen timestamp.
            self.client.post(self.url + "pause/")
            self.room.refresh_from_db()
            self.assertEqual(self.room.paused_at, stamp)
            with self.assertRaises(ValidationError):
                record_hit(self.room.code, self.host, 1, 1)
            self.assertEqual(self.client.post(self.url + "resume/").status_code, 200)
            self.room.refresh_from_db()
            self.assertEqual(self.room.status, "running")
            self.assertIsNone(self.room.paused_at)
            self.assertAlmostEqual(elapsed(self.room), position)
            with patch("arena.services.elapsed", return_value=2100):
                record_hit(self.room.code, self.host, 1, 1)
        self.assertEqual(self.room.participants.get().score, 2000)

    def test_pausing_initial_countdown_preserves_remaining_time(self):
        now = timezone.now()
        self.room.starts_at = now + timedelta(seconds=2)
        self.room.save()
        with patch("arena.services.timezone.now", return_value=now):
            self.client.post(self.url + "pause/")
        with patch(
            "arena.services.timezone.now", return_value=now + timedelta(seconds=20)
        ):
            self.client.post(self.url + "resume/")
            self.room.refresh_from_db()
            self.assertEqual(elapsed(self.room), -2000)

    def test_restart_creates_clean_attempt_on_same_song_and_old_packets_cannot_score(
        self,
    ):
        with patch("arena.services.elapsed", return_value=1500):
            record_hit(self.room.code, self.host, 0, 0)
        self.client.post(self.url + "pause/")
        response = self.client.post(self.url + "restart/")
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data["code"], self.room.code)
        self.assertEqual(response.data["song"]["id"], self.room.song_id)
        self.assertEqual(response.data["mode"], "solo")
        self.assertEqual(response.data["status"], "running")
        self.assertEqual(response.data["participants"][0]["score"], 0)
        self.assertEqual(response.data["participants"][0]["max_combo"], 0)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, "abandoned")
        with self.assertRaises(ValidationError):
            record_hit(self.room.code, self.host, 1, 1)
        self.assertEqual(self.client.get("/api/history/").data, [])
        self.assertEqual(self.client.get("/api/leaderboard/").data, [])

    def test_quit_abandons_attempt_without_completed_result(self):
        self.client.post(self.url + "pause/")
        response = self.client.post(self.url + "quit/")
        self.assertEqual(response.data["status"], "abandoned")
        self.assertIsNone(response.data["paused_at"])
        self.assertFalse(self.room.participants.get().finished)
        self.assertEqual(self.client.get("/api/history/").data, [])
        self.assertEqual(self.client.get("/api/leaderboard/").data, [])
        self.assertEqual(self.client.post(self.url + "resume/").status_code, 400)
        self.assertEqual(self.client.post(self.url + "restart/").status_code, 400)

    def test_solo_only_controls_enforce_permissions(self):
        self.client.force_authenticate(self.other)
        for action in ("pause", "resume", "restart", "quit"):
            self.assertEqual(self.client.post(self.url + action + "/").status_code, 404)
        self.client.force_authenticate(self.host)
        self.room.mode = "multiplayer"
        self.room.save()
        for action in ("pause", "resume", "restart", "quit"):
            self.assertEqual(self.client.post(self.url + action + "/").status_code, 400)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, "running")

    def test_restart_completed_song_preserves_its_historical_result(self):
        self.room.starts_at = timezone.now() - timedelta(minutes=3)
        self.room.save()
        finish_if_due(self.room.code)
        response = self.client.post(self.url + "restart/")
        self.assertEqual(response.status_code, 200)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, "finished")
        self.assertTrue(self.room.participants.get().finished)
        self.assertEqual(len(self.client.get("/api/history/").data), 1)

    def test_restart_is_atomic_if_new_start_fails(self):
        with patch(
            "arena.services.start_room", side_effect=ValidationError("Cannot start")
        ):
            self.assertEqual(self.client.post(self.url + "restart/").status_code, 400)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, "running")
        self.assertEqual(Room.objects.count(), 1)


class SocketTests(TransactionTestCase):
    def setUp(self):
        self.host = User.objects.create_user("socket-host")
        self.rival = User.objects.create_user("socket-rival")
        self.outsider = User.objects.create_user("outsider")
        song, _ = Song.objects.get_or_create(
            title="Socket test",
            defaults={
                "bpm": 100,
                "chart": [{"time": 1500, "lane": 0}],
                "duration_ms": 3000,
            },
        )
        self.room = Room.objects.create(host=self.host, song=song)
        Participation.objects.create(room=self.room, user=self.host)
        Participation.objects.create(room=self.room, user=self.rival)

    def socket(self):
        return WebsocketCommunicator(
            application,
            f"/ws/rooms/{self.room.code}/",
            headers=[(b"origin", b"http://localhost:5500")],
        )

    def test_socket_auth_and_membership(self):
        token = str(AccessToken.for_user(self.outsider))

        async def check():
            ws = self.socket()
            self.assertTrue((await ws.connect())[0])
            await ws.send_json_to({"type": "auth", "token": token})
            self.assertEqual((await ws.receive_json_from())["type"], "error")
            await ws.disconnect()

        async_to_sync(check)()

    def test_two_sockets_share_state_and_reconnect(self):
        tokens = [str(AccessToken.for_user(u)) for u in (self.host, self.rival)]

        async def check():
            sockets = [self.socket(), self.socket()]
            for ws, token in zip(sockets, tokens):
                self.assertTrue((await ws.connect())[0])
                await ws.send_json_to({"type": "auth", "token": token})
                packet = await ws.receive_json_from()
                self.assertEqual(packet["room"]["code"], self.room.code)
                self.assertEqual(len(packet["room"]["participants"]), 2)
            await sockets[0].send_json_to({"type": "hit", "note": 0, "lane": 0})
            self.assertEqual(
                (await sockets[0].receive_json_from())["type"], "input_rejected"
            )
            await sockets[0].disconnect()
            ws = self.socket()
            await ws.connect()
            await ws.send_json_to({"type": "auth", "token": tokens[0]})
            self.assertEqual((await ws.receive_json_from())["room"]["status"], "lobby")
            await ws.disconnect()
            await sockets[1].disconnect()

        async_to_sync(check)()

    def test_timing_rejection_is_readable_gameplay_feedback_and_real_validation_is_clean(
        self,
    ):
        self.room.status = "running"
        self.room.starts_at = timezone.now()
        self.room.save()
        token = str(AccessToken.for_user(self.host))

        async def check():
            ws = self.socket()
            await ws.connect()
            await ws.send_json_to({"type": "auth", "token": token})
            await ws.receive_json_from()
            await ws.send_json_to({"type": "hit", "note": 0, "lane": 0})
            packet = await ws.receive_json_from()
            self.assertEqual(packet["type"], "input_rejected")
            self.assertEqual(packet["reason"], "timing")
            self.assertIn("Too early", packet["message"])
            self.assertNotIn("ErrorDetail", packet["message"])
            await asyncio.sleep(0.03)
            await ws.send_json_to({"type": "hit", "note": -1, "lane": 0})
            packet = await ws.receive_json_from()
            self.assertEqual(packet["type"], "error")
            self.assertEqual(packet["message"], "Invalid note or lane.")
            await ws.disconnect()

        async_to_sync(check)()

    def test_disallowed_origin_rejected(self):
        async def check():
            ws = WebsocketCommunicator(
                application,
                f"/ws/rooms/{self.room.code}/",
                headers=[(b"origin", b"https://untrusted.example")],
            )
            self.assertFalse((await ws.connect())[0])
            await ws.disconnect()

        async_to_sync(check)()


class DeploymentTests(TestCase):
    def test_health_is_public_and_checks_the_database(self):
        client = APIClient()
        response = client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_health_does_not_expose_database_failures(self):
        from django.db import DatabaseError

        with patch(
            "config.health.connection.cursor",
            side_effect=DatabaseError("private details"),
        ):
            response = APIClient().get("/api/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})

    def test_github_pages_origin_can_preflight_the_api(self):
        from django.test import override_settings

        with override_settings(CORS_ALLOWED_ORIGINS=["https://2bandie.github.io"]):
            response = APIClient().options(
                "/api/token/",
                HTTP_ORIGIN="https://2bandie.github.io",
                HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
                HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,authorization",
            )
            self.assertEqual(
                response["Access-Control-Allow-Origin"], "https://2bandie.github.io"
            )
            blocked = APIClient().options(
                "/api/token/",
                HTTP_ORIGIN="https://untrusted.example",
                HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            )
            self.assertNotIn("Access-Control-Allow-Origin", blocked)
