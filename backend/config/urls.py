from django.contrib import admin
from django.urls import path, include
from config.views import health_check

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/health/', health_check, name='health-check'),
    path('api/v1/', include('apps.rehabilitation.urls')),
    path('api/v1/', include('apps.movement.urls')),
    path('api/v1/', include('apps.voice.urls')),
    path('api/v1/', include('apps.safety.urls')),
    path('api/v1/', include('apps.reporting.urls')),
]
