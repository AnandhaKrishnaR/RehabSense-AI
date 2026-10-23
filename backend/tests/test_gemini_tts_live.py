"""Opt-in Gemini TTS smoke test; never runs during normal test suites."""

import base64
import os
from unittest import skipUnless

from django.test import SimpleTestCase

from apps.voice.services.gemini_tts_service import GeminiTTSService


@skipUnless(
    os.getenv("RUN_GEMINI_LIVE_TESTS") == "1" and bool(os.getenv("GEMINI_API_KEY", "").strip()),
    "Set RUN_GEMINI_LIVE_TESTS=1 and GEMINI_API_KEY to enable billable live Gemini TTS testing.",
)
class GeminiTTSLiveTests(SimpleTestCase):
    def test_live_malayalam_audio_is_wav(self):
        result = GeminiTTSService().synthesize("നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.")
        audio_bytes = base64.b64decode(result["audio_base64"], validate=True)

        self.assertEqual(result["provider"], "gemini")
        self.assertEqual(result["mime_type"], "audio/wav")
        self.assertTrue(audio_bytes.startswith(b"RIFF"))
        self.assertEqual(audio_bytes[8:12], b"WAVE")
