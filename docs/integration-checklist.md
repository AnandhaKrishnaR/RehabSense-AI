# RehabSense AI — Integration Verification Checklist

Use this checklist to verify that all modules are properly connected and functioning prior to hackathon demonstration.

---

## 1. Environment & Setup Verification
- [ ] Node.js (>= 18) and Python (>= 3.10) verified.
- [ ] Backend virtualenv created and dependencies installed (`django`, `djangorestframework`, `django-cors-headers`).
- [ ] Frontend dependencies installed (`vite`, `react`, `three`, `@react-three/fiber`, `@mediapipe/tasks-vision`, `lucide-react`).
- [ ] Backend migrations run cleanly with SQLite / PostgreSQL.
- [ ] Frontend builds without TypeScript or bundling errors (`npm run build`).

---

## 2. API Contract Verification
- [ ] `GET /api/v1/health/` returns `200 OK` with JSON `{ "status": "healthy", ... }`.
- [ ] `GET /api/v1/exercises/` lists `bodyweight_squat` and `shoulder_flexion`.
- [ ] `POST /api/v1/sessions/` creates a session with status `in_progress`.
- [ ] `POST /api/v1/sessions/{id}/measurements/` accepts valid `MovementResult` payload.
- [ ] Unreliable measurement (`measurement_reliable: false`) is saved and flagged, **without** false failure accusations.
- [ ] `POST /api/v1/sessions/{id}/symptoms/` records symptom with `patient_confirmed`.
- [ ] `POST /api/v1/safety/evaluate/` returns deterministic feedback and review flags for high pain ($\ge 7$) or red flags.
- [ ] `GET /api/v1/clinician/reviews/` displays pending flags.
- [ ] `POST /api/v1/clinician/reviews/{id}/resolve/` stores resolution audit record.
- [ ] `GET /api/v1/sessions/{id}/report/?format=csv` downloads valid CSV report.

---

## 3. Computer Vision (MediaPipe) Verification
- [ ] Webcam stream initializes upon user permission.
- [ ] MediaPipe Landmarker loads and overlays key skeletal points (knees, hips, shoulders, elbows).
- [ ] Squat knee angles compute accurately ($180^\circ$ upright down to inflection $\le 100^\circ$).
- [ ] Squat repetition counter increments reliably when full cycle is completed.
- [ ] Shoulder flexion angles compute accurately ($< 30^\circ$ resting up to peak $\ge 120^\circ$).
- [ ] Shoulder flexion repetition counter increments reliably.
- [ ] Low-visibility frames are flagged `measurement_reliable: false` and rep counter safely pauses.
- [ ] Automated math & state machine unit tests pass.

---

## 4. 3D Avatar & UI Verification
- [ ] 3D Avatar canvas renders in exercise view.
- [ ] Squat animation demonstrates squat mechanics when `bodyweight_squat` is selected.
- [ ] Arm raise animation demonstrates shoulder elevation when `shoulder_flexion` is selected.
- [ ] Pause / Resume / Replay controls function smoothly.
- [ ] Clear step-by-step instructions available in English and Malayalam.
- [ ] Demo mode toggle works seamlessly for offline judging.

---

## 5. Malayalam Voice & Safety Verification
- [ ] Audio recording button records voice when held or toggled.
- [ ] STT transcription adapter returns Malayalam text (e.g. `കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു`).
- [ ] Structured symptom extraction drafts pain score, difficulty, and body area.
- [ ] Patient confirmation dialog allows patient to verify or adjust values.
- [ ] High pain trigger ($\ge 7$) triggers conservative pause guidance and clinician flag.
- [ ] Audio feedback (TTS) plays or displays readable fallback text.

---

## 6. Clinician Dashboard Verification
- [ ] Clinician view lists flagged sessions with clear reasons.
- [ ] Clinician can review associated movement snapshots and patient symptoms.
- [ ] Clinician can submit resolution notes and mark flag resolved.
- [ ] Session progress summary chart shows repetition and pain trends.
