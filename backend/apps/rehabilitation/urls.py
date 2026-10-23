from django.urls import path
from apps.rehabilitation.views import (
    ExerciseListView,
    ExerciseDetailView,
    TherapyPlanListCreateView,
    SessionListCreateView,
    SessionDetailView,
    SessionSymptomCreateView,
)

app_name = 'rehabilitation'

urlpatterns = [
    path('exercises/', ExerciseListView.as_view(), name='exercise-list'),
    path('exercises/<str:exercise_id>/', ExerciseDetailView.as_view(), name='exercise-detail'),
    path('therapy-plans/', TherapyPlanListCreateView.as_view(), name='therapy-plan-list-create'),
    path('sessions/', SessionListCreateView.as_view(), name='session-list-create'),
    path('sessions/<uuid:session_id>/', SessionDetailView.as_view(), name='session-detail'),
    path('sessions/<uuid:session_id>/symptoms/', SessionSymptomCreateView.as_view(), name='session-symptom-create'),
]
