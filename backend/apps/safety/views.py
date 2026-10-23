from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from apps.rehabilitation.models import RehabilitationSession
from apps.safety.evaluator import evaluate_session_safety

class SafetyEvaluateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({"error": "session_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        session = get_object_or_404(RehabilitationSession, id=session_id)

        pain_score = request.data.get('pain_score')
        worsening_pain = request.data.get('worsening_pain', False)
        unreliable_streak = request.data.get('unreliable_measurement_streak', 0)
        reported_symptoms = request.data.get('reported_symptoms', [])
        transcript = request.data.get('transcript', '')
        if not transcript and reported_symptoms:
            transcript = " ".join([str(s) for s in reported_symptoms])

        patient_confirmed = request.data.get('patient_confirmed', True)

        result = evaluate_session_safety(
            session=session,
            pain_score=pain_score,
            transcript=transcript,
            patient_confirmed=patient_confirmed,
            unreliable_measurement_streak=unreliable_streak,
            worsening_pain=worsening_pain,
        )

        return Response(result, status=status.HTTP_200_OK)
