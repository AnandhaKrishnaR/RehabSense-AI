from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from apps.rehabilitation.models import RehabilitationSession
from apps.rehabilitation.permissions import check_session_access
from apps.safety.evaluator import evaluate_session_safety

class SafetyEvaluateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        session_id = request.data.get('session_id')
        if not session_id:
            return Response(
                {"error": "bad_request", "detail": "session_id is required for safety evaluation."},
                status=status.HTTP_400_BAD_REQUEST
            )

        session = get_object_or_404(RehabilitationSession, id=session_id)

        if not check_session_access(session, request):
            return Response(
                {"error": "forbidden", "detail": "You do not have permission to evaluate another patient's session."},
                status=status.HTTP_403_FORBIDDEN
            )

        pain_score = request.data.get('pain_score')
        worsening_pain = request.data.get('worsening_pain', False)
        unreliable_streak = request.data.get('unreliable_measurement_streak', 0)
        reported_symptoms = request.data.get('reported_symptoms', [])
        patient_confirmed = request.data.get('patient_confirmed', True)
        missing_critical = request.data.get('missing_critical_measurements', False)
        joint_angles = request.data.get('joint_angles')

        transcript_parts = [str(s) for s in reported_symptoms]
        if 'transcript' in request.data:
            transcript_parts.append(str(request.data['transcript']))
        transcript = " ".join(transcript_parts)

        result = evaluate_session_safety(
            session=session,
            pain_score=pain_score,
            transcript=transcript,
            patient_confirmed=patient_confirmed,
            unreliable_measurement_streak=unreliable_streak,
            worsening_pain=worsening_pain,
            missing_critical_measurements=missing_critical,
            joint_angles=joint_angles,
        )

        return Response(result, status=status.HTTP_200_OK)
