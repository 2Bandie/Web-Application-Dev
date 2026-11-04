from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from .models import Profile, Song, Room, Participation


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, max_length=128)

    class Meta:
        model = User
        fields = ["id", "username", "password"]

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], user=User(username=attrs["username"]))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        Profile.objects.create(user=user)
        return user


class SongSerializer(serializers.ModelSerializer):
    class Meta:
        model = Song
        fields = ["id", "title", "bpm", "chart", "duration_ms"]


class PlayerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    user_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Participation
        fields = [
            "user_id",
            "username",
            "ready",
            "score",
            "combo",
            "max_combo",
            "accuracy",
            "finished",
        ]


class RoomSerializer(serializers.ModelSerializer):
    song = SongSerializer(read_only=True)
    participants = PlayerSerializer(many=True, read_only=True)

    class Meta:
        model = Room
        fields = ["code", "host_id", "song", "status", "starts_at", "participants"]


class CreateRoomSerializer(serializers.Serializer):
    song_id = serializers.PrimaryKeyRelatedField(queryset=Song.objects.all())


class ReadySerializer(serializers.Serializer):
    ready = serializers.BooleanField()
