from django.test import TestCase
from django.urls import reverse
from rest_framework import status

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

    def test_speak_endpoint_returns_audio_and_fallback_text(self):
        url = reverse('voice:voice-speak')
        payload = {'text': 'വ്യായാമം നിർത്തുക', 'language': 'ml'}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('fallback_text'), 'വ്യായാമം നിർത്തുക')
        self.assertIn('audio_base64', response.data)
