from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.conf import settings
from apps.voice.adapters import get_voice_adapter

class VoiceTranscribeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        audio_file = request.FILES.get('audio')
        language = request.data.get('language', 'ml')

        adapter = get_voice_adapter(settings.MALAYALAM_VOICE_PROVIDER)
        result = adapter.transcribe(audio_file, language=language)
        return Response(result, status=status.HTTP_200_OK)


class VoiceSpeakView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        text = request.data.get('text')
        language = request.data.get('language', 'ml')

        if not text:
            return Response({"error": "text is required"}, status=status.HTTP_400_BAD_REQUEST)

        adapter = get_voice_adapter(settings.MALAYALAM_VOICE_PROVIDER)
        result = adapter.synthesize(text, language=language)
        return Response(result, status=status.HTTP_200_OK)
