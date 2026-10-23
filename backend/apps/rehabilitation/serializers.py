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
    exercise_id = serializers.CharField(source='exercise.id', required=False)
    exercise_name = serializers.ReadOnlyField(source='exercise.name')

    class Meta:
        model = TherapyPlanItem
        fields = ['id', 'exercise', 'exercise_id', 'exercise_name', 'target_sets', 'target_reps', 'notes']
        extra_kwargs = {
            'exercise': {'required': False},
        }

    def validate(self, attrs):
        exercise = attrs.get('exercise')
        if not exercise:
            exercise_id = self.initial_data.get('exercise_id') or self.initial_data.get('exercise')
            if not exercise_id:
                raise serializers.ValidationError({"exercise_id": "Exercise ID is required."})
            try:
                attrs['exercise'] = Exercise.objects.get(id=exercise_id)
            except Exercise.DoesNotExist:
                raise serializers.ValidationError({"exercise_id": f"Exercise '{exercise_id}' not found."})
        return attrs


class TherapyPlanSerializer(serializers.ModelSerializer):
    items = TherapyPlanItemSerializer(many=True, required=False)
    patient_name = serializers.CharField(source='patient_identifier', required=False)
    notes = serializers.CharField(source='diagnosis_notes', required=False, allow_blank=True)

    class Meta:
        model = TherapyPlan
        fields = [
            'id', 'patient_identifier', 'patient_name', 'clinician_name',
            'diagnosis_notes', 'notes', 'is_active', 'items', 'created_at',
        ]

    def create(self, validated_data):
        items_data = self.initial_data.get('items', [])
        
        # Support aliases patient_name and notes
        patient_identifier = validated_data.get('patient_identifier')
        if not patient_identifier and 'patient_name' in self.initial_data:
            patient_identifier = self.initial_data['patient_name']
        if not patient_identifier:
            patient_identifier = 'demo_patient'

        diagnosis_notes = validated_data.get('diagnosis_notes')
        if not diagnosis_notes and 'notes' in self.initial_data:
            diagnosis_notes = self.initial_data['notes']
        if not diagnosis_notes:
            diagnosis_notes = ''

        with transaction.atomic():
            plan = TherapyPlan.objects.create(
                patient_identifier=patient_identifier,
                clinician_name=validated_data.get('clinician_name', 'Dr. Clinician'),
                diagnosis_notes=diagnosis_notes,
                is_active=validated_data.get('is_active', True),
            )

            for item_dict in items_data:
                ex_id = item_dict.get('exercise_id') or item_dict.get('exercise')
                try:
                    exercise = Exercise.objects.get(id=ex_id)
                except Exercise.DoesNotExist:
                    raise serializers.ValidationError({"items": f"Exercise '{ex_id}' does not exist."})

                TherapyPlanItem.objects.create(
                    therapy_plan=plan,
                    exercise=exercise,
                    target_sets=item_dict.get('target_sets', 3),
                    target_reps=item_dict.get('target_reps', 10),
                    notes=item_dict.get('notes', ''),
                )

        return plan


class CreateSessionSerializer(serializers.Serializer):
    exercise_id = serializers.CharField()
    therapy_plan_id = serializers.UUIDField(required=False, allow_null=True)
    target_reps = serializers.IntegerField(required=False, min_value=1, default=10)
    patient_identifier = serializers.CharField(required=False, default='demo_patient')

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
    session_id = serializers.UUIDField(source='session.id', read_only=True)

    class Meta:
        model = SymptomReport
        fields = [
            'id', 'session', 'session_id', 'reported_at', 'transcript',
            'language', 'pain_score', 'difficulty', 'body_area',
            'patient_confirmed', 'extraction_metadata',
        ]
        read_only_fields = ['id', 'session', 'session_id', 'reported_at']

    def validate_pain_score(self, value):
        if value is not None and (value < 0 or value > 10):
            raise serializers.ValidationError("Pain score must be between 0 and 10.")
        return value
