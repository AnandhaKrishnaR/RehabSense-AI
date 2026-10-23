"""Offline and optional live evaluation utility for Gemini Malayalam TTS."""

import base64
import csv
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.voice.services.gemini_tts_service import GeminiTTSService, GeminiTTSError
from apps.voice.services.malayalam_text import prepare_text_for_tts, segment_malayalam_text

EVALUATION_TEXTS = [
    ("greeting", "സുഖമാണോ? വ്യായാമം തുടങ്ങാൻ തയ്യാറാണോ?"),
    ("begin", "ദയവായി വ്യായാമം ആരംഭിക്കാൻ തയ്യാറാകൂ."),
    ("raise_arm", "നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക."),
    ("lower_arm", "ഇപ്പോൾ കൈ പതുക്കെ താഴ്ത്തുക."),
    ("continue", "നന്നായി. ഇതേ രീതിയിൽ തുടരൂ."),
    ("camera", "ചലനം വ്യക്തമായി കണ്ടെത്താൻ കഴിഞ്ഞില്ല. ദയവായി ക്യാമറയ്ക്ക് മുന്നിൽ ശരിയായ സ്ഥാനത്ത് നിൽക്കുക."),
    ("pause", "വ്യായാമം നിർത്തി നിങ്ങളുടെ ഫിസിയോതെറാപ്പിസ്റ്റിന്റെ നിർദ്ദേശങ്ങൾ പാലിക്കുക."),
    ("pain_question", "വ്യായാമം ചെയ്യുമ്പോൾ വേദന അനുഭവപ്പെട്ടോ?"),
    ("difficulty_question", "ഈ വ്യായാമം ചെയ്യാൻ എത്ര ബുദ്ധിമുട്ടുണ്ടായി?"),
    ("repetitions", "5 repetitions പൂർത്തിയായി. ഇനി 2 മിനിറ്റ് വിശ്രമിക്കുക."),
    ("left_right", "ഇടത് കൈ ഉയർത്തുക. വലത് കൈ താഴ്ത്തുക."),
    ("bodyweight_squat", "bodyweight squat ചെയ്യാൻ തയ്യാറാകൂ."),
    ("shoulder_flexion", "shoulder flexion വ്യായാമം പതുക്കെ ചെയ്യുക."),
    ("mixed_punctuation", "നന്നായി! വേദന 7/10 ആണെങ്കിൽ ഉടൻ നിർത്തുക."),
    ("long_instruction", "കാലുകൾ തോളിന്റെ വീതിയിൽ വയ്ക്കുക. പുറം നേരെ വയ്ക്കുക. പതുക്കെ താഴേക്ക് ഇരിക്കുക. വേദന തോന്നിയാൽ നിർത്തുക."),
]


class Command(BaseCommand):
    help = "Preview or generate Gemini Malayalam TTS samples for voice comparison."

    def add_arguments(self, parser):
        parser.add_argument("--text", help="Synthesize one custom Malayalam phrase.")
        parser.add_argument("--model", default=None, help="Gemini TTS model ID.")
        parser.add_argument("--voice", default=None, help="Gemini prebuilt or account-enabled voice ID.")
        parser.add_argument("--compare-voices", help="Comma-separated voice IDs; makes one request per voice and phrase.")
        parser.add_argument("--compare-text", action="store_true", help="Generate raw and prepared variants separately.")
        parser.add_argument("--save", action="store_true", help="Save returned WAV files and a qualitative review CSV.")
        parser.add_argument("--preview-only", action="store_true", help="Print final text without calling Gemini.")

    def handle(self, *args, **options):
        model = options["model"] or settings.GEMINI_TTS_MODEL
        default_voice = options["voice"] or settings.GEMINI_TTS_VOICE
        voices = [voice.strip() for voice in options["compare_voices"].split(",") if voice.strip()] if options["compare_voices"] else [default_voice]
        samples = [("custom", options["text"])] if options["text"] else EVALUATION_TEXTS
        sample_dir = Path(settings.BASE_DIR) / "var" / "gemini-tts-samples"
        if options["save"]:
            sample_dir.mkdir(parents=True, exist_ok=True)

        self.stdout.write(f"Model: {model} | Voice(s): {', '.join(voices)}")
        api_key_available = bool(getattr(settings, "GEMINI_API_KEY", "").strip())
        if not api_key_available and not options["preview_only"]:
            self.stdout.write(self.style.WARNING("GEMINI_API_KEY is not configured; only text previews will run."))

        service = GeminiTTSService(model=model, voice=default_voice)
        review_path = sample_dir / "qualitative-review.csv"
        for sample_id, original_text in samples:
            prepared_text = prepare_text_for_tts(original_text)
            segments = segment_malayalam_text(prepared_text)
            self.stdout.write(f"[{sample_id}] original: {original_text}")
            self.stdout.write(f"[{sample_id}] prepared: {prepared_text}")
            if len(segments) > 1:
                for index, segment in enumerate(segments, 1):
                    self.stdout.write(f"  segment {index}: {segment}")

            if options["preview_only"] or not api_key_available:
                continue

            variants = [("prepared", True), ("raw", False)] if options["compare_text"] else [("prepared", True)]
            for voice in voices:
                for variant, prepare in variants:
                    try:
                        result = service.synthesize(original_text, voice=voice, prepare_text=prepare)
                    except GeminiTTSError as exc:
                        self.stderr.write(self.style.ERROR(f"[{sample_id}/{voice}/{variant}] {exc}"))
                        continue

                    audio_path = ""
                    if options["save"]:
                        safe_voice = "".join(char for char in voice if char.isalnum() or char in "-_ ").strip().replace(" ", "_")
                        audio_path_obj = sample_dir / f"{sample_id}_{variant}_{safe_voice}.wav"
                        audio_path_obj.write_bytes(base64.b64decode(result["audio_base64"]))
                        audio_path = audio_path_obj.name
                        self._append_review_row(review_path, sample_id, voice, variant, model, result["prepared_text"], audio_path)
                        self.stdout.write(f"  saved {audio_path_obj.relative_to(settings.BASE_DIR)}")
                    else:
                        self.stdout.write(f"  generated {variant} audio ({len(result['audio_base64'])} base64 chars)")

        if options["save"]:
            self.stdout.write(f"Review sheet: {review_path.relative_to(settings.BASE_DIR)}")

    @staticmethod
    def _append_review_row(path, sample_id, voice, variant, model, spoken_text, audio_file):
        fields = [
            "generated_at_utc", "sample_id", "voice", "variant", "model", "spoken_text", "audio_file",
            "clarity_1_to_5", "naturalness_1_to_5", "intelligible_at_normal_speed",
            "sentence_complete", "clipping_or_distortion", "meaning_preserved", "comments",
        ]
        write_header = not path.exists()
        with path.open("a", encoding="utf-8-sig", newline="") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=fields)
            if write_header:
                writer.writeheader()
            writer.writerow({
                "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                "sample_id": sample_id,
                "voice": voice,
                "variant": variant,
                "model": model,
                "spoken_text": spoken_text,
                "audio_file": audio_file,
                "clarity_1_to_5": "",
                "naturalness_1_to_5": "",
                "intelligible_at_normal_speed": "",
                "sentence_complete": "",
                "clipping_or_distortion": "",
                "meaning_preserved": "",
                "comments": "",
            })
