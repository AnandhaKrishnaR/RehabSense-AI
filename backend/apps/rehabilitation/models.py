import uuid
from django.db import models
from django.conf import settings

class Exercise(models.Model):
    id = models.CharField(
        max_length=50,
        primary_key=True,
        help_text="Canonical ID (strictly 'bodyweight_squat' or 'shoulder_flexion')"
    )
    name = models.CharField(max_length=100)
    description = models.TextField()
    instructions_en = models.TextField()
    instructions_ml = models.TextField()
    target_joints = models.JSONField(default=list, help_text="List of joint landmark names tracked")
    demo_parameters = models.JSONField(default=dict, help_text="Configurable demonstration biomechanical angles")
    default_target_reps = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.name} ({self.id})"


class TherapyPlan(models.Model):
    APPROVAL_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='therapy_plans'
    )
    patient_identifier = models.CharField(max_length=100, default='demo_patient')
    clinician_name = models.CharField(max_length=100)
    instructions = models.TextField(blank=True, default='', help_text="Clinician instructions for patient")
    diagnosis_notes = models.TextField(blank=True, default='', help_text="Clinical indications")
    approval_status = models.CharField(max_length=20, choices=APPROVAL_STATUS_CHOICES, default='draft')
    is_approved = models.BooleanField(default=False, help_text="True only when approved by a clinician")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_therapy_plans'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        approval = "APPROVED" if self.is_approved else "DRAFT"
        return f"Therapy Plan [{approval}] for {self.patient_identifier} by {self.clinician_name}"


class TherapyPlanItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    therapy_plan = models.ForeignKey(TherapyPlan, related_name='items', on_delete=models.CASCADE)
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE)
    target_sets = models.PositiveIntegerField(default=3)
    target_reps = models.PositiveIntegerField(default=10)
    notes = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.exercise.name} ({self.target_sets} sets x {self.target_reps} reps)"


class RehabilitationSession(models.Model):
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('aborted', 'Aborted'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='rehab_sessions'
    )
    patient_identifier = models.CharField(max_length=100, default='demo_patient')
    therapy_plan = models.ForeignKey(
        TherapyPlan,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sessions'
    )
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name='sessions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    target_reps = models.PositiveIntegerField(default=10)
    completed_reps = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, default='', help_text="Session execution notes")
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    review_required = models.BooleanField(default=False)
    summary_metrics = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"Session {self.id} - {self.exercise_id} ({self.status}) for {self.patient_identifier}"


class SymptomReport(models.Model):
    EXTRACTION_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(RehabilitationSession, related_name='symptoms', on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='symptom_reports'
    )
    reported_at = models.DateTimeField(auto_now_add=True)
    raw_transcript = models.TextField()
    language = models.CharField(max_length=10, default='ml')
    pain_score = models.PositiveSmallIntegerField(null=True, blank=True, help_text="0 to 10 VAS scale")
    difficulty = models.CharField(max_length=50, blank=True, default='')
    body_area = models.CharField(max_length=100, blank=True, default='')
    extraction_status = models.CharField(max_length=30, choices=EXTRACTION_STATUS_CHOICES, default='draft')
    patient_confirmed = models.BooleanField(default=False, help_text="Explicit patient confirmation before clinical trust")
    extraction_metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-reported_at']

    def __str__(self):
        return f"SymptomReport {self.id} for Session {self.session_id}: pain={self.pain_score}, confirmed={self.patient_confirmed}"
