import asyncio
import json
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.db import DatabaseError
from django.utils import timezone
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import Room, Participation
from .serializers import RoomSerializer
from .services import record_hit, finish_if_due


@database_sync_to_async
def authenticate(token, code):
    auth = JWTAuthentication()
    validated = auth.get_validated_token(token)
    user = auth.get_user(validated)
    if not Participation.objects.filter(room__code=code, user=user).exists():
        raise ValueError("Join this room before connecting.")
    return user, int(validated["exp"])


@database_sync_to_async
def snapshot(code, user):
    finish_if_due(code)
    room = (
        Room.objects.select_related("song")
        .prefetch_related("participants__user", "participants__hits")
        .get(code=code)
    )
    p = Participation.objects.get(room=room, user=user)
    return {
        "type": "snapshot",
        "room": RoomSerializer(room).data,
        "server_time": timezone.now().isoformat(),
        "hit_notes": list(p.hits.values_list("note", flat=True)),
    }


class SessionConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = None
        self.code = self.scope["url_route"]["kwargs"]["code"]
        self.group = f"room_{self.code}"
        self.last_packet = 0
        self.ticker = None
        await self.accept()
        self.auth_timeout = asyncio.create_task(self.close_if_unauthenticated())

    async def close_if_unauthenticated(self):
        await asyncio.sleep(5)
        if self.user is None:
            await self.close(code=4401)

    async def disconnect(self, code):
        self.auth_timeout.cancel()
        if self.ticker:
            self.ticker.cancel()
        if self.user:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def send_json(self, data):
        await self.send(text_data=json.dumps(data))

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data or len(text_data) > 4096:
            await self.close(code=4400)
            return
        try:
            data = json.loads(text_data)
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object.")
            if not self.user:
                if data.get("type") != "auth" or not isinstance(data.get("token"), str):
                    raise ValueError("Authenticate first.")
                self.user, self.expires = await authenticate(data["token"], self.code)
                self.auth_timeout.cancel()
                await self.channel_layer.group_add(self.group, self.channel_name)
                await self.room_update({})
                self.ticker = asyncio.create_task(self.tick())
                return
            if time.time() >= self.expires:
                await self.close(code=4401)
                return
            if data.get("type") == "ping":
                await self.send_json(
                    {"type": "pong", "server_time": timezone.now().isoformat()}
                )
                return
            now = time.monotonic()
            if now - self.last_packet < 0.025:
                raise ValueError("Too many inputs.")
            self.last_packet = now
            if data.get("type") != "hit":
                raise ValueError("Unknown message type.")
            result = await database_sync_to_async(record_hit)(
                self.code, self.user, data.get("note"), data.get("lane")
            )
            await self.send_json({"type": "judgement", **result})
            await self.channel_layer.group_send(self.group, {"type": "room.update"})
        except (
            ValueError,
            APIException,
            Room.DoesNotExist,
            Participation.DoesNotExist,
        ) as exc:
            await self.send_json({"type": "error", "message": str(exc)})
            if not self.user:
                await self.close(code=4401)
        except DatabaseError:
            await self.send_json(
                {"type": "error", "message": "Database busy; reconnect and try again."}
            )

    async def room_update(self, event):
        await self.send_json(await snapshot(self.code, self.user))

    async def tick(self):
        try:
            while True:
                await asyncio.sleep(0.5)
                if time.time() >= self.expires:
                    await self.close(code=4401)
                    return
                await self.room_update({})
        except asyncio.CancelledError:
            pass
        except DatabaseError:
            await self.send_json(
                {
                    "type": "error",
                    "message": "Database temporarily unavailable. Reconnect to resume.",
                }
            )
            await self.close(code=1013)
