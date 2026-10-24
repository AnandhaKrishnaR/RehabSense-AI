from rest_framework import serializers
from apps.movement.models import MovementMeasurement

CANONICAL_EXERCISES = ('bodyweight_squat', 'shoulder_flexion')

class MovementMeasurementSerializer(serializers.ModelSerializer):
    exercise = serializers.CharField(write_only=True, required=False)
    session_id = serializers.UUIDField(source='session.id', read_only=True)
    stored_at = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = MovementMeasurement
        fields = [
            'id', 'session', 'session_id', 'captured_at', 'repetitions',
            'joint_angles', 'visibility', 'measurement_reliable',
            'movement_checks', 'current_phase', 'created_at', 'stored_at', 'exercise',
        ]
        read_only_fields = ['id', 'session', 'session_id', 'created_at', 'stored_at']

    def validate_exercise(self, value):
        if value not in CANONICAL_EXERCISES:
            raise serializers.ValidationError(
                f"Invalid exercise ID '{value}'. Allowed canonical exercises: {list(CANONICAL_EXERCISES)}"
            )
        return value

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if instance.session_id:
            representation['exercise'] = instance.session.exercise_id
        return representation

    def validate_visibility(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Visibility must be an object with landmark confidence scores.")
        for joint, score in value.items():
            if not isinstance(score, (int, float)) or score < 0.0 or score > 1.0:
                raise serializers.ValidationError(f"Visibility score for '{joint}' must be between 0.0 and 1.0.")
        return value

    def validate_repetitions(self, value):
        if not isinstance(value, int) or value < 0:
            raise serializers.ValidationError("Repetitions must be a non-negative integer.")
        return value

    def validate_joint_angles(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Joint angles must be an object mapping joints to degrees.")
        for joint, angle in value.items():
            if angle is not None:
                if not isinstance(angle, (int, float)):
                    raise serializers.ValidationError(f"Angle for '{joint}' must be a number or null.")
                if angle < 0.0 or angle > 360.0:
                    raise serializers.ValidationError(f"Angle for '{joint}' ({angle}) must be between 0.0 and 360.0 degrees.")
        return value
