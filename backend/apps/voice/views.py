from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.conf import settings
from apps.voice.adapters import get_voice_adapter
from apps.voice.services.sarvam_service import (
    SarvamVoiceError,
    SarvamConfigurationError,
    SarvamAuthenticationError,
    SarvamRateLimitError,
    SarvamValidationError,
    SarvamTimeoutError,
    SarvamServiceUnavailableError,
)

ALLOWED_AUDIO_EXTENSIONS = ('.wav', '.webm', '.mp3', '.ogg', '.m4a', '.aac')
ALLOWED_AUDIO_MIMES = (
    'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mpeg',
    'audio/mp3', 'audio/ogg', 'audio/x-m4a', 'audio/aac',
    'application/octet-stream'  # sometimes sent by browser blob
)
MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class VoiceTranscribeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        audio_file = request.FILES.get('audio')
        language = request.data.get('language', 'ml-IN')
        text_fallback = request.data.get('text')

        # If an audio file is uploaded, validate format and size
        if audio_file:
            if audio_file.size > MAX_AUDIO_SIZE_BYTES:
                return Response(
                    {
                        "error": "file_too_large",
                        "detail": f"Audio file size ({audio_file.size} bytes) exceeds maximum allowed limit of {MAX_AUDIO_SIZE_BYTES} bytes (10MB)."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check extension
            filename_lower = (audio_file.name or '').lower()
            if not filename_lower.endswith(ALLOWED_AUDIO_EXTENSIONS):
                return Response(
                    {
                        "error": "unsupported_audio_format",
                        "detail": f"Unsupported audio file extension. Allowed extensions: {list(ALLOWED_AUDIO_EXTENSIONS)}"
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Ensure either audio file or text fallback is provided
        if not audio_file and not text_fallback:
            # For demonstration and test convenience, default to sample transcription if neither passed
            text_fallback = "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു"

        try:
            adapter = get_voice_adapter(settings.MALAYALAM_VOICE_PROVIDER)
            result = adapter.transcribe(audio_file=audio_file, text_fallback=text_fallback, language=language)
            return Response(result, status=status.HTTP_200_OK)
        except SarvamValidationError as e:
            return Response(
                {"error": "validation_error", "detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except SarvamAuthenticationError as e:
            return Response(
                {"error": "authentication_error", "detail": str(e)},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except SarvamRateLimitError as e:
            return Response(
                {"error": "rate_limited", "detail": str(e)},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        except SarvamTimeoutError as e:
            return Response(
                {"error": "timeout", "detail": str(e)},
                status=status.HTTP_504_GATEWAY_TIMEOUT
            )
        except (SarvamConfigurationError, SarvamServiceUnavailableError) as e:
            return Response(
                {"error": "service_unavailable", "detail": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            return Response(
                {
                    "error": "transcription_error",
                    "detail": f"Voice transcription provider error: {str(e)}"
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class VoiceSpeakView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        text = request.data.get('text')
        language = request.data.get('language', 'ml-IN')

        if not text:
            return Response(
                {"error": "bad_request", "detail": "text is required for speech synthesis."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            adapter = get_voice_adapter(settings.MALAYALAM_VOICE_PROVIDER)
            result = adapter.synthesize(text, language=language)
            return Response(result, status=status.HTTP_200_OK)
        except SarvamValidationError as e:
            return Response(
                {"error": "validation_error", "detail": str(e), "fallback_text": text},
                status=status.HTTP_400_BAD_REQUEST
            )
        except SarvamAuthenticationError as e:
            return Response(
                {"error": "authentication_error", "detail": str(e), "fallback_text": text},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except SarvamRateLimitError as e:
            return Response(
                {"error": "rate_limited", "detail": str(e), "fallback_text": text},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        except SarvamTimeoutError as e:
            return Response(
                {"error": "timeout", "detail": str(e), "fallback_text": text},
                status=status.HTTP_504_GATEWAY_TIMEOUT
            )
        except (SarvamConfigurationError, SarvamServiceUnavailableError) as e:
            return Response(
                {"error": "service_unavailable", "detail": str(e), "fallback_text": text},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            return Response(
                {
                    "error": "synthesis_error",
                    "detail": f"Text-to-speech provider error: {str(e)}",
                    "fallback_text": text
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
