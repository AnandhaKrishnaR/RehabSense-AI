import base64
import io
import wave
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework import status

from apps.voice.adapters import GeminiTTSProvider, SarvamSTTProvider, get_voice_adapter
from apps.voice.services.gemini_tts_service import (
    DEFAULT_GEMINI_TTS_MODEL,
    DEFAULT_GEMINI_TTS_VOICE,
    GeminiTTSAuthenticationError,
    GeminiTTSConfigurationError,
    GeminiTTSRateLimitError,
    GeminiTTSService,
    GeminiTTSServiceError,
    GeminiTTSTimeoutError,
    GeminiTTSValidationError,
)
from apps.voice.services.tts_language import check_tts_compatibility


def wav_fixture():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(24000)
        output.writeframes(b"\x00\x00" * 8)
    return buffer.getvalue()


class GeminiTTSServiceTests(SimpleTestCase):
    def setUp(self):
        self.client = MagicMock()
        self.audio_bytes = wav_fixture()
        self.client.interactions.create.return_value = SimpleNamespace(
            output_audio=SimpleNamespace(
                data=base64.b64encode(self.audio_bytes).decode("ascii"),
                mime_type="audio/wav",
            )
        )
        self.client.voices.list.return_value = SimpleNamespace(voices=[
            SimpleNamespace(id="Kore", display_name="Kore", language_code="ml-IN", gender="female"),
            SimpleNamespace(id="Kore", display_name="Kore", language_code="en-IN", gender="female"),
            SimpleNamespace(id="Puck", display_name="Puck", language_code="en-IN", gender="male"),
        ])
        self.service = GeminiTTSService(
            api_key="test-key",
            model=DEFAULT_GEMINI_TTS_MODEL,
            voice=DEFAULT_GEMINI_TTS_VOICE,
            client=self.client,
        )

    def test_generates_audio_using_documented_interactions_request(self):
        result = self.service.synthesize("നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.")

        self.assertEqual(base64.b64decode(result["audio_base64"]), self.audio_bytes)
        self.assertEqual(result["mime_type"], "audio/wav")
        self.assertEqual(result["provider"], "gemini")
        self.assertEqual(result["model"], "gemini-3.8-flash-tts")
        self.assertEqual(result["speaker"], "Kore")
        self.assertFalse(result["is_mock"])

        kwargs = self.client.interactions.create.call_args.kwargs
        self.assertEqual(kwargs["model"], "gemini-3.8-flash-tts")
        self.assertEqual(kwargs["response_format"], {"type": "audio"})
        self.assertFalse(kwargs["store"])
        content = kwargs["input"][0]["content"][0]
        self.assertEqual(content["text"], "നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.")
        self.assertEqual(content["annotations"][0]["type"], "speech_metadata")
        self.assertIn("calm", content["annotations"][0]["style"].lower())
        self.assertEqual(kwargs["generation_config"]["speech_config"], [{"voice": "Kore"}])

    def test_allows_voice_override_and_text_preparation_opt_out(self):
        raw_text = "  Patient report: pain 7/10.  "
        self.service.synthesize(raw_text, voice="Puck", prepare_text=False, speech_language="en-IN")

        kwargs = self.client.interactions.create.call_args.kwargs
        self.assertEqual(kwargs["input"][0]["content"][0]["text"], raw_text)
        self.assertEqual(kwargs["generation_config"]["speech_config"], [{"voice": "Puck"}])

    def test_voice_catalog_is_filtered_by_speech_language(self):
        options = self.service.list_voices("ml-IN")

        self.assertEqual([option["id"] for option in options], ["Kore"])
        self.assertEqual(options[0]["gender"], "female")

    def test_long_text_returns_ordered_wav_segments(self):
        result = self.service.synthesize_segments("ആദ്യം കൈ ഉയർത്തുക. പിന്നീട് കൈ താഴ്ത്തുക.")

        self.assertEqual(result["count"], 2)
        self.assertEqual(len(result["segments"]), 2)
        self.assertEqual(
            [call.kwargs["input"][0]["content"][0]["text"] for call in self.client.interactions.create.call_args_list],
            ["ആദ്യം കൈ ഉയർത്തുക.", "പിന്നീട് കൈ താഴ്ത്തുക."],
        )
        self.assertTrue(all(segment["mime_type"] == "audio/wav" for segment in result["segments"]))

    def test_missing_api_key_fails_before_client_creation(self):
        service = GeminiTTSService(api_key="", client=None)
        with self.assertRaises(GeminiTTSConfigurationError):
            service.synthesize("വ്യായാമം തുടങ്ങാം")

    def test_empty_and_oversized_text_are_rejected(self):
        with self.assertRaises(GeminiTTSValidationError):
            self.service.synthesize("   ")
        with self.assertRaises(GeminiTTSValidationError):
            self.service.synthesize("ക" * 4001)
        self.client.interactions.create.assert_not_called()

    def test_authentication_rate_limit_and_timeout_errors_are_mapped(self):
        cases = [
            (401, GeminiTTSAuthenticationError),
            (400, GeminiTTSAuthenticationError),
            (429, GeminiTTSRateLimitError),
            (504, GeminiTTSTimeoutError),
        ]
        for code, expected_error in cases:
            with self.subTest(code=code):
                provider_error = Exception("invalid API key; provider details must not leak" if code == 400 else "provider details must not leak")
                provider_error.code = code
                self.client.interactions.create.side_effect = provider_error
                with self.assertRaises(expected_error) as caught:
                    self.service.synthesize("വ്യായാമം തുടങ്ങാം")
                self.assertNotIn("provider details", str(caught.exception))

    def test_missing_or_invalid_audio_is_rejected(self):
        self.client.interactions.create.return_value = SimpleNamespace(output_audio=None)
        with self.assertRaises(GeminiTTSServiceError):
            self.service.synthesize("വ്യായാമം തുടങ്ങാം")

        self.client.interactions.create.return_value = SimpleNamespace(
            output_audio=SimpleNamespace(data="not-base64", mime_type="audio/wav")
        )
        with self.assertRaises(GeminiTTSServiceError):
            self.service.synthesize("വ്യായാമം തുടങ്ങാം")

        self.client.interactions.create.return_value = SimpleNamespace(
            output_audio=SimpleNamespace(
                data=base64.b64encode(b"not a wav").decode("ascii"),
                mime_type="audio/wav",
            )
        )
        with self.assertRaises(GeminiTTSServiceError):
            self.service.synthesize("വ്യായാമം തുടങ്ങാം")


@override_settings(MALAYALAM_VOICE_PROVIDER="sarvam", MALAYALAM_TTS_PROVIDER="gemini")
class GeminiVoiceEndpointTests(TestCase):
    @patch("apps.voice.adapters.GeminiTTSProvider.synthesize")
    def test_existing_speak_endpoint_returns_json_base64_wav(self, mock_synthesize):
        audio_bytes = wav_fixture()
        mock_synthesize.return_value = {
            "audio_url": None,
            "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
            "mime_type": "audio/wav",
            "provider": "gemini",
            "model": "gemini-3.8-flash-tts",
            "speaker": "Kore",
            "is_mock": False,
            "fallback_text": "നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.",
            "prepared_text": "നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.",
            "cached": False,
        }

        response = self.client.post(
            reverse("voice:voice-speak"),
            data={"text": "നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.", "language_code": "ml-IN"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.data["mime_type"], "audio/wav")
        self.assertEqual(base64.b64decode(response.data["audio_base64"]), audio_bytes)
        mock_synthesize.assert_called_once()
        self.assertEqual(mock_synthesize.call_args.kwargs["language"], "ml-IN")

    @patch("apps.voice.adapters.GeminiTTSProvider.synthesize", side_effect=GeminiTTSAuthenticationError("sanitized"))
    def test_speak_endpoint_maps_authentication_error(self, _mock_synthesize):
        response = self.client.post(
            reverse("voice:voice-speak"),
            data={"text": "വ്യായാമം തുടങ്ങാം"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data["error"], "authentication_error")

    @override_settings(GEMINI_API_KEY="")
    def test_speak_endpoint_handles_missing_gemini_key(self):
        response = self.client.post(
            reverse("voice:voice-speak"),
            data={"text": "വ്യായാമം തുടങ്ങാം"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["error"], "service_unavailable")

    def test_gemini_tts_selection_does_not_replace_sarvam_stt(self):
        adapter = get_voice_adapter()

        self.assertIsInstance(adapter.stt, SarvamSTTProvider)
        self.assertIsInstance(adapter.tts, GeminiTTSProvider)

    @patch("apps.voice.adapters.GeminiTTSProvider.synthesize")
    def test_english_source_with_malayalam_speech_is_rejected_without_synthesis(self, mock_synthesize):
        response = self.client.post(
            reverse("voice:voice-speak"),
            data={
                "text": "Raise your arms slowly.",
                "text_language": "en-IN",
                "speech_language": "ml-IN",
                "provider": "gemini",
                "voice": "Kore",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertEqual(response.data["error"], "language_incompatible")
        self.assertEqual(response.data["original_text"], "Raise your arms slowly.")
        mock_synthesize.assert_not_called()

    @patch("apps.voice.adapters.GeminiTTSProvider.synthesize")
    def test_english_source_with_english_speech_sends_exact_input(self, mock_synthesize):
        mock_synthesize.return_value = {"audio_base64": "", "mime_type": "audio/wav", "provider": "gemini"}
        original_text = "  Raise your arms slowly.  "

        response = self.client.post(
            reverse("voice:voice-speak"),
            data={"text": original_text, "text_language": "en-IN", "speech_language": "en-IN", "voice": "Kore"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_synthesize.call_args.args[0], original_text)
        self.assertEqual(response.data["text_sent"], original_text)

    def test_mixed_language_is_allowed_only_for_documented_sarvam_v3(self):
        original_text = "ഇനി shoulder flexion ചെയ്യുക"
        sarvam_result = check_tts_compatibility(original_text, "auto", "ml-IN", "sarvam", "bulbul:v3")
        gemini_result = check_tts_compatibility(original_text, "auto", "ml-IN", "gemini", "gemini-3.8-flash-tts")

        self.assertTrue(sarvam_result["compatible"])
        self.assertFalse(gemini_result["compatible"])

    @patch("apps.voice.views.GeminiTTSService.list_voices", return_value=[
        {"id": "Kore", "label": "Kore (female)", "gender": "female", "language_code": "en-IN"},
    ])
    def test_voice_options_endpoint_returns_provider_verified_voices(self, _mock_list):
        response = self.client.get(reverse("voice:voice-options"), {"provider": "gemini", "speech_language": "en-IN"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["voices"][0]["id"], "Kore")
        self.assertEqual(response.data["voices"][0]["gender"], "female")
