import csv
import io
from django.http import HttpResponse
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer, JSONRenderer, BrowsableAPIRenderer
from django.shortcuts import get_object_or_404
from django.db.models import Sum
from apps.safety.models import ClinicianReviewFlag, ReviewResolutionAudit
from apps.rehabilitation.models import RehabilitationSession, SymptomReport
from apps.movement.models import MovementMeasurement
from apps.reporting.serializers import ClinicianReviewFlagSerializer

class CSVRenderer(BaseRenderer):
    media_type = 'text/csv'
    format = 'csv'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if isinstance(data, (bytes, str)):
            return data
        return str(data).encode('utf-8')


class ClinicianReviewListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        status_filter = request.query_params.get('status')
        queryset = ClinicianReviewFlag.objects.select_related('session').all()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        serializer = ClinicianReviewFlagSerializer(queryset, many=True)
        return Response(serializer.data)


class ClinicianReviewResolveView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, review_id):
        flag = get_object_or_404(ClinicianReviewFlag, id=review_id)
        notes = request.data.get('clinician_notes')
        action = request.data.get('resolution_action', 'acknowledged_and_plan_adjusted')
        clinician = request.data.get('clinician_identifier', 'Dr. Clinician')

        if not notes:
            return Response(
                {"error": "clinician_notes is required for audit trail"},
                status=status.HTTP_400_BAD_REQUEST
            )

        flag.status = 'resolved'
        flag.save(update_fields=['status'])

        audit = ReviewResolutionAudit.objects.create(
            review_flag=flag,
            clinician_identifier=clinician,
            clinician_notes=notes,
            resolution_action=action,
        )

        return Response({
            "status": "resolved",
            "review_id": str(flag.id),
            "audit_id": str(audit.id),
            "resolved_at": audit.resolved_at,
        }, status=status.HTTP_200_OK)


class ProgressSummaryView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        sessions = RehabilitationSession.objects.all()
        total_sessions = sessions.count()

        # Exercises aggregate (like-for-like, never conflating squat and arm raise)
        completed_exercises = {}
        for ex_id in ['bodyweight_squat', 'shoulder_flexion']:
            ex_sessions = sessions.filter(exercise_id=ex_id)
            count = ex_sessions.count()
            total_reps = ex_sessions.aggregate(Sum('completed_reps'))['completed_reps__sum'] or 0

            completed_exercises[ex_id] = {
                "sessions_count": count,
                "total_reps": total_reps,
            }

        # Pain trend from confirmed symptom reports
        symptoms = SymptomReport.objects.filter(patient_confirmed=True).order_by('reported_at')[:20]
        pain_trend = [
            {
                "date": sym.reported_at.strftime('%Y-%m-%d'),
                "pain_score": sym.pain_score,
                "difficulty": sym.difficulty,
            }
            for sym in symptoms
        ]

        flagged_count = ClinicianReviewFlag.objects.filter(status='pending').count()

        return Response({
            "total_sessions": total_sessions,
            "completed_exercises": completed_exercises,
            "pain_trend": pain_trend,
            "flagged_sessions_count": flagged_count,
        })


class SessionReportView(APIView):
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer, CSVRenderer, BrowsableAPIRenderer]

    def get(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)
        fmt = request.query_params.get('format', 'json').lower()

        measurements = session.measurements.all()
        symptoms = session.symptoms.all()
        flags = session.review_flags.all()

        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="rehabsense_session_{session.id}.csv"'

            writer = csv.writer(response)
            writer.writerow(['Session ID', str(session.id)])
            writer.writerow(['Patient', session.patient_identifier])
            writer.writerow(['Exercise', session.exercise_id])
            writer.writerow(['Status', session.status])
            writer.writerow(['Target Reps', session.target_reps])
            writer.writerow(['Completed Reps', session.completed_reps])
            writer.writerow(['Started At', session.started_at])
            writer.writerow([])
            writer.writerow(['Measurements'])
            writer.writerow(['Timestamp', 'Repetitions', 'Reliable', 'Joint Angles', 'Checks'])
            for m in measurements:
                writer.writerow([m.captured_at, m.repetitions, m.measurement_reliable, str(m.joint_angles), str(m.movement_checks)])

            writer.writerow([])
            writer.writerow(['Symptom Reports'])
            writer.writerow(['Reported At', 'Transcript', 'Pain Score', 'Difficulty', 'Patient Confirmed'])
            for s in symptoms:
                writer.writerow([s.reported_at, s.raw_transcript, s.pain_score, s.difficulty, s.patient_confirmed])

            return response

        # Default JSON structured report
        return Response({
            "session_id": str(session.id),
            "patient_identifier": session.patient_identifier,
            "exercise": session.exercise_id,
            "status": session.status,
            "target_reps": session.target_reps,
            "completed_reps": session.completed_reps,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "review_required": session.review_required,
            "measurements_count": measurements.count(),
            "symptoms_count": symptoms.count(),
            "flags": [
                {
                    "id": str(f.id),
                    "status": f.status,
                    "severity": f.severity,
                    "reasons": f.flag_reasons,
                    "feedback": f.safety_feedback,
                }
                for f in flags
            ],
        })
