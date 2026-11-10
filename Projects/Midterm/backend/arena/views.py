from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models import Max, F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import Room, Participation, Song
from .serializers import (
    RegisterSerializer,
    SongSerializer,
    RoomSerializer,
    CreateRoomSerializer,
    ReadySerializer,
)
from .services import join_room, start_room, set_ready, finish_if_due


def broadcast(code):
    async_to_sync(get_channel_layer().group_send)(
        f"room_{code}", {"type": "room.update"}
    )


class RegisterViewSet(viewsets.GenericViewSet):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SongViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Song.objects.all().order_by("id")
    serializer_class = SongSerializer


class RoomViewSet(viewsets.GenericViewSet):
    serializer_class = RoomSerializer
    lookup_field = "code"

    def get_queryset(self):
        return (
            Room.objects.select_related("song")
            .prefetch_related("participants__user", "participants__hits")
            .filter(players=self.request.user)
            .order_by("-created_at")
        )

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, code=None):
        self.get_object()
        finish_if_due(code)
        return Response(self.get_serializer(self.get_object()).data)

    @transaction.atomic
    def create(self, request):
        serializer = CreateRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = Room.objects.create(
            host=request.user, song=serializer.validated_data["song_id"]
        )
        Participation.objects.create(room=room, user=request.user)
        return Response(self.get_serializer(room).data, status=201)

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def solo(self, request):
        serializer = CreateRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = Room.objects.create(
            host=request.user, song=serializer.validated_data["song_id"], mode="solo"
        )
        Participation.objects.create(room=room, user=request.user, ready=True)
        start_room(room.code, request.user)
        room.refresh_from_db()
        return Response(self.get_serializer(room).data, status=201)

    @action(detail=True, methods=["post"])
    def join(self, request, code=None):
        get_object_or_404(Room, code=code)
        join_room(code, request.user)
        broadcast(code)
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def ready(self, request, code=None):
        self.get_object()
        serializer = ReadySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        set_ready(code, request.user, serializer.validated_data["ready"])
        broadcast(code)
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def start(self, request, code=None):
        self.get_object()
        start_room(code, request.user)
        broadcast(code)
        return Response(self.get_serializer(self.get_object()).data)


@api_view(["GET"])
def me(request):
    return Response({"id": request.user.id, "username": request.user.username})


@api_view(["GET"])
def leaderboard(request):
    # Finalize stale sessions even if every browser disconnected before the end.
    for code in Room.objects.filter(
        status="running", starts_at__lt=timezone.now()
    ).values_list("code", flat=True):
        finish_if_due(code)
    rows = (
        Participation.objects.filter(finished=True)
        .values(
            "user_id",
            "user__username",
            song_id=F("room__song_id"),
            song_title=F("room__song__title"),
        )
        .annotate(best_accuracy=Max("accuracy"))
        .order_by("-best_accuracy", "song_id", "user_id")[:20]
    )
    return Response(list(rows))


@api_view(["GET"])
def history(request):
    for code in Room.objects.filter(players=request.user, status="running").values_list(
        "code", flat=True
    ):
        finish_if_due(code)
    rows = (
        Participation.objects.filter(user=request.user, finished=True)
        .select_related("room__song")
        .order_by("-room__starts_at")[:20]
    )
    return Response(
        [
            {
                "code": p.room.code,
                "song": p.room.song.title,
                "score": p.score,
                "accuracy": p.accuracy,
                "max_combo": p.max_combo,
                "played_at": p.room.starts_at,
            }
            for p in rows
        ]
    )
