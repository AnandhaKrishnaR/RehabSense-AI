from rest_framework.test import APIClient
import io
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from apps.voice.adapters import (
    AI4BharatSTTProvider,
    GTTSVoiceProvider,
    MalayalamSymptomExtractor,
    MockSTTProvider,
    SarvamTTSProvider,
    WhisperSTTProvider,
    extract_symptoms_from_text,
    get_voice_adapter,
)

@override_settings(MALAYALAM_VOICE_PROVIDER='mock')
class VoiceEndpointTests(TestCase):
    @patch('gtts.gTTS', side_effect=OSError('offline'))
    def test_gtts_failure_returns_no_tone_for_browser_fallback(self, mock_gtts):
        result = GTTSVoiceProvider().synthesize('വ്യായാമം നിർത്തുക', language='ml')

        self.assertIsNone(result['audio_base64'])
        self.assertEqual(result['provider'], 'gtts_unavailable')
        self.assertEqual(result['fallback_text'], 'വ്യായാമം നിർത്തുക')

    def test_transcribe_audio_returns_malayalam_text_and_symptoms(self):
        url = reverse('voice:voice-transcribe')
        response = self.client.post(url, data={'language': 'ml'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('language'), 'ml')
        self.assertEqual(response.data.get('provider'), 'mock')
        self.assertTrue(response.data.get('is_mock'))
        self.assertIn('text', response.data)
        self.assertIn('extracted_symptoms', response.data)
        symptoms = response.data['extracted_symptoms']
        self.assertTrue(symptoms['pain_detected'])
        self.assertIsNone(symptoms['suggested_pain_score'])
        self.assertIn('pain_intensity', symptoms['clarification_needed'])

    def test_transcribe_custom_text_extracts_symptoms(self):
        url = reverse('voice:voice-transcribe')
        # Test mild knee symptom
        response = self.client.post(url, data={'text': 'കാൽമുട്ടിൽ ചെറിയ വേദനയുണ്ട്', 'language': 'ml'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        extracted = response.data['extracted_symptoms']
        self.assertTrue(extracted['pain_detected'])
        self.assertLessEqual(extracted['suggested_pain_score'], 4)
        self.assertEqual(extracted['body_area'], 'knee')

    def test_transcribe_with_text_fallback(self):
        url = reverse('voice:voice-transcribe')
        payload = {'text': 'തോളിന് കടുത്ത വേദനയുണ്ട്', 'language': 'ml'}
        response = self.client.post(url, data=payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('text'), 'തോളിന് കടുത്ത വേദനയുണ്ട്')
        symptoms = response.data.get('extracted_symptoms', {})
        self.assertTrue(symptoms.get('pain_detected'))
        self.assertEqual(symptoms.get('suggested_pain_score'), 8)
        self.assertEqual(symptoms.get('body_area'), 'shoulder')
        self.assertFalse(symptoms.get('patient_confirmed'))

    def test_transcribe_rejects_oversized_file(self):
        url = reverse('voice:voice-transcribe')
        # Create dummy file > 10MB
        oversized_content = b'x' * (11 * 1024 * 1024)
        audio = SimpleUploadedFile("big_audio.wav", oversized_content, content_type="audio/wav")
        response = self.client.post(url, data={'audio': audio, 'language': 'ml'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('error'), 'file_too_large')

    def test_transcribe_rejects_unsupported_audio_format(self):
        url = reverse('voice:voice-transcribe')
        bad_file = SimpleUploadedFile("script.exe", b'binarydata', content_type="application/octet-stream")
        response = self.client.post(url, data={'audio': bad_file, 'language': 'ml'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('error'), 'unsupported_audio_format')

    @patch('apps.voice.adapters.SarvamTTSProvider.synthesize')
    def test_speak_endpoint_returns_sarvam_audio_and_fallback_text(self, mock_synthesize):
        mock_synthesize.return_value = {
            'audio_base64': 'dGVzdA==',
            'mime_type': 'audio/wav',
            'provider': 'sarvam',
            'fallback_text': 'വ്യായാമം നിർത്തുക',
        }
        url = reverse('voice:voice-speak')
        payload = {'text': 'വ്യായാമം നിർത്തുക', 'language': 'ml'}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('fallback_text'), 'വ്യായാമം നിർത്തുക')
        self.assertEqual(response.data.get('provider'), 'sarvam')
        self.assertEqual(response.data.get('audio_base64'), 'dGVzdA==')
        mock_synthesize.assert_called_once()

    def test_speak_endpoint_rejects_non_sarvam_provider(self):
        response = self.client.post(
            reverse('voice:voice-speak'),
            data={'text': 'വ്യായാമം നിർത്തുക', 'provider': 'gemini'},
            content_type='application/json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error'], 'invalid_provider')

    def test_symptom_extractor_malayalam_rules(self):
        extractor = MalayalamSymptomExtractor()

        # Arm raise pain
        res1 = extractor.extract_symptoms("കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു")
        self.assertTrue(res1['pain_detected'])
        self.assertEqual(res1['body_area'], 'arm')
        self.assertTrue(res1['worsening_pain'])
        self.assertFalse(res1['patient_confirmed'])

        # Explicit numeric pain
        res2 = extractor.extract_symptoms("മുട്ടിന് വേദന 7, വളരെ ബുദ്ധിമുട്ടാണ്")
        self.assertTrue(res2['pain_detected'])
        self.assertEqual(res2['suggested_pain_score'], 7)
        self.assertEqual(res2['body_area'], 'knee')
        self.assertEqual(res2['suggested_difficulty'], 'very_hard')

        # Mild fatigue without anatomical area (requires clarification)
        res3 = extractor.extract_symptoms("കുറച്ച് ക്ഷീണം തോന്നുന്നു, വേദനയില്ല")
        self.assertEqual(res3['suggested_pain_score'], 0)
        self.assertEqual(res3['suggested_difficulty'], 'moderate')
        self.assertEqual(res3['body_area'], '')

        chest_pain = extractor.extract_symptoms('നെഞ്ചിൽ കടുത്ത വേദന 9/10 തോന്നുന്നു')
        self.assertEqual(chest_pain['suggested_pain_score'], 9)
        self.assertEqual(chest_pain['body_area'], 'chest')

    def test_symptom_extractor_handles_colloquial_pain_and_spoken_scores(self):
        extractor = MalayalamSymptomExtractor()

        colloquial = extractor.extract_symptoms('കൈ നീക്കുമ്പോൾ നീറുന്നു')
        self.assertTrue(colloquial['pain_detected'])
        self.assertIsNone(colloquial['suggested_pain_score'])
        self.assertEqual(colloquial['body_area'], 'arm')
        self.assertIn('pain_intensity', colloquial['clarification_needed'])

        spoken_score = extractor.extract_symptoms('വേദന ഏഴ്')
        self.assertEqual(spoken_score['suggested_pain_score'], 7)

        spoken_vas = extractor.extract_symptoms('പത്തിൽ ആറാണ് വേദന')
        self.assertEqual(spoken_vas['suggested_pain_score'], 6)

        mild = extractor.extract_symptoms('വേദന കുറവാണ്')
        self.assertEqual(mild['suggested_pain_score'], 2)

        colloquial_mild = extractor.extract_symptoms('ചെറുതായി വേദനിക്കുന്നു')
        self.assertEqual(colloquial_mild['suggested_pain_score'], 2)

        colloquial_mild = extractor.extract_symptoms('കുറച്ചൊക്കെ വേദന')
        self.assertEqual(colloquial_mild['suggested_pain_score'], 2)

        colloquial_severe = extractor.extract_symptoms('ഭയങ്കര വേദനയാണ്')
        self.assertEqual(colloquial_severe['suggested_pain_score'], 8)

        colloquial_severe = extractor.extract_symptoms('പെരുത്ത വേദന')
        self.assertEqual(colloquial_severe['suggested_pain_score'], 8)

        unspecified = extractor.extract_symptoms('കാൽ വലിവും നോവും തോന്നുന്നു')
        self.assertTrue(unspecified['pain_detected'])
        self.assertIsNone(unspecified['suggested_pain_score'])
        self.assertIn('pain_intensity', unspecified['clarification_needed'])

    def test_explicit_no_pain_is_not_reported_as_pain(self):
        extractor = MalayalamSymptomExtractor()
        result = extractor.extract_symptoms('കടുത്ത വേദന ഇല്ല')

        self.assertFalse(result['pain_detected'])
        self.assertEqual(result['suggested_pain_score'], 0)
        self.assertEqual(result['clarification_needed'], [])

        alternate_negation = extractor.extract_symptoms('വേദന തീരെ ഇല്ല')
        self.assertFalse(alternate_negation['pain_detected'])
        self.assertEqual(alternate_negation['suggested_pain_score'], 0)

    def test_pain_synonym_without_intensity_stays_unscored(self):
        result = MalayalamSymptomExtractor().extract_symptoms('കൈയിൽ നൊമ്പരം തോന്നുന്നു')

        self.assertTrue(result['pain_detected'])
        self.assertIsNone(result['suggested_pain_score'])
        self.assertIn('pain_intensity', result['clarification_needed'])


class VoiceEvaluationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_evaluation_get_returns_presets_and_rubric(self):
        url = reverse('voice:voice-evaluation')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("presets", response.data)
        self.assertEqual(len(response.data["presets"]["ml-IN"]), 8)
        self.assertEqual(len(response.data["presets"]["en-IN"]), 8)
        self.assertIn("rubric", response.data)
        self.assertEqual(len(response.data["rubric"]), 5)

    def test_evaluation_post_valid_records_entry(self):
        url = reverse('voice:voice-evaluation')
        payload = {
            "provider": "sarvam",
            "speech_language": "ml-IN",
            "voice": "shubh",
            "sentence": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
            "pronunciation_score": 5,
            "naturalness_score": 4,
            "clarity_score": 5,
            "medical_terms_score": 4,
            "overall_score": 5,
            "notes": "Natural Kerala accent, clear pauses.",
        }
        response = self.client.post(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["overall_score"], 5)
        self.assertEqual(response.data["notes"], "Natural Kerala accent, clear pauses.")

    def test_evaluation_post_invalid_score_rejected(self):
        url = reverse('voice:voice-evaluation')
        payload = {
            "provider": "sarvam",
            "speech_language": "ml-IN",
            "voice": "shubh",
            "sentence": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
            "pronunciation_score": 6,  # Invalid: > 5
            "naturalness_score": 4,
            "clarity_score": 5,
            "medical_terms_score": 4,
            "overall_score": 5,
        }
        response = self.client.post(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "validation_error")


class VoiceAdapterCompatibilityTests(TestCase):
    def test_symptom_extraction_wrapper_uses_conservative_extractor(self):
        result = extract_symptoms_from_text('തോളിന് കടുത്ത വേദനയുണ്ട്', language='ml')

        self.assertTrue(result['pain_detected'])
        self.assertEqual(result['suggested_pain_score'], 8)
        self.assertEqual(result['body_area'], 'shoulder')
        self.assertFalse(result['patient_confirmed'])

    def test_factory_preserves_stt_choices_and_sarvam_tts(self):
        expected_stt_providers = (
            ('mock', MockSTTProvider),
            ('ai4bharat', AI4BharatSTTProvider),
            ('whisper', WhisperSTTProvider),
        )

        for provider_name, expected_stt_type in expected_stt_providers:
            with self.subTest(provider=provider_name):
                adapter = get_voice_adapter(provider_name, 'sarvam')

                self.assertIsInstance(adapter.stt, expected_stt_type)
                self.assertIsInstance(adapter.tts, SarvamTTSProvider)

    def test_speak_endpoint_without_text_returns_400(self):
        url = reverse('voice:voice-speak')
        response = self.client.post(url, data={}, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
