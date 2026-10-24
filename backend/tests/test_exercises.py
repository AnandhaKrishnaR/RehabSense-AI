from django.test import TestCase
from django.urls import reverse
from django.core.management import call_command
from rest_framework import status
from apps.rehabilitation.models import Exercise, TherapyPlan

class ExerciseCatalogTests(TestCase):
    def setUp(self):
        Exercise.objects.create(
            id='bodyweight_squat',
            name='Bodyweight Squat',
            description='Squat desc',
            instructions_en='Chest up',
            instructions_ml='നേരെ നിൽക്കുക',
            target_joints=['left_knee', 'right_knee'],
            demo_parameters={'inflection_knee_angle': 100.0},
            default_target_reps=10,
            is_active=True,
        )
        Exercise.objects.create(
            id='shoulder_flexion',
            name='Shoulder Flexion',
            description='Arm raise desc',
            instructions_en='Raise arm',
            instructions_ml='കൈ ഉയർത്തുക',
            target_joints=['left_shoulder'],
            demo_parameters={'peak_shoulder_angle': 120.0},
            default_target_reps=8,
            is_active=True,
        )

    def test_list_exercises_returns_canonical_ids(self):
        url = reverse('rehabilitation:exercise-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = [item['id'] for item in response.data]
        self.assertIn('bodyweight_squat', returned_ids)
        self.assertIn('shoulder_flexion', returned_ids)
        self.assertEqual(len(returned_ids), 2)

    def test_get_exercise_detail_success(self):
        url = reverse('rehabilitation:exercise-detail', kwargs={'exercise_id': 'bodyweight_squat'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], 'bodyweight_squat')
        self.assertEqual(response.data['name'], 'Bodyweight Squat')

    def test_get_nonexistent_exercise_returns_404(self):
        url = reverse('rehabilitation:exercise-detail', kwargs={'exercise_id': 'bench_press'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_idempotent_exercise_seed_command(self):
        # Call management command twice to ensure idempotency
        call_command('seed_exercises')
        call_command('seed_exercises')
        self.assertEqual(Exercise.objects.count(), 2)
        self.assertTrue(Exercise.objects.filter(id='bodyweight_squat').exists())
        self.assertTrue(Exercise.objects.filter(id='shoulder_flexion').exists())

    def test_therapy_plans_create_and_approval_filtering(self):
        url = reverse('rehabilitation:therapy-plan-list-create')
        payload = {
            "patient_name": "Test Patient",
            "clinician_name": "Dr. Sarah Clinician",
            "notes": "Post-op knee plan",
            "items": [
                {
                    "exercise_id": "bodyweight_squat",
                    "target_sets": 2,
                    "target_reps": 10,
                    "notes": "Safe depth"
                }
            ]
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['approval_status'], 'draft')
        self.assertFalse(response.data['is_approved'])

        # Filter by approved plans
        resp_approved = self.client.get(f"{url}?approved=true")
        self.assertEqual(len(resp_approved.data), 0)

        # Mark plan as approved
        plan = TherapyPlan.objects.get(id=response.data['id'])
        plan.is_approved = True
        plan.approval_status = 'approved'
        plan.save()

        resp_approved_after = self.client.get(f"{url}?approved=true")
        self.assertEqual(len(resp_approved_after.data), 1)
