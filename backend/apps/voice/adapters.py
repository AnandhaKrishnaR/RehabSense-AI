import os
import re
import math
import struct
import io
import base64
from typing import Optional
from abc import ABC, abstractmethod
import requests

from django.conf import settings
from apps.voice.services.sarvam_service import (
    SarvamVoiceService,
    SarvamVoiceError,
    SarvamConfigurationError,
    SarvamAuthenticationError,
    SarvamRateLimitError,
    SarvamValidationError,
    SarvamTimeoutError,
    SarvamServiceUnavailableError,
)
from apps.voice.services.gemini_tts_service import GeminiTTSService


class BaseSTTProvider(ABC):
    @abstractmethod
    def transcribe(self, audio_file=None, text_fallback=None, language='ml'):
        """
        Transcribes audio or falls back to direct text input.
        Returns dict with: text, language, confidence, provider, is_mock.
        """
        pass


class BaseTTSProvider(ABC):
    @abstractmethod
    def synthesize(self, text, language='ml', **kwargs):
        """
        Synthesizes text into speech.
        Returns dict with: audio_url, audio_base64, mime_type, provider, is_mock, fallback_text.
        """
        pass


class BaseSymptomExtractor(ABC):
    @abstractmethod
    def extract_symptoms(self, text, language='ml'):
        """
        Extracts structured clinical symptoms from natural language text.
        Returns dict with: pain_detected, suggested_pain_score, suggested_difficulty,
        body_area, worsening_pain, clarification_needed, patient_confirmed.
        """
        pass


class MalayalamSymptomExtractor(BaseSymptomExtractor):
    """
    Deterministic Malayalam & English physiotherapy symptom extractor.
    Extracts pain scores, difficulty, and anatomical location strictly when
    supported by text evidence. Never invents anatomical sides or severity without evidence.
    """
    PAIN_NUMERIC_PATTERN = re.compile(r'(?:വേദന|pain)\s*[:=]?\s*(\d{1,2})', re.IGNORECASE)
    VAS_SCALE_PATTERN = re.compile(r'(\d{1,2})\s*/\s*10')
    PAIN_SCORE_WORDS = {
        0: ('പൂജ്യം', 'സീറോ'),
        1: ('ഒന്ന്', 'ഒന്നു', 'ഒന്നാണ്'),
        2: ('രണ്ട്', 'രണ്ടു', 'രണ്ടാണ്'),
        3: ('മൂന്ന്', 'മൂന്നു', 'മൂന്നാണ്'),
        4: ('നാല്', 'നാലു', 'നാലാണ്'),
        5: ('അഞ്ച്', 'അഞ്ചു', 'അഞ്ചാണ്'),
        6: ('ആറ്', 'ആറു', 'ആറാണ്'),
        7: ('ഏഴ്', 'ഏഴു', 'ഏഴാണ്'),
        8: ('എട്ട്', 'എട്ടു', 'എട്ടാണ്'),
        9: ('ഒമ്പത്', 'ഒമ്പതു', 'ഒൻപത്', 'ഒൻപതു', 'ഒമ്പതാണ്'),
        10: ('പത്ത്', 'പത്തു', 'പത്താണ്'),
    }
    _score_word_values = {
        word: score for score, words in PAIN_SCORE_WORDS.items() for word in words
    }
    _score_word_pattern = '|'.join(
        re.escape(word) for word in sorted(_score_word_values, key=len, reverse=True)
    )
    PAIN_SPOKEN_SCORE_PATTERN = re.compile(
        rf'(?:വേദന(?:യുടെ)?(?:\s*(?:അളവ്|സ്കോർ|നില))?|pain(?:\s*score)?)'
        rf'\s*(?:is|ആണ്|:|=)?\s*(\d{{1,2}}|{_score_word_pattern})(?=\s|$|[.,!?])',
        re.IGNORECASE,
    )
    SPOKEN_VAS_PATTERN = re.compile(
        rf'പത്തിൽ\s*(\d{{1,2}}|{_score_word_pattern})(?=\s|$|[.,!?])',
        re.IGNORECASE,
    )
    PAIN_NEGATION_PATTERN = re.compile(
        r'വേദന\s*(?:യില്ല|ഇല്ല|ഒന്നുമില്ല|ഒട്ടുമില്ല|ഒട്ടും\s*ഇല്ല|തീരെ\s*ഇല്ല)'
        r'|വേദനയില്ല|\bno\s+(?:pain|ache)\b|\bpain[- ]free\b',
        re.IGNORECASE,
    )
    PAIN_MARKERS = (
        'വേദന', 'നോവ്', 'നോവു', 'നോവുന്നു', 'നൊമ്പരം', 'നീറു', 'നീറൽ', 'നീറ്റൽ',
        'കുത്തുന്ന', 'കുത്തി വേദന', 'കുത്തുന്നു', 'വലിവ്', 'വലിക്കുന്നു',
        'പൊള്ളുന്നു', 'pain', 'ache',
    )

    PAIN_LEVELS = [
        ([
            'സഹിക്കാൻ പറ്റാത്ത വേദന', 'സഹിക്കാൻ പറ്റില്ലാത്ത വേദന', 'സഹിക്കാനാവാത്ത വേദന',
            'താങ്ങാൻ പറ്റാത്ത വേദന', 'താങ്ങാൻ കഴിയാത്ത വേദന', 'അസഹ്യമായ വേദന',
            'unbearable pain', 'extreme pain',
        ], 9),
        ([
            'കടുത്ത വേദന', 'വളരെ കടുത്ത വേദന', 'കഠിനമായ വേദന', 'കഠിനമായി വേദനിക്കുന്നു',
            'വല്ലാത്ത വേദന', 'വല്ലാതെ വേദനിക്കുന്നു', 'ഭയങ്കര വേദന', 'പെരുത്ത വേദന',
            'നല്ലോണം വേദന', 'തീവ്ര വേദന', 'ഒത്തിരി വേദന',
            'വളരെ വേദനിക്കുന്നു', 'severe pain', 'sharp pain',
        ], 8),
        (['ഇടത്തരം വേദന', 'മിതമായ വേദന', 'moderate pain', 'medium pain'], 5),
        ([
            'ചെറിയ തോതിൽ വേദന', 'ചെറിയ തോതില്‍ വേദന', 'ചെറിയൊരു വേദന', 'ചെറിയ വേദന',
            'ചെറുതായി വേദന', 'വേദന ചെറിയതാണ്', 'നേരിയ വേദന', 'ലഘുവായ വേദന',
            'അല്പം വേദന', 'അല്പം വേദനിക്കുന്നു', 'ഒരല്പം വേദന', 'കുറച്ചൊക്കെ വേദന',
            'കുറച്ച് വേദന', 'കുറച്ചു വേദന', 'വേദന കുറവാണ്', 'വേദന കുറവുണ്ട്',
            'mild pain', 'slight pain', 'little pain',
        ], 2),
    ]

    DIFFICULTY_LEVELS = [
        (['വളരെ കഠിനം', 'വളരെ ബുദ്ധിമുട്ട്', 'വളരെ ബുദ്ധിമുട്ടാണ്', 'വളരെ പ്രയാസം', 'വളരെ പ്രയാസമാണ്', 'very hard', 'extremely hard'], 'very_hard'),
        (['ബുദ്ധിമുട്ടാണ്', 'ബുദ്ധിമുട്ട്', 'പ്രയാസമാണ്', 'പ്രയാസം', 'കഠിനം', 'hard', 'difficult'], 'hard'),
        (['കുഴപ്പമില്ല', 'ഇടത്തരം', 'moderate', 'okay', 'tolerable', 'ക്ഷീണം'], 'moderate'),
        (['എളുപ്പമാണ്', 'എളുപ്പം', 'സുഗമം', 'easy', 'smooth'], 'easy'),
    ]

    BODY_AREAS = [
        (['തോൾ', 'തോളിന്', 'തോളിൽ', 'തോളത്ത്', 'തോള', 'shoulder'], 'shoulder'),
        (['മുട്ട്', 'മുട്ടിന്', 'മുട്ടിൽ', 'കാൽമുട്ട്', 'കാൽമുട്ടിന്', 'കാൽമുട്ടിൽ', 'knee'], 'knee'),
        (['കൈ', 'കയ്യിൽ', 'കൈക്ക്', 'കൈകൾ', 'arm'], 'arm'),
        (['കാൽ', 'കാലിൽ', 'കാലിന്', 'കാലുകൾ', 'leg'], 'leg'),
        (['ഇടുപ്പ്', 'ഇടുപ്പിന്', 'ഇടുപ്പിൽ', 'hip'], 'hip'),
        (['നടുവ്', 'പുറം', 'നടുവിന്', 'നടുവിൽ', 'പുറത്ത്', 'back', 'spine'], 'back'),
    ]

    WORSENING_KEYWORDS = [
        'കൂടുന്നു', 'കൂടുതൽ', 'കൂടി', 'worse', 'worsening', 'increasing', 'getting worse', 'കൂടിയ വേദന'
    ]

    def extract_symptoms(self, text, language='ml'):
        text_lower = (text or "").strip().lower()
        if not text_lower:
            return {
                "pain_detected": False,
                "suggested_pain_score": None,
                "suggested_difficulty": "",
                "body_area": "",
                "worsening_pain": False,
                "clarification_needed": [],
                "patient_confirmed": False,
            }

        # Score only explicit numbers or clear intensity words; do not infer a default.
        pain_score = None
        pain_detected = False

        if self.PAIN_NEGATION_PATTERN.search(text_lower):
            pain_score = 0
        else:
            vas_match = self.VAS_SCALE_PATTERN.search(text_lower)
            num_match = self.PAIN_NUMERIC_PATTERN.search(text_lower)
            spoken_score_match = self.PAIN_SPOKEN_SCORE_PATTERN.search(text_lower)
            spoken_vas_match = self.SPOKEN_VAS_PATTERN.search(text_lower)

            if vas_match:
                score_value = int(vas_match.group(1))
                if 0 <= score_value <= 10:
                    pain_score = score_value
            elif num_match:
                score_value = int(num_match.group(1))
                if 0 <= score_value <= 10:
                    pain_score = score_value
            elif spoken_score_match:
                pain_score = self._parse_pain_score(spoken_score_match.group(1))
            elif spoken_vas_match and any(marker in text_lower for marker in self.PAIN_MARKERS):
                pain_score = self._parse_pain_score(spoken_vas_match.group(1))

        if pain_score is not None:
            pain_detected = pain_score > 0
        elif not self.PAIN_NEGATION_PATTERN.search(text_lower):
            for keywords, score in self.PAIN_LEVELS:
                if any(kw in text_lower for kw in keywords):
                    pain_score = score
                    pain_detected = score > 0
                    break

        if pain_score is None:
            pain_detected = any(marker in text_lower for marker in self.PAIN_MARKERS)

        # 2. Difficulty Extraction
        difficulty = ""
        for keywords, diff_code in self.DIFFICULTY_LEVELS:
            if any(kw in text_lower for kw in keywords):
                difficulty = diff_code
                break

        # 3. Body Area Extraction (Strictly anatomical, no invented sides)
        body_area = ""
        for keywords, area in self.BODY_AREAS:
            if any(kw in text_lower for kw in keywords):
                # If both arm and shoulder match, prefer shoulder
                if area == 'arm' and ('തോൾ' in text_lower or 'shoulder' in text_lower):
                    continue
                body_area = area
                break

        # 4. Worsening Pain Detection
        worsening_pain = any(kw in text_lower for kw in self.WORSENING_KEYWORDS)

        # 5. Clarification Needs
        clarification_needed = []
        if pain_detected and pain_score != 0 and not body_area:
            clarification_needed.append("body_area")
        if pain_detected and pain_score is None:
            clarification_needed.append("pain_intensity")

        return {
            "pain_detected": pain_detected,
            "suggested_pain_score": pain_score,
            "suggested_difficulty": difficulty,
            "body_area": body_area,
            "worsening_pain": worsening_pain,
            "clarification_needed": clarification_needed,
            "patient_confirmed": False,  # Human-in-the-loop guarantee
        }

    @classmethod
    def _parse_pain_score(cls, score_text):
        score_text = score_text.strip().lower()
        if score_text.isdigit():
            score_value = int(score_text)
            return score_value if 0 <= score_value <= 10 else None
        return cls._score_word_values.get(score_text)


class SarvamSTTProvider(BaseSTTProvider):
    """
    Official Sarvam AI Malayalam Speech-to-Text adapter (Saaras model).
    Preserves patient's original Malayalam speech input without English translation.
    """
    def __init__(self, service: Optional[SarvamVoiceService] = None):
        self.service = service or SarvamVoiceService()

    def transcribe(self, audio_file=None, text_fallback=None, language='ml-IN'):
        return self.service.transcribe_audio(
            audio_file=audio_file,
            text_fallback=text_fallback,
            language=language,
        )


class SarvamTTSProvider(BaseTTSProvider):
    """
    Official Sarvam AI Malayalam Text-to-Speech adapter (Bulbul model).
    Generates natural, audible Malayalam speech guidance with text preparation and caching.
    """
    def __init__(self, service: Optional[SarvamVoiceService] = None):
        self.service = service or SarvamVoiceService()

    def synthesize(self, text, language='ml-IN', speaker=None, pace=None, segment=False,
                   prepare_text=False, cache_audio=False, **kwargs):
        if segment:
            segments = self.service.synthesize_segments(
                text=text,
                language=language,
                speaker=speaker,
                pace=pace,
                prepare_text=False,
                cache_audio=cache_audio,
            )
            return {
                "audio_url": None,
                "audio_base64": None,
                "mime_type": "audio/wav",
                "fallback_text": text,
                "segments": segments,
                "provider": "sarvam",
                "model": self.service.tts_model,
                "speaker": speaker or self.service.tts_speaker,
                "count": len(segments),
            }
        return self.service.synthesize_speech(
            text=text,
            language=language,
            speaker=speaker,
            pace=pace,
            skip_preparation=True,
            cache_audio=False,
        )


class GeminiTTSProvider(BaseTTSProvider):
    """Google Gemini TTS; deliberately independent from the configured STT provider."""

    def __init__(self, service: Optional[GeminiTTSService] = None):
        self.service = service or GeminiTTSService()

    def synthesize(self, text, language='ml-IN', speaker=None, prepare_text=False, segment=False, **kwargs):
        if segment:
            return self.service.synthesize_segments(
                text=text,
                voice=speaker,
                prepare_text=False,
                speech_language=language,
            )
        return self.service.synthesize(
            text=text,
            voice=speaker,
            prepare_text=False,
            speech_language=language,
        )


class MockSTTProvider(BaseSTTProvider):
    """
    Deterministic mock adapter for development and offline testing.
    Clearly identifies itself as a mock provider and extracts symptoms conservatively.
    """
    def transcribe(self, audio_file=None, text_fallback=None, language='ml'):
        text = text_fallback or "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു"
        return {
            "text": text,
            "language": language,
            "confidence": 0.95,
            "provider": "mock",
            "is_mock": True,
        }


class MockTTSProvider(BaseTTSProvider):
    """
    Deterministic fallback text-to-speech provider.
    Generates an audible 440Hz synthetic tone in WAV format so test listeners
    hear clear audio feedback even without cloud network connection.
    """
    def synthesize(self, text, language='ml', **kwargs):
        # Generate 0.5s 440Hz PCM sine wave (8000 Hz sample rate, 8-bit mono)
        sample_rate = 8000
        duration = 0.5
        num_samples = int(sample_rate * duration)
        data = bytearray()
        for i in range(num_samples):
            val = int(128 + 80 * math.sin(2 * math.pi * 440 * i / sample_rate))
            data.append(val)

        header = bytearray(b'RIFF')
        header.extend(struct.pack('<I', 36 + len(data)))
        header.extend(b'WAVEfmt ')
        header.extend(struct.pack('<I', 16))
        header.extend(struct.pack('<H', 1))  # PCM
        header.extend(struct.pack('<H', 1))  # Mono
        header.extend(struct.pack('<I', sample_rate))
        header.extend(struct.pack('<I', sample_rate))
        header.extend(struct.pack('<H', 1))
        header.extend(struct.pack('<H', 8))
        header.extend(b'data')
        header.extend(struct.pack('<I', len(data)))
        wav_bytes = bytes(header + data)

        return {
            "audio_url": None,
            "audio_base64": base64.b64encode(wav_bytes).decode('utf-8'),
            "mime_type": "audio/wav",
            "provider": "mock",
            "is_mock": True,
            "fallback_text": text,
        }


class GTTSVoiceProvider(BaseTTSProvider):
    """
    Real Google Text-to-Speech (gTTS) provider for Malayalam and English.
    Generates natural, audible native pronunciation audio in MP3 format.
    """
    def synthesize(self, text, language='ml', **kwargs):
        lang_code = 'ml' if language in ('ml', 'ml-IN', 'malayalam') else 'en'
        try:
            from gtts import gTTS
            fp = io.BytesIO()
            tts = gTTS(text=text, lang=lang_code)
            tts.write_to_fp(fp)
            audio_bytes = fp.getvalue()
            return {
                "audio_url": None,
                "audio_base64": base64.b64encode(audio_bytes).decode('utf-8'),
                "mime_type": "audio/mp3",
                "provider": "gtts",
                "is_mock": False,
                "fallback_text": text,
            }
        except Exception:
            return {
                "audio_url": None,
                "audio_base64": None,
                "mime_type": "audio/mp3",
                "provider": "gtts_unavailable",
                "is_mock": False,
                "fallback_text": text,
            }


class WhisperSTTProvider(BaseSTTProvider):
    """
    OpenAI / Local Whisper STT Adapter.
    Can call OpenAI Whisper API if OPENAI_API_KEY is configured.
    """
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')

    def transcribe(self, audio_file=None, text_fallback=None, language='ml'):
        if text_fallback:
            return {
                "text": text_fallback,
                "language": language,
                "confidence": 1.0,
                "provider": "whisper_fallback",
                "is_mock": False,
            }

        if not self.api_key:
            return {
                "text": "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു",
                "language": language,
                "confidence": 0.85,
                "provider": "whisper (unconfigured_mock_fallback)",
                "is_mock": True,
                "note": "OPENAI_API_KEY not configured. Falling back to mock transcription.",
            }

        if not audio_file:
            return {
                "text": "",
                "language": language,
                "confidence": 0.0,
                "provider": "whisper",
                "is_mock": False,
            }

        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            files = {"file": (audio_file.name, audio_file.read(), audio_file.content_type)}
            data = {"model": "whisper-1", "language": language}
            resp = requests.post("https://api.openai.com/v1/audio/transcriptions", headers=headers, files=files, data=data, timeout=10)
            if resp.status_code == 200:
                result = resp.json()
                return {
                    "text": result.get("text", ""),
                    "language": language,
                    "confidence": 0.92,
                    "provider": "whisper_openai",
                    "is_mock": False,
                }
            else:
                return {
                    "text": "",
                    "language": language,
                    "confidence": 0.0,
                    "provider": "whisper_openai_error",
                    "is_mock": False,
                    "error": f"API returned status {resp.status_code}: {resp.text}",
                }
        except Exception as e:
            return {
                "text": "",
                "language": language,
                "confidence": 0.0,
                "provider": "whisper_exception",
                "is_mock": False,
                "error": str(e),
            }


class AI4BharatSTTProvider(BaseSTTProvider):
    """
    AI4Bharat IndicASR Adapter interface.
    """
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('AI4BHARAT_API_KEY')

    def transcribe(self, audio_file=None, text_fallback=None, language='ml'):
        if text_fallback:
            return {
                "text": text_fallback,
                "language": language,
                "confidence": 1.0,
                "provider": "ai4bharat_text",
                "is_mock": False,
            }
        return {
            "text": "കൈ ഉയർത്തുമ്പോൾ തോളിന് വേദന കൂടുന്നു",
            "language": language,
            "confidence": 0.90,
            "provider": "ai4bharat_mock_fallback",
            "is_mock": True,
            "note": "AI4Bharat IndicASR container offline. Returned labeled mock result.",
        }


class VoiceAdapterFacade:
    """
    Unified voice service combining configured STT provider, TTS provider, and symptom extractor.
    """
    def __init__(self, stt_provider: BaseSTTProvider, tts_provider: BaseTTSProvider, extractor: BaseSymptomExtractor):
        self.stt = stt_provider
        self.tts = tts_provider
        self.extractor = extractor

    def transcribe(self, audio_file=None, text_fallback=None, language='ml'):
        stt_result = self.stt.transcribe(audio_file=audio_file, text_fallback=text_fallback, language=language)
        extracted = self.extractor.extract_symptoms(stt_result.get("text", ""), language=language)
        return {
            "text": stt_result.get("text", ""),
            "language": stt_result.get("language", language),
            "confidence": stt_result.get("confidence", 0.9),
            "provider": stt_result.get("provider", "unknown"),
            "model": stt_result.get("model"),
            "request_id": stt_result.get("request_id"),
            "is_mock": stt_result.get("is_mock", False),
            "extracted_symptoms": extracted,
        }

    def synthesize(self, text, language='ml', **kwargs):
        return self.tts.synthesize(text, language=language, **kwargs)


def get_voice_adapter(
    provider_name: Optional[str] = None,
    tts_provider_name: Optional[str] = None,
) -> VoiceAdapterFacade:
    """
    Factory function returning a unified voice adapter facade.
    STT uses MALAYALAM_VOICE_PROVIDER; TTS independently uses MALAYALAM_TTS_PROVIDER.
    """
    active_provider = (
        provider_name
        or getattr(settings, 'MALAYALAM_VOICE_PROVIDER', 'sarvam')
        or 'sarvam'
    ).lower().strip()

    extractor = MalayalamSymptomExtractor()

    if active_provider == 'sarvam':
        stt = SarvamSTTProvider()
    elif active_provider == 'whisper':
        stt = WhisperSTTProvider()
    elif active_provider == 'ai4bharat':
        stt = AI4BharatSTTProvider()
    else:
        stt = MockSTTProvider()

    active_tts_provider = (
        tts_provider_name
        or getattr(settings, 'MALAYALAM_TTS_PROVIDER', 'gemini')
        or 'gemini'
    ).lower().strip()
    if active_tts_provider == 'sarvam':
        tts = SarvamTTSProvider()
    elif active_tts_provider == 'gtts':
        tts = GTTSVoiceProvider()
    elif active_tts_provider == 'mock':
        tts = MockTTSProvider()
    else:
        tts = GeminiTTSProvider()

    return VoiceAdapterFacade(stt, tts, extractor)
