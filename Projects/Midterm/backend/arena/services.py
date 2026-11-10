from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from .models import Room, Participation, Hit

WINDOW = 180


def elapsed(room):
    return (
        (timezone.now() - room.starts_at).total_seconds() * 1000
        if room.starts_at
        else -1
    )


@transaction.atomic
def join_room(code, user):
    room = Room.objects.select_for_update().get(code=code)
    if Participation.objects.filter(room=room, user=user).exists():
        return room
    if room.mode == "solo":
        raise ValidationError("Solo sessions are private.")
    if room.status != Room.Status.LOBBY:
        raise ValidationError("This session has already started.")
    if room.participants.count() >= 4:
        raise ValidationError("Room is full (4 players maximum).")
    Participation.objects.create(room=room, user=user)
    return room


@transaction.atomic
def start_room(code, user):
    room = Room.objects.select_for_update().select_related("song").get(code=code)
    if room.host_id != user.id:
        raise PermissionDenied("Only the host can start the session.")
    if room.status != Room.Status.LOBBY:
        raise ValidationError("Session has already started.")
    if not room.participants.exists() or room.participants.filter(ready=False).exists():
        raise ValidationError("Every player must be ready.")
    room.starts_at = timezone.now() + timedelta(seconds=3)
    room.status = Room.Status.RUNNING
    room.save(update_fields=["starts_at", "status"])
    return room


@transaction.atomic
def set_ready(code, user, ready):
    room = Room.objects.select_for_update().get(code=code)
    if room.status != Room.Status.LOBBY:
        raise ValidationError("Ready state is locked during a session.")
    p = Participation.objects.get(room=room, user=user)
    p.ready = ready
    p.save(update_fields=["ready"])


@transaction.atomic
def record_hit(code, user, note, lane):
    room = Room.objects.select_for_update().select_related("song").get(code=code)
    if room.status != Room.Status.RUNNING:
        raise ValidationError("No session in progress.")
    p = Participation.objects.select_for_update().get(room=room, user=user)
    chart = room.song.chart
    if (
        type(note) is not int
        or type(lane) is not int
        or not 0 <= note < len(chart)
        or not 0 <= lane < 4
    ):
        raise ValidationError("Invalid note or lane.")
    target = chart[note]
    delta = round(elapsed(room) - target["time"])
    if target["lane"] != lane or abs(delta) > WINDOW:
        raise ValidationError("Outside the hit window or wrong lane.")
    if p.hits.filter(note=note).exists():
        raise ValidationError("Note already judged.")
    # A later note must not be followed by an earlier note to farm combos.
    latest = p.hits.order_by("-note").first()
    if latest and latest.note >= note:
        raise ValidationError("Note already passed.")
    if (latest and latest.note + 1 != note) or (latest is None and note != 0):
        p.combo = 0
    grade = "perfect" if abs(delta) <= 80 else "good"
    Hit.objects.create(participant=p, note=note, delta_ms=delta, grade=grade)
    p.combo += 1
    p.max_combo = max(p.max_combo, p.combo)
    p.score += 1000 if grade == "perfect" else 600
    p.accuracy = p.score / (len(chart) * 1000) * 100
    p.save(update_fields=["combo", "max_combo", "score", "accuracy"])
    return {"grade": grade, "delta_ms": delta, "note": note}


@transaction.atomic
def finish_if_due(code):
    room = Room.objects.select_for_update().select_related("song").get(code=code)
    if room.status == Room.Status.RUNNING and elapsed(room) >= room.song.duration_ms:
        room.status = Room.Status.FINISHED
        room.save(update_fields=["status"])
        room.participants.update(finished=True)
    return room
