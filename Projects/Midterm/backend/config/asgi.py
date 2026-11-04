import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
from django.core.asgi import get_asgi_application

django_app = get_asgi_application()
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.urls import path
from arena.consumers import RaceConsumer

application = ProtocolTypeRouter(
    {
        "http": django_app,
        "websocket": OriginValidator(
            URLRouter([path("ws/rooms/<str:code>/", RaceConsumer.as_asgi())]),
            settings.CORS_ALLOWED_ORIGINS,
        ),
    }
)
