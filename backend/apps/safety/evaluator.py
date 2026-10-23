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
    feedback_ml = []
    urgent_alert = False

    transcript_lower = (transcript or "").lower()

    # Rule S3: Red-Flag Urgent Medical Symptoms
    for kw in URGENT_KEYWORDS:
        if kw in transcript_lower:
            urgent_alert = True
            reasons.append("urgent_symptom_detected")
            feedback.append("URGENT: Serious symptom detected. Stop immediately and seek immediate medical assistance.")
            feedback_ml.append("ശ്രദ്ധിക്കുക: അടിയന്തിര ലക്ഷണങ്ങൾ കാണുന്നു. ഉടൻ തന്നെ വ്യായാമം നിർത്തി വൈദ്യസഹായം തേടുക.")
            break

    # Rule S1: Severe Pain (VAS >= 7)
    if pain_score is not None and pain_score >= 7:
        reasons.append("high_pain_score")
        feedback.append("High pain reported. Please stop the exercise, rest, and notify your physiotherapist.")
        feedback_ml.append("കടുത്ത വേദന അനുഭവപ്പെടുന്നു. ദയവായി വ്യായാമം നിർത്തി വിശ്രമിക്കുക, ഫിസിയോതെറാപ്പിസ്റ്റിനെ അറിയിക്കുക.")

    # Rule S2: Worsening Pain Progression (Flag or >= 2 points above prior session baseline)
    pain_worsening_detected = worsening_pain
    if not pain_worsening_detected:
        for kw in PAIN_INCREASE_KEYWORDS:
            if kw in transcript_lower:
                pain_worsening_detected = True
                break

    if not pain_worsening_detected and pain_score is not None and getattr(session, 'patient_identifier', None):
        try:
            from apps.rehabilitation.models import SymptomReport
            prev_symptom = SymptomReport.objects.filter(
                session__patient_identifier=session.patient_identifier,
                patient_confirmed=True,
                pain_score__isnull=False,
            ).exclude(session_id=session.id).order_by('-reported_at').first()

            if prev_symptom and prev_symptom.pain_score is not None:
                if pain_score - prev_symptom.pain_score >= 2:
                    pain_worsening_detected = True
        except Exception:
            pass

    if pain_worsening_detected:
        reasons.append("patient_reported_increasing_pain")
        feedback.append("Your pain is increasing. Pause the exercise and consult your clinician before resuming.")
        feedback_ml.append("വേദന കൂടുന്നതായി കാണുന്നു. വ്യായാമം താൽക്കാലികമായി നിർത്തി വിശ്രമിക്കുക.")

    # Rule S4: Persistent Unreliable Tracking Streak
    if unreliable_measurement_streak >= 5:
        reasons.append("unreliable_camera_streak")
        feedback.append("Tracking is currently unreliable. Please step back into full camera view and ensure proper room lighting.")
        feedback_ml.append("ക്യാമറയിൽ ശരീരം വ്യക്തമല്ല. വെളിച്ചം ഉറപ്പാക്കി ക്യാമറയ്ക്ക് നേരെ നിൽക്കുക.")

    # Rule S5: Unconfirmed Symptom Safeguard
    # If symptoms are unconfirmed and non-urgent, retain as draft without generating clinical alert
    if not patient_confirmed and not urgent_alert:
        draft_reasons = list(reasons)
        return {
            "review_required": False,
            "reasons": draft_reasons,
            "measurement_reliable": unreliable_measurement_streak < 5,
            "feedback": ["Symptom draft recorded. Awaiting patient confirmation."],
            "feedback_ml": ["രേഖപ്പെടുത്തിയ ലക്ഷണങ്ങൾ സ്ഥിരീകരിക്കാൻ കാത്തിരിക്കുന്നു."],
            "urgent_alert": False,
            "unconfirmed_draft": True,
        }

    # Determine if review is required
    review_required = bool(reasons)

    # Persist review flag if review is required and symptoms were confirmed (or urgent)
    if review_required and (patient_confirmed or urgent_alert):
        if not session.review_required:
            session.review_required = True
            session.save(update_fields=['review_required'])

        target_severity = 'urgent' if urgent_alert else ('warning' if pain_score and pain_score >= 7 else 'routine')
        
        # Deduplicate or update existing pending flag for this session
        existing_flag = ClinicianReviewFlag.objects.filter(session=session, status='pending').first()
        if existing_flag:
            existing_flag.flag_reasons = list(dict.fromkeys(existing_flag.flag_reasons + reasons))
            existing_flag.safety_feedback = list(dict.fromkeys(existing_flag.safety_feedback + feedback))
            if target_severity == 'urgent' or existing_flag.severity != 'urgent':
                existing_flag.severity = target_severity
            existing_flag.save()
        else:
            ClinicianReviewFlag.objects.create(
                session=session,
                status='pending',
                severity=target_severity,
                flag_reasons=reasons,
                safety_feedback=feedback,
            )

    if not feedback:
        feedback.append("Exercise movement within safe demonstration parameters.")
        feedback_ml.append("വ്യായാമ ചലനങ്ങൾ സുരക്ഷിതമായ പരിധിയിലാണ്.")

    return {
        "review_required": review_required,
        "reasons": reasons,
        "measurement_reliable": unreliable_measurement_streak < 5,
        "feedback": feedback,
        "feedback_ml": feedback_ml,
        "urgent_alert": urgent_alert,
    }
