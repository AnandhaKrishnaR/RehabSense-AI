from django.test import TestCase
from django.urls import reverse
from rest_framework import status
import base64
from apps.voice.adapters import extract_symptoms_from_text, get_voice_adapter, MockMalayalamVoiceAdapter, AI4BharatVoiceAdapter, WhisperVoiceAdapter

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
        symptoms = response.data['extracted_symptoms']
        self.assertTrue(symptoms['pain_detected'])
        self.assertIsNotNone(symptoms['suggested_pain_score'])

    def test_transcribe_custom_text_extracts_symptoms(self):
        url = reverse('voice:voice-transcribe')
        # Test mild knee symptom
        response = self.client.post(url, data={'text': 'കാൽമുട്ടിൽ ചെറിയ ബുദ്ധിമുട്ടുണ്ട്', 'language': 'ml'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        extracted = response.data['extracted_symptoms']
        self.assertTrue(extracted['pain_detected'])
        self.assertLessEqual(extracted['suggested_pain_score'], 4)
        self.assertEqual(extracted['body_area'], 'knee')

    def test_speak_endpoint_returns_audio_and_fallback_text(self):
        url = reverse('voice:voice-speak')
        payload = {'text': 'വ്യായാമം നിർത്തുക', 'language': 'ml'}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('fallback_text'), 'വ്യായാമം നിർത്തുക')
        self.assertIn('audio_base64', response.data)
        
        # Verify valid base64 WAV payload
        audio_bytes = base64.b64decode(response.data['audio_base64'])
        self.assertTrue(audio_bytes.startswith(b'RIFF'))
        self.assertIn(b'WAVEfmt ', audio_bytes)

    def test_speak_endpoint_without_text_returns_400(self):
        url = reverse('voice:voice-speak')
        response = self.client.post(url, data={}, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_symptom_extractor_rules(self):
        # 1. Severe pain
        s1 = extract_symptoms_from_text("കടുത്ത വേദന തോന്നുന്നു", language='ml')
        self.assertTrue(s1['pain_detected'])
        self.assertGreaterEqual(s1['suggested_pain_score'], 7)

        # 2. Urgent symptoms
        s2 = extract_symptoms_from_text("ശ്വാസതടസ്സം അനുഭവപ്പെടുന്നു", language='ml')
        self.assertTrue(s2['pain_detected'])
        self.assertGreaterEqual(s2['suggested_pain_score'], 8)

        # 3. Comfort / easy
        s3 = extract_symptoms_from_text("വ്യായാമം ചെയ്യാൻ എളുപ്പമാണ്", language='ml')
        self.assertFalse(s3['pain_detected'])
        self.assertEqual(s3['suggested_pain_score'], 0)
        self.assertEqual(s3['suggested_difficulty'], 'easy')

        # 4. Explicit number
        s4 = extract_symptoms_from_text("വേദന 8/10 ഉണ്ട്", language='ml')
        self.assertEqual(s4['suggested_pain_score'], 8)

    def test_voice_adapter_factory(self):
        mock_adapter = get_voice_adapter('mock')
        self.assertIsInstance(mock_adapter, MockMalayalamVoiceAdapter)

        ai4bharat_adapter = get_voice_adapter('ai4bharat')
        self.assertIsInstance(ai4bharat_adapter, AI4BharatVoiceAdapter)

        whisper_adapter = get_voice_adapter('whisper')
        self.assertIsInstance(whisper_adapter, WhisperVoiceAdapter)
