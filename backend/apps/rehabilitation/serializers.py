from django.db import transaction
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
    exercise = serializers.PrimaryKeyRelatedField(
        queryset=Exercise.objects.filter(is_active=True),
        required=False,
    )
    exercise_id = serializers.CharField(source='exercise.id', read_only=True)
    exercise_name = serializers.ReadOnlyField(source='exercise.name')

    class Meta:
        model = TherapyPlanItem
        fields = ['id', 'exercise', 'exercise_id', 'exercise_name', 'target_sets', 'target_reps', 'notes']
        extra_kwargs = {
            'exercise': {'required': False},
        }

    def to_internal_value(self, data):
        data = data.copy()
        if 'exercise_id' in data and 'exercise' not in data:
            data['exercise'] = data['exercise_id']
        return super().to_internal_value(data)

    def validate(self, attrs):
        if not attrs.get('exercise'):
            raise serializers.ValidationError({"exercise_id": "Exercise ID is required."})
        return attrs


class TherapyPlanSerializer(serializers.ModelSerializer):
    items = TherapyPlanItemSerializer(many=True, required=False)
    patient_name = serializers.CharField(source='patient_identifier', required=False)
    clinician_name = serializers.CharField(required=False, default='Dr. Clinician')
    notes = serializers.CharField(source='diagnosis_notes', required=False, allow_blank=True)

    class Meta:
        model = TherapyPlan
        fields = [
            'id', 'patient_name', 'patient_identifier', 'clinician_name',
            'instructions', 'notes', 'diagnosis_notes', 'approval_status',
            'is_approved', 'approved_at', 'is_active', 'items', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'approved_at', 'created_at', 'updated_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data.setdefault('patient_identifier', 'demo_patient')
        validated_data.setdefault('clinician_name', 'Dr. Clinician')
        validated_data.setdefault('approval_status', 'draft')
        validated_data.setdefault('is_approved', False)
        with transaction.atomic():
            plan = TherapyPlan.objects.create(**validated_data)
            for item_data in items_data:
                TherapyPlanItem.objects.create(
                    therapy_plan=plan,
                    exercise=item_data['exercise'],
                    target_sets=item_data.get('target_sets', 3),
                    target_reps=item_data.get('target_reps', 10),
                    notes=item_data.get('notes', ''),
                )
        return plan


class CreateSessionSerializer(serializers.Serializer):
    exercise_id = serializers.CharField()
    therapy_plan_id = serializers.UUIDField(required=False, allow_null=True)
    target_reps = serializers.IntegerField(required=False, min_value=1, default=10)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    patient_identifier = serializers.CharField(required=False, default='demo_patient')

    def validate_exercise_id(self, value):
        if not Exercise.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError(
                f"Invalid exercise ID '{value}'. Allowed: {list(Exercise.objects.values_list('id', flat=True))}"
            )
        return value

    def validate_therapy_plan_id(self, value):
        if value:
            try:
                plan = TherapyPlan.objects.get(id=value)
            except TherapyPlan.DoesNotExist:
                raise serializers.ValidationError(f"Therapy plan with ID '{value}' does not exist.")
            if not plan.is_approved:
                raise serializers.ValidationError(
                    "Therapy plan has not been approved by a clinician. Only approved plans may be assigned to active rehabilitation sessions."
                )
        return value


class RehabilitationSessionSerializer(serializers.ModelSerializer):
    exercise_name = serializers.ReadOnlyField(source='exercise.name')

    class Meta:
        model = RehabilitationSession
        fields = [
            'id', 'patient_identifier', 'therapy_plan', 'exercise',
            'exercise_name', 'status', 'target_reps', 'completed_reps',
            'notes', 'started_at', 'ended_at', 'review_required', 'summary_metrics',
        ]


class SymptomReportSerializer(serializers.ModelSerializer):
    transcript = serializers.CharField(source='raw_transcript')
    session_id = serializers.UUIDField(source='session.id', read_only=True)

    class Meta:
        model = SymptomReport
        fields = [
            'id', 'session', 'session_id', 'reported_at', 'transcript',
            'language', 'pain_score', 'difficulty', 'body_area',
            'extraction_status', 'patient_confirmed', 'extraction_metadata',
        ]
        read_only_fields = ['id', 'session', 'session_id', 'reported_at']

    def validate_pain_score(self, value):
        if value is not None and (value < 0 or value > 10):
            raise serializers.ValidationError("Pain score must be between 0 and 10.")
        return value
