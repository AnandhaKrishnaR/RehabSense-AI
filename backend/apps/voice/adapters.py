import io
import math
import struct
import base64
import logging
import re
import requests
from abc import ABC, abstractmethod
from django.conf import settings

logger = logging.getLogger(__name__)

# Keyword vocabularies for Malayalam and English symptom extraction
URGENT_KEYWORDS = [
    'chest pain', 'shortness of breath', 'dizziness', 'faint', 'fainting',
    'heart', 'numbness', 'emergency',
    'നെഞ്ചുവേദന', 'ശ്വാസതടസ്സം', 'തലകറക്കം', 'തളർച്ച', 'ശ്വാസം'
]

SEVERE_PAIN_KEYWORDS = [
    'കടുത്ത', 'സഹിക്കാൻ പറ്റാത്ത', 'വളരെ കൂടുതൽ', 'severe', 'unbearable', 'extreme', 'excruciating'
]

WORSENING_PAIN_KEYWORDS = [
    'കൂടുന്നു', 'കൂടുതൽ', 'കൂടി', 'worse', 'worsening', 'increasing', 'sharp'
]

MILD_PAIN_KEYWORDS = [
    'ചെറിയ', 'കുറച്ച്', 'mild', 'slight', 'a bit', 'little'
]

COMFORT_KEYWORDS = [
    'എളുപ്പമാണ്', 'സുഖമാണ്', 'നന്നായി', 'no pain', 'fine', 'easy', 'good', 'comfortable'
]

BODY_AREA_MAP = [
    (('തോൾ', 'തോളിന്', 'കൈ', 'കൈമുട്ട്', 'shoulder', 'arm', 'elbow'), 'shoulder'),
    (('കാൽമുട്ട്', 'മുട്ട്', 'കാൽ', 'തുട', 'knee', 'leg', 'thigh'), 'knee'),
    (('നടുവ്', 'നട്ടെല്ല്', 'back', 'spine'), 'back'),
    (('നെഞ്ച്', 'നെഞ്ചുവേദന', 'chest'), 'chest'),
    (('കഴുത്ത്', 'neck'), 'neck'),
]


def extract_symptoms_from_text(text: str, language: str = 'ml') -> dict:
    """
    Conservative natural language symptom extractor for Malayalam & English.
    Extracts draft pain score, difficulty rating, and affected body area.
    Always intended for patient validation before clinical trust.
    """
    if not text:
        text = "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു"

    text_lower = text.lower()

    # 1. Check for explicit numeric pain rating (e.g. "pain 6", "വേദന 7")
    explicit_num = None
    num_match = re.search(r'\b(10|[0-9])\s*(?:/\s*10)?\b', text_lower)
    if num_match:
        try:
            val = int(num_match.group(1))
            if 0 <= val <= 10:
                explicit_num = val
        except ValueError:
            pass

    # 2. Check for comfort / no pain
    is_comfortable = any(kw in text_lower for kw in COMFORT_KEYWORDS)

    # 3. Check for urgent keywords
    is_urgent = any(kw in text_lower for kw in URGENT_KEYWORDS)

    # 4. Check for severe pain keywords
    is_severe = any(kw in text_lower for kw in SEVERE_PAIN_KEYWORDS)

    # 5. Check for worsening pain keywords
    is_worsening = any(kw in text_lower for kw in WORSENING_PAIN_KEYWORDS)

    # 6. Check for mild pain keywords
    is_mild = any(kw in text_lower for kw in MILD_PAIN_KEYWORDS)

    # General pain keyword presence
    has_pain_word = any(w in text_lower for w in ['വേദന', 'ബുദ്ധിമുട്ട്', 'കുത്തുന്നു', 'നീറ്റൽ', 'pain', 'hurt', 'ache', 'sore', 'stiff'])

    # Determine pain score and difficulty
    if explicit_num is not None:
        suggested_pain = explicit_num
        pain_detected = suggested_pain > 0
        if suggested_pain >= 7:
            suggested_difficulty = "very_hard"
        elif suggested_pain >= 5:
            suggested_difficulty = "hard"
        elif suggested_pain >= 3:
            suggested_difficulty = "moderate"
        elif suggested_pain > 0:
            suggested_difficulty = "mild"
        else:
            suggested_difficulty = "easy"
    elif is_urgent:
        suggested_pain = 9
        suggested_difficulty = "very_hard"
        pain_detected = True
    elif is_severe:
        suggested_pain = 8
        suggested_difficulty = "severe"
        pain_detected = True
    elif is_worsening:
        suggested_pain = 6
        suggested_difficulty = "hard"
        pain_detected = True
    elif is_mild:
        suggested_pain = 3
        suggested_difficulty = "mild"
        pain_detected = True
    elif is_comfortable:
        suggested_pain = 0
        suggested_difficulty = "easy"
        pain_detected = False
    elif has_pain_word:
        suggested_pain = 5
        suggested_difficulty = "moderate"
        pain_detected = True
    else:
        # Default conservative fallback
        suggested_pain = 4
        suggested_difficulty = "moderate"
        pain_detected = True

    # 7. Determine affected body area
    detected_area = ""
    for keywords, area_name in BODY_AREA_MAP:
        if any(kw in text_lower for kw in keywords):
            detected_area = area_name
            break

    if not detected_area:
        detected_area = "general"

    return {
        "pain_detected": pain_detected,
        "suggested_pain_score": suggested_pain,
        "suggested_difficulty": suggested_difficulty,
        "body_area": detected_area,
    }


def generate_audio_tone(frequency: float = 440.0, duration: float = 0.25, sample_rate: int = 16000) -> bytes:
    """
    Generates a brief PCM 16-bit mono WAV tone (gentle sine wave) for audible feedback in mock mode.
    """
    num_samples = int(duration * sample_rate)
    audio_data = bytearray()
    for i in range(num_samples):
        # Apply gentle fade-in / fade-out envelope to avoid audio clicks
        envelope = min(i / (0.05 * sample_rate), (num_samples - i) / (0.05 * sample_rate), 1.0)
        sample = int(0.3 * 32767.0 * envelope * math.sin(2.0 * math.pi * frequency * i / sample_rate))
        audio_data.extend(struct.pack('<h', sample))

    data_size = len(audio_data)
    wav_header = bytearray(b'RIFF')
    wav_header.extend(struct.pack('<I', 36 + data_size))
    wav_header.extend(b'WAVEfmt ')
    wav_header.extend(struct.pack('<I', 16))             # Subchunk1Size (16 for PCM)
    wav_header.extend(struct.pack('<H', 1))              # AudioFormat (1 for PCM)
    wav_header.extend(struct.pack('<H', 1))              # NumChannels (1 mono)
    wav_header.extend(struct.pack('<I', sample_rate))    # SampleRate
    wav_header.extend(struct.pack('<I', sample_rate * 2))# ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    wav_header.extend(struct.pack('<H', 2))              # BlockAlign (NumChannels * BitsPerSample/8)
    wav_header.extend(struct.pack('<H', 16))             # BitsPerSample
    wav_header.extend(b'data')
    wav_header.extend(struct.pack('<I', data_size))

    return bytes(wav_header + audio_data)


class BaseMalayalamVoiceAdapter(ABC):
    @abstractmethod
    def transcribe(self, audio_file, language='ml', sample_text=None):
        pass

    @abstractmethod
    def synthesize(self, text, language='ml'):
        pass


class MockMalayalamVoiceAdapter(BaseMalayalamVoiceAdapter):
    """
    Deterministic mock adapter for development, offline testing, and CI.
    Clearly identifies itself as a mock provider and extracts symptoms conservatively.
    """
    def transcribe(self, audio_file, language='ml', sample_text=None):
        transcript = sample_text or "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു"
        extracted = extract_symptoms_from_text(transcript, language=language)

        return {
            "text": transcript,
            "language": language,
            "confidence": 0.95,
            "provider": "mock",
            "is_mock": True,
            "extracted_symptoms": extracted,
        }

    def synthesize(self, text, language='ml'):
        wav_bytes = generate_audio_tone(frequency=440.0, duration=0.25)
        return {
            "audio_url": None,
            "audio_base64": base64.b64encode(wav_bytes).decode('utf-8'),
            "mime_type": "audio/wav",
            "provider": "mock",
            "is_mock": True,
            "fallback_text": text,
        }


class AI4BharatVoiceAdapter(BaseMalayalamVoiceAdapter):
    """
    AI4Bharat IndicASR and IndicTTS integration adapter for Malayalam voice processing.
    Gracefully falls back to mock if API key is not configured or network call fails.
    """
    def __init__(self, api_key=None):
        self.api_key = api_key or getattr(settings, 'AI4BHARAT_API_KEY', '') or ''
        self.mock_fallback = MockMalayalamVoiceAdapter()

    def transcribe(self, audio_file, language='ml', sample_text=None):
        if not self.api_key:
            logger.info("AI4BHARAT_API_KEY not configured. Falling back to mock Malayalam transcription.")
            result = self.mock_fallback.transcribe(audio_file, language, sample_text)
            result['provider'] = 'ai4bharat (mock-fallback)'
            return result

        try:
            # AI4Bharat IndicASR REST API Endpoint
            headers = {'Authorization': self.api_key}
            files = {'audio': audio_file} if audio_file else None
            data = {'language': language}
            response = requests.post(
                'https://api.dhruva.ai4bharat.org/services/inference/asr',
                headers=headers,
                files=files,
                data=data,
                timeout=10,
            )
            if response.status_code == 200:
                res_data = response.json()
                text = res_data.get('transcript', '')
                extracted = extract_symptoms_from_text(text, language)
                return {
                    "text": text,
                    "language": language,
                    "confidence": res_data.get('confidence', 0.90),
                    "provider": "ai4bharat",
                    "is_mock": False,
                    "extracted_symptoms": extracted,
                }
        except Exception as e:
            logger.warning(f"AI4Bharat transcription error: {e}. Using fallback.")

        result = self.mock_fallback.transcribe(audio_file, language, sample_text)
        result['provider'] = 'ai4bharat (fallback)'
        return result

    def synthesize(self, text, language='ml'):
        if not self.api_key:
            result = self.mock_fallback.synthesize(text, language)
            result['provider'] = 'ai4bharat (mock-fallback)'
            return result

        try:
            headers = {'Authorization': self.api_key, 'Content-Type': 'application/json'}
            payload = {'text': text, 'language': language}
            response = requests.post(
                'https://api.dhruva.ai4bharat.org/services/inference/tts',
                headers=headers,
                json=payload,
                timeout=10,
            )
            if response.status_code == 200:
                res_data = response.json()
                return {
                    "audio_url": res_data.get('audio_url'),
                    "audio_base64": res_data.get('audio_base64'),
                    "mime_type": "audio/wav",
                    "provider": "ai4bharat",
                    "is_mock": False,
                    "fallback_text": text,
                }
        except Exception as e:
            logger.warning(f"AI4Bharat synthesis error: {e}. Using fallback.")

        result = self.mock_fallback.synthesize(text, language)
        result['provider'] = 'ai4bharat (fallback)'
        return result


class WhisperVoiceAdapter(BaseMalayalamVoiceAdapter):
    """
    OpenAI Whisper integration adapter for Malayalam voice transcription.
    Gracefully falls back to mock if API key is not configured or network call fails.
    """
    def __init__(self, api_key=None):
        self.api_key = api_key or getattr(settings, 'WHISPER_API_KEY', '') or ''
        self.mock_fallback = MockMalayalamVoiceAdapter()

    def transcribe(self, audio_file, language='ml', sample_text=None):
        if not self.api_key or not audio_file:
            result = self.mock_fallback.transcribe(audio_file, language, sample_text)
            result['provider'] = 'whisper (mock-fallback)'
            return result

        try:
            headers = {'Authorization': f'Bearer {self.api_key}'}
            files = {'file': audio_file}
            data = {'model': 'whisper-1', 'language': language}
            response = requests.post(
                'https://api.openai.com/v1/audio/transcriptions',
                headers=headers,
                files=files,
                data=data,
                timeout=10,
            )
            if response.status_code == 200:
                res_data = response.json()
                text = res_data.get('text', '')
                extracted = extract_symptoms_from_text(text, language)
                return {
                    "text": text,
                    "language": language,
                    "confidence": 0.92,
                    "provider": "whisper",
                    "is_mock": False,
                    "extracted_symptoms": extracted,
                }
        except Exception as e:
            logger.warning(f"Whisper transcription error: {e}. Using fallback.")

        result = self.mock_fallback.transcribe(audio_file, language, sample_text)
        result['provider'] = 'whisper (fallback)'
        return result

    def synthesize(self, text, language='ml'):
        result = self.mock_fallback.synthesize(text, language)
        result['provider'] = 'whisper (fallback-tts)'
        return result


def get_voice_adapter(provider_name='mock') -> BaseMalayalamVoiceAdapter:
    provider = (provider_name or getattr(settings, 'MALAYALAM_VOICE_PROVIDER', 'mock')).lower()
    if provider == 'ai4bharat':
        return AI4BharatVoiceAdapter()
    elif provider == 'whisper':
        return WhisperVoiceAdapter()
    return MockMalayalamVoiceAdapter()
