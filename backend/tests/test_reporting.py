from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from apps.rehabilitation.models import Exercise, RehabilitationSession
from apps.safety.models import ClinicianReviewFlag, ReviewResolutionAudit

class ReportingAndClinicianReviewTests(TestCase):
    def setUp(self):
        self.exercise = Exercise.objects.create(
            id='bodyweight_squat',
            name='Bodyweight Squat',
            description='Squat desc',
            instructions_en='Chest up',
            instructions_ml='നേരെ നിൽക്കുക',
            target_joints=['left_knee'],
        )
        self.session = RehabilitationSession.objects.create(
            exercise=self.exercise,
            target_reps=10,
            completed_reps=8,
            review_required=True,
        )
        self.flag = ClinicianReviewFlag.objects.create(
            session=self.session,
            status='pending',
            severity='warning',
            flag_reasons=['high_pain_score'],
            safety_feedback=['Patient reported pain.'],
        )

    def test_get_clinician_reviews(self):
        url = reverse('reporting:clinician-reviews-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['status'], 'pending')

    def test_resolve_clinician_review(self):
        url = reverse('reporting:clinician-review-resolve', kwargs={'review_id': self.flag.id})
        payload = {
            "clinician_notes": "Reviewed session. Target reps adjusted to 6.",
            "resolution_action": "acknowledged_and_plan_adjusted",
            "clinician_identifier": "Dr. Sarah Clinician",
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'resolved')

        # Check flag updated in database
        self.flag.refresh_from_db()
        self.assertEqual(self.flag.status, 'resolved')
        self.assertTrue(hasattr(self.flag, 'resolution'))
        self.assertEqual(self.flag.resolution.clinician_notes, "Reviewed session. Target reps adjusted to 6.")

    def test_get_progress_summary(self):
        url = reverse('reporting:progress-summary')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_sessions', response.data)
        self.assertIn('completed_exercises', response.data)
        self.assertIn('bodyweight_squat', response.data['completed_exercises'])
        self.assertIn('shoulder_flexion', response.data['completed_exercises'])

    def test_get_session_csv_report(self):
        url = f"{reverse('reporting:session-report', kwargs={'session_id': self.session.id})}?format=csv"
        response = self.client.get(url)
        if response.status_code != 200:
            print("CSV Test Failed. URL:", url, "Status:", response.status_code, "Content:", getattr(response, 'data', response.content))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn('attachment', response['Content-Disposition'])
        content = response.content.decode('utf-8')
        self.assertIn('Session ID', content)
        self.assertIn(str(self.session.id), content)
