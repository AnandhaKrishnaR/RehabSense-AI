from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from apps.rehabilitation.models import Exercise, TherapyPlan, RehabilitationSession, SymptomReport
from apps.rehabilitation.serializers import (
    ExerciseSerializer,
    TherapyPlanSerializer,
    CreateSessionSerializer,
    RehabilitationSessionSerializer,
    SymptomReportSerializer,
)

class ExerciseListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    queryset = Exercise.objects.filter(is_active=True)
    serializer_class = ExerciseSerializer


class ExerciseDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    queryset = Exercise.objects.filter(is_active=True)
    serializer_class = ExerciseSerializer
    lookup_field = 'id'
    lookup_url_kwarg = 'exercise_id'


class TherapyPlanListCreateView(generics.ListCreateAPIView):
    permission_classes = [AllowAny]
    queryset = TherapyPlan.objects.filter(is_active=True)
    serializer_class = TherapyPlanSerializer


class SessionListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        sessions = RehabilitationSession.objects.all()
        exercise_filter = request.query_params.get('exercise')
        status_filter = request.query_params.get('status')
        if exercise_filter:
            sessions = sessions.filter(exercise_id=exercise_filter)
        if status_filter:
            sessions = sessions.filter(status=status_filter)
        serializer = RehabilitationSessionSerializer(sessions, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CreateSessionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        exercise = get_object_or_404(Exercise, id=data['exercise_id'])
        therapy_plan = None
        if data.get('therapy_plan_id'):
            therapy_plan = get_object_or_404(TherapyPlan, id=data['therapy_plan_id'])

        session = RehabilitationSession.objects.create(
            exercise=exercise,
            therapy_plan=therapy_plan,
            target_reps=data.get('target_reps', exercise.default_target_reps),
            status='in_progress',
        )

        return Response(RehabilitationSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SessionDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)
        serializer = RehabilitationSessionSerializer(session)
        return Response(serializer.data)

    def patch(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)
        status_update = request.data.get('status')
        completed_reps = request.data.get('completed_reps')
        summary_metrics = request.data.get('summary_metrics')

        if status_update:
            session.status = status_update
            if status_update in ('completed', 'aborted') and not session.ended_at:
                session.ended_at = timezone.now()
        if completed_reps is not None:
            session.completed_reps = completed_reps
        if summary_metrics:
            session.summary_metrics = summary_metrics

        session.save()
        return Response(RehabilitationSessionSerializer(session).data)


class SessionSymptomCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)
        serializer = SymptomReportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        symptom = serializer.save(session=session)

        # Trigger safety evaluation if pain score is reported or pain is worsening
        from apps.safety.evaluator import evaluate_session_safety
        safety_result = evaluate_session_safety(
            session=session,
            pain_score=symptom.pain_score,
            transcript=symptom.raw_transcript,
            patient_confirmed=symptom.patient_confirmed,
        )

        data = SymptomReportSerializer(symptom).data
        data['safety_evaluation'] = safety_result
        return Response(data, status=status.HTTP_201_CREATED)
