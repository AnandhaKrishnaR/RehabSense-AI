from django.urls import path
from apps.movement.views import SessionMeasurementCreateView

app_name = 'movement'

urlpatterns = [
    path('sessions/<uuid:session_id>/measurements/', SessionMeasurementCreateView.as_view(), name='session-measurement-create'),
]
