import os
import re
import io
import logging
from typing import Optional, Dict, Any, Union

from django.conf import settings

logger = logging.getLogger(__name__)

# Constants and limits
MAX_AUDIO_SIZE_DEFAULT = 10 * 1024 * 1024  # 10 MB
ALLOWED_AUDIO_EXTENSIONS = ('.wav', '.webm', '.mp3', '.ogg', '.m4a', '.aac')
MAX_TTS_CHARS_BULBUL_V3 = 2500
MAX_TTS_CHARS_BULBUL_V2 = 1500


class SarvamVoiceError(Exception):
    """Base exception for all Sarvam AI voice errors."""
    pass


class SarvamConfigurationError(SarvamVoiceError):
    """Raised when required Sarvam AI configuration (such as SARVAM_API_KEY) is missing."""
    pass


class SarvamAuthenticationError(SarvamVoiceError):
    """Raised when Sarvam AI rejects authentication (HTTP 401 / 403)."""
    pass


class SarvamRateLimitError(SarvamVoiceError):
    """Raised when Sarvam AI rate limit or quota is exceeded (HTTP 429)."""
    pass


class SarvamValidationError(SarvamVoiceError):
    """Raised when input audio format, file size, or text length fails validation."""
    pass


class SarvamTimeoutError(SarvamVoiceError):
    """Raised when a request to Sarvam AI times out."""
    pass


class SarvamServiceUnavailableError(SarvamVoiceError):
    """Raised when Sarvam AI upstream service is down, degraded, or unreachable (HTTP 500/502/503/504)."""
    pass


class SarvamVoiceService:
    """
    Service layer for Sarvam AI Malayalam voice interaction.
    Encapsulates:
    1. Speech-to-Text via Saaras model (ml-IN transcription mode).
    2. Text-to-Speech via Bulbul model (ml-IN voice synthesis).
    3. Input validation, error sanitization (no key leakage), and memory-safe audio handling.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        stt_model: Optional[str] = None,
        tts_model: Optional[str] = None,
        tts_speaker: Optional[str] = None,
        language_code: Optional[str] = None,
        timeout: Optional[float] = None,
        max_upload_size: Optional[int] = None,
        client: Optional[Any] = None,
    ):
        self.api_key = (
            api_key
            or getattr(settings, 'SARVAM_API_KEY', '')
            or os.getenv('SARVAM_API_KEY', '')
        )
        self.stt_model = (
            stt_model
            or getattr(settings, 'SARVAM_STT_MODEL', 'saaras:v3')
            or os.getenv('SARVAM_STT_MODEL', 'saaras:v3')
        )
        self.tts_model = (
            tts_model
            or getattr(settings, 'SARVAM_TTS_MODEL', 'bulbul:v3')
            or os.getenv('SARVAM_TTS_MODEL', 'bulbul:v3')
        )
        self.tts_speaker = (
            tts_speaker
            or getattr(settings, 'SARVAM_TTS_SPEAKER', 'shubh')
            or os.getenv('SARVAM_TTS_SPEAKER', 'shubh')
        )
        self.language_code = (
            language_code
            or getattr(settings, 'SARVAM_LANGUAGE_CODE', 'ml-IN')
            or os.getenv('SARVAM_LANGUAGE_CODE', 'ml-IN')
        )
        self.timeout = float(
            timeout
            if timeout is not None
            else getattr(settings, 'SARVAM_TIMEOUT_SECONDS', 15.0)
        )
        self.max_upload_size = int(
            max_upload_size
            if max_upload_size is not None
            else getattr(settings, 'VOICE_MAX_UPLOAD_SIZE', MAX_AUDIO_SIZE_DEFAULT)
        )
        self._client = client

    def get_client(self):
        """
        Instantiates or returns the official SarvamAI client safely.
        Raises SarvamConfigurationError if SARVAM_API_KEY is not set.
        """
        if self._client is not None:
            return self._client

        if not self.api_key or not self.api_key.strip():
            raise SarvamConfigurationError(
                "SARVAM_API_KEY is not configured. "
                "Set SARVAM_API_KEY in your environment or .env file to enable Sarvam AI voice services."
            )

        try:
            from sarvamai import SarvamAI
            self._client = SarvamAI(
                api_subscription_key=self.api_key.strip(),
                timeout=self.timeout,
            )
            return self._client
        except Exception as e:
            # Never include raw key or full traceback with potential secrets
            logger.error("Failed to initialize SarvamAI SDK client: %s", type(e).__name__)
            raise SarvamConfigurationError(f"Failed to initialize Sarvam AI SDK: {str(e)}")

    def validate_audio_file(self, audio_file) -> None:
        """
        Validates presence, size, and extension of patient audio upload.
        """
        if audio_file is None:
            raise SarvamValidationError("No audio file provided.")

        file_size = getattr(audio_file, 'size', None)
        if file_size is None and hasattr(audio_file, 'seek') and hasattr(audio_file, 'tell'):
            pos = audio_file.tell()
            audio_file.seek(0, os.SEEK_END)
            file_size = audio_file.tell()
            audio_file.seek(pos)

        if file_size is not None:
            if file_size <= 0:
                raise SarvamValidationError("Uploaded audio file is empty (0 bytes).")
            if file_size > self.max_upload_size:
                raise SarvamValidationError(
                    f"Audio file size ({file_size} bytes) exceeds maximum permitted limit "
                    f"of {self.max_upload_size} bytes ({self.max_upload_size // (1024 * 1024)}MB)."
                )

        filename = getattr(audio_file, 'name', '') or ''
        filename_lower = filename.lower()
        if filename and not filename_lower.endswith(ALLOWED_AUDIO_EXTENSIONS):
            raise SarvamValidationError(
                f"Unsupported audio format '{filename}'. Allowed formats: {list(ALLOWED_AUDIO_EXTENSIONS)}"
            )

    def validate_text(self, text: str) -> str:
        """
        Validates text for Malayalam text-to-speech synthesis.
        """
        if text is None:
            raise SarvamValidationError("Text cannot be None.")

        cleaned = text.strip()
        if not cleaned:
            raise SarvamValidationError("Text for speech synthesis cannot be empty.")

        max_limit = MAX_TTS_CHARS_BULBUL_V2 if 'v2' in self.tts_model else MAX_TTS_CHARS_BULBUL_V3
        if len(cleaned) > max_limit:
            raise SarvamValidationError(
                f"Text length ({len(cleaned)} characters) exceeds maximum supported limit "
                f"of {max_limit} characters for model '{self.tts_model}'."
            )

        return cleaned

    def transcribe_audio(
        self,
        audio_file=None,
        text_fallback: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transcribes Malayalam audio to text using Sarvam AI Saaras model.
        Preserves patient's original Malayalam speech without English translation.

        Returns:
            Dict containing:
                - text: Extracted Malayalam transcript
                - language: Language code ('ml-IN')
                - confidence: Probability score or default 0.95
                - provider: 'sarvam' (or 'sarvam_text_fallback')
                - model: Configured model ID (e.g. 'saaras:v3')
                - request_id: Provider request ID if returned
                - is_mock: False
        """
        target_language = language or self.language_code
        if target_language in ('ml', 'malayalam'):
            target_language = 'ml-IN'

        # If direct text fallback was explicitly supplied (e.g. manual fallback or test probe)
        if not audio_file and text_fallback:
            return {
                "text": text_fallback.strip(),
                "language": target_language,
                "confidence": 1.0,
                "provider": "sarvam_text_fallback",
                "model": self.stt_model,
                "request_id": None,
                "is_mock": False,
            }

        # Validate audio upload
        self.validate_audio_file(audio_file)

        client = self.get_client()

        # Read audio in-memory to preserve patient privacy (no permanent disk storage)
        filename = getattr(audio_file, 'name', 'recording.wav') or 'recording.wav'
        if hasattr(audio_file, 'seek'):
            audio_file.seek(0)
        audio_bytes = audio_file.read() if hasattr(audio_file, 'read') else audio_file
        content_type = getattr(audio_file, 'content_type', 'audio/wav') or 'audio/wav'

        file_payload = (filename, audio_bytes, content_type)

        try:
            response = client.speech_to_text.transcribe(
                file=file_payload,
                model=self.stt_model,
                mode="transcribe",  # Strictly transcription, no translation
                language_code=target_language,
            )

            transcript = getattr(response, 'transcript', '') or ''
            request_id = getattr(response, 'request_id', None)
            lang_code = getattr(response, 'language_code', target_language) or target_language
            confidence = getattr(response, 'language_probability', 0.95)
            if confidence is None:
                confidence = 0.95

            return {
                "text": transcript.strip(),
                "language": lang_code,
                "confidence": float(confidence),
                "request_id": request_id,
                "provider": "sarvam",
                "model": self.stt_model,
                "is_mock": False,
            }

        except Exception as exc:
            self._handle_sarvam_error(exc, operation="STT transcription")

    def synthesize_speech(
        self,
        text: str,
        language: Optional[str] = None,
        speaker: Optional[str] = None,
        pace: Optional[float] = None,
        speech_sample_rate: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Synthesizes Malayalam text to spoken audio using Sarvam AI Bulbul model.

        Returns:
            Dict containing:
                - audio_url: None (direct base64 payload delivered)
                - audio_base64: Base64-encoded WAV/MP3 audio
                - mime_type: 'audio/wav'
                - provider: 'sarvam'
                - model: Configured TTS model
                - speaker: Speaker persona ID used
                - request_id: Provider request ID if returned
                - is_mock: False
                - fallback_text: Original text
        """
        cleaned_text = self.validate_text(text)
        target_language = language or self.language_code
        if target_language in ('ml', 'malayalam'):
            target_language = 'ml-IN'

        target_speaker = speaker or self.tts_speaker
        client = self.get_client()

        convert_kwargs: Dict[str, Any] = {
            "text": cleaned_text,
            "language_code": target_language,
            "speaker": target_speaker,
            "model": self.tts_model,
            "output_audio_codec": "wav",
        }

        if pace is not None:
            convert_kwargs["pace"] = pace
        if speech_sample_rate is not None:
            convert_kwargs["speech_sample_rate"] = speech_sample_rate

        try:
            response = client.text_to_speech.convert(**convert_kwargs)

            audios = getattr(response, 'audios', []) or []
            if not audios or not audios[0]:
                raise SarvamVoiceError("Sarvam AI text-to-speech returned an empty audio response.")

            audio_base64 = audios[0]
            request_id = getattr(response, 'request_id', None)

            return {
                "audio_url": None,
                "audio_base64": audio_base64,
                "mime_type": "audio/wav",
                "provider": "sarvam",
                "model": self.tts_model,
                "speaker": target_speaker,
                "request_id": request_id,
                "is_mock": False,
                "fallback_text": cleaned_text,
            }

        except Exception as exc:
            self._handle_sarvam_error(exc, operation="TTS speech synthesis")

    def _handle_sarvam_error(self, exc: Exception, operation: str = "Voice operation") -> None:
        """
        Maps SDK/network exceptions to domain exceptions without leaking secrets.
        """
        # Re-raise known domain exceptions immediately
        if isinstance(exc, SarvamVoiceError):
            raise exc

        exc_class_name = type(exc).__name__
        exc_str = str(exc)

        # Check for authentication / authorization errors
        if 'Unauthorized' in exc_class_name or 'Forbidden' in exc_class_name or '401' in exc_str or '403' in exc_str:
            logger.warning("Sarvam AI authentication failed during %s", operation)
            raise SarvamAuthenticationError(
                "Sarvam AI authentication failed. Please check that SARVAM_API_KEY is valid and active."
            )

        # Check for rate limits / quota exceeded
        if 'TooManyRequests' in exc_class_name or '429' in exc_str or 'rate limit' in exc_str.lower():
            logger.warning("Sarvam AI rate limit exceeded during %s", operation)
            raise SarvamRateLimitError(
                "Sarvam AI rate limit or quota exceeded. Please retry after a brief pause."
            )

        # Check for content too large / bad request validation
        if 'ContentTooLarge' in exc_class_name or '413' in exc_str:
            raise SarvamValidationError(
                "Audio or text payload exceeds Sarvam AI capacity limit."
            )

        if 'BadRequest' in exc_class_name or 'UnprocessableEntity' in exc_class_name or '400' in exc_str or '422' in exc_str:
            # Sanitize error string to prevent any token exposure
            sanitized_msg = re.sub(r'[A-Za-z0-9_-]{20,}', '[REDACTED]', exc_str)
            raise SarvamValidationError(f"Sarvam AI rejected request parameters: {sanitized_msg}")

        # Check for timeouts
        if 'Timeout' in exc_class_name or 'timed out' in exc_str.lower():
            logger.warning("Sarvam AI request timed out during %s", operation)
            raise SarvamTimeoutError(
                f"Sarvam AI {operation} timed out after {self.timeout} seconds."
            )

        # Check for upstream server outages
        if any(term in exc_class_name for term in ('InternalServer', 'BadGateway', 'ServiceUnavailable', 'GatewayTimeout')) \
           or any(code in exc_str for code in ('500', '502', '503', '504')):
            logger.error("Sarvam AI upstream outage during %s: %s", operation, exc_class_name)
            raise SarvamServiceUnavailableError(
                "Sarvam AI voice service is currently unavailable. Please check service status."
            )

        # Generic fallback
        sanitized_msg = re.sub(r'[A-Za-z0-9_-]{20,}', '[REDACTED]', exc_str)
        logger.error("Unexpected Sarvam AI error during %s: %s", operation, exc_class_name)
        raise SarvamVoiceError(f"Sarvam AI error during {operation}: {sanitized_msg}")
