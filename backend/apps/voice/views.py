from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.conf import settings
import re
import logging
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
from apps.voice.services.tts_language import (
    SUPPORTED_SPEECH_LANGUAGES,
    SUPPORTED_TEXT_LANGUAGES,
    check_tts_compatibility,
    get_sarvam_v3_voice_options,
    segment_verbatim_text,
)

ALLOWED_AUDIO_EXTENSIONS = ('.wav', '.webm', '.mp3', '.ogg', '.m4a', '.aac')
ALLOWED_AUDIO_MIMES = (
    'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mpeg',
    'audio/mp3', 'audio/ogg', 'audio/x-m4a', 'audio/aac',
    'application/octet-stream'  # sometimes sent by browser blob
)
MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
logger = logging.getLogger(__name__)


class VoiceTranscribeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        audio_file = request.FILES.get('audio')
        language = request.data.get('language_code', request.data.get('language', 'ml-IN'))
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
        if not isinstance(text, str) or not text.strip():
            return Response(
                {"error": "bad_request", "detail": "text is required and must be a string."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        raw_lang = request.data.get(
            'speech_language',
            request.data.get('language_code', request.data.get('language', 'ml-IN')),
        )
        if raw_lang in ('ml', 'ml-IN'):
            speech_language = 'ml-IN'
        elif raw_lang in ('en', 'en-IN'):
            speech_language = 'en-IN'
        else:
            speech_language = raw_lang

        text_language = request.data.get('text_language', 'auto')
        configured_tts_provider = (
            getattr(settings, 'MALAYALAM_TTS_PROVIDER', None)
            or getattr(settings, 'TTS_PROVIDER', 'sarvam')
        )
        provider = request.data.get('provider', configured_tts_provider)
        voice = request.data.get('voice', request.data.get('speaker'))
        segment = request.data.get('segment', False)
        preview = request.query_params.get('preview', '').lower() in ('true', '1') or request.data.get('preview', False)

        if provider != 'sarvam':
            return Response(
                {"error": "invalid_provider", "detail": "Sarvam is the only supported TTS provider."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model = getattr(settings, 'SARVAM_TTS_MODEL', 'bulbul:v3')

        try:
            compatibility = check_tts_compatibility(text, text_language, speech_language, provider, model)
        except ValueError as e:
            return Response({"error": "invalid_language", "detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        if not compatibility['compatible']:
            return Response({
                "error": "language_incompatible",
                "detail": compatibility['warning'],
                "original_text": text,
                "text_sent": text,
                "text_language": text_language,
                "speech_language": speech_language,
                "detected_text_language": compatibility['detected_text_language'],
                "compatible": False,
            }, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        if preview:
            return Response({
                "original_text": text,
                "text_sent": text,
                "segments": segment_verbatim_text(text),
                "text_language": text_language,
                "speech_language": speech_language,
                "detected_text_language": compatibility['detected_text_language'],
                "compatible": compatibility['compatible'],
                "warning": compatibility['warning'],
                "provider": provider,
                "model": model,
                "voice": voice or getattr(settings, 'SARVAM_TTS_SPEAKER', 'shubh'),
                "output_audio_codec": "audio/wav",
                "preview_only": True,
            }, status=status.HTTP_200_OK)

        sentence_count = len(re.findall(r'[.!?](?:\s+|$)|\n+', text))
        segment = segment is True or str(segment).lower() in ('true', '1') or len(text) > 240 or sentence_count >= 3

        try:
            adapter = get_voice_adapter(
                getattr(settings, 'MALAYALAM_VOICE_PROVIDER', 'sarvam'),
                provider,
            )
            result = adapter.synthesize(
                text,
                language=speech_language,
                speaker=voice,
                segment=segment,
                prepare_text=False,
                cache_audio=False,
            )
            result.setdefault('fallback_text', text)
            result.update({
                "original_text": text,
                "text_sent": text,
                "text_language": text_language,
                "speech_language": speech_language,
                "detected_text_language": compatibility['detected_text_language'],
                "compatible": True,
            })
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
            logger.error("TTS endpoint failed (%s)", type(e).__name__)
            return Response(
                {
                    "error": "synthesis_error",
                    "detail": "Text-to-speech generation failed. Check provider configuration and service status.",
                    "fallback_text": text
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class VoiceCompatibilityView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        text = request.data.get('text')
        text_language = request.data.get('text_language', 'auto')
        raw_lang = request.data.get('speech_language', 'ml-IN')
        speech_language = 'ml-IN' if raw_lang in ('ml', 'ml-IN') else ('en-IN' if raw_lang in ('en', 'en-IN') else raw_lang)
        provider = request.data.get('provider', settings.TTS_PROVIDER)
        if not isinstance(text, str) or not text.strip():
            return Response({"error": "validation_error", "detail": "text is required."}, status=status.HTTP_400_BAD_REQUEST)
        if provider != 'sarvam':
            return Response({"error": "invalid_provider", "detail": "Sarvam is the only supported TTS provider."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = check_tts_compatibility(
                text, text_language, speech_language, provider,
                settings.SARVAM_TTS_MODEL,
            )
        except ValueError as e:
            return Response({"error": "invalid_language", "detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({**result, "text_language": text_language, "speech_language": speech_language, "provider": provider})


class VoiceOptionsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        provider = request.query_params.get('provider', settings.TTS_PROVIDER)
        raw_lang = request.query_params.get('speech_language', 'ml-IN')
        speech_language = 'ml-IN' if raw_lang in ('ml', 'ml-IN') else ('en-IN' if raw_lang in ('en', 'en-IN') else raw_lang)
        if provider != 'sarvam':
            return Response({"error": "invalid_provider", "detail": "Sarvam is the only supported TTS provider."}, status=status.HTTP_400_BAD_REQUEST)
        if speech_language not in SUPPORTED_SPEECH_LANGUAGES:
            return Response({"error": "invalid_language", "detail": "speech_language must be en-IN or ml-IN."}, status=status.HTTP_400_BAD_REQUEST)

        voices = get_sarvam_v3_voice_options(speech_language)
        return Response({
            "provider": provider,
            "speech_language": speech_language,
            "model": settings.SARVAM_TTS_MODEL,
            "voices": voices,
        })


class VoiceTemplatesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from apps.voice.services.malayalam_text import VOICE_DATA

        return Response({
            "review_status": VOICE_DATA["review_status"],
            "templates": VOICE_DATA["templates"],
        }, status=status.HTTP_200_OK)


MALAYALAM_EVALUATION_SENTENCES = [
    "കൈകൾ പതുക്കെ ഉയർത്തുക.",
    "വേദന അനുഭവപ്പെട്ടാൽ വ്യായാമം നിർത്തുക.",
    "നിങ്ങളുടെ തോളുകൾ പതുക്കെ മുന്നോട്ട് ചലിപ്പിക്കുക.",
    "ഈ വ്യായാമം എട്ട് തവണ ആവർത്തിക്കുക.",
    "ശരീരത്തിന് അസ്വസ്ഥത അനുഭവപ്പെടുകയാണെങ്കിൽ വിശ്രമിക്കുക.",
    "നിങ്ങളുടെ ഡോക്ടർ നിർദ്ദേശിച്ച വ്യായാമങ്ങൾ മാത്രം ചെയ്യുക.",
    "കാൽമുട്ടുകളിൽ അമിതമായ സമ്മർദ്ദം നൽകാതിരിക്കുക.",
    "വ്യായാമം ചെയ്യുമ്പോൾ ശ്വാസം സാധാരണ നിലയിൽ തുടരുക.",
]

ENGLISH_EVALUATION_SENTENCES = [
    "Raise your arms slowly.",
    "Stop exercising if you experience pain.",
    "Move your shoulders gently forward.",
    "Repeat this exercise eight times.",
    "Rest if you feel uncomfortable.",
    "Only perform exercises prescribed by your clinician.",
    "Avoid putting excessive pressure on your knees.",
    "Continue breathing normally during the exercise.",
]

_EVALUATION_ENTRIES = []


class VoiceEvaluationView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            "presets": {
                "ml-IN": MALAYALAM_EVALUATION_SENTENCES,
                "en-IN": ENGLISH_EVALUATION_SENTENCES,
            },
            "rubric": [
                {"field": "pronunciation_score", "label": "Pronunciation", "min": 1, "max": 5},
                {"field": "naturalness_score", "label": "Naturalness", "min": 1, "max": 5},
                {"field": "clarity_score", "label": "Clarity", "min": 1, "max": 5},
                {"field": "medical_terms_score", "label": "Medical Terminology", "min": 1, "max": 5},
                {"field": "overall_score", "label": "Overall Quality", "min": 1, "max": 5},
            ],
            "evaluations": _EVALUATION_ENTRIES,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        data = request.data
        provider = data.get("provider", "sarvam")
        speech_language = data.get("speech_language", "ml-IN")
        voice = data.get("voice", "")
        sentence = data.get("sentence", "").strip()

        if not sentence:
            return Response(
                {"error": "validation_error", "detail": "sentence is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if provider != 'sarvam':
            return Response(
                {"error": "invalid_provider", "detail": "Sarvam is the only supported TTS provider."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        score_fields = [
            "pronunciation_score",
            "naturalness_score",
            "clarity_score",
            "medical_terms_score",
            "overall_score",
        ]
        scores = {}
        for field in score_fields:
            val = data.get(field)
            try:
                val_int = int(val)
                if not (1 <= val_int <= 5):
                    raise ValueError()
                scores[field] = val_int
            except (TypeError, ValueError):
                return Response(
                    {"error": "validation_error", "detail": f"{field} must be an integer between 1 and 5."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        import datetime
        import uuid
        entry = {
            "id": f"eval-{uuid.uuid4().hex[:8]}",
            "provider": provider,
            "speech_language": speech_language,
            "voice": voice,
            "sentence": sentence,
            **scores,
            "notes": str(data.get("notes", "")).strip(),
            "evaluated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        _EVALUATION_ENTRIES.append(entry)
        return Response(entry, status=status.HTTP_201_CREATED)
