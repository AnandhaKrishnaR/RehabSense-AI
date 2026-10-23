# RehabSense AI — API Integration Contracts (`/api/v1/`)

Version: `1.0.0`  
Base URL: `http://localhost:8000/api/v1`

---

## 1. Canonical Constants

### Canonical Exercise IDs
Every module (Frontend, Vision, Backend, Database, Reports) must use these exact strings:
- `bodyweight_squat`: Bodyweight Squat exercise
- `shoulder_flexion`: Shoulder Flexion (Arm Raise) exercise

No alternative slugs or capitalization (`Squat`, `arm_raise`, `shoulder-flexion`) are permitted.

### Standard Units and Formatting
- **Joint Angles**: Degrees (`0.0` to `180.0` or `360.0`), decimal floating-point.
- **Confidence / Visibility**: Decimal floating-point between `0.0` and `1.0`.
- **Timestamps**: ISO-8601 UTC format (`YYYY-MM-DDTHH:MM:SSZ` or with offset).
- **Pain Score**: Integer `0` to `10` or `null` if not reported.
- **Difficulty Options**: `""`, `"easy"`, `"moderate"`, `"hard"`, `"very_hard"`.

---

## 2. Standard Response & Error Format

All error responses return standard JSON with HTTP status codes:

```json
{
  "error": "Error message or error code",
  "detail": "Detailed explanation of what failed",
  "field_errors": {
    "exercise": ["Invalid exercise ID. Allowed: bodyweight_squat, shoulder_flexion"]
  }
}
```

HTTP Status Codes:
- `200 OK`: Request succeeded.
- `201 Created`: Resource created successfully.
- `400 Bad Request`: Field validation error or invalid payload.
- `401 Unauthorized` / `403 Forbidden`: Authentication or authorization required.
- `404 Not Found`: Resource does not exist.
- `500 Internal Server Error`: Unexpected server error.

---

## 3. Endpoints

### 3.1 Health Check
- **Endpoint**: `GET /api/v1/health/`
- **Description**: Verifies service status and configured dependencies.
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "demo_mode": true,
  "voice_provider": "mock",
  "database": "connected"
}
```

---

### 3.2 Exercise Catalog

#### `GET /api/v1/exercises/`
- **Description**: List all supported exercises.
- **Response `200 OK`**:
```json
[
  {
    "id": "bodyweight_squat",
    "name": "Bodyweight Squat",
    "target_joints": ["left_knee", "right_knee", "left_hip", "right_hip"],
    "description": "Lower hips until thighs approach parallel to floor, then return upright.",
    "instructions_en": "Keep chest up and knees tracking over toes.",
    "instructions_ml": "നെഞ്ച് നേരെ വയ്ക്കുക, കാൽമുട്ടുകൾ വളച്ച് പതുക്കെ താഴേക്ക് ഇരിക്കുക.",
    "default_target_reps": 10,
    "demo_parameters": {
      "inflection_knee_angle": 100.0,
      "standing_knee_angle": 160.0
    }
  },
  {
    "id": "shoulder_flexion",
    "name": "Shoulder Flexion (Arm Raise)",
    "target_joints": ["left_shoulder", "right_shoulder"],
    "description": "Raise the arm forward and upward in front of the body within a comfortable range.",
    "instructions_en": "Raise your arm smoothly without arching your back.",
    "instructions_ml": "കൈ നേരെ മുന്നിലേക്ക് സാവധാനം ഉയർത്തുക.",
    "default_target_reps": 8,
    "demo_parameters": {
      "peak_shoulder_angle": 120.0,
      "resting_shoulder_angle": 30.0
    }
  }
]
```

#### `GET /api/v1/exercises/{exercise_id}/`
- **Response `200 OK`**: Single exercise object as above.
- **Response `404 Not Found`**:
```json
{
  "error": "not_found",
  "detail": "Exercise 'invalid_id' not found."
}
```

---

### 3.3 Therapy Plans

#### `GET /api/v1/therapy-plans/`
- **Response `200 OK`**: List of therapy plans prescribed for the patient.

#### `POST /api/v1/therapy-plans/`
- **Request Body**:
```json
{
  "patient_name": "Test Patient",
  "clinician_name": "Dr. Sarah Clinician",
  "notes": "Post-knee arthroscopy rehabilitation plan.",
  "items": [
    {
      "exercise_id": "bodyweight_squat",
      "target_sets": 2,
      "target_reps": 10,
      "notes": "Do not exceed comfortable depth."
    }
  ]
}
```
- **Response `201 Created`**

---

### 3.4 Rehabilitation Sessions

#### `POST /api/v1/sessions/`
- **Description**: Create a new exercise session.
- **Request Body**:
```json
{
  "exercise_id": "bodyweight_squat",
  "therapy_plan_id": null
}
```
- **Response `201 Created`**:
```json
{
  "id": "b3e0c7a1-2d9f-4e8a-b9c1-5d6e7f8a9b0c",
  "exercise": "bodyweight_squat",
  "therapy_plan": null,
  "status": "in_progress",
  "target_reps": 10,
  "completed_reps": 0,
  "started_at": "2026-10-23T10:15:30Z",
  "ended_at": null,
  "review_required": false
}
```

#### `GET /api/v1/sessions/`
- **Query parameters**: `?exercise=bodyweight_squat&status=completed`
- **Response `200 OK`**: Paginated or list of session records.

#### `GET /api/v1/sessions/{session_id}/`
- **Response `200 OK`**: Detailed session with summary metrics and flags.

---

### 3.5 Movement Measurements

#### `POST /api/v1/sessions/{session_id}/measurements/`
- **Description**: Submit movement tracking data from browser MediaPipe processing.
- **Request Body**:
```json
{
  "exercise": "bodyweight_squat",
  "repetitions": 8,
  "joint_angles": {
    "left_knee": 85.0,
    "right_knee": 88.0
  },
  "measurement_reliable": true,
  "visibility": {
    "left_knee": 0.95,
    "right_knee": 0.92
  },
  "movement_checks": [],
  "captured_at": "2026-10-23T10:18:22Z"
}
```
- **Validation Rules**:
  - `exercise` must match session exercise ID.
  - `repetitions` must be non-negative integer.
  - `measurement_reliable` must be boolean.
  - `visibility` joint scores must be `0.0 <= v <= 1.0`.
  - Missing angles or low visibility landmarks must be reflected in `measurement_reliable: false` and `movement_checks`.
- **Response `201 Created`**:
```json
{
  "id": "m1a2b3c4-...",
  "session_id": "b3e0c7a1-...",
  "exercise": "bodyweight_squat",
  "repetitions": 8,
  "measurement_reliable": true,
  "stored_at": "2026-10-23T10:18:23Z"
}
```

---

### 3.6 Symptom Reports

#### `POST /api/v1/sessions/{session_id}/symptoms/`
- **Description**: Submit patient symptom feedback (text or transcribed Malayalam).
- **Request Body**:
```json
{
  "transcript": "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു",
  "pain_score": 5,
  "difficulty": "hard",
  "body_area": "shoulder",
  "patient_confirmed": true,
  "language": "ml"
}
```
- **Rules**:
  - `patient_confirmed` indicates user has explicitly validated the extracted values.
  - If `patient_confirmed: false`, stored as draft or triggers confirmation prompt.
- **Response `201 Created`**: Stored symptom record and triggered safety status.

---

### 3.7 Safety Evaluation

#### `POST /api/v1/safety/evaluate/`
- **Description**: Evaluates current session state against deterministic safety rules.
- **Request Body**:
```json
{
  "session_id": "b3e0c7a1-...",
  "pain_score": 7,
  "worsening_pain": true,
  "unreliable_measurement_streak": 0,
  "reported_symptoms": ["pain_increase", "sharp_ache"]
}
```
- **Response `200 OK`**:
```json
{
  "review_required": true,
  "reasons": [
    "patient_reported_increasing_pain",
    "high_pain_score"
  ],
  "measurement_reliable": true,
  "feedback": [
    "Pause the exercise and follow your clinician's guidance.",
    "Please rest and do not push through worsening pain."
  ],
  "urgent_alert": false
}
```

---

### 3.8 Voice Endpoints

#### `POST /api/v1/voice/transcribe/`
- **Content-Type**: `multipart/form-data`
- **Form Data**: `audio`: audio file (wav/webm/mp3), `language`: `"ml"` (Malayalam) or `"en"`.
- **Response `200 OK`**:
```json
{
  "text": "കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു",
  "language": "ml",
  "confidence": 0.94,
  "provider": "mock",
  "extracted_symptoms": {
    "pain_detected": true,
    "suggested_pain_score": 5,
    "suggested_difficulty": "hard",
    "body_area": "arm_shoulder"
  }
}
```

#### `POST /api/v1/voice/speak/`
- **Content-Type**: `application/json`
- **Request Body**:
```json
{
  "text": "വ്യായാമം നിർത്തുക, വിശ്രമിക്കുക.",
  "language": "ml"
}
```
- **Response `200 OK`**:
```json
{
  "audio_url": null,
  "audio_base64": "UklGR...",
  "mime_type": "audio/wav",
  "provider": "mock",
  "fallback_text": "വ്യായാമം നിർത്തുക, വിശ്രമിക്കുക."
}
```

---

### 3.9 Progress & Clinician Review Endpoints

#### `GET /api/v1/progress/`
- **Response `200 OK`**:
```json
{
  "total_sessions": 12,
  "completed_exercises": {
    "bodyweight_squat": {
      "sessions_count": 8,
      "total_reps": 68,
      "average_knee_flexion": 88.5
    },
    "shoulder_flexion": {
      "sessions_count": 4,
      "total_reps": 28,
      "average_shoulder_elevation": 115.0
    }
  },
  "pain_trend": [
    {"date": "2026-10-20", "pain_score": 6},
    {"date": "2026-10-22", "pain_score": 4}
  ],
  "flagged_sessions_count": 1
}
```

#### `GET /api/v1/clinician/reviews/`
- **Response `200 OK`**: List of sessions flagged for clinician review with reasons.

#### `POST /api/v1/clinician/reviews/{review_id}/resolve/`
- **Request Body**:
```json
{
  "clinician_notes": "Reviewed session. Patient advised to reduce squat depth to 80 degrees.",
  "resolution_action": "acknowledged_and_plan_adjusted"
}
```
- **Response `200 OK`**: Updated review record with audit timestamp.

#### `GET /api/v1/sessions/{session_id}/report/`
- **Query param**: `?format=json` or `?format=csv`
- Returns structured clinical summary report or downloadable CSV file.
