import logging
from django.db import DatabaseError, IntegrityError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response
    if isinstance(exc, IntegrityError):
        return Response(
            {"detail": "Conflicting update. Refresh and try again."}, status=409
        )
    if isinstance(exc, DatabaseError):
        logger.exception("Database operation failed")
        return Response(
            {"detail": "Database temporarily unavailable. Try again shortly."},
            status=503,
        )
    return None
