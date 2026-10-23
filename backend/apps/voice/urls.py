from django.urls import path
from apps.voice.views import (
    VoiceCompatibilityView,
    VoiceEvaluationView,
    VoiceOptionsView,
    VoiceSpeakView,
    VoiceTemplatesView,
    VoiceTranscribeView,
)

app_name = 'voice'

urlpatterns = [
    # Canonical DRF endpoints
    path('voice/transcribe/', VoiceTranscribeView.as_view(), name='voice-transcribe'),
    path('voice/speak/', VoiceSpeakView.as_view(), name='voice-speak'),
    path('voice/compatibility/', VoiceCompatibilityView.as_view(), name='voice-compatibility'),
    path('voice/options/', VoiceOptionsView.as_view(), name='voice-options'),
    path('voice/templates/', VoiceTemplatesView.as_view(), name='voice-templates'),
    path('voice/evaluation/', VoiceEvaluationView.as_view(), name='voice-evaluation'),

    # Revive-style aliases (/api/v1/voice/stt/ and /api/v1/voice/tts/)
    path('voice/stt/', VoiceTranscribeView.as_view(), name='voice-stt'),
    path('voice/tts/', VoiceSpeakView.as_view(), name='voice-tts'),
]
