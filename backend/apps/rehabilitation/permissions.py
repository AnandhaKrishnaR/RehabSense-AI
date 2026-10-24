from rest_framework import permissions
from django.conf import settings

def get_request_patient_identifier(request):
    """
    Extracts effective patient identifier from authenticated user or header in demo mode.
    """
    if request.user and request.user.is_authenticated:
        return request.user.username
    return request.headers.get('X-Patient-Id', request.query_params.get('patient_id', 'demo_patient'))

def is_clinician(request):
    """
    Returns True if user is a clinician/staff member or has clinician header in demo mode.
    """
    if request.user and request.user.is_authenticated:
        return request.user.is_staff or request.user.groups.filter(name='Clinicians').exists()
    if settings.DEMO_MODE:
        return request.headers.get('X-Clinician-Id') is not None or request.headers.get('X-Role') == 'clinician'
    return False

def check_session_access(session, request):
    """
    Verifies that the requester has permission to access the given session.
    Clinicians can access all sessions.
    Patients can only access their own sessions.
    Returns True if allowed, False otherwise.
    """
    if is_clinician(request):
        return True

    # If user is authenticated, check user relationship
    if request.user and request.user.is_authenticated:
        if session.user is not None:
            return session.user == request.user
        return session.patient_identifier == request.user.username

    # In demo mode, check patient identifier match
    if settings.DEMO_MODE:
        patient_id = get_request_patient_identifier(request)
        # If session has a specific non-default patient, verify caller matches
        if session.patient_identifier != 'demo_patient' and patient_id != 'demo_patient':
            return session.patient_identifier == patient_id
        return True

    return False


class IsClinicianOrReadOnly(permissions.BasePermission):
    """
    Allows full access to clinicians; read-only to others.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_clinician(request)


class IsClinicianUser(permissions.BasePermission):
    """
    Allows access only to authenticated clinicians or clinician header in demo mode.
    """
    def has_permission(self, request, view):
        return is_clinician(request)
