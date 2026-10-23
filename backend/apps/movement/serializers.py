from rest_framework import serializers
from apps.movement.models import MovementMeasurement

class MovementMeasurementSerializer(serializers.ModelSerializer):
    exercise = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = MovementMeasurement
        fields = [
            'id', 'session', 'captured_at', 'repetitions',
            'joint_angles', 'visibility', 'measurement_reliable',
            'movement_checks', 'current_phase', 'created_at', 'exercise',
        ]
        read_only_fields = ['id', 'session', 'created_at']

    def validate_visibility(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Visibility must be an object with landmark confidence scores.")
        for joint, score in value.items():
            if not isinstance(score, (int, float)) or score < 0.0 or score > 1.0:
                raise serializers.ValidationError(f"Visibility score for '{joint}' must be between 0.0 and 1.0.")
        return value

    def validate_repetitions(self, value):
        if value < 0:
            raise serializers.ValidationError("Repetitions cannot be negative.")
        return value

    def validate_joint_angles(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Joint angles must be an object mapping joints to degrees.")
        return value

    def create(self, validated_data):
        validated_data.pop('exercise', None)
        return super().create(validated_data)
