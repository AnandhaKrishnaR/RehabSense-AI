from apps.safety.models import ClinicianReviewFlag

URGENT_KEYWORDS = [
    'chest pain', 'shortness of breath', 'dizziness', 'faint', 'fainting',
    'heart', 'numbness', 'emergency',
    'നെഞ്ചുവേദന', 'ശ്വാസതടസ്സം', 'തലകറക്കം', 'തളർച്ച', 'ശ്വാസം'
]

PAIN_INCREASE_KEYWORDS = [
    'കൂടുന്നു', 'കൂടുതൽ', 'കൂടി', 'worse', 'worsening', 'increasing',
    'sharp', 'severe', 'unbearable', 'കടുത്ത', 'getting worse'
]

def evaluate_session_safety(
    session,
    pain_score=None,
    transcript="",
    patient_confirmed=True,
    unreliable_measurement_streak=0,
    worsening_pain=False,
    difficulty="",
    body_area="",
    missing_critical_measurements=False,
    joint_angles=None,
):
    """
    Deterministic safety evaluation based on documented safety rules in docs/safety-rules.md.
    - Does NOT diagnose injury or arbitrarily alter treatments.
    - Provides conservative pause guidance and clinician review flags.
    - Implements flag deduplication to prevent clinician notification fatigue.
    """
    reasons = []
    feedback = []
    urgent_alert = False

    transcript_lower = (transcript or "").lower()

    # Rule S3: Red-Flag Urgent Medical Symptoms (Emergency Priority)
    for kw in URGENT_KEYWORDS:
        if kw in transcript_lower:
            urgent_alert = True
            reasons.append("urgent_symptom_detected")
            feedback.append("URGENT: Serious symptom reported. Stop exercising immediately and seek medical attention.")
            break

    # Rule S6: Conflicting or Contradictory Data Check
    conflicting = False
    has_pain_keywords = any(kw in transcript_lower for kw in PAIN_INCREASE_KEYWORDS)
    if pain_score == 0 and (worsening_pain or has_pain_keywords):
        conflicting = True
        reasons.append("conflicting_data")
        feedback.append("Conflicting symptom data detected: 0 pain reported alongside worsening pain description. Please verify.")

    # Rule S1: Severe Pain (VAS >= 7)
    if pain_score is not None and pain_score >= 7:
        reasons.append("high_pain_score")
        feedback.append("High pain level reported. Please stop the exercise, rest, and notify your physiotherapist.")

    # Rule S2: Worsening Pain Progression
    pain_worsening_detected = worsening_pain
    if not pain_worsening_detected and not conflicting:
        for kw in PAIN_INCREASE_KEYWORDS:
            if kw in transcript_lower:
                pain_worsening_detected = True
                break

    # Check baseline progression against prior confirmed reports in session
    if not pain_worsening_detected and pain_score is not None and session:
        try:
            prior_symptoms = session.symptoms.filter(
                patient_confirmed=True
            ).exclude(pain_score__isnull=True).order_by('reported_at')
            if prior_symptoms.exists():
                baseline_pain = prior_symptoms.first().pain_score
                if baseline_pain is not None and pain_score >= baseline_pain + 2:
                    pain_worsening_detected = True
        except Exception:
            pass

    if pain_worsening_detected and not conflicting:
        reasons.append("patient_reported_increasing_pain")
        feedback.append("Your pain appears to be increasing. Pause the exercise and follow your clinician's guidance.")

    # Rule S4: Persistent Unreliable Tracking Streak
    if unreliable_measurement_streak >= 5:
        reasons.append("unreliable_camera_streak")
        feedback.append("Webcam tracking is currently unreliable. Please step back into full camera view and ensure proper room lighting.")

    # Rule S5: Missing Critical Measurements
    if missing_critical_measurements:
        reasons.append("missing_critical_measurements")
        feedback.append("Critical joint tracking data is missing for this exercise. Please check camera framing.")
    elif joint_angles is not None and session and session.exercise:
        target_joints = session.exercise.target_joints or []
        if target_joints and all(joint_angles.get(j) is None for j in target_joints):
            reasons.append("missing_critical_measurements")
            feedback.append("Target joint angles could not be calculated from current pose. Please reposition.")

    # Rule S7: Unconfirmed Symptom Safeguard
    if not patient_confirmed and not urgent_alert:
        reasons.append("unconfirmed_symptom_draft")
        feedback.append("Extracted symptom report is awaiting patient confirmation before clinical trust.")

    # Determine if clinician review is required
    # Any urgent symptom, severe pain, worsening pain, or persistent camera issues trigger review
    review_triggering_reasons = [
        r for r in reasons if r in (
            "urgent_symptom_detected",
            "high_pain_score",
            "patient_reported_increasing_pain",
            "conflicting_data",
        )
    ]
    review_required = bool(review_triggering_reasons)

    # Persist review flag if review is required and symptoms were confirmed (or urgent)
    if review_required and (patient_confirmed or urgent_alert) and session:
        if not session.review_required:
            session.review_required = True
            session.save(update_fields=['review_required'])

        # Flag Deduplication: Check if identical pending flag already exists on session
        existing_flag = ClinicianReviewFlag.objects.filter(
            session=session,
            status='pending',
            flag_reasons=reasons
        ).exists()

        if not existing_flag:
            severity = 'urgent' if urgent_alert else ('warning' if (pain_score and pain_score >= 7) or pain_worsening_detected else 'routine')
            ClinicianReviewFlag.objects.create(
                session=session,
                status='pending',
                severity=severity,
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
