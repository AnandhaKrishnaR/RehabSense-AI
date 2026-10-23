import uuid
from django.db import models
from apps.rehabilitation.models import RehabilitationSession

class ClinicianReviewFlag(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_review', 'In Review'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]

    SEVERITY_CHOICES = [
        ('routine', 'Routine'),
        ('warning', 'Warning'),
        ('urgent', 'Urgent'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(RehabilitationSession, related_name='review_flags', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='warning')
    flag_reasons = models.JSONField(default=list, help_text="List of machine-readable reason codes")
    safety_feedback = models.JSONField(default=list, help_text="User-facing guidance messages")

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"ReviewFlag {self.id} on Session {self.session_id} [{self.status} - {self.severity}]"


class ReviewResolutionAudit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    review_flag = models.OneToOneField(ClinicianReviewFlag, related_name='resolution', on_delete=models.CASCADE)
    clinician_identifier = models.CharField(max_length=100, default='Dr. Clinician')
    resolved_at = models.DateTimeField(auto_now_add=True)
    clinician_notes = models.TextField()
    resolution_action = models.CharField(max_length=100)

    def __str__(self):
        return f"Resolution for Flag {self.review_flag_id} by {self.clinician_identifier}"
