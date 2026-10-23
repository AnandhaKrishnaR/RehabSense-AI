from django.urls import path
from apps.reporting.views import (
    ClinicianReviewListView,
    ClinicianReviewResolveView,
    ProgressSummaryView,
    SessionReportView,
)

app_name = 'reporting'

urlpatterns = [
    path('clinician/reviews/', ClinicianReviewListView.as_view(), name='clinician-reviews-list'),
    path('clinician/reviews/<uuid:review_id>/resolve/', ClinicianReviewResolveView.as_view(), name='clinician-review-resolve'),
    path('progress/', ProgressSummaryView.as_view(), name='progress-summary'),
    path('sessions/<uuid:session_id>/report/', SessionReportView.as_view(), name='session-report'),
]
