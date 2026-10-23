from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from rest_framework import status
from apps.rehabilitation.models import Exercise, TherapyPlan, RehabilitationSession
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
        self.user1 = User.objects.create_user(username='patient1', password='password123')
        self.user2 = User.objects.create_user(username='patient2', password='password123')

    def test_create_session_with_valid_exercise(self):
        url = reverse('rehabilitation:session-list-create')
        payload = {'exercise_id': 'bodyweight_squat', 'target_reps': 12, 'notes': 'Morning routine'}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['exercise'], 'bodyweight_squat')
        self.assertEqual(response.data['target_reps'], 12)
        self.assertEqual(response.data['notes'], 'Morning routine')
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertFalse(response.data['review_required'])

    def test_create_session_with_invalid_exercise_returns_400(self):
        url = reverse('rehabilitation:session-list-create')
        payload = {'exercise_id': 'invalid_exercise_slug'}
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('exercise_id', response.data.get('field_errors', response.data))

    def test_create_session_with_unapproved_plan_rejected(self):
        unapproved_plan = TherapyPlan.objects.create(
            patient_identifier='Patient #1',
            clinician_name='Dr. Clinician',
            is_approved=False,
            approval_status='draft',
        )
        url = reverse('rehabilitation:session-list-create')
        payload = {
            'exercise_id': 'bodyweight_squat',
            'therapy_plan_id': str(unapproved_plan.id)
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_session_with_approved_plan_succeeds(self):
        approved_plan = TherapyPlan.objects.create(
            patient_identifier='Patient #1',
            clinician_name='Dr. Clinician',
            is_approved=True,
            approval_status='approved',
        )
        url = reverse('rehabilitation:session-list-create')
        payload = {
            'exercise_id': 'bodyweight_squat',
            'therapy_plan_id': str(approved_plan.id)
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data['therapy_plan']), str(approved_plan.id))

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

    def test_patch_session_completes_session(self):
        session = RehabilitationSession.objects.create(
            exercise=self.squat,
            target_reps=10,
            status='in_progress',
        )
        url = reverse('rehabilitation:session-detail', kwargs={'session_id': session.id})
        response = self.client.patch(url, data={'status': 'completed', 'completed_reps': 10}, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'completed')
        self.assertEqual(response.data['completed_reps'], 10)
        self.assertIsNotNone(response.data['ended_at'])

    def test_cross_patient_session_access_denied(self):
        session = RehabilitationSession.objects.create(
            user=self.user1,
            patient_identifier='patient1',
            exercise=self.squat,
            target_reps=10,
        )
        self.client.force_login(self.user2)
        url = reverse('rehabilitation:session-detail', kwargs={'session_id': session.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_nonexistent_session_returns_404(self):
        url = reverse('rehabilitation:session-detail', kwargs={'session_id': uuid.uuid4()})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
