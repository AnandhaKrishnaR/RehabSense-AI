from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from apps.rehabilitation.models import Exercise, RehabilitationSession
import uuid

class SessionEndpointTests(TestCase):
    def setUp(self):
        self.squat = Exercise.objects.create(
            id='bodyweight_squat',
            name='Bodyweight Squat',
            description='Squat desc',
            instructions_en='Chest up',
            instructions_ml='നേരെ നിൽക്കുക',
            target_joints=['left_knee'],
            demo_parameters={'inflection_knee_angle': 100.0},
            default_target_reps=10,
        )

    def test_create_session_with_valid_exercise(self):
        url = reverse('rehabilitation:session-list-create')
        payload = {'exercise_id': 'bodyweight_squat', 'target_reps': 12}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['exercise'], 'bodyweight_squat')
        self.assertEqual(response.data['target_reps'], 12)
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertFalse(response.data['review_required'])

    def test_create_session_with_invalid_exercise_returns_400(self):
        url = reverse('rehabilitation:session-list-create')
        payload = {'exercise_id': 'invalid_exercise_slug'}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('exercise_id', response.data)

    def test_get_session_by_id(self):
        session = RehabilitationSession.objects.create(
            exercise=self.squat,
            target_reps=10,
            status='in_progress',
        )
        url = reverse('rehabilitation:session-detail', kwargs={'session_id': session.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], str(session.id))
        self.assertEqual(response.data['exercise'], 'bodyweight_squat')

    def test_get_nonexistent_session_returns_404(self):
        url = reverse('rehabilitation:session-detail', kwargs={'session_id': uuid.uuid4()})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
