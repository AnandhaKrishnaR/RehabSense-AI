from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from apps.rehabilitation.models import RehabilitationSession
from apps.rehabilitation.permissions import check_session_access
from apps.movement.models import MovementMeasurement
from apps.movement.serializers import MovementMeasurementSerializer

class SessionMeasurementCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)

        # 1. Enforce session ownership
        if not check_session_access(session, request):
            return Response(
                {"error": "forbidden", "detail": "You do not have permission to submit measurements for another patient's session."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 2. Validate exercise matches session's exercise
        passed_exercise = request.data.get('exercise', session.exercise_id)
        if passed_exercise != session.exercise_id:
            return Response(
                {
                    "error": "exercise_mismatch",
                    "detail": f"Payload exercise '{passed_exercise}' does not match session exercise '{session.exercise_id}'."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Serialize and validate payload
        data = request.data.copy()
        if 'exercise' not in data:
            data['exercise'] = session.exercise_id

        serializer = MovementMeasurementSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        captured_at_str = request.data.get('captured_at')
        captured_at = parse_datetime(captured_at_str) if captured_at_str else timezone.now()

        measurement = serializer.save(
            session=session,
            exercise=session.exercise_id,
            captured_at=captured_at or timezone.now()
        )

        # 4. Update session completed reps if higher and measurement was reliable
        if measurement.measurement_reliable and measurement.repetitions > session.completed_reps:
            session.completed_reps = measurement.repetitions
            session.save(update_fields=['completed_reps'])

        return Response(MovementMeasurementSerializer(measurement).data, status=status.HTTP_201_CREATED)
