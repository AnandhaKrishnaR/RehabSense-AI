import io
import json
from unittest.mock import MagicMock, patch
from django.test import TestCase, override_settings
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

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
from apps.voice.adapters import (
    SarvamSTTProvider,
    SarvamTTSProvider,
    get_voice_adapter,
    MalayalamSymptomExtractor,
    VoiceAdapterFacade,
)
from apps.voice.services.voice_cache import VoiceAudioCache
from apps.rehabilitation.models import Exercise, TherapyPlan, RehabilitationSession, SymptomReport
from apps.safety.evaluator import evaluate_session_safety


class SarvamVoiceServiceUnitTests(TestCase):
    """
    Unit tests for SarvamVoiceService core service layer.
    All external Sarvam SDK interactions are mocked: 0 network calls, 0 credits used.
    """

    def setUp(self):
        self.mock_client = MagicMock()
        self.service = SarvamVoiceService(
            api_key="test_sarvam_key_xyz",
            stt_model="saaras:v3",
            tts_model="bulbul:v3",
            tts_speaker="shubh",
            language_code="ml-IN",
            pace=1.0,
            speech_sample_rate=22050,
            pronunciation_dictionary_id="test-pronunciation-dict",
            client=self.mock_client,
        )

    def test_transcribe_audio_success(self):
        # Mock SDK response
        mock_response = MagicMock()
        mock_response.transcript = "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു"
        mock_response.language_code = "ml-IN"
        mock_response.language_probability = 0.98
        mock_response.request_id = "req_stt_test_123"
        self.mock_client.speech_to_text.transcribe.return_value = mock_response

        audio_file = SimpleUploadedFile("patient_voice.wav", b"dummy_pcm_wav_data", content_type="audio/wav")

        result = self.service.transcribe_audio(audio_file=audio_file, language="ml-IN")

        self.assertEqual(result["text"], "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു")
        self.assertEqual(result["language"], "ml-IN")
        self.assertEqual(result["provider"], "sarvam")
        self.assertEqual(result["model"], "saaras:v3")
        self.assertEqual(result["request_id"], "req_stt_test_123")
        self.assertFalse(result["is_mock"])
        self.assertAlmostEqual(result["confidence"], 0.98)

        # Verify client was called with mode="transcribe" (no English translation)
        self.mock_client.speech_to_text.transcribe.assert_called_once()
        call_kwargs = self.mock_client.speech_to_text.transcribe.call_args[1]
        self.assertEqual(call_kwargs["mode"], "transcribe")
        self.assertEqual(call_kwargs["language_code"], "ml-IN")

    def test_transcribe_text_fallback_without_audio(self):
        result = self.service.transcribe_audio(
            audio_file=None,
            text_fallback="മുട്ടിന് വേദനയുണ്ട്",
            language="ml-IN",
        )
        self.assertEqual(result["text"], "മുട്ടിന് വേദനയുണ്ട്")
        self.assertEqual(result["provider"], "sarvam_text_fallback")
        self.assertFalse(result["is_mock"])
        # SDK should not have been called for direct text fallback
        self.mock_client.speech_to_text.transcribe.assert_not_called()

    def test_synthesize_speech_success(self):
        # Mock SDK response
        mock_response = MagicMock()
        mock_response.audios = ["UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="]
        mock_response.request_id = "req_tts_test_456"
        self.mock_client.text_to_speech.convert.return_value = mock_response

        text = "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക"
        result = self.service.synthesize_speech(text, language="ml-IN", cache_audio=False)

        self.assertEqual(result["audio_base64"], mock_response.audios[0])
        self.assertEqual(result["mime_type"], "audio/wav")
        self.assertEqual(result["provider"], "sarvam")
        self.assertEqual(result["model"], "bulbul:v3")
        self.assertEqual(result["speaker"], "shubh")
        self.assertEqual(result["request_id"], "req_tts_test_456")
        self.assertFalse(result["is_mock"])
        self.assertEqual(result["fallback_text"], text)
        self.assertEqual(result["prepared_text"], "പതുക്കെ താഴേക്ക് ഇരിക്കുക, പുറം നേരെ വയ്ക്കുക.")

        self.mock_client.text_to_speech.convert.assert_called_once()
        call_kwargs = self.mock_client.text_to_speech.convert.call_args[1]
        self.assertEqual(call_kwargs["text"], result["prepared_text"])
        self.assertEqual(call_kwargs["language_code"], "ml-IN")
        self.assertEqual(call_kwargs["speaker"], "shubh")
        self.assertEqual(call_kwargs["pace"], 1.0)
        self.assertEqual(call_kwargs["speech_sample_rate"], 22050)
        self.assertEqual(call_kwargs["output_audio_codec"], "wav")
        self.assertEqual(call_kwargs["dict_id"], "test-pronunciation-dict")

    def test_transcript_synthesis_can_bypass_preparation_and_cache(self):
        mock_response = MagicMock()
        mock_response.audios = ["UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="]
        self.mock_client.text_to_speech.convert.return_value = mock_response
        raw_text = "Patient report: pain 7/10."

        result = self.service.synthesize_speech(
            raw_text,
            skip_preparation=True,
            cache_audio=False,
        )

        self.assertEqual(result["prepared_text"], raw_text)
        self.assertEqual(self.mock_client.text_to_speech.convert.call_args.kwargs["text"], raw_text)

    def test_v4_flash_is_rejected_for_malayalam_before_api_call(self):
        service = SarvamVoiceService(
            api_key="test_key",
            tts_model="bulbul:v4-flash",
            client=self.mock_client,
        )

        with self.assertRaises(SarvamValidationError):
            service.synthesize_speech("കൈ പതുക്കെ ഉയർത്തുക")

        self.mock_client.text_to_speech.convert.assert_not_called()

    @override_settings(VOICE_CACHE_ENABLED=False)
    def test_long_speech_segments_preserve_sentence_order(self):
        mock_response = MagicMock()
        mock_response.audios = ["UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="]
        self.mock_client.text_to_speech.convert.return_value = mock_response

        result = self.service.synthesize_segments("ആദ്യം കൈ ഉയർത്തുക. പിന്നീട് കൈ താഴ്ത്തുക.")

        self.assertEqual(len(result), 2)
        sent_texts = [call.kwargs["text"] for call in self.mock_client.text_to_speech.convert.call_args_list]
        self.assertEqual(sent_texts, ["ആദ്യം കൈ ഉയർത്തുക.", "പിന്നീട് കൈ താഴ്ത്തുക."])

    def test_cache_key_includes_pronunciation_dictionary(self):
        base = dict(text="വേദന", language="ml-IN", model="bulbul:v3", speaker="shubh")

        first_key = VoiceAudioCache.generate_cache_key(**base, dictionary_id="dict-one")
        second_key = VoiceAudioCache.generate_cache_key(**base, dictionary_id="dict-two")

        self.assertNotEqual(first_key, second_key)

    def test_missing_api_key_raises_configuration_error(self):
        service_no_key = SarvamVoiceService(api_key="", client=None)
        audio = SimpleUploadedFile("test.wav", b"dummy_content", content_type="audio/wav")
        with self.assertRaises(SarvamConfigurationError) as ctx:
            service_no_key.transcribe_audio(audio_file=audio)
        self.assertIn("SARVAM_API_KEY is not configured", str(ctx.exception))

    def test_unauthorized_error_mapping(self):
        class MockUnauthorizedError(Exception):
            pass
        MockUnauthorizedError.__name__ = "UnauthorizedError"

        self.mock_client.speech_to_text.transcribe.side_effect = MockUnauthorizedError("Invalid subscription key 401")
        audio = SimpleUploadedFile("test.wav", b"wav_bytes", content_type="audio/wav")

        with self.assertRaises(SarvamAuthenticationError) as ctx:
            self.service.transcribe_audio(audio_file=audio)
        self.assertIn("authentication failed", str(ctx.exception).lower())

    def test_rate_limit_error_mapping(self):
        class MockTooManyRequestsError(Exception):
            pass
        MockTooManyRequestsError.__name__ = "TooManyRequestsError"

        self.mock_client.speech_to_text.transcribe.side_effect = MockTooManyRequestsError("Rate limit exceeded (429)")
        audio = SimpleUploadedFile("test.wav", b"wav_bytes", content_type="audio/wav")

        with self.assertRaises(SarvamRateLimitError) as ctx:
            self.service.transcribe_audio(audio_file=audio)
        self.assertIn("rate limit", str(ctx.exception).lower())

    def test_timeout_error_mapping(self):
        class MockTimeoutError(Exception):
            pass
        MockTimeoutError.__name__ = "GatewayTimeoutError"

        self.mock_client.text_to_speech.convert.side_effect = MockTimeoutError("Request timed out")

        with self.assertRaises(SarvamTimeoutError) as ctx:
            self.service.synthesize_speech("വ്യായാമം തുടങ്ങുക")
        self.assertIn("timed out", str(ctx.exception).lower())

    def test_validation_empty_audio_file(self):
        empty_audio = SimpleUploadedFile("empty.wav", b"", content_type="audio/wav")
        with self.assertRaises(SarvamValidationError) as ctx:
            self.service.transcribe_audio(audio_file=empty_audio)
        self.assertIn("empty", str(ctx.exception).lower())

    def test_validation_unsupported_audio_format(self):
        invalid_file = SimpleUploadedFile("malware.exe", b"payload", content_type="application/octet-stream")
        with self.assertRaises(SarvamValidationError) as ctx:
            self.service.transcribe_audio(audio_file=invalid_file)
        self.assertIn("unsupported audio format", str(ctx.exception).lower())

    def test_validation_text_too_long_for_model(self):
        too_long = "വേദന " * 600  # > 2500 characters
        with self.assertRaises(SarvamValidationError) as ctx:
            self.service.synthesize_speech(too_long)
        self.assertIn("exceeds maximum supported limit", str(ctx.exception).lower())

    def test_validation_empty_text_for_synthesis(self):
        with self.assertRaises(SarvamValidationError) as ctx:
            self.service.synthesize_speech("   ")
        self.assertIn("empty", str(ctx.exception).lower())


class SarvamVoiceAdapterIntegrationTests(TestCase):
    """
    Tests integrating Sarvam STT and TTS adapters with MalayalamSymptomExtractor.
    """

    def test_sarvam_adapter_connects_to_symptom_extractor(self):
        mock_service = MagicMock()
        mock_service.transcribe_audio.return_value = {
            "text": "കൈ ഉയർത്തുമ്പോൾ തോളിന് വേദന കൂടുന്നു, 7/10",
            "language": "ml-IN",
            "confidence": 0.96,
            "provider": "sarvam",
            "model": "saaras:v3",
            "request_id": "req_mock_99",
            "is_mock": False,
        }

        stt_provider = SarvamSTTProvider(service=mock_service)
        tts_provider = SarvamTTSProvider(service=mock_service)
        extractor = MalayalamSymptomExtractor()

        facade = VoiceAdapterFacade(stt_provider, tts_provider, extractor)

        dummy_audio = SimpleUploadedFile("speech.wav", b"bytes", content_type="audio/wav")
        result = facade.transcribe(audio_file=dummy_audio, language="ml-IN")

        self.assertEqual(result["text"], "കൈ ഉയർത്തുമ്പോൾ തോളിന് വേദന കൂടുന്നു, 7/10")
        self.assertEqual(result["provider"], "sarvam")
        self.assertFalse(result["is_mock"])

        extracted = result["extracted_symptoms"]
        self.assertTrue(extracted["pain_detected"])
        self.assertEqual(extracted["suggested_pain_score"], 7)
        self.assertEqual(extracted["body_area"], "shoulder")
        self.assertTrue(extracted["worsening_pain"])
        # Crucial human-in-the-loop guarantee
        self.assertFalse(extracted["patient_confirmed"])


class SarvamVoiceEndpointAPITests(TestCase):
    """
    API endpoint tests for /api/v1/voice/transcribe/ and /api/v1/voice/speak/
    with MALAYALAM_VOICE_PROVIDER configured as 'sarvam'.
    """

    @override_settings(MALAYALAM_VOICE_PROVIDER='sarvam', SARVAM_API_KEY='test_key')
    @patch('apps.voice.adapters.SarvamSTTProvider.transcribe')
    def test_transcribe_endpoint_with_sarvam_success(self, mock_transcribe):
        mock_transcribe.return_value = {
            "text": "മുട്ടിന് കഠിനമായ വേദനയുണ്ട്",
            "language": "ml-IN",
            "confidence": 0.97,
            "provider": "sarvam",
            "model": "saaras:v3",
            "request_id": "req_api_1",
            "is_mock": False,
        }

        url = reverse('voice:voice-transcribe')
        audio = SimpleUploadedFile("audio.webm", b"webm_bytes", content_type="audio/webm")
        response = self.client.post(url, data={'audio': audio, 'language': 'ml-IN'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["provider"], "sarvam")
        self.assertEqual(response.data["text"], "മുട്ടിന് കഠിനമായ വേദനയുണ്ട്")
        self.assertFalse(response.data["is_mock"])

        extracted = response.data["extracted_symptoms"]
        self.assertTrue(extracted["pain_detected"])
        self.assertEqual(extracted["suggested_pain_score"], 8)
        self.assertEqual(extracted["body_area"], "knee")

    @override_settings(MALAYALAM_VOICE_PROVIDER='sarvam', SARVAM_API_KEY='test_key')
    @patch('apps.voice.adapters.SarvamSTTProvider.transcribe')
    def test_transcribe_endpoint_handles_rate_limit(self, mock_transcribe):
        mock_transcribe.side_effect = SarvamRateLimitError("Quota exceeded")

        url = reverse('voice:voice-transcribe')
        audio = SimpleUploadedFile("audio.wav", b"bytes", content_type="audio/wav")
        response = self.client.post(url, data={'audio': audio})

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data["error"], "rate_limited")

    @override_settings(MALAYALAM_VOICE_PROVIDER='sarvam', SARVAM_API_KEY='test_key')
    @patch('apps.voice.adapters.SarvamSTTProvider.transcribe')
    def test_transcribe_endpoint_handles_auth_failure(self, mock_transcribe):
        mock_transcribe.side_effect = SarvamAuthenticationError("Invalid API key")

        url = reverse('voice:voice-transcribe')
        audio = SimpleUploadedFile("audio.wav", b"bytes", content_type="audio/wav")
        response = self.client.post(url, data={'audio': audio})

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data["error"], "authentication_error")

    @override_settings(
        MALAYALAM_VOICE_PROVIDER='sarvam',
        MALAYALAM_TTS_PROVIDER='sarvam',
        SARVAM_API_KEY='test_key',
    )
    @patch('apps.voice.adapters.SarvamTTSProvider.synthesize')
    def test_speak_endpoint_with_sarvam_success(self, mock_synthesize):
        mock_synthesize.return_value = {
            "audio_url": None,
            "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
            "mime_type": "audio/wav",
            "provider": "sarvam",
            "model": "bulbul:v3",
            "speaker": "shubh",
            "request_id": "req_speak_1",
            "is_mock": False,
            "fallback_text": "നന്നായി ചെയ്തു",
        }

        url = reverse('voice:voice-speak')
        response = self.client.post(
            url,
            data=json.dumps({'text': 'നന്നായി ചെയ്തു', 'language': 'ml-IN'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["provider"], "sarvam")
        self.assertIn("audio_base64", response.data)
        self.assertEqual(response.data["mime_type"], "audio/wav")
        self.assertEqual(response.data["speaker"], "shubh")

    def test_voice_templates_endpoint_marks_text_as_pending_review(self):
        response = self.client.get(reverse('voice:voice-templates'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["review_status"],
            "draft_pending_fluent_speaker_and_clinician_review",
        )
        self.assertIn("safety_pause_pain", response.data["templates"])


class SarvamVoicePhysiotherapySafetyIntegrationTests(TestCase):
    """
    End-to-end integration test validating the workflow:
    Sarvam Speech -> Symptom Extraction -> Patient Confirmation -> Deterministic Safety Evaluation.
    """

    def setUp(self):
        self.exercise, _ = Exercise.objects.get_or_create(
            id="shoulder_flexion",
            defaults={
                "name": "Shoulder Flexion (Arm Raise)",
                "description": "Smooth arm elevation in sagittal plane",
                "instructions_en": "Raise your arm smoothly to ear level.",
                "instructions_ml": "കൈ സാവധാനം മുകളിലേക്ക് ഉയർത്തുക.",
                "target_joints": ["left_shoulder", "right_shoulder"],
                "default_target_reps": 10,
                "is_active": True,
            }
        )
        self.plan = TherapyPlan.objects.create(
            clinician_name="Dr. Maya (Senior PT)",
            instructions="Maintain comfortable range of motion",
            is_approved=True,
            approval_status='approved',
        )
        self.session = RehabilitationSession.objects.create(
            exercise=self.exercise,
            therapy_plan=self.plan,
            status="in_progress",
            target_reps=10,
        )

    def test_sarvam_transcribed_symptom_triggers_clinician_review_flag(self):
        # 1. Simulate Sarvam STT transcribing Malayalam speech
        raw_speech_text = "കൈ ഉയർത്തുമ്പോൾ കടുത്ത വേദന കൂടുന്നു 8/10"

        # 2. Extract clinical symptoms using Malayalam extractor
        extractor = MalayalamSymptomExtractor()
        draft_symptoms = extractor.extract_symptoms(raw_speech_text)

        self.assertTrue(draft_symptoms["pain_detected"])
        self.assertEqual(draft_symptoms["suggested_pain_score"], 8)
        self.assertEqual(draft_symptoms["body_area"], "arm")
        self.assertTrue(draft_symptoms["worsening_pain"])
        self.assertFalse(draft_symptoms["patient_confirmed"])

        # 3. Patient confirms draft symptoms through UI dialog
        symptom_report = SymptomReport.objects.create(
            session=self.session,
            pain_score=draft_symptoms["suggested_pain_score"],
            difficulty="hard",
            body_area=draft_symptoms["body_area"],
            raw_transcript=raw_speech_text,
            patient_confirmed=True,
            extraction_status='confirmed',
        )

        # 4. Evaluate deterministic safety rules
        eval_result = evaluate_session_safety(
            session=self.session,
            pain_score=symptom_report.pain_score,
            transcript=raw_speech_text,
            worsening_pain=draft_symptoms["worsening_pain"],
            patient_confirmed=symptom_report.patient_confirmed,
        )

        # 5. Assert safety flag is raised requiring clinician review
        self.assertTrue(eval_result["review_required"])
        self.assertIn("high_pain_score", eval_result["reasons"])
        self.assertIn("patient_reported_increasing_pain", eval_result["reasons"])

        # Reload session from DB to verify review_required persisted
        self.session.refresh_from_db()
        self.assertTrue(self.session.review_required)
