# RehabSense AI — Deterministic Safety Rules Engine

## 1. Principles and Clinical Safeguards

1. **Conservative Action**: When in doubt or when symptoms worsen, the system recommends pausing the session. It **never** encourages a patient to "push through the pain".
2. **Deterministic & Explainable**: Safety decisions are calculated by deterministic Python functions with explicit reasons. No black-box or non-reproducible AI makes medical safety calls.
3. **No Unvalidated Medical Diagnoses**: The system tracks kinematic measurements and symptom statements; it does not diagnose pathologies (e.g., does not diagnose "meniscus tear").
4. **Reliability Independence**: Missing landmarks or poor webcam visibility are flagged as camera/visibility issues, **never** as poor patient compliance or incorrect exercise technique.

---

## 2. Deterministic Rule Catalog

### Rule S1: Severe Pain (`high_pain_score`)
- **Condition**: Reported `pain_score >= 7` (on a 0–10 Visual Analog Scale).
- **Flag Generated**: `ClinicianReviewFlag(severity='warning')`
- **Session Status**: Session `review_required = True`.
- **Patient Feedback**:
  - English: *"High pain reported. Please stop the exercise, rest, and notify your physiotherapist."*
  - Malayalam: *"കടുത്ത വേദന അനുഭവപ്പെടുന്നു. ദയവായി വ്യായാമം നിർത്തി വിശ്രമിക്കുക, ഫിസിയോതെറാപ്പിസ്റ്റിനെ അറിയിക്കുക."*

### Rule S2: Worsening Pain Progression (`worsening_pain`)
- **Condition**:
  - `worsening_pain == True`, OR
  - Current `pain_score` is $\ge 2$ points higher than previous session baseline.
- **Flag Generated**: `ClinicianReviewFlag(severity='warning')`
- **Patient Feedback**:
  - English: *"Your pain is increasing. Pause the exercise and consult your clinician before resuming."*
  - Malayalam: *"വേദന കൂടുന്നതായി കാണുന്നു. വ്യായാമം താൽക്കാലികമായി നിർത്തി വിശ്രമിക്കുക."*

### Rule S3: Red-Flag Urgent Medical Symptoms (`urgent_symptom_detected`)
- **Condition**: Transcript or symptom report contains urgent red-flag tokens:
  - English: `chest pain`, `shortness of breath`, `dizziness`, `fainting`, `severe numbness`
  - Malayalam: `നെഞ്ചുവേദന` (chest pain), `ശ്വാസതടസ്സം` (breathlessness), `തലകറക്കം` (dizziness), `തളർച്ച` (faintness)
- **Flag Generated**: `ClinicianReviewFlag(severity='urgent')`
- **Patient Feedback**:
  - English: *"URGENT: Serious symptom detected. Stop immediately and seek immediate medical assistance."*
  - Malayalam: *"ശ്രദ്ധിക്കുക: അടിയന്തിര ലക്ഷണങ്ങൾ കാണുന്നു. ഉടൻ തന്നെ വ്യായാമം നിർത്തി വൈദ്യസഹായം തേടുക."*

### Rule S4: Persistent Unreliable Tracking (`unreliable_camera_streak`)
- **Condition**: $\ge 5$ consecutive measurement snapshots marked `measurement_reliable == False` or primary landmark visibility $< 0.65$.
- **Action**: Pause repetition counter. Provide environment guidance.
- **Patient Feedback**:
  - English: *"Tracking is currently unreliable. Please step back into full camera view and ensure proper room lighting."*
  - Malayalam: *"ക്യാമറയിൽ ശരീരം വ്യക്തമല്ല. വെളിച്ചം ഉറപ്പാക്കി ക്യാമറയ്ക്ക് നേരെ നിൽക്കുക."*
- **Note**: Does **not** penalize the patient or count as failed repetitions.

### Rule S5: Unconfirmed Symptom Safeguard (`unconfirmed_symptom_draft`)
- **Condition**: Symptom parsed from Malayalam STT where `patient_confirmed == False`.
- **Action**: Retain as draft; UI prompts: *"We noted: [Extracted Details]. Is this correct?"*
- **Persisted Status**: Only confirmed records (`patient_confirmed: True`) factor into clinical progress scoring.
