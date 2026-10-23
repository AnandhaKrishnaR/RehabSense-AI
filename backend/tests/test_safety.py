from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from apps.rehabilitation.models import Exercise, RehabilitationSession
from apps.safety.models import ClinicianReviewFlag

class SafetyEngineTests(TestCase):
    def setUp(self):
        self.exercise = Exercise.objects.create(
            id='bodyweight_squat',
            name='Bodyweight Squat',
            description='Squat desc',
            instructions_en='Chest up',
            instructions_ml='നേരെ നിൽക്കുക',
            target_joints=['left_knee', 'right_knee'],
        )
        self.session = RehabilitationSession.objects.create(
            exercise=self.exercise,
            target_reps=10,
        )

    def test_evaluate_severe_pain_triggers_review(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "pain_score": 8,
            "worsening_pain": False,
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['review_required'])
        self.assertIn('high_pain_score', response.data['reasons'])

    def test_evaluate_worsening_pain_triggers_review(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "pain_score": 5,
            "worsening_pain": True,
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['review_required'])
        self.assertIn('patient_reported_increasing_pain', response.data['reasons'])

    def test_evaluate_urgent_symptoms_triggers_urgent_alert(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "reported_symptoms": ["കടുത്ത നെഞ്ചുവേദന (chest pain)"],
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['review_required'])
        self.assertTrue(response.data['urgent_alert'])
        self.assertIn('urgent_symptom_detected', response.data['reasons'])

    def test_evaluate_unreliable_tracking_streak(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "unreliable_measurement_streak": 6,
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['measurement_reliable'])
        self.assertIn('unreliable_camera_streak', response.data['reasons'])

    def test_evaluate_missing_critical_measurements(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "missing_critical_measurements": True,
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('missing_critical_measurements', response.data['reasons'])

    def test_evaluate_conflicting_data(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "pain_score": 0,
            "worsening_pain": True, # Contradiction: 0 pain but worsening
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('conflicting_data', response.data['reasons'])

    def test_evaluate_unconfirmed_draft_safeguard(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "pain_score": 4,
            "patient_confirmed": False, # Draft
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('unconfirmed_symptom_draft', response.data['reasons'])

    def test_flag_deduplication_prevents_duplicate_pending_flags(self):
        url = reverse('safety:safety-evaluate')
        payload = {
            "session_id": str(self.session.id),
            "pain_score": 8,
            "patient_confirmed": True,
        }
        # Post twice with identical reason
        self.client.post(url, data=payload, content_type='application/json')
        self.client.post(url, data=payload, content_type='application/json')

        pending_flags = ClinicianReviewFlag.objects.filter(session=self.session, status='pending')
        self.assertEqual(pending_flags.count(), 1)
