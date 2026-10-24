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
from apps.rehabilitation.permissions import (
    check_session_access,
    get_request_patient_identifier,
    is_clinician,
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


class TherapyPlanListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = TherapyPlan.objects.filter(is_active=True)
        approved_filter = request.query_params.get('approved')
        if approved_filter is not None:
            is_app = approved_filter.lower() in ('true', '1')
            queryset = queryset.filter(is_approved=is_app)

        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(approval_status=status_filter)

        serializer = TherapyPlanSerializer(queryset, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = TherapyPlanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        plan = serializer.save()
        return Response(TherapyPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class SessionListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        sessions = RehabilitationSession.objects.all()

        # Enforce patient data isolation
        if not is_clinician(request):
            if request.user and request.user.is_authenticated:
                sessions = sessions.filter(user=request.user)
            else:
                patient_id = get_request_patient_identifier(request)
                if patient_id and patient_id != 'demo_patient':
                    sessions = sessions.filter(patient_identifier=patient_id)

        exercise_filter = request.query_params.get('exercise')
        status_filter = request.query_params.get('status')
        patient_filter = request.query_params.get('patient') or request.query_params.get('patient_identifier')
        if exercise_filter:
            sessions = sessions.filter(exercise_id=exercise_filter)
        if status_filter:
            sessions = sessions.filter(status=status_filter)

        if patient_filter:
            sessions = sessions.filter(patient_identifier=patient_filter)
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

        user = request.user if (request.user and request.user.is_authenticated) else None
        patient_identifier = (
            get_request_patient_identifier(request)
            if user
            else data.get('patient_identifier', get_request_patient_identifier(request))
        )

        session = RehabilitationSession.objects.create(
            user=user,
            patient_identifier=patient_identifier,
            exercise=exercise,
            therapy_plan=therapy_plan,
            target_reps=data.get('target_reps', exercise.default_target_reps),
            notes=data.get('notes', ''),
            status='in_progress',
        )

        return Response(RehabilitationSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SessionDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)
        if not check_session_access(session, request):
            return Response(
                {"error": "forbidden", "detail": "You do not have permission to view another patient's session."},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = RehabilitationSessionSerializer(session)
        return Response(serializer.data)

    def patch(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)
        if not check_session_access(session, request):
            return Response(
                {"error": "forbidden", "detail": "You do not have permission to modify another patient's session."},
                status=status.HTTP_403_FORBIDDEN
            )

        status_update = request.data.get('status')
        completed_reps = request.data.get('completed_reps')
        notes_update = request.data.get('notes')
        summary_metrics = request.data.get('summary_metrics')

        if status_update:
            session.status = status_update
            if status_update in ('completed', 'aborted') and not session.ended_at:
                session.ended_at = timezone.now()
        if completed_reps is not None:
            session.completed_reps = completed_reps
        if notes_update is not None:
            session.notes = notes_update
        if summary_metrics:
            session.summary_metrics = summary_metrics

        session.save()
        return Response(RehabilitationSessionSerializer(session).data)


class SessionSymptomCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)
        if not check_session_access(session, request):
            return Response(
                {"error": "forbidden", "detail": "You do not have permission to submit symptoms for another patient's session."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = SymptomReportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user if (request.user and request.user.is_authenticated) else None
        extraction_status = 'confirmed' if serializer.validated_data.get('patient_confirmed') else 'draft'

        symptom = serializer.save(
            session=session,
            user=user,
            extraction_status=extraction_status
        )

        # Trigger safety evaluation
        from apps.safety.evaluator import evaluate_session_safety
        safety_result = evaluate_session_safety(
            session=session,
            pain_score=symptom.pain_score,
            transcript=symptom.raw_transcript,
            patient_confirmed=symptom.patient_confirmed,
            difficulty=symptom.difficulty,
            body_area=symptom.body_area,
        )

        data = SymptomReportSerializer(symptom).data
        data['safety_evaluation'] = safety_result
        return Response(data, status=status.HTTP_201_CREATED)
