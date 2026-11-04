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
from .services import record_hit, finish_if_due


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
        self.assertEqual(board[0]["best_score"], 2000)
        self.assertEqual(len(self.client.get("/api/history/").data), 1)

    def test_leaderboard_excludes_unfinished_and_uses_best_per_player(self):
        self.assertEqual(self.client.get("/api/leaderboard/").data, [])
        p = self.room.participants.get(user=self.host)
        p.finished = True
        p.score = 1200
        p.save()
        second = Room.objects.create(host=self.host, song=self.song, status="finished")
        Participation.objects.create(
            room=second, user=self.host, score=500, finished=True
        )
        board = self.client.get("/api/leaderboard/").data
        self.assertEqual(len(board), 1)
        self.assertEqual(board[0]["best_score"], 1200)

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
            headers=[(b"origin", b"http://localhost:5173")],
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
            self.assertEqual((await sockets[0].receive_json_from())["type"], "error")
            await sockets[0].disconnect()
            ws = self.socket()
            await ws.connect()
            await ws.send_json_to({"type": "auth", "token": tokens[0]})
            self.assertEqual((await ws.receive_json_from())["room"]["status"], "lobby")
            await ws.disconnect()
            await sockets[1].disconnect()

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
