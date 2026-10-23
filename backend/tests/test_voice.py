import io
from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from apps.voice.adapters import MalayalamSymptomExtractor

class VoiceEndpointTests(TestCase):
    def test_transcribe_audio_returns_malayalam_text_and_symptoms(self):
        url = reverse('voice:voice-transcribe')
        response = self.client.post(url, data={'language': 'ml'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('language'), 'ml')
        self.assertEqual(response.data.get('provider'), 'mock')
        self.assertTrue(response.data.get('is_mock'))
        self.assertIn('text', response.data)
        self.assertIn('extracted_symptoms', response.data)

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

    def test_speak_endpoint_returns_audio_and_fallback_text(self):
        url = reverse('voice:voice-speak')
        payload = {'text': 'വ്യായാമം നിർത്തുക', 'language': 'ml'}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('fallback_text'), 'വ്യായാമം നിർത്തുക')
        self.assertIn('audio_base64', response.data)

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
