from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from arena import views

router = DefaultRouter()
router.register("register", views.RegisterViewSet, basename="register")
router.register("songs", views.SongViewSet)
router.register("rooms", views.RoomViewSet, basename="room")
urlpatterns = [
    path("api/", include(router.urls)),
    path("api/token/", TokenObtainPairView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
    path("api/me/", views.me),
    path("api/leaderboard/", views.leaderboard),
    path("api/history/", views.history),
]
