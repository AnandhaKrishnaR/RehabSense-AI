from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.conf import settings
from django.db import connection

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    db_status = "connected"
    try:
        connection.ensure_connection()
    except Exception as e:
        db_status = f"error: {str(e)}"

    return Response({
        "status": "healthy",
        "version": "1.0.0",
        "demo_mode": settings.DEMO_MODE,
        "voice_provider": settings.MALAYALAM_VOICE_PROVIDER,
        "database": db_status
    })
