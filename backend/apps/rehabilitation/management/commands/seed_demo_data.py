from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.rehabilitation.models import Exercise, TherapyPlan, TherapyPlanItem, RehabilitationSession, SymptomReport
from apps.safety.models import ClinicianReviewFlag

class Command(BaseCommand):
    help = 'Seeds database with canonical exercises, sample approved therapy plan, draft plan, and demo sessions'

    def handle(self, *args, **options):
        self.stdout.write("Seeding canonical exercises...")

        # 1. Bodyweight Squat
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

        # 2. Shoulder Flexion
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

        self.stdout.write(self.style.SUCCESS(f"Canonical exercises ready: {squat.id}, {shoulder.id}"))

        # 3. Create Approved Therapy Plan
        plan, _ = TherapyPlan.objects.get_or_create(
            patient_identifier='Patient #1042',
            clinician_name='Dr. Anjali Menon (PT)',
            defaults={
                'diagnosis_notes': 'Knee rehabilitation & upper-body mobility plan (Post-mild strain recovery)',
                'instructions': 'Perform 2 sets per exercise daily. Cease movement if pain exceeds 5/10.',
                'approval_status': 'approved',
                'is_approved': True,
                'approved_at': timezone.now(),
                'is_active': True,
            }
        )

        # Ensure approved fields are set even if record previously existed
        if not plan.is_approved:
            plan.approval_status = 'approved'
            plan.is_approved = True
            plan.approved_at = timezone.now()
            plan.save(update_fields=['approval_status', 'is_approved', 'approved_at'])

        TherapyPlanItem.objects.get_or_create(
            therapy_plan=plan,
            exercise=squat,
            defaults={'target_sets': 2, 'target_reps': 10, 'notes': 'Comfortable depth only'}
        )

        TherapyPlanItem.objects.get_or_create(
            therapy_plan=plan,
            exercise=shoulder,
            defaults={'target_sets': 2, 'target_reps': 8, 'notes': 'Stop if shoulder impingement occurs'}
        )

        # 4. Create Draft Unapproved Therapy Plan (to test approval filtering)
        draft_plan, _ = TherapyPlan.objects.get_or_create(
            patient_identifier='Patient #2001',
            clinician_name='Dr. Sarah Clinician',
            defaults={
                'diagnosis_notes': 'Draft preliminary routine awaiting clinician sign-off.',
                'instructions': 'Draft instructions pending clinical review.',
                'approval_status': 'draft',
                'is_approved': False,
                'is_active': True,
            }
        )

        # 5. Seed a flagged demo session for clinician review demonstration
        sess, created = RehabilitationSession.objects.get_or_create(
            patient_identifier='Patient #1042',
            exercise=shoulder,
            status='completed',
            defaults={
                'therapy_plan': plan,
                'target_reps': 8,
                'completed_reps': 5,
                'notes': 'Patient felt shoulder stiffness halfway through session.',
                'review_required': True,
                'summary_metrics': {'avg_shoulder_angle': 105.0, 'completion_pct': 62.5},
            }
        )

        if created:
            # Add synthetic symptom
            SymptomReport.objects.create(
                session=sess,
                raw_transcript="കൈ ഉയർത്തുമ്പോൾ തോളിന് വേദന കൂടുന്നു",
                language="ml",
                pain_score=6,
                difficulty="hard",
                body_area="shoulder",
                extraction_status="confirmed",
                patient_confirmed=True,
                extraction_metadata={"pain_keyword": "വേദന", "body_area_keyword": "തോൾ"}
            )

            # Add Clinician Review Flag
            ClinicianReviewFlag.objects.create(
                session=sess,
                status='pending',
                severity='warning',
                flag_reasons=['patient_reported_increasing_pain', 'pain_score_elevated'],
                safety_feedback=[
                    'Patient reported pain score 6/10 during arm elevation.',
                    'Advise checking form or adjusting target range of motion.'
                ]
            )

        self.stdout.write(self.style.SUCCESS("Database seeded successfully with demo data."))
