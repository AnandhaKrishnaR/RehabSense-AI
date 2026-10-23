import base64
from abc import ABC, abstractmethod

class BaseMalayalamVoiceAdapter(ABC):
    @abstractmethod
    def transcribe(self, audio_file, language='ml'):
        pass

    @abstractmethod
    def synthesize(self, text, language='ml'):
        pass


class MockMalayalamVoiceAdapter(BaseMalayalamVoiceAdapter):
    """
    Deterministic mock adapter for development and offline testing.
    Clearly identifies itself as a mock provider and extracts symptoms conservatively.
    """
    def transcribe(self, audio_file, language='ml'):
        # In a real environment with configured keys, calls external ASR.
        # In mock mode, returns sample transcribed Malayalam with conservative draft extraction.
        sample_transcript = "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു"

        pain_detected = True
        suggested_pain = 5
        difficulty = "hard"
        body_area = "arm_shoulder"

        return {
            "text": sample_transcript,
            "language": language,
            "confidence": 0.95,
            "provider": "mock",
            "is_mock": True,
            "extracted_symptoms": {
                "pain_detected": pain_detected,
                "suggested_pain_score": suggested_pain,
                "suggested_difficulty": difficulty,
                "body_area": body_area,
            }
        }

    def synthesize(self, text, language='ml'):
        # Returns fallback text and mock silent wav header or synthetic tone
        # Minimal valid 44-byte WAV header
        wav_header = (
            b'RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00'
            b'D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00'
        )
        return {
            "audio_url": None,
            "audio_base64": base64.b64encode(wav_header).decode('utf-8'),
            "mime_type": "audio/wav",
            "provider": "mock",
            "is_mock": True,
            "fallback_text": text,
        }


def get_voice_adapter(provider_name='mock'):
    if provider_name == 'mock':
        return MockMalayalamVoiceAdapter()
    # Can extend with AI4Bharat or Whisper providers when keys are configured
    return MockMalayalamVoiceAdapter()
