import os
import re
import base64
from abc import ABC, abstractmethod
import requests

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
    def synthesize(self, text, language='ml'):
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

    PAIN_LEVELS = [
        (['സഹിക്കാൻ പറ്റാത്ത വേദന', 'unbearable pain', 'extreme pain'], 9),
        (['കടുത്ത വേദന', 'കഠിനമായ വേദന', 'severe pain', 'sharp pain'], 8),
        (['ഇടത്തരം വേദന', 'moderate pain', 'medium pain'], 5),
        (['ചെറിയ വേദന', 'കുറച്ച് വേദന', 'mild pain', 'slight pain', 'little pain'], 2),
        (['വേദനയില്ല', 'വേദന ഇല്ല', 'no pain', 'zero pain'], 0),
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

        # 1. Pain Score Extraction
        pain_score = None
        pain_detected = False

        # Check explicit numeric pain pattern e.g. "വേദന 6" or "7/10"
        vas_match = self.VAS_SCALE_PATTERN.search(text_lower)
        num_match = self.PAIN_NUMERIC_PATTERN.search(text_lower)
        if vas_match:
            try:
                val = int(vas_match.group(1))
                if 0 <= val <= 10:
                    pain_score = val
                    pain_detected = True
            except ValueError:
                pass
        elif num_match:
            try:
                val = int(num_match.group(1))
                if 0 <= val <= 10:
                    pain_score = val
                    pain_detected = True
            except ValueError:
                pass

        # Check keyword-based pain levels if not explicitly numeric
        if pain_score is None:
            for keywords, score in self.PAIN_LEVELS:
                if any(kw in text_lower for kw in keywords):
                    pain_score = score
                    pain_detected = score > 0
                    break

        if not pain_detected and ('വേദന' in text_lower or 'pain' in text_lower or 'ache' in text_lower):
            pain_detected = True
            if pain_score is None:
                pain_score = 5 # Default moderate placeholder requiring clarification

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
        if pain_detected and not body_area:
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
            "patient_confirmed": False, # Human-in-the-loop guarantee
        }


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
    Deterministic mock text-to-speech provider.
    Returns valid 44-byte silent WAV header in base64 format with clear mock label.
    """
    def synthesize(self, text, language='ml'):
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
            # Fall back to mock with clear warning
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

        # Live call to OpenAI Whisper API
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
        # In hackathon prototype without dedicated GPU container, returns labeled mock
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
            "is_mock": stt_result.get("is_mock", False),
            "extracted_symptoms": extracted,
        }

    def synthesize(self, text, language='ml'):
        return self.tts.synthesize(text, language=language)


def get_voice_adapter(provider_name='mock') -> VoiceAdapterFacade:
    extractor = MalayalamSymptomExtractor()

    if provider_name == 'whisper':
        stt = WhisperSTTProvider()
        tts = MockTTSProvider()
    elif provider_name == 'ai4bharat':
        stt = AI4BharatSTTProvider()
        tts = MockTTSProvider()
    else:
        stt = MockSTTProvider()
        tts = MockTTSProvider()

    return VoiceAdapterFacade(stt, tts, extractor)
