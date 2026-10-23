from django.urls import path
from apps.safety.views import SafetyEvaluateView

app_name = 'safety'

urlpatterns = [
    path('safety/evaluate/', SafetyEvaluateView.as_view(), name='safety-evaluate'),
]
