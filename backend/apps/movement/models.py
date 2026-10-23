import uuid
from django.db import models
from apps.rehabilitation.models import RehabilitationSession

class MovementMeasurement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(RehabilitationSession, related_name='measurements', on_delete=models.CASCADE)
    captured_at = models.DateTimeField()
    repetitions = models.PositiveIntegerField(default=0)
    joint_angles = models.JSONField(default=dict, help_text="Joint angles in degrees")
    visibility = models.JSONField(default=dict, help_text="Landmark confidence/visibility scores (0.0 - 1.0)")
    measurement_reliable = models.BooleanField(default=True, help_text="False if landmarks are occluded or noisy")
    movement_checks = models.JSONField(default=list, blank=True, help_text="Biomechanics feedback flags")
    current_phase = models.CharField(max_length=30, blank=True, default='idle')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['captured_at']

    def __str__(self):
        return f"Measurement for {self.session_id} @ rep {self.repetitions} (Reliable: {self.measurement_reliable})"
