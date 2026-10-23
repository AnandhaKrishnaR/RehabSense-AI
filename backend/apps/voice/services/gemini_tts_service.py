"""Gemini Interactions API client for backend-only Malayalam text-to-speech."""

import base64
import binascii
import logging
import os
import threading
import time
from typing import Any, Dict, Optional

from django.conf import settings

from .tts_language import SUPPORTED_SPEECH_LANGUAGES, normalize_gemini_voice, segment_verbatim_text

logger = logging.getLogger(__name__)
DEFAULT_GEMINI_TTS_MODEL = "gemini-3.8-flash-tts"
DEFAULT_GEMINI_TTS_VOICE = "Kore"
MAX_TTS_CHARACTERS = 4000
TTS_STYLE = "Calm, clear, friendly physiotherapy assistant; natural, unhurried delivery."
VOICE_CATALOG_TTL_SECONDS = 300
_voice_catalog_cache: Dict[tuple, tuple] = {}
_voice_catalog_lock = threading.Lock()


class GeminiTTSError(Exception):
    """Base error for Gemini TTS operations."""


class GeminiTTSConfigurationError(GeminiTTSError):
    pass


class GeminiTTSValidationError(GeminiTTSError):
    pass


class GeminiTTSAuthenticationError(GeminiTTSError):
    pass


class GeminiTTSRateLimitError(GeminiTTSError):
    pass


class GeminiTTSTimeoutError(GeminiTTSError):
    pass


class GeminiTTSServiceError(GeminiTTSError):
    pass


class GeminiTTSService:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        voice: Optional[str] = None,
        timeout: Optional[float] = None,
        client: Optional[Any] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else getattr(settings, "GEMINI_API_KEY", os.getenv("GEMINI_API_KEY", ""))
        self.model = model or getattr(settings, "GEMINI_TTS_MODEL", DEFAULT_GEMINI_TTS_MODEL)
        self.voice = voice or getattr(settings, "GEMINI_TTS_VOICE", DEFAULT_GEMINI_TTS_VOICE)
        self.timeout = float(timeout if timeout is not None else getattr(settings, "GEMINI_TTS_TIMEOUT_SECONDS", 30.0))
        self._client = client

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.api_key or not self.api_key.strip():
            raise GeminiTTSConfigurationError("GEMINI_API_KEY is not configured.")
        try:
            from google import genai
            from google.genai import types

            self._client = genai.Client(
                api_key=self.api_key.strip(),
                http_options=types.HttpOptions(timeout=int(self.timeout * 1000)),
            )
            return self._client
        except Exception as exc:
            logger.error("Gemini TTS client initialization failed: %s", type(exc).__name__)
            raise GeminiTTSConfigurationError("Gemini TTS client could not be initialized.") from None

    @staticmethod
    def validate_text(text: Optional[str]) -> str:
        if not isinstance(text, str) or not text.strip():
            raise GeminiTTSValidationError("Text for speech synthesis cannot be empty.")
        if len(text) > MAX_TTS_CHARACTERS:
            raise GeminiTTSValidationError(
                f"Speech text exceeds the application limit of {MAX_TTS_CHARACTERS} characters."
            )
        return text

    def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        prepare_text: Optional[bool] = None,
        speech_language: str = "ml-IN",
    ) -> Dict[str, Any]:
        original_text = self.validate_text(text)
        spoken_text = original_text
        if speech_language not in SUPPORTED_SPEECH_LANGUAGES:
            raise GeminiTTSValidationError("speech_language must be en-IN or ml-IN.")
        selected_voice = voice or self.voice
        available_voices = self.list_voices(speech_language)
        if not any(option["id"] == selected_voice for option in available_voices):
            raise GeminiTTSValidationError(
                f"Voice '{selected_voice}' is not available for {speech_language} in this Gemini project."
            )
        client = self._get_client()

        try:
            interaction = client.interactions.create(
                model=self.model,
                input=[{
                    "type": "user_input",
                    "content": [{
                        "type": "text",
                        "text": spoken_text,
                        "annotations": [{
                            "type": "speech_metadata",
                            "style": TTS_STYLE,
                        }],
                    }],
                }],
                response_format={"type": "audio"},
                generation_config={"speech_config": [{"voice": selected_voice}]},
                store=False,
            )
        except GeminiTTSError:
            raise
        except Exception as exc:
            self._raise_provider_error(exc)

        output_audio = getattr(interaction, "output_audio", None)
        encoded_audio = getattr(output_audio, "data", None) if output_audio is not None else None
        if not encoded_audio:
            raise GeminiTTSServiceError("Gemini TTS returned no audio data.")

        try:
            audio_bytes = base64.b64decode(encoded_audio, validate=True)
        except (binascii.Error, ValueError, TypeError):
            raise GeminiTTSServiceError("Gemini TTS returned invalid encoded audio.") from None

        mime_type = getattr(output_audio, "mime_type", None) or "audio/wav"
        if mime_type != "audio/wav" or len(audio_bytes) < 44 or audio_bytes[:4] != b"RIFF" or audio_bytes[8:12] != b"WAVE":
            raise GeminiTTSServiceError("Gemini TTS did not return a valid WAV audio response.")

        return {
            "audio_url": None,
            "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
            "mime_type": mime_type,
            "provider": "gemini",
            "model": self.model,
            "speaker": selected_voice,
            "speech_language": speech_language,
            "is_mock": False,
            "original_text": original_text,
            "fallback_text": original_text,
            "prepared_text": spoken_text,
            "text_sent": spoken_text,
            "cached": False,
        }

    def list_voices(self, speech_language: str) -> list[Dict[str, str]]:
        if speech_language not in SUPPORTED_SPEECH_LANGUAGES:
            raise GeminiTTSValidationError("speech_language must be en-IN or ml-IN.")

        cache_key = (self.model, speech_language)
        now = time.monotonic()
        with _voice_catalog_lock:
            cached = _voice_catalog_cache.get(cache_key)
            if cached and cached[0] > now:
                return [dict(option) for option in cached[1]]

        client = self._get_client()
        try:
            response = client.voices.list(
                language_code=[speech_language],
                type_=["prebuilt"],
                page_size=100,
            )
        except Exception as exc:
            self._raise_provider_error(exc)

        voices = [
            option
            for option in (normalize_gemini_voice(item) for item in (getattr(response, "voices", None) or []))
            if option and option["language_code"].lower() == speech_language.lower()
        ]
        with _voice_catalog_lock:
            _voice_catalog_cache[cache_key] = (now + VOICE_CATALOG_TTL_SECONDS, voices)
        return [dict(option) for option in voices]

    def synthesize_segments(
        self,
        text: str,
        voice: Optional[str] = None,
        prepare_text: bool = True,
        speech_language: str = "ml-IN",
    ) -> Dict[str, Any]:
        original_text = self.validate_text(text)
        segments = segment_verbatim_text(original_text)

        audio_segments = [
            self.synthesize(
                segment,
                voice=voice,
                prepare_text=False,
                speech_language=speech_language,
            )
            for segment in segments
        ]
        return {
            "audio_url": None,
            "audio_base64": None,
            "mime_type": "audio/wav",
            "provider": "gemini",
            "model": self.model,
            "speaker": voice or self.voice,
            "is_mock": False,
            "original_text": original_text,
            "fallback_text": original_text,
            "text_sent": original_text,
            "segments": audio_segments,
            "count": len(audio_segments),
        }

    @staticmethod
    def _raise_provider_error(exc: Exception) -> None:
        status_code = getattr(exc, "code", None)
        error_name = type(exc).__name__.lower()
        error_message = str(getattr(exc, "message", "") or exc).lower()
        if (
            status_code in (400, 401, 403)
            and (status_code in (401, 403) or "api key" in error_message or "api_key" in error_message)
        ) or "auth" in error_name or "permissiondenied" in error_name:
            logger.warning("Gemini TTS authentication failed (%s)", type(exc).__name__)
            raise GeminiTTSAuthenticationError("Gemini TTS authentication failed. Check GEMINI_API_KEY and model access.") from None
        if status_code == 429 or "resourceexhausted" in error_name or "ratelimit" in error_name or "quota" in error_message:
            logger.warning("Gemini TTS quota or rate limit reached (%s)", type(exc).__name__)
            raise GeminiTTSRateLimitError("Gemini TTS quota or rate limit was reached.") from None
        if status_code in (408, 504) or "timeout" in error_name or "timedout" in error_name or "deadline exceeded" in error_message:
            logger.warning("Gemini TTS request timed out (%s)", type(exc).__name__)
            raise GeminiTTSTimeoutError("Gemini TTS request timed out.") from None
        logger.error("Gemini TTS request failed (%s)", type(exc).__name__)
        raise GeminiTTSServiceError("Gemini TTS request failed. Check model availability and service status.") from None
