from django.urls import path
from apps.voice.views import VoiceTranscribeView, VoiceSpeakView

app_name = 'voice'

urlpatterns = [
    path('voice/transcribe/', VoiceTranscribeView.as_view(), name='voice-transcribe'),
    path('voice/speak/', VoiceSpeakView.as_view(), name='voice-speak'),
]
