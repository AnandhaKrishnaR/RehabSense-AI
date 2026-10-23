from django.test import TestCase
from django.urls import reverse
from rest_framework import status

class HealthCheckEndpointTests(TestCase):
    def test_health_check_returns_200_and_expected_fields(self):
        url = reverse('health-check')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'healthy')
        self.assertIn('version', response.data)
        self.assertIn('demo_mode', response.data)
        self.assertIn('voice_provider', response.data)
        self.assertIn('database', response.data)
