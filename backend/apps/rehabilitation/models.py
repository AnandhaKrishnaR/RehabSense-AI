import uuid
from django.db import models

class Exercise(models.Model):
    id = models.CharField(max_length=50, primary_key=True, help_text="Canonical ID (e.g. bodyweight_squat, shoulder_flexion)")
    name = models.CharField(max_length=100)
    description = models.TextField()
    instructions_en = models.TextField()
    instructions_ml = models.TextField()
    target_joints = models.JSONField(default=list, help_text="List of joint landmark names tracked")
    demo_parameters = models.JSONField(default=dict, help_text="Configurable demonstration biomechanical angles")
    default_target_reps = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.id})"


class TherapyPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient_identifier = models.CharField(max_length=100, default='demo_patient')
    clinician_name = models.CharField(max_length=100)
    diagnosis_notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Therapy Plan for {self.patient_identifier} by {self.clinician_name}"


class TherapyPlanItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    therapy_plan = models.ForeignKey(TherapyPlan, related_name='items', on_delete=models.CASCADE)
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE)
    target_sets = models.PositiveIntegerField(default=3)
    target_reps = models.PositiveIntegerField(default=10)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.exercise.name} ({self.target_sets} sets x {self.target_reps} reps)"


class RehabilitationSession(models.Model):
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('aborted', 'Aborted'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient_identifier = models.CharField(max_length=100, default='demo_patient')
    therapy_plan = models.ForeignKey(TherapyPlan, null=True, blank=True, on_delete=models.SET_NULL, related_name='sessions')
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name='sessions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    target_reps = models.PositiveIntegerField(default=10)
    completed_reps = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    review_required = models.BooleanField(default=False)
    summary_metrics = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"Session {self.id} - {self.exercise_id} ({self.status})"


class SymptomReport(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(RehabilitationSession, related_name='symptoms', on_delete=models.CASCADE)
    reported_at = models.DateTimeField(auto_now_add=True)
    raw_transcript = models.TextField()
    language = models.CharField(max_length=10, default='ml')
    pain_score = models.PositiveSmallIntegerField(null=True, blank=True, help_text="0 to 10 VAS scale")
    difficulty = models.CharField(max_length=50, blank=True)
    body_area = models.CharField(max_length=100, blank=True)
    patient_confirmed = models.BooleanField(default=False, help_text="Explicit patient confirmation before clinical trust")
    extraction_metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-reported_at']

    def __str__(self):
        return f"SymptomReport for {self.session_id}: pain={self.pain_score}, confirmed={self.patient_confirmed}"

