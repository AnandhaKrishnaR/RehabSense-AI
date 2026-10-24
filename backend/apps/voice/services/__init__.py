"""
Voice domain service layer for RehabSense AI.
Provides provider-independent voice integration with Sarvam AI Malayalam voice services,
natural text preparation, terminology localization, prosody optimization, and audio caching.
"""
from .sarvam_service import (
    SarvamVoiceService,
    SarvamVoiceError,
    SarvamConfigurationError,
    SarvamAuthenticationError,
    SarvamRateLimitError,
    SarvamValidationError,
    SarvamTimeoutError,
    SarvamServiceUnavailableError,
)
from .malayalam_text import (
    prepare_text_for_tts,
    segment_malayalam_text,
    preserve_patient_transcript,
    get_physio_voice_message,
    number_to_malayalam,
    normalize_numbers_and_units,
    normalize_terminology,
    PHYSIO_VOICE_TEMPLATES,
)
from .voice_cache import voice_audio_cache, VoiceAudioCache

__all__ = [
    'SarvamVoiceService',
    'SarvamVoiceError',
    'SarvamConfigurationError',
    'SarvamAuthenticationError',
    'SarvamRateLimitError',
    'SarvamValidationError',
    'SarvamTimeoutError',
    'SarvamServiceUnavailableError',
    'prepare_text_for_tts',
    'segment_malayalam_text',
    'preserve_patient_transcript',
    'get_physio_voice_message',
    'number_to_malayalam',
    'normalize_numbers_and_units',
    'normalize_terminology',
    'PHYSIO_VOICE_TEMPLATES',
    'voice_audio_cache',
    'VoiceAudioCache',
]
