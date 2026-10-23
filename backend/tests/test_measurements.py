from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from apps.rehabilitation.models import Exercise, RehabilitationSession
from apps.movement.models import MovementMeasurement
import uuid

class MovementMeasurementEndpointTests(TestCase):
    def setUp(self):
        self.exercise = Exercise.objects.create(
            id='bodyweight_squat',
            name='Bodyweight Squat',
            description='Squat desc',
            instructions_en='Chest up',
            instructions_ml='നേരെ നിൽക്കുക',
            target_joints=['left_knee', 'right_knee'],
            demo_parameters={'inflection_knee_angle': 100.0},
        )
        self.session = RehabilitationSession.objects.create(
            exercise=self.exercise,
            target_reps=10,
            status='in_progress',
        )

    def test_submit_valid_measurement(self):
        url = reverse('movement:session-measurement-create', kwargs={'session_id': self.session.id})
        payload = {
            "exercise": "bodyweight_squat",
            "repetitions": 3,
            "joint_angles": {"left_knee": 88.5, "right_knee": 89.0},
            "measurement_reliable": True,
            "visibility": {"left_knee": 0.95, "right_knee": 0.92},
            "movement_checks": [],
            "captured_at": "2026-10-23T10:15:30Z",
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['repetitions'], 3)
        self.assertTrue(response.data['measurement_reliable'])
        self.assertEqual(response.data['session_id'], str(self.session.id))
        self.assertEqual(response.data['exercise'], 'bodyweight_squat')
        self.assertIn('stored_at', response.data)

        # Check session updated completed_reps
        self.session.refresh_from_db()
        self.assertEqual(self.session.completed_reps, 3)

    def test_submit_unreliable_measurement_preserves_reliability_status(self):
        url = reverse('movement:session-measurement-create', kwargs={'session_id': self.session.id})
        payload = {
            "exercise": "bodyweight_squat",
            "repetitions": 3,
            "joint_angles": {"left_knee": None},
            "measurement_reliable": False,
            "visibility": {"left_knee": 0.45},
            "movement_checks": ["low_visibility_knee"],
            "captured_at": "2026-10-23T10:15:35Z",
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['measurement_reliable'])
        self.assertIn("low_visibility_knee", response.data['movement_checks'])

    def test_submit_measurement_mismatched_exercise_returns_400(self):
        url = reverse('movement:session-measurement-create', kwargs={'session_id': self.session.id})
        payload = {
            "exercise": "shoulder_flexion", # Mismatched with bodyweight_squat session
            "repetitions": 1,
            "joint_angles": {},
            "visibility": {},
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('error'), 'exercise_mismatch')

    def test_submit_measurement_to_nonexistent_session_returns_404(self):
        url = reverse('movement:session-measurement-create', kwargs={'session_id': uuid.uuid4()})
        payload = {"repetitions": 1, "joint_angles": {}, "visibility": {}}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
