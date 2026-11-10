import secrets
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models


def room_code():
    return secrets.token_hex(4).upper()


def validate_chart(chart):
    if not isinstance(chart, list) or not 1 <= len(chart) <= 1000:
        raise ValidationError("A chart needs 1 to 1000 notes.")
    previous = -1
    for note in chart:
        if not isinstance(note, dict) or set(note) != {"time", "lane"}:
            raise ValidationError("Each note needs time and lane.")
        t, lane = note["time"], note["lane"]
        if (
            type(t) is not int
            or type(lane) is not int
            or t <= previous
            or not 0 <= lane <= 3
            or not 0 <= t <= 180000
        ):
            raise ValidationError(
                "Notes need increasing millisecond times and lanes 0–3."
            )
        previous = t


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    accent = models.CharField(max_length=7, default="#91f5ba")


class Song(models.Model):
    title = models.CharField(max_length=100, unique=True)
    bpm = models.PositiveIntegerField(
        validators=[MinValueValidator(60), MaxValueValidator(240)]
    )
    difficulty = models.CharField(
        max_length=12,
        choices=[
            ("easy", "Easy"),
            ("normal", "Normal"),
            ("hard", "Hard"),
            ("expert", "Expert"),
        ],
        default="easy",
    )
    arrangement = models.CharField(
        max_length=12,
        choices=[
            ("ambient", "Ambient"),
            ("house", "House"),
            ("breakbeat", "Breakbeat"),
        ],
        default="ambient",
    )
    chart = models.JSONField(validators=[validate_chart])
    duration_ms = models.PositiveIntegerField()

    def clean(self):
        validate_chart(self.chart)
        if self.duration_ms < self.chart[-1]["time"] + 500:
            raise ValidationError("Duration must leave room after the final note.")


class Room(models.Model):
    class Status(models.TextChoices):
        LOBBY = "lobby"
        RUNNING = "running"
        FINISHED = "finished"

    code = models.CharField(
        max_length=8, unique=True, default=room_code, editable=False
    )
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="hosted_rooms"
    )
    song = models.ForeignKey(Song, on_delete=models.PROTECT, related_name="rooms")
    players = models.ManyToManyField(
        settings.AUTH_USER_MODEL, through="Participation", related_name="session_rooms"
    )
    mode = models.CharField(
        max_length=12,
        choices=[("solo", "Solo"), ("multiplayer", "Multiplayer")],
        default="multiplayer",
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.LOBBY
    )
    starts_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Participation(models.Model):
    room = models.ForeignKey(
        Room, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="performances"
    )
    ready = models.BooleanField(default=False)
    score = models.PositiveIntegerField(default=0)
    combo = models.PositiveIntegerField(default=0)
    max_combo = models.PositiveIntegerField(default=0)
    accuracy = models.FloatField(default=0)
    finished = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="one_player_per_room")
        ]
        ordering = ["-score", "id"]


class Hit(models.Model):
    participant = models.ForeignKey(
        Participation, on_delete=models.CASCADE, related_name="hits"
    )
    note = models.PositiveIntegerField()
    delta_ms = models.IntegerField()
    grade = models.CharField(
        max_length=7, choices=[("perfect", "Perfect"), ("good", "Good")]
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["participant", "note"], name="one_hit_per_note"
            )
        ]
