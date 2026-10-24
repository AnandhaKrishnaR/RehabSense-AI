from django.core.management.base import BaseCommand
from apps.rehabilitation.models import Exercise

class Command(BaseCommand):
    help = 'Seeds canonical exercise definitions (bodyweight_squat and shoulder_flexion) idempotently'

    def handle(self, *args, **options):
        self.stdout.write("Seeding canonical exercises...")

        squat, _ = Exercise.objects.update_or_create(
            id='bodyweight_squat',
            defaults={
                'name': 'Bodyweight Squat',
                'description': 'Stand with feet shoulder-width apart, lower hips until thighs approach parallel to floor, then return upright.',
                'instructions_en': 'Keep chest up, knees tracking in line with toes, and lower smoothly without bouncing.',
                'instructions_ml': 'നെഞ്ച് നേരെ വയ്ക്കുക, കാൽമുട്ടുകൾ വളച്ച് പതുക്കെ താഴേക്ക് ഇരിക്കുക, തുടർന്ന് നിവർന്നു നിൽക്കുക.',
                'target_joints': ['left_knee', 'right_knee', 'left_hip', 'right_hip'],
                'demo_parameters': {
                    'inflection_knee_angle': 100.0,
                    'standing_knee_angle': 160.0,
                    'min_visibility': 0.65,
                },
                'default_target_reps': 10,
                'is_active': True,
            }
        )

        shoulder, _ = Exercise.objects.update_or_create(
            id='shoulder_flexion',
            defaults={
                'name': 'Shoulder Flexion (Arm Raise)',
                'description': 'Raise arm forward and upward in front of body within a comfortable, pain-free range.',
                'instructions_en': 'Raise your arm smoothly without arching your back. Lower back to your side under control.',
                'instructions_ml': 'കൈ നേരെ മുന്നിലേക്ക് സാവധാനം ഉയർത്തുക. വേദനയില്ലാത്ത പരിധിക്കപ്പുറം ഉയർത്തരുത്.',
                'target_joints': ['left_shoulder', 'right_shoulder'],
                'demo_parameters': {
                    'peak_shoulder_angle': 120.0,
                    'resting_shoulder_angle': 30.0,
                    'min_visibility': 0.65,
                },
                'default_target_reps': 8,
                'is_active': True,
            }
        )

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded: {squat.id}, {shoulder.id}"))
