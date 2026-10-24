"""
Malayalam Text Preparation and Localization Service for RehabSense AI.
Specialized for Malayalam Text-to-Speech (TTS), phonetic clarity,
rehabilitation terminology, natural Kerala phrasing, and clinical safety boundaries.
"""

import json
import re
from pathlib import Path
from typing import List, Dict, Optional, Tuple

VOICE_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "malayalam_voice.json"
VOICE_DATA = json.loads(VOICE_DATA_PATH.read_text(encoding="utf-8"))

# ==============================================================================
# 1. Malayalam Number Words Mapping (Cardinal & Ordinal)
# ==============================================================================

MALAYALAM_CARDINALS: Dict[int, str] = {
    0: "പൂജ്യം",
    1: "ഒന്ന്",
    2: "രണ്ട്",
    3: "മൂന്ന്",
    4: "നാല്",
    5: "അഞ്ച്",
    6: "ആറ്",
    7: "ഏഴ്",
    8: "എട്ട്",
    9: "ഒമ്പത്",
    10: "പത്ത്",
    11: "പതിനൊന്ന്",
    12: "പന്ത്രണ്ട്",
    13: "പതിമൂന്ന്",
    14: "പതിനാല്",
    15: "പതിനഞ്ച്",
    16: "പതിനാറ്",
    17: "പതിനേഴ്",
    18: "പതിനെട്ട്",
    19: "പത്തൊമ്പത്",
    20: "ഇരുപത്",
    25: "ഇരുപത്തിയഞ്ച്",
    30: "മുപ്പത്",
    40: "നാൽപ്പത്",
    50: "അമ്പത്",
    60: "അറുപത്",
    70: "എഴുപത്",
    80: "എൺപത്",
    90: "തൊണ്ണൂറ്",
    100: "നൂറ്",
}

# Counting classifier words (used when counting repetitions: "ഒരു ആവർത്തനം", "രണ്ട് തവണ")
MALAYALAM_COUNT_PREFIX: Dict[int, str] = {
    1: "ഒരു",
    2: "രണ്ട്",
    3: "മൂന്ന്",
    4: "നാല്",
    5: "അഞ്ച്",
    6: "ആറ്",
    7: "ഏഴ്",
    8: "എട്ട്",
    9: "ഒമ്പത്",
    10: "പത്ത്",
    11: "പതിനൊന്ന്",
    12: "പന്ത്രണ്ട്",
    15: "പതിനഞ്ച്",
    20: "ഇരുപത്",
}

MALAYALAM_ORDINALS: Dict[int, str] = {
    1: "ഒന്നാമത്തെ",
    2: "രണ്ടാമത്തെ",
    3: "മൂന്നാമത്തെ",
    4: "നാലാമത്തെ",
    5: "അഞ്ചാമത്തെ",
    6: "ആറാമത്തെ",
    7: "ഏഴാമത്തെ",
    8: "എട്ടാമത്തെ",
    9: "ഒമ്പതാമത്തെ",
    10: "പത്താമത്തെ",
}


def number_to_malayalam(num: int) -> str:
    """
    Converts integer (0 to 100) into standard spoken Malayalam words.
    """
    if num in MALAYALAM_CARDINALS:
        return MALAYALAM_CARDINALS[num]

    return str(num)


# ==============================================================================
# 2. Physiotherapy Reviewed Terminology Dictionary
# ==============================================================================

PHYSIO_TERMINOLOGY_DICTIONARY: List[Dict[str, Optional[str]]] = VOICE_DATA["terminology"]


# ==============================================================================
# 3. Contextual Number and Measurement Replacement Rules
# ==============================================================================

def normalize_numbers_and_units(text: str) -> str:
    """
    Transforms ASCII numbers, durations, angles, and ratios into natural spoken Malayalam.
    Example:
        '5 reps' -> 'അഞ്ച് ആവർത്തനം'
        '10 seconds' -> 'പത്ത് സെക്കൻഡ്'
        '7/10' -> 'പത്തിൽ ഏഴ്'
        '90 deg' -> 'തൊണ്ണൂറ് ഡിഗ്രി'
    """
    if not text:
        return ""

    processed = text

    # 1. VAS Scale ratio: e.g. "7/10" or "8 / 10" -> "പത്തിൽ ഏഴ്" / "പത്തിൽ എട്ട്"
    def replace_vas_ratio(match):
        score_val = int(match.group(1))
        out_of = int(match.group(2))
        if 0 <= score_val <= 10 and out_of == 10:
            score_word = number_to_malayalam(score_val)
            return f"പത്തിൽ {score_word}"
        return match.group(0)

    processed = re.sub(r'(\d{1,2})\s*/\s*(10)\b', replace_vas_ratio, processed)

    # 2. Ordinal repetitions: e.g. "1st", "2nd", "1-ാം", "10-ാം"
    def replace_ordinals(match):
        num = int(match.group(1))
        if num in MALAYALAM_ORDINALS:
            return MALAYALAM_ORDINALS[num]
        return match.group(0)

    processed = re.sub(r'(\d{1,2})(?:st|nd|rd|th|\s*-\s*ാം|\s*-\s*ആം)', replace_ordinals, processed, flags=re.IGNORECASE)

    # 3. Repetition count with English or Malayalam unit:
    # "5 reps" / "5 rep" / "5 ആവർത്തനം" -> "അഞ്ച് ആവർത്തനം"
    def replace_rep_count(match):
        num = int(match.group(1))
        unit = match.group(2).lower()
        word = MALAYALAM_COUNT_PREFIX.get(num, number_to_malayalam(num))
        if num == 1:
            return "ഒരു ആവർത്തനം"
        if "ആവർത്തനം" in unit or "ആവർത്തനങ്ങൾ" in unit:
            return f"{word} ആവർത്തനങ്ങൾ"
        return f"{word} തവണ"

    processed = re.sub(
        r'\b(\d{1,2})\s*(reps?|repetitions?|ആവർത്തനം|ആവർത്തനങ്ങൾ|തവണ)\b',
        replace_rep_count,
        processed,
        flags=re.IGNORECASE
    )

    # 4. Durations in seconds: e.g. "10s", "10 sec", "10 seconds", "10 സെക്കൻഡ്"
    def replace_duration_seconds(match):
        num = int(match.group(1))
        word = number_to_malayalam(num)
        return f"{word} സെക്കൻഡ്"

    processed = re.sub(
        r'\b(\d{1,2})\s*(?:s|secs?|seconds?|സെക്കൻഡ്)\b',
        replace_duration_seconds,
        processed,
        flags=re.IGNORECASE
    )

    processed = re.sub(
        r'(?<!\w)(\d{1,2})\s*(?:mins?|minutes?|മിനിറ്റ്)(?=\s|$|[.,!?;:])',
        lambda match: f"{number_to_malayalam(int(match.group(1)))} മിനിറ്റ്",
        processed,
        flags=re.IGNORECASE,
    )

    # 5. Angles and Degrees: e.g. "90°", "90 deg", "90 degrees", "90 ഡിഗ്രി"
    def replace_angles(match):
        num = int(match.group(1))
        word = number_to_malayalam(num)
        return f"{word} ഡിഗ്രി"

    processed = re.sub(
        r'\b(\d{1,3})\s*(?:°|deg|degrees?|ഡിഗ്രി)\b',
        replace_angles,
        processed,
        flags=re.IGNORECASE
    )

    return processed


# ==============================================================================
# 4. Terminology Substitution
# ==============================================================================

def normalize_terminology(text: str) -> str:
    """
    Substitutes reviewed clinical and exercise terminology with native Malayalam expressions.
    """
    if not text:
        return ""

    processed = text
    for item in PHYSIO_TERMINOLOGY_DICTIONARY:
        pattern = re.compile(item["pattern"], re.IGNORECASE)
        processed = pattern.sub(item["spoken_form"], processed)

    return processed


# ==============================================================================
# 5. Prosody and Punctuation Optimization
# ==============================================================================

def format_prosody_and_pauses(text: str) -> str:
    """
    Refines punctuation, ellipsis, and spacing to ensure natural breathing pauses
    in Sarvam AI's speech synthesis engine.
    - Strips unwanted markdown or code artifacts
    - Adds natural comma pauses between clauses
    - Ensures sentences end with proper terminal punctuation
    """
    if not text:
        return ""

    # Remove markdown formatting like **, __, #, backticks
    cleaned = re.sub(r'[*_`#~]', '', text)

    # Normalize excessive whitespace
    cleaned = re.sub(r'[ \t]+', ' ', cleaned).strip()

    # Normalize multiple punctuation marks
    cleaned = re.sub(r'\.{2,}', '... ', cleaned)
    cleaned = re.sub(r'!{2,}', '! ', cleaned)
    cleaned = re.sub(r'\?{2,}', '? ', cleaned)
    cleaned = re.sub(r',{2,}', ', ', cleaned)

    # Ensure pause after comma or period has a single space
    cleaned = re.sub(r'([,.;:!?])([^\s])', r'\1 \2', cleaned)

    # If the text has no terminal punctuation, add a period for natural final cadence
    if cleaned and cleaned[-1] not in ('.', '!', '?', ';'):
        cleaned += '.'

    return cleaned


# ==============================================================================
# 6. Master TTS Text Preparer (Safe Boundary)
# ==============================================================================

def prepare_text_for_tts(text: str, context: Optional[str] = None) -> str:
    """
    Complete text preparation pipeline for Malayalam TTS synthesis:
    1. Terminology normalization (safe exercise dictionary)
    2. Contextual number and unit expansion
    3. Prosody and pause enhancement

    CRITICAL SAFETY GUARANTEE:
    This function is strictly for preparing output audio. It does NOT modify
    the patient's original symptom report or clinician instructions stored in the DB.
    """
    if not text or not text.strip():
        return ""

    raw = text.strip()

    # Step 1: Replace technical English phrases with reviewed Malayalam
    step1 = normalize_terminology(raw)

    # Step 2: Convert numbers, ratios, units into spoken Malayalam words
    step2 = normalize_numbers_and_units(step1)

    # Step 3: Punctuation and prosodic spacing
    final_text = format_prosody_and_pauses(step2)

    return final_text


def preserve_patient_transcript(raw_text: str) -> str:
    """
    Safety passthrough ensuring the patient's verbatim spoken report is preserved
    unaltered for medical records and clinician review.
    """
    return (raw_text or "").strip()


# ==============================================================================
# 7. Long Instruction Sentence Segmentation
# ==============================================================================

def segment_malayalam_text(text: str, max_segment_chars: int = 140) -> List[str]:
    """
    Divides long instructions into natural, coherent spoken segments.
    - Preserves sentence order and meaning.
    - Splits strictly at sentence terminators (. ! ? ; \n).
    - If a single sentence exceeds max_segment_chars, safely splits at major commas.
    - Avoids splitting inside Malayalam words or compound ligatures.
    """
    if not text or not text.strip():
        return []

    cleaned = text.strip()

    # Split on sentence boundaries
    raw_sentences = re.split(r'(?<=[.!?;\n])\s+', cleaned)
    segments: List[str] = []

    for s in raw_sentences:
        s_clean = s.strip()
        if not s_clean:
            continue

        if len(s_clean) <= max_segment_chars:
            segments.append(s_clean)
        else:
            # Sentence is unusually long, split at major commas or semicolons
            clauses = re.split(r'(?<=[,])\s+', s_clean)
            current_chunk = ""
            for clause in clauses:
                words = clause.split()
                for word in words:
                    candidate = f"{current_chunk} {word}".strip()
                    if current_chunk and len(candidate) > max_segment_chars:
                        segments.append(current_chunk.strip())
                        current_chunk = word
                    else:
                        current_chunk = candidate
            if current_chunk:
                segments.append(current_chunk.strip())

    return segments


# Malayalam guidance content is kept in data/malayalam_voice.json for review and editing.
PHYSIO_VOICE_TEMPLATES: Dict[str, Dict[str, str]] = VOICE_DATA["templates"]


def get_physio_voice_message(template_key: str, rep_count: Optional[int] = None) -> str:
    """
    Retrieves a reviewed physiotherapy Malayalam template and prepares it for TTS.
    """
    template_data = PHYSIO_VOICE_TEMPLATES.get(template_key)
    if not template_data:
        return ""

    if "template" in template_data and rep_count is not None:
        rep_word = number_to_malayalam(rep_count)
        rep_unit = "ആവർത്തനം" if rep_count == 1 else "ആവർത്തനങ്ങൾ"
        raw_msg = template_data["template"].format(rep_word=rep_word, rep_unit=rep_unit)
    else:
        raw_msg = template_data.get("text", "")

    return prepare_text_for_tts(raw_msg)
