import csv
from django.http import HttpResponse
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer, JSONRenderer, BrowsableAPIRenderer
from django.shortcuts import get_object_or_404
from django.db.models import Sum
from django.utils import timezone
from apps.safety.models import ClinicianReviewFlag, ReviewResolutionAudit
from apps.rehabilitation.models import RehabilitationSession, SymptomReport
from apps.movement.models import MovementMeasurement
from apps.reporting.serializers import ClinicianReviewFlagSerializer
from apps.rehabilitation.permissions import (
    check_session_access,
    get_request_patient_identifier,
    is_clinician,
)

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
        # Role-based permission check: ordinary patients cannot inspect clinician queues
        if not is_clinician(request):
            return Response(
                {"error": "forbidden", "detail": "Clinician authorization required to access review queues."},
                status=status.HTTP_403_FORBIDDEN
            )

        status_filter = request.query_params.get('status')
        queryset = ClinicianReviewFlag.objects.select_related('session').all()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        serializer = ClinicianReviewFlagSerializer(queryset, many=True)
        return Response(serializer.data)


class ClinicianReviewResolveView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, review_id):
        if not is_clinician(request):
            return Response(
                {"error": "forbidden", "detail": "Clinician authorization required to resolve safety flags."},
                status=status.HTTP_403_FORBIDDEN
            )

        flag = get_object_or_404(ClinicianReviewFlag, id=review_id)
        notes = request.data.get('clinician_notes')
        action = request.data.get('resolution_action', 'acknowledged_and_plan_adjusted')
        clinician_name = request.data.get('clinician_identifier', 'Dr. Clinician')

        if not notes:
            return Response(
                {"error": "bad_request", "detail": "clinician_notes is required for audit trail."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user if (request.user and request.user.is_authenticated) else None
        now = timezone.now()

        flag.status = 'resolved'
        flag.resolved_at = now
        flag.resolved_by = user
        flag.save(update_fields=['status', 'resolved_at', 'resolved_by'])

        audit = ReviewResolutionAudit.objects.create(
            review_flag=flag,
            clinician_identifier=clinician_name,
            clinician=user,
            clinician_notes=notes,
            resolution_action=action,
            resolved_at=now,
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

        # Isolate progress metrics to requesting patient unless clinician
        if not is_clinician(request):
            if request.user and request.user.is_authenticated:
                sessions = sessions.filter(user=request.user)
            else:
                patient_id = get_request_patient_identifier(request)
                if patient_id and patient_id != 'demo_patient':
                    sessions = sessions.filter(patient_identifier=patient_id)
        else:
            patient_filter = request.query_params.get('patient_id')
            if patient_filter:
                sessions = sessions.filter(patient_identifier=patient_filter)

        total_sessions = sessions.count()

        # Exercises aggregate (like-for-like, never conflating squat and arm raise)
        completed_exercises = {}
        for ex_id in ['bodyweight_squat', 'shoulder_flexion']:
            ex_sessions = sessions.filter(exercise_id=ex_id)
            count = ex_sessions.count()
            total_reps = ex_sessions.aggregate(Sum('completed_reps'))['completed_reps__sum'] or 0

            # Compute average primary joint angle from reliable measurements
            measurements = MovementMeasurement.objects.filter(
                session__in=ex_sessions,
                measurement_reliable=True
            )
            primary_angles = []
            for m in measurements:
                angles = m.joint_angles or {}
                if ex_id == 'bodyweight_squat':
                    # knee flexion
                    val = angles.get('left_knee') or angles.get('right_knee')
                else:
                    # shoulder flexion
                    val = angles.get('left_shoulder') or angles.get('right_shoulder')
                if val is not None and isinstance(val, (int, float)):
                    primary_angles.append(val)

            avg_angle = round(sum(primary_angles) / len(primary_angles), 1) if primary_angles else None

            completed_exercises[ex_id] = {
                "sessions_count": count,
                "total_reps": total_reps,
                "average_primary_angle": avg_angle,
            }

        # Pain & difficulty trend from confirmed symptom reports only
        symptoms = SymptomReport.objects.filter(
            session__in=sessions,
            patient_confirmed=True
        ).order_by('reported_at')[:20]

        pain_trend = [
            {
                "date": sym.reported_at.strftime('%Y-%m-%d'),
                "pain_score": sym.pain_score,
                "difficulty": sym.difficulty,
            }
            for sym in symptoms
        ]

        flagged_count = ClinicianReviewFlag.objects.filter(
            session__in=sessions,
            status='pending'
        ).count()

        # Group sessions by date
        sessions_by_date = {}
        for s in sessions:
            d_str = s.started_at.strftime('%Y-%m-%d')
            sessions_by_date[d_str] = sessions_by_date.get(d_str, 0) + 1

        return Response({
            "total_sessions": total_sessions,
            "completed_exercises": completed_exercises,
            "pain_trend": pain_trend,
            "flagged_sessions_count": flagged_count,
            "sessions_by_date": sessions_by_date,
        })


class SessionReportView(APIView):
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer, CSVRenderer, BrowsableAPIRenderer]

    def get(self, request, session_id):
        session = get_object_or_404(RehabilitationSession, id=session_id)

        if not check_session_access(session, request):
            return Response(
                {"error": "forbidden", "detail": "You do not have permission to view or download another patient's report."},
                status=status.HTTP_403_FORBIDDEN
            )

        fmt = request.query_params.get('format', 'json').lower()
        measurements = session.measurements.all()
        symptoms = session.symptoms.all()
        flags = session.review_flags.all()

        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="rehabsense_session_{session.id}.csv"'

            writer = csv.writer(response)
            writer.writerow(['RehabSense AI - Session Clinical Summary Report'])
            writer.writerow(['Session ID', str(session.id)])
            writer.writerow(['Patient Identifier', session.patient_identifier])
            writer.writerow(['Exercise', session.exercise_id])
            writer.writerow(['Status', session.status])
            writer.writerow(['Target Reps', session.target_reps])
            writer.writerow(['Completed Reps', session.completed_reps])
            writer.writerow(['Notes', session.notes or 'None'])
            writer.writerow(['Started At', session.started_at.isoformat() if session.started_at else ''])
            writer.writerow(['Ended At', session.ended_at.isoformat() if session.ended_at else ''])
            writer.writerow(['Review Required', session.review_required])
            writer.writerow([])

            writer.writerow(['--- Movement Measurements ---'])
            writer.writerow(['Timestamp', 'Repetitions', 'Reliable', 'Joint Angles (deg)', 'Visibility', 'Checks', 'Phase'])
            for m in measurements:
                writer.writerow([
                    m.captured_at.isoformat() if m.captured_at else '',
                    m.repetitions,
                    m.measurement_reliable,
                    str(m.joint_angles),
                    str(m.visibility),
                    str(m.movement_checks),
                    m.current_phase,
                ])

            writer.writerow([])
            writer.writerow(['--- Patient Symptom Reports ---'])
            writer.writerow(['Reported At', 'Transcript', 'Language', 'Pain Score (0-10)', 'Difficulty', 'Body Area', 'Patient Confirmed'])
            for s in symptoms:
                writer.writerow([
                    s.reported_at.isoformat() if s.reported_at else '',
                    s.raw_transcript,
                    s.language,
                    s.pain_score if s.pain_score is not None else '',
                    s.difficulty,
                    s.body_area,
                    s.patient_confirmed,
                ])

            writer.writerow([])
            writer.writerow(['--- Clinician Review Flags & Audit Trails ---'])
            writer.writerow(['Flag ID', 'Created At', 'Status', 'Severity', 'Reasons', 'Feedback', 'Resolved By', 'Resolution Action', 'Clinician Notes'])
            for f in flags:
                audit_notes = ''
                audit_action = ''
                if hasattr(f, 'resolution'):
                    audit_notes = f.resolution.clinician_notes
                    audit_action = f.resolution.resolution_action
                writer.writerow([
                    str(f.id),
                    f.created_at.isoformat() if f.created_at else '',
                    f.status,
                    f.severity,
                    "; ".join(f.flag_reasons),
                    "; ".join(f.safety_feedback),
                    str(f.resolved_by or ''),
                    audit_action,
                    audit_notes,
                ])

            return response

        # Default JSON structured report
        return Response({
            "session_id": str(session.id),
            "patient_identifier": session.patient_identifier,
            "exercise": session.exercise_id,
            "status": session.status,
            "target_reps": session.target_reps,
            "completed_reps": session.completed_reps,
            "notes": session.notes,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "review_required": session.review_required,
            "summary_metrics": session.summary_metrics,
            "measurements_count": measurements.count(),
            "symptoms_count": symptoms.count(),
            "measurements": [
                {
                    "id": str(m.id),
                    "captured_at": m.captured_at,
                    "repetitions": m.repetitions,
                    "joint_angles": m.joint_angles,
                    "measurement_reliable": m.measurement_reliable,
                    "movement_checks": m.movement_checks,
                }
                for m in measurements
            ],
            "symptoms": [
                {
                    "id": str(s.id),
                    "reported_at": s.reported_at,
                    "transcript": s.raw_transcript,
                    "language": s.language,
                    "pain_score": s.pain_score,
                    "difficulty": s.difficulty,
                    "body_area": s.body_area,
                    "patient_confirmed": s.patient_confirmed,
                }
                for s in symptoms
            ],
            "flags": [
                {
                    "id": str(f.id),
                    "status": f.status,
                    "severity": f.severity,
                    "reasons": f.flag_reasons,
                    "feedback": f.safety_feedback,
                    "resolution": {
                        "clinician_identifier": f.resolution.clinician_identifier,
                        "clinician_notes": f.resolution.clinician_notes,
                        "resolution_action": f.resolution.resolution_action,
                        "resolved_at": f.resolution.resolved_at,
                    } if hasattr(f, 'resolution') else None,
                }
                for f in flags
            ],
        })
