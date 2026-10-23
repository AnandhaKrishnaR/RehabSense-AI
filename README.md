# RehabSense AI — Multimodal AI-Powered Physiotherapy Companion

RehabSense AI is an interactive, multimodal physical therapy rehabilitation assistant designed for home exercise guidance. It features real-time browser-based computer vision pose tracking, 3D animated exercise demonstration, repetition counting, Malayalam voice interaction, conservative symptom extraction, and deterministic clinical safety review tools.

> [!IMPORTANT]
> **Clinical & Safety Disclaimer**: RehabSense AI is an assistive exercise tracking companion and clinician review prototype. It does **not** diagnose medical conditions, independently alter prescribed treatments, or replace a qualified healthcare professional. All joint-angle thresholds and movement targets are demonstration parameters until clinically validated by a licensed physiotherapist.

---

## 🚀 Key Features

- **Webcam-Based Movement Analysis**: Browser-based pose estimation using MediaPipe Pose Landmarker for real-time joint-angle calculation and reliable repetition counting.
- **Initial Supported Exercises**:
  1. **Bodyweight Squat** (`bodyweight_squat`): Tracks knee and hip angles with a multi-phase state machine.
  2. **Shoulder Flexion / Arm Raise** (`shoulder_flexion`): Tracks shoulder elevation and arm mechanics.
- **3D Animated Physiotherapy Avatar**: Interactive Three.js/R3F visual guide demonstrating proper exercise kinematics with speed controls, pause, and mirror view.
- **Malayalam Voice Interaction**: Sarvam Saaras v3 for speech-to-text and Sarvam Bulbul v3 for application-generated Malayalam and Indian English guidance.
- **Conservative Symptom Extraction**: Natural language extraction of pain scores and difficulty with mandatory patient confirmation safeguards.
- **Deterministic Safety Engine**: Real-time evaluation of pain progression, red-flag symptoms, and camera reliability that automatically flags sessions for clinician review and provides cautious pause guidance.
- **Clinician Dashboard & Progress Tracking**: Review flagged sessions, analyze movement history, record resolution audit logs, and download progress reports.

---

## 🏛️ Architecture and Decoupled Team Ownership

Designed for three independent developer streams:

```
rehabsense-ai/
  docs/                   # Architecture, API contracts, safety rules, data model, voice, testing
  vision-contracts/       # Schemas and contracts for computer vision results
  frontend/               # React + TypeScript + Vite + Three.js + MediaPipe (Members 1 & 2)
  backend/                # Django 5 + Django REST Framework API (Member 3)
  assets/                 # 3D models and audio resources
  scripts/                # Quickstart and testing utilities
```

- **Member 1 (Frontend & Avatar Lead)**: `frontend/src/features/avatar/`, UI components, session dashboard.
- **Member 2 (Computer Vision Lead)**: `frontend/src/features/movement/`, `vision-contracts/`, MediaPipe pose engine.
- **Member 3 (Backend & Safety Lead — Complete & Tested)**: `backend/`, DRF APIs, Malayalam voice adapters, database models, safety engine.

---

## ⚡ Windows & VS Code Quick Start (PowerShell)

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.11.7)
- Node.js (v18+)

### 2. Backend Setup (Windows PowerShell)

```powershell
# 1. From workspace root, create and activate a Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install backend dependencies
pip install -r backend\requirements.txt

# 3. Configure environment variables (copy the example, then add your Sarvam key)
Copy-Item .env.example .env

# 4. Run database migrations
python backend\manage.py migrate

# 5. Seed canonical exercise definitions and demo clinical data
python backend\manage.py seed_demo_data

# 6. (Optional) Create superuser for Django Admin & Clinician testing
python backend\manage.py createsuperuser

# 7. Start the backend development server (port 8000)
python backend\manage.py runserver
```

Verify backend health at: **[http://localhost:8000/api/v1/health/](http://localhost:8000/api/v1/health/)**

### 3. Frontend Setup (Terminal 2)

```powershell
# Navigate to frontend
cd frontend

# Install npm dependencies
npm install

# Start Vite dev server
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

## 🎙️ Bilingual Voice System (Malayalam & English)

RehabSense AI provides a complete bilingual voice system designed for physiotherapy coaching in:
1. **Malayalam (`ml-IN`)** — Natural Kerala pronunciation with medical term cadence.
2. **Indian English (`en-IN`)** — Clear Indian English pronunciation for clinical guidance.

### Strict Non-Translation Clinical Invariant
- **Original displayed clinical text NEVER changes**: Selecting a voice preference or language never translates, transliterates, rewrites, or paraphrases clinical instructions.
- **Language Compatibility Warnings**: If an English voice is selected for Malayalam text (or vice versa), an explicit warning is displayed rather than silently mutating the text.
- **Independent STT and TTS**: Patient symptom voice reporting uses Sarvam Saaras v3 STT, while application guidance uses Sarvam Bulbul v3 TTS.

### Supported TTS Providers
| Provider | Default Model | Verified Voices | Use Case |
|---|---|---|---|
| **Sarvam AI TTS** | `bulbul:v3` | `shubh` (Male), `ishita` (Female) | Malayalam and Indian English clinical speech |

### API Key Setup (.env)
Add your API keys to the root `.env` file (never expose keys to the frontend):

```env
# Sarvam AI STT and TTS (Get key from https://sarvam.ai/)
TTS_PROVIDER=sarvam
SARVAM_API_KEY=your_sarvam_api_key_here
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=shubh
```

### AI Voice Quality Evaluation Lab
Access the **Voice Lab** tab directly in the web app navigation or test via the API:
- **Sarvam Voice Evaluation**: Listen to and rate the configured Sarvam Bulbul v3 voice against standard benchmark sentences.
- **8 Standard Benchmark Sentences**: Preloaded for both Malayalam and English (covering joint movement, pain stopping, reps, and breathing).
- **Clinical Rubric (1–5 scale)**:
  - *Pronunciation*: Phonetic accuracy of consonants and vowels.
  - *Naturalness*: Cadence, inflection, and absence of robotic artifacts.
  - *Clarity*: Intelligibility and absence of clipping.
  - *Medical Terminology*: Anatomical and repetition number precision.
  - *Overall Quality*: Clinic and home rehabilitation readiness.
- Record notes and submit evaluations directly to the backend audit log (`/api/v1/voice/evaluation/`).

### Voice Synthesis API Contract
`POST /api/v1/voice/speak/`

```json
{
  "text": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
  "speech_language": "ml-IN",
  "text_language": "auto",
  "provider": "sarvam",
  "voice": "shubh"
}
```

Response:
```json
{
  "audio_base64": "UklGRi...",
  "mime_type": "audio/wav",
  "provider": "sarvam",
  "model": "bulbul:v3",
  "speaker": "shubh",
  "speech_language": "ml-IN",
  "original_text": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
  "text_sent": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
  "compatible": true
}
```

## Sarvam Malayalam TTS (Windows)

Sarvam Saaras v3 handles incoming patient speech, and Sarvam Bulbul v3 synthesizes application voice guidance. Configure the Sarvam key in the root `.env` file; do not put it in a `VITE_*` variable or frontend file:

```env
SARVAM_API_KEY=your_sarvam_api_key
MALAYALAM_VOICE_PROVIDER=sarvam
TTS_PROVIDER=sarvam
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=shubh
```

Install backend dependencies and start/restart Django after changing `.env`:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\manage.py runserver
```

The speech endpoint is `POST http://localhost:8000/api/v1/voice/speak/`. Send JSON with `Content-Type: application/json`:

```json
{
  "text": "ദയവായി നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.",
  "language_code": "ml-IN"
}
```

The response is JSON with `audio_base64` and `mime_type: "audio/wav"`; the app plays it directly. Only Sarvam is accepted for TTS.

The React client plays the response at 1.0x and serializes queued messages. Voice options are available from `GET /api/v1/voice/options/?provider=sarvam&speech_language=ml-IN`.

To run backend tests without contacting paid services, use:

```powershell
python backend\manage.py test tests.test_voice
```

---

## 🧪 Automated Testing

### Run Backend Tests (Member 3)
```powershell
# Run the complete backend test suite; all provider calls are mocked in tests
.\.venv\Scripts\python backend\manage.py test backend/tests -v 2
```

### Run Frontend & Vision Tests (Members 1 & 2)
```powershell
cd frontend
npm test
```

---

## 📄 Complete Documentation

- [Backend Architecture Specification](docs/backend-architecture.md)
- [Team Integration Guide & Contracts](docs/team-integration.md)
- [Malayalam Voice & Symptom Extraction](docs/malayalam-voice.md)
- [Deterministic Safety Rules Catalog](docs/safety-rules.md)
- [Data Model & Database Schema](docs/data-model.md)
- [Backend Testing Strategy & Quality Gates](docs/testing.md)
- [API Integration Contracts](docs/api-contracts.md)
- [Vision Result Schema](vision-contracts/schemas/movement-result.schema.json)
- [Collaboration & Git Workflow](docs/collaboration.md)
- [Setup Guide](docs/setup-guide.md)
- [Integration Verification Checklist](docs/integration-checklist.md)
