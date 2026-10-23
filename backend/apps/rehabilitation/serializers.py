from rest_framework import serializers
from apps.rehabilitation.models import Exercise, TherapyPlan, TherapyPlanItem, RehabilitationSession, SymptomReport

class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = [
            'id', 'name', 'description', 'instructions_en',
            'instructions_ml', 'target_joints', 'demo_parameters',
            'default_target_reps', 'is_active',
        ]


class TherapyPlanItemSerializer(serializers.ModelSerializer):
    exercise_name = serializers.ReadOnlyField(source='exercise.name')

    class Meta:
        model = TherapyPlanItem
        fields = ['id', 'exercise', 'exercise_name', 'target_sets', 'target_reps', 'notes']


class TherapyPlanSerializer(serializers.ModelSerializer):
    items = TherapyPlanItemSerializer(many=True, read_only=True)

    class Meta:
        model = TherapyPlan
        fields = [
            'id', 'patient_identifier', 'clinician_name',
            'diagnosis_notes', 'is_active', 'items', 'created_at',
        ]


class CreateSessionSerializer(serializers.Serializer):
    exercise_id = serializers.CharField()
    therapy_plan_id = serializers.UUIDField(required=False, allow_null=True)
    target_reps = serializers.IntegerField(required=False, min_value=1, default=10)

    def validate_exercise_id(self, value):
        if not Exercise.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError(
                f"Invalid exercise ID '{value}'. Allowed: {list(Exercise.objects.values_list('id', flat=True))}"
            )
        return value


class RehabilitationSessionSerializer(serializers.ModelSerializer):
    exercise_name = serializers.ReadOnlyField(source='exercise.name')

    class Meta:
        model = RehabilitationSession
        fields = [
            'id', 'patient_identifier', 'therapy_plan', 'exercise',
            'exercise_name', 'status', 'target_reps', 'completed_reps',
            'started_at', 'ended_at', 'review_required', 'summary_metrics',
        ]


class SymptomReportSerializer(serializers.ModelSerializer):
    transcript = serializers.CharField(source='raw_transcript')

    class Meta:
        model = SymptomReport
        fields = [
            'id', 'session', 'reported_at', 'transcript',
            'language', 'pain_score', 'difficulty', 'body_area',
            'patient_confirmed', 'extraction_metadata',
        ]
        read_only_fields = ['id', 'session', 'reported_at']

    def validate_pain_score(self, value):
        if value is not None and (value < 0 or value > 10):
            raise serializers.ValidationError("Pain score must be between 0 and 10.")
        return value

