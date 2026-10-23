from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from apps.rehabilitation.models import Exercise

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
