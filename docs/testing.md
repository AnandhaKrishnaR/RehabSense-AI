# RehabSense AI — Backend Testing Strategy & Quality Gates

## 1. Testing Philosophy

In digital health rehabilitation prototypes:
1. **Never mock safety logic**: Deterministic safety rules and threshold evaluations must run against real rule code with exhaustive positive, negative, and edge-case synthetic inputs.
2. **Synthetic data only**: All test fixtures use synthetic data. Never use real patient identifiers, medical histories, or PHI.
3. **Graceful provider failures**: All external integrations (voice STT/TTS, cloud databases) must have failure-path tests verifying clear error responses without uncaught 500 crashes.
4. **Separation of Concerns**: Test measurement ingestion independently from vision algorithms, and symptom confirmation independently from audio codecs.

---

## 2. Test Suite Architecture

Backend tests are organized under `backend/tests/`:

| Test Module | Coverage Domain | Key Invariants Tested |
|---|---|---|
| `test_health.py` | Health Check Endpoint | Returns database connection status, demo mode flag, active voice provider |
| `test_exercises.py` | Exercise Catalog | Canonical IDs (`bodyweight_squat`, `shoulder_flexion`), 404 for unknown exercise |
| `test_sessions.py` | Session Lifecycle | Session creation, invalid exercise rejection, status updates, ownership filters |
| `test_measurements.py` | Movement API Contract | Adherence to `vision-contracts` schema, exercise mismatch rejection, reliability preservation |
| `test_symptoms.py` | Symptom Reports & Confirmation | Pain score bounds (0-10), Malayalam symptom capture, confirmation status |
| `test_safety.py` | Deterministic Safety Engine | S1 (severe pain), S2 (worsening pain), S3 (red-flag symptoms), S4 (unreliable streak), S5 (missing data), S6 (conflicting data) |
| `test_reporting.py` | Progress & Clinician Review | Like-for-like exercise metric aggregation, review flag filtering, clinician resolution audit trails, CSV report export |
| `test_voice.py` | Malayalam Voice Layer | Mock STT transcription, TTS synthesis fallback, file upload validation, size limits |

---

## 3. Running Tests on Windows (VS Code PowerShell)

### Run Entire Backend Test Suite
```powershell
# From project root
.venv\Scripts\python backend\manage.py test tests --settings=config.settings
```

### Run a Specific Test Module
```powershell
.venv\Scripts\python backend\manage.py test tests.test_safety --settings=config.settings
.venv\Scripts\python backend\manage.py test tests.test_measurements --settings=config.settings
```

### Run with Verbosity
```powershell
.venv\Scripts\python backend\manage.py test tests -v 2 --settings=config.settings
```

### Run Django System Check
```powershell
.venv\Scripts\python backend\manage.py check
```

---

## 4. Quality Gates Checklist

Before submitting or handing off to frontend and computer vision leads:
- [x] Django system check passes: `python manage.py check` (0 issues).
- [x] Migrations are fully applied and idempotent: `python manage.py migrate`.
- [x] Canonical exercise definitions seeded idempotently: `python manage.py seed_demo_data`.
- [x] All automated test cases pass: 100% test success with zero errors.
- [x] Error payloads adhere to standard contract (`error`, `detail`, `field_errors`).
- [x] No hardcoded production secrets or unhandled exceptions.
