from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from apps.rehabilitation.models import Exercise, TherapyPlan, TherapyPlanItem

class TherapyPlanEndpointTests(TestCase):
    def setUp(self):
        self.squat = Exercise.objects.create(
            id='bodyweight_squat',
            name='Bodyweight Squat',
            description='Squat desc',
            instructions_en='Chest up',
            instructions_ml='നേരെ നിൽക്കുക',
            target_joints=['left_knee'],
            default_target_reps=10,
        )
        self.shoulder = Exercise.objects.create(
            id='shoulder_flexion',
            name='Shoulder Flexion',
            description='Arm raise desc',
            instructions_en='Raise arm',
            instructions_ml='കൈ ഉയർത്തുക',
            target_joints=['left_shoulder'],
            default_target_reps=8,
        )

    def test_list_therapy_plans_empty(self):
        url = reverse('rehabilitation:therapy-plan-list-create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_create_therapy_plan_with_nested_items(self):
        url = reverse('rehabilitation:therapy-plan-list-create')
        payload = {
            "patient_name": "John Doe",
            "clinician_name": "Dr. Sarah Clinician",
            "notes": "Post-knee arthroscopy rehabilitation plan.",
            "items": [
                {
                    "exercise_id": "bodyweight_squat",
                    "target_sets": 2,
                    "target_reps": 10,
                    "notes": "Do not exceed comfortable depth."
                },
                {
                    "exercise_id": "shoulder_flexion",
                    "target_sets": 3,
                    "target_reps": 8,
                    "notes": "Pain-free range only."
                }
            ]
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['patient_identifier'], "John Doe")
        self.assertEqual(response.data['patient_name'], "John Doe")
        self.assertEqual(response.data['clinician_name'], "Dr. Sarah Clinician")
        self.assertEqual(response.data['notes'], "Post-knee arthroscopy rehabilitation plan.")
        self.assertEqual(len(response.data['items']), 2)

        # Check database records
        plan = TherapyPlan.objects.get(id=response.data['id'])
        self.assertEqual(plan.items.count(), 2)
        item1 = plan.items.filter(exercise_id='bodyweight_squat').first()
        self.assertIsNotNone(item1)
        self.assertEqual(item1.target_sets, 2)
        self.assertEqual(item1.target_reps, 10)

    def test_create_therapy_plan_with_invalid_exercise_returns_400(self):
        url = reverse('rehabilitation:therapy-plan-list-create')
        payload = {
            "patient_name": "Jane Doe",
            "clinician_name": "Dr. Clinician",
            "items": [
                {
                    "exercise_id": "nonexistent_exercise",
                    "target_sets": 1,
                    "target_reps": 5,
                }
            ]
        }
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
