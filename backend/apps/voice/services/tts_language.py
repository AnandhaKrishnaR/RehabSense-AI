"""Language detection and compatibility checks for non-translating TTS."""

import re
from typing import Any, Dict, List

from django.conf import settings

SUPPORTED_TEXT_LANGUAGES = {"auto", "en-IN", "ml-IN"}
SUPPORTED_SPEECH_LANGUAGES = {"en-IN", "ml-IN"}

SARVAM_V3_VOICES = [
    ("shubh", "Shubh", "male"),
    ("ishita", "Ishita", "female"),
]


def detect_text_language(text: str) -> str:
    malayalam = bool(re.search(r"[\u0D00-\u0D7F]", text))
    latin = bool(re.search(r"[A-Za-z]", text))
    if malayalam and latin:
        return "mixed"
    if malayalam:
        return "ml-IN"
    if latin:
        return "en-IN"
    return "unknown"


def segment_verbatim_text(text: str, max_characters: int = 3500) -> List[str]:
    """Split long text at sentence/word boundaries without dropping or changing characters."""
    sentence_pattern = r"[.!?;](?:[\"'’\")]*)?(?:\s+|$)|\n+"
    if len(text) <= max_characters:
        boundaries = list(re.finditer(sentence_pattern, text))
        if not boundaries:
            return [text.strip()] if text.strip() else [text]
        segments = []
        start = 0
        for boundary in boundaries:
            part = text[start:boundary.end()].strip()
            if part:
                segments.append(part)
            start = boundary.end()
        if start < len(text):
            part = text[start:].strip()
            if part:
                segments.append(part)
        return segments or [text.strip()]

    segments: List[str] = []
    start = 0
    while start < len(text):
        limit = min(start + max_characters, len(text))
        if limit == len(text):
            part = text[start:].strip()
            if part:
                segments.append(part)
            break

        window = text[start:limit]
        sentence_boundaries = [
            match.end()
            for match in re.finditer(sentence_pattern, window)
        ]
        if sentence_boundaries:
            end = start + sentence_boundaries[-1]
        else:
            whitespace_boundaries = [match.end() for match in re.finditer(r"\s+", window)]
            end = start + (whitespace_boundaries[-1] if whitespace_boundaries else max_characters)

        if end <= start:
            end = limit
        part = text[start:end].strip()
        if part:
            segments.append(part)
        start = end

    return segments


def check_tts_compatibility(
    text: str,
    text_language: str,
    speech_language: str,
    provider: str,
    model: str = "",
) -> Dict[str, Any]:
    if text_language not in SUPPORTED_TEXT_LANGUAGES:
        raise ValueError("text_language must be auto, en-IN, or ml-IN.")
    if speech_language not in SUPPORTED_SPEECH_LANGUAGES:
        raise ValueError("speech_language must be en-IN or ml-IN.")

    detected_language = detect_text_language(text)
    if text_language != "auto" and detected_language in SUPPORTED_SPEECH_LANGUAGES and text_language != detected_language:
        return {
            "compatible": False,
            "detected_text_language": detected_language,
            "warning": "The selected text language does not match the original text. Choose Auto detect or the matching language; the text will not be translated.",
        }

    if detected_language in SUPPORTED_SPEECH_LANGUAGES and detected_language != speech_language:
        return {
            "compatible": False,
            "detected_text_language": detected_language,
            "warning": "The selected speech language differs from the original text. Choose a matching speech language; the text will not be translated.",
        }

    if detected_language == "mixed":
        if provider == "sarvam" and model == "bulbul:v3":
            return {
                "compatible": True,
                "detected_text_language": detected_language,
                "warning": "The original mixed-language text will be sent unchanged to Bulbul v3. Review its pronunciation before clinical use.",
            }
        return {
            "compatible": False,
            "detected_text_language": detected_language,
            "warning": "This provider has no documented guarantee for code-switched Malayalam-English speech. Choose Sarvam Bulbul v3 or use a single-language original; no translation will be applied.",
        }

    if detected_language == "unknown" and text_language == "auto":
        return {
            "compatible": False,
            "detected_text_language": detected_language,
            "warning": "The text language could not be detected. Select English or Malayalam as the original text language.",
        }

    return {
        "compatible": True,
        "detected_text_language": detected_language,
        "warning": "",
    }


def get_sarvam_v3_voice_options(speech_language: str) -> List[Dict[str, str]]:
    if speech_language not in SUPPORTED_SPEECH_LANGUAGES:
        raise ValueError("Unsupported speech language.")
    if getattr(settings, "SARVAM_TTS_MODEL", "bulbul:v3") != "bulbul:v3":
        return []
    return [
        {
            "id": voice_id,
            "label": f"{display_name} ({gender})",
            "gender": gender,
            "language_code": speech_language,
        }
        for voice_id, display_name, gender in SARVAM_V3_VOICES
    ]


def normalize_gemini_voice(voice: Any) -> Dict[str, str]:
    voice_id = getattr(voice, "id", None)
    if not voice_id:
        return {}
    display_name = getattr(voice, "display_name", None) or voice_id
    language_code = getattr(voice, "language_code", None) or ""
    voice_gender = getattr(voice, "gender", None) or ""
    label = f"{display_name} ({voice_gender})" if voice_gender else display_name
    return {
        "id": voice_id,
        "label": label,
        "gender": voice_gender,
        "language_code": language_code,
    }
