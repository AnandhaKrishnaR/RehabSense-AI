from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from apps.rehabilitation.models import Exercise, RehabilitationSession
from apps.safety.models import ClinicianReviewFlag

class SymptomEndpointTests(TestCase):
    def setUp(self):
        self.exercise = Exercise.objects.create(
            id='shoulder_flexion',
            name='Shoulder Flexion',
            description='Arm raise desc',
            instructions_en='Raise arm',
            instructions_ml='കൈ ഉയർത്തുക',
            target_joints=['left_shoulder'],
            demo_parameters={'peak_shoulder_angle': 120.0},
        )
        self.session = RehabilitationSession.objects.create(
            exercise=self.exercise,
            target_reps=8,
            status='in_progress',
        )

    def test_submit_mild_symptom_saves_record(self):
        url = reverse('rehabilitation:session-symptom-create', kwargs={'session_id': self.session.id})
        payload = {
            "transcript": "ചെറിയ ക്ഷീണം തോന്നുന്നു",
            "pain_score": 2,
            "difficulty": "mild",
            "body_area": "arm",
            "patient_confirmed": True,
            "language": "ml",
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['pain_score'], 2)
        self.assertTrue(response.data['patient_confirmed'])
        self.assertFalse(response.data['safety_evaluation']['review_required'])

    def test_submit_high_pain_triggers_clinician_review_flag(self):
        url = reverse('rehabilitation:session-symptom-create', kwargs={'session_id': self.session.id})
        payload = {
            "transcript": "കടുത്ത വേദന കൂടുന്നു",
            "pain_score": 8,
            "difficulty": "severe",
            "body_area": "shoulder",
            "patient_confirmed": True,
            "language": "ml",
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['safety_evaluation']['review_required'])
        self.assertIn('high_pain_score', response.data['safety_evaluation']['reasons'])

        # Verify session is marked review_required and flag is created
        self.session.refresh_from_db()
        self.assertTrue(self.session.review_required)
        self.assertTrue(ClinicianReviewFlag.objects.filter(session=self.session).exists())

    def test_submit_invalid_pain_score_returns_400(self):
        url = reverse('rehabilitation:session-symptom-create', kwargs={'session_id': self.session.id})
        payload = {
            "transcript": "വേദന",
            "pain_score": 15, # Out of 0-10 bounds
            "patient_confirmed": True,
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('pain_score', response.data)
