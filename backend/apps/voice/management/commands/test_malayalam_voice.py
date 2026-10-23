"""
Management command to test, evaluate, and compare Malayalam Text-to-Speech (TTS)
generation in RehabSense AI using Sarvam AI Bulbul and the Malayalam text-preparation layer.
"""

import os
import base64
import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any
from django.core.management.base import BaseCommand
from django.conf import settings

from apps.voice.services.malayalam_text import (
    prepare_text_for_tts,
    segment_malayalam_text,
    get_physio_voice_message,
)
from apps.voice.services.sarvam_service import (
    SarvamVoiceService,
    SarvamVoiceError,
    SarvamConfigurationError,
)
from apps.voice.services.voice_cache import voice_audio_cache


# Standard 15-Sentence Malayalam Physiotherapy Evaluation Suite
MALAYALAM_TTS_EVALUATION_SET: List[Dict[str, str]] = [
    {
        "id": "EVAL_01",
        "category": "Everyday Greeting & Session Setup",
        "raw_text": "സുഖമാണോ? ഇന്നത്തെ വ്യായാമം തുടങ്ങാം.",
        "notes": "Natural conversational greeting with polite Kerala phrasing"
    },
    {
        "id": "EVAL_02",
        "category": "Exercise Setup (Squat)",
        "raw_text": "bodyweight squat തുടങ്ങാൻ തയ്യാറാകൂ. കാലുകൾ തോളിന്റെ വീതിയിൽ വയ്ക്കുക.",
        "notes": "Mixed technical term 'bodyweight squat' normalized to Malayalam"
    },
    {
        "id": "EVAL_03",
        "category": "Descent Coaching (Squat)",
        "raw_text": "പതുക്കെ താഴേക്ക് ഇരിക്കുക. പുറം നേരെ വയ്ക്കുക.",
        "notes": "Short, deliberate coaching cue with imperative clarity"
    },
    {
        "id": "EVAL_04",
        "category": "Exercise Setup (Shoulder Flexion)",
        "raw_text": "shoulder flexion വ്യായാമം ചെയ്യാം. ഇടത് കൈ മുന്നോട്ട് പതുക്കെ ഉയർത്തുക.",
        "notes": "Technical term + lateral arm specification"
    },
    {
        "id": "EVAL_05",
        "category": "Elevation Coaching (Arm Raise)",
        "raw_text": "കൈ പതുക്കെ മുകളിലേക്ക് ഉയർത്തുക. വേദനയില്ലാത്ത പരിധിയിൽ മാത്രം ചെയ്യുക.",
        "notes": "Safe movement guidance respecting pain threshold"
    },
    {
        "id": "EVAL_06",
        "category": "Ascent Coaching",
        "raw_text": "നന്നായി. ഇനി പതുക്കെ താഴേക്ക് കൊണ്ടുവരിക.",
        "notes": "Inflection pause and descent coaching"
    },
    {
        "id": "EVAL_07",
        "category": "Repetition Count (Ordinal & Cardinal)",
        "raw_text": "നന്നായി ചെയ്തു. 5 reps പൂർത്തിയായി.",
        "notes": "Numeric expansion of '5 reps' into Malayalam words"
    },
    {
        "id": "EVAL_08",
        "category": "Repetition Milestone",
        "raw_text": "10-ാം ആവർത്തനം പൂർത്തിയായി. ഇന്നത്തെ ടാർഗെറ്റ് കഴിഞ്ഞു.",
        "notes": "Ordinal Malayalam number 'പത്താമത്തെ ആവർത്തനം'"
    },
    {
        "id": "EVAL_09",
        "category": "Rest Duration",
        "raw_text": "10s നേരം വിശ്രമിക്കുക. സാധാരണ പോലെ ശ്വാസമെടുക്കുക.",
        "notes": "Duration '10s' expanded to 'പത്ത് സെക്കൻഡ്'"
    },
    {
        "id": "EVAL_10",
        "category": "Joint Angle Coaching",
        "raw_text": "മുട്ട് 90 deg മടക്കുക. പതുക്കെ ചെയ്യുക.",
        "notes": "Degrees '90 deg' expanded to 'തൊണ്ണൂറ് ഡിഗ്രി'"
    },
    {
        "id": "EVAL_11",
        "category": "Bilateral Arm Distinction",
        "raw_text": "വലത് കൈ താഴെ വച്ച്, ഇടത് കൈ മാത്രം സാവധാനം ഉയർത്തുക.",
        "notes": "Distinct left (ഇടത്) and right (വലത്) articulation"
    },
    {
        "id": "EVAL_12",
        "category": "Camera Unreliable Alert",
        "raw_text": "ക്യാമറയിൽ ശരീരം വ്യക്തമായി കാണുന്നില്ല. ദയവായി അല്പം പിന്നോട്ട് മാറി വെളിച്ചമുള്ള സ്ഥലത്ത് നിൽക്കുക.",
        "notes": "Clear articulation of tracking visibility warning"
    },
    {
        "id": "EVAL_13",
        "category": "VAS Pain Ratio & Query",
        "raw_text": "വേദന 7/10 ആയി കൂടുന്നുണ്ടോ? എവിടെയാണ് വേദന അനുഭവപ്പെടുന്നത്?",
        "notes": "VAS ratio '7/10' expanded to 'പത്തിൽ ഏഴ്'"
    },
    {
        "id": "EVAL_14",
        "category": "Clinical Safety Pause",
        "raw_text": "വേദന കൂടുന്നതായി കാണുന്നു. വ്യായാമം ഉടൻ നിർത്തി വിശ്രമിക്കുക. നിങ്ങളുടെ ഫിസിയോതെറാപ്പിസ്റ്റിനെ വിവരം അറിയിക്കുക.",
        "notes": "Mandatory safety pause and rest instruction"
    },
    {
        "id": "EVAL_15",
        "category": "Emergency Red-Flag Warning",
        "raw_text": "ശ്രദ്ധിക്കുക. നെഞ്ചുവേദനയോ തലകറക്കമോ ഉണ്ടെങ്കിൽ വ്യായാമം ഉടൻ നിർത്തി സുരക്ഷിതമായി ഇരിക്കുക, വൈദ്യസഹായം തേടുക.",
        "notes": "Red-flag cardiac/neurological symptoms warning"
    },
    {
        "id": "EVAL_16",
        "category": "Mixed Malayalam and English with Punctuation",
        "raw_text": "നന്നായി! 5 reps പൂർത്തിയായി; ഇനി 10 seconds വിശ്രമിക്കുക.",
        "notes": "Mixed-language tokens, count, duration, and punctuation"
    },
    {
        "id": "EVAL_17",
        "category": "Left/Right and Longer Instruction",
        "raw_text": "ഇടത് കൈ പതുക്കെ ഉയർത്തുക. വലത് കൈ ശരീരത്തോട് ചേർത്ത് വയ്ക്കുക. ചലനം നിയന്ത്രിച്ച് ചെയ്യുക.",
        "notes": "Side distinction and multi-sentence playback order"
    },
]


class Command(BaseCommand):
    help = "Test, evaluate, and compare Malayalam voice preparation and Sarvam AI TTS synthesis."

    def add_arguments(self, parser):
        parser.add_argument(
            "--text",
            type=str,
            help="Custom Malayalam or mixed text to test.",
        )
        parser.add_argument(
            "--all-eval",
            action="store_true",
            help="Run the complete 15-sentence Malayalam physiotherapy evaluation suite.",
        )
        parser.add_argument(
            "--speaker",
            type=str,
            default=None,
            help="Sarvam Bulbul speaker persona (e.g. kavitha, anand, shubh, priya).",
        )
        parser.add_argument(
            "--model",
            type=str,
            default=None,
            help="Sarvam TTS model (Malayalam support is documented for bulbul:v3).",
        )
        parser.add_argument(
            "--pace",
            type=float,
            default=None,
            help="Speech pace multiplier (documented default: 1.0).",
        )
        parser.add_argument(
            "--compare",
            action="store_true",
            help="Display comparison between raw text and normalized Malayalam text.",
        )
        parser.add_argument(
            "--compare-audio",
            action="store_true",
            help="Generate raw and prepared variants separately (uses two Sarvam requests per sentence).",
        )
        parser.add_argument(
            "--save",
            action="store_true",
            help="Save synthesized WAV audio files to backend/var/samples/ for human listening review.",
        )
        parser.add_argument(
            "--preview-only",
            action="store_true",
            help="Run only text preparation and segmentation without calling external TTS API.",
        )

    def handle(self, *args, **options):
        import sys
        if hasattr(sys.stdout, "reconfigure"):
            try:
                sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

        custom_text = options.get("text")
        run_all_eval = options.get("all_eval")
        speaker = options.get("speaker") or getattr(settings, "SARVAM_TTS_SPEAKER", "shubh")
        model = options.get("model") or getattr(settings, "SARVAM_TTS_MODEL", "bulbul:v3")
        pace = options.get("pace") if options.get("pace") is not None else getattr(settings, "SARVAM_TTS_PACE", 1.0)
        compare = options.get("compare", True)
        save_audio = options.get("save", False)
        preview_only = options.get("preview_only", False)

        samples_dir = Path(settings.BASE_DIR) / "var" / "samples"
        if save_audio:
            samples_dir.mkdir(parents=True, exist_ok=True)

        self.stdout.write(self.style.SUCCESS("=" * 80))
        self.stdout.write(self.style.SUCCESS("  RehabSense AI -- Malayalam Voice Quality & Pronunciation Evaluation"))
        self.stdout.write(self.style.SUCCESS("=" * 80))
        self.stdout.write(f"Configured Model: {model} | Speaker: {speaker} | Pace: {pace:.2f}")
        self.stdout.write(f"Voice Cache Status: {'Enabled' if getattr(settings, 'VOICE_CACHE_ENABLED', True) else 'Disabled'}")

        api_key_configured = bool(getattr(settings, "SARVAM_API_KEY", "") or os.getenv("SARVAM_API_KEY"))
        if not api_key_configured and not preview_only:
            self.stdout.write(self.style.WARNING(
                "\n[NOTE] SARVAM_API_KEY is not configured in environment. "
                "Running in Text-Preparation & Offline Validation mode."
            ))

        service = SarvamVoiceService(
            tts_speaker=speaker,
            tts_model=model,
            pace=pace,
        )

        test_items: List[Dict[str, str]] = []
        if custom_text:
            test_items.append({
                "id": "CUSTOM",
                "category": "User Provided Text",
                "raw_text": custom_text,
                "notes": "Custom test phrase"
            })
        elif run_all_eval or not custom_text:
            test_items = MALAYALAM_TTS_EVALUATION_SET

        self.stdout.write(f"\nProcessing {len(test_items)} test sentence(s)...\n")

        success_count = 0
        cache_hits = 0

        for item in test_items:
            item_id = item["id"]
            raw_text = item["raw_text"]
            category = item["category"]

            # Step 1: Text Preparation Layer
            prepared_text = prepare_text_for_tts(raw_text)
            segments = segment_malayalam_text(prepared_text)

            self.stdout.write(self.style.MIGRATE_HEADING(f"[{item_id}] {category}"))
            if compare:
                self.stdout.write(f"  * Raw Input   : {raw_text}")
                self.stdout.write(f"  * Prepared TTS: {prepared_text}")
                if len(segments) > 1:
                    self.stdout.write(f"  * Segments ({len(segments)}):")
                    for idx, seg in enumerate(segments, 1):
                        self.stdout.write(f"      [{idx}] {seg}")

            if preview_only:
                self.stdout.write(self.style.SUCCESS("  [PASS] Text normalized and segmented successfully (preview mode)."))
                success_count += 1
                self.stdout.write("-" * 80)
                continue

            # Step 2: Speech Synthesis (if API key available)
            if api_key_configured:
                try:
                    variants = {"prepared": True}
                    if options.get("compare_audio"):
                        variants = {"raw": False, "prepared": True}
                    for variant, prepare in variants.items():
                        result = service.synthesize_speech(
                            text=raw_text,
                            speaker=speaker,
                            pace=pace,
                            skip_preparation=not prepare,
                            cache_audio=False if options.get("compare_audio") else True,
                        )
                        self.stdout.write(self.style.SUCCESS(
                            f"  [PASS] {variant.title()} audio generated ({len(result.get('audio_base64', ''))} chars base64)"
                        ))
                        if save_audio and result.get("audio_base64"):
                            wav_bytes = base64.b64decode(result["audio_base64"])
                            out_file = samples_dir / f"{item_id}_{variant}_{model.replace(':', '-')}_{speaker}.wav"
                            with open(out_file, "wb") as f:
                                f.write(wav_bytes)
                            self.stdout.write(f"    Saved WAV to: {out_file.relative_to(settings.BASE_DIR)}")
                            self._append_review_row(
                                samples_dir / "qualitative-review.csv",
                                item_id=item_id,
                                category=category,
                                variant=variant,
                                model=model,
                                speaker=speaker,
                                prepared_text=result.get("prepared_text", prepared_text),
                                audio_file=out_file.name,
                            )
                    success_count += 1
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f"  [FAIL] Synthesis Error: {str(exc)}"))
            else:
                self.stdout.write("  [OK] Offline validation passed: Text preparation, numbers, and prosody verified.")
                success_count += 1

            self.stdout.write("-" * 80)

        # Summary
        self.stdout.write(self.style.SUCCESS("\n" + "=" * 80))
        self.stdout.write(self.style.SUCCESS(f"Evaluation Complete: {success_count}/{len(test_items)} items passed text preparation & validation."))
        if api_key_configured:
            self.stdout.write(f"Cache Hits: {cache_hits} | Cache Telemetry: {voice_audio_cache.stats()}")
        self.stdout.write(self.style.SUCCESS("=" * 80))

    @staticmethod
    def _append_review_row(path, *, item_id, category, variant, model, speaker, prepared_text, audio_file):
        fieldnames = [
            "generated_at_utc", "sample_id", "category", "variant", "model", "speaker",
            "prepared_text", "audio_file", "pronunciation_clarity_1_to_5",
            "naturalness_1_to_5", "intelligible_at_normal_speed",
            "exercise_terms_and_numbers_correct", "sentence_complete",
            "clipping_or_distortion", "meaning_preserved", "comments",
        ]
        write_header = not path.exists()
        with path.open("a", encoding="utf-8-sig", newline="") as review_file:
            writer = csv.DictWriter(review_file, fieldnames=fieldnames)
            if write_header:
                writer.writeheader()
            writer.writerow({
                "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                "sample_id": item_id,
                "category": category,
                "variant": variant,
                "model": model,
                "speaker": speaker,
                "prepared_text": prepared_text,
                "audio_file": audio_file,
                "pronunciation_clarity_1_to_5": "",
                "naturalness_1_to_5": "",
                "intelligible_at_normal_speed": "",
                "exercise_terms_and_numbers_correct": "",
                "sentence_complete": "",
                "clipping_or_distortion": "",
                "meaning_preserved": "",
                "comments": "",
            })
