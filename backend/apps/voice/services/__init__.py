"""
Voice domain service layer for RehabSense AI.
Provides provider-independent voice integration with Sarvam AI Malayalam voice services.
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

__all__ = [
    'SarvamVoiceService',
    'SarvamVoiceError',
    'SarvamConfigurationError',
    'SarvamAuthenticationError',
    'SarvamRateLimitError',
    'SarvamValidationError',
    'SarvamTimeoutError',
    'SarvamServiceUnavailableError',
]
