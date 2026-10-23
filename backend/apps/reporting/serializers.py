from rest_framework import serializers
from apps.safety.models import ClinicianReviewFlag, ReviewResolutionAudit
from apps.rehabilitation.models import RehabilitationSession

class ReviewResolutionAuditSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewResolutionAudit
        fields = ['id', 'clinician_identifier', 'resolved_at', 'clinician_notes', 'resolution_action']


class ClinicianReviewFlagSerializer(serializers.ModelSerializer):
    patient_identifier = serializers.ReadOnlyField(source='session.patient_identifier')
    exercise = serializers.ReadOnlyField(source='session.exercise_id')
    completed_reps = serializers.ReadOnlyField(source='session.completed_reps')
    target_reps = serializers.ReadOnlyField(source='session.target_reps')
    resolution = ReviewResolutionAuditSerializer(read_only=True)
    latest_pain_score = serializers.SerializerMethodField()
    measurements_count = serializers.SerializerMethodField()

    class Meta:
        model = ClinicianReviewFlag
        fields = [
            'id', 'session_id', 'patient_identifier', 'exercise',
            'created_at', 'status', 'severity', 'flag_reasons',
            'safety_feedback', 'completed_reps', 'target_reps', 'resolution',
            'latest_pain_score', 'measurements_count',
        ]

    def get_latest_pain_score(self, obj):
        latest = obj.session.symptoms.filter(pain_score__isnull=False).order_by('-reported_at').first()
        return latest.pain_score if latest else None

    def get_measurements_count(self, obj):
        return obj.session.measurements.count()
