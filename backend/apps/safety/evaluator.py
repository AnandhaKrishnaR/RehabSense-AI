from apps.safety.models import ClinicianReviewFlag

URGENT_KEYWORDS = [
    'chest pain', 'shortness of breath', 'dizziness', 'faint', 'fainting',
    'heart', 'numbness', 'emergency',
    'നെഞ്ചുവേദന', 'ശ്വാസതടസ്സം', 'തലകറക്കം', 'തളർച്ച', 'ശ്വാസം'
]

PAIN_INCREASE_KEYWORDS = [
    'കൂടുന്നു', 'കൂടുതൽ', 'കൂടി', 'worse', 'worsening', 'increasing',
    'sharp', 'severe', 'unbearable', 'കടുത്ത'
]

def evaluate_session_safety(
    session,
    pain_score=None,
    transcript="",
    patient_confirmed=True,
    unreliable_measurement_streak=0,
    worsening_pain=False,
):
    """
    Deterministic safety evaluation based on documented safety rules in docs/safety-rules.md.
    Does NOT diagnose injury or arbitrarily alter treatments.
    Provides conservative pause guidance and clinician review flags.
    """
    reasons = []
    feedback = []
    urgent_alert = False

    transcript_lower = (transcript or "").lower()

    # Rule S3: Red-Flag Urgent Medical Symptoms
    for kw in URGENT_KEYWORDS:
        if kw in transcript_lower:
            urgent_alert = True
            reasons.append("urgent_symptom_detected")
            feedback.append("URGENT: Serious symptom reported. Stop exercising immediately and seek medical attention.")
            break

    # Rule S1: Severe Pain (VAS >= 7)
    if pain_score is not None and pain_score >= 7:
        reasons.append("high_pain_score")
        feedback.append("High pain level reported. Please stop the exercise, rest, and notify your physiotherapist.")

    # Rule S2: Worsening Pain Progression
    pain_worsening_detected = worsening_pain
    if not pain_worsening_detected:
        for kw in PAIN_INCREASE_KEYWORDS:
            if kw in transcript_lower:
                pain_worsening_detected = True
                break

    if pain_worsening_detected:
        reasons.append("patient_reported_increasing_pain")
        feedback.append("Your pain appears to be increasing. Pause the exercise and follow your clinician's guidance.")

    # Rule S4: Persistent Unreliable Tracking Streak
    if unreliable_measurement_streak >= 5:
        reasons.append("unreliable_camera_streak")
        feedback.append("Webcam tracking has been occluded. Please check lighting and step fully into camera view.")

    # Determine if review is required
    review_required = bool(reasons)

    # Persist review flag if review is required and symptoms were confirmed (or urgent)
    if review_required and (patient_confirmed or urgent_alert):
        if not session.review_required:
            session.review_required = True
            session.save(update_fields=['review_required'])

        ClinicianReviewFlag.objects.create(
            session=session,
            status='pending',
            severity='urgent' if urgent_alert else ('warning' if pain_score and pain_score >= 7 else 'routine'),
            flag_reasons=reasons,
            safety_feedback=feedback,
        )

    if not feedback:
        feedback.append("Exercise movement within safe demonstration parameters.")

    return {
        "review_required": review_required,
        "reasons": reasons,
        "measurement_reliable": unreliable_measurement_streak < 5,
        "feedback": feedback,
        "urgent_alert": urgent_alert,
    }
