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
- **Malayalam Voice Interaction**: Independent voice providers: Sarvam Saaras v3 for speech-to-text and Google Gemini 3.8 Flash TTS for application-generated Malayalam guidance.
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

# 3. Configure environment variables (copy the example, then add your Gemini key below)
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
- **Independent STT and TTS**: Patient symptom voice reporting continues to use Sarvam Saaras v3 STT independently of whether Gemini or Sarvam TTS generates coaching audio.

### Supported TTS Providers
| Provider | Default Model | Verified Voices | Use Case |
|---|---|---|---|
| **Google Gemini TTS** | `gemini-3.8-flash-tts` | `Kore`, `Puck`, `Aoede`, `Fenrir` | High-fidelity expressive clinical speech |
| **Sarvam AI TTS** | `bulbul:v3` | `shubh` (Male), `ishita` (Female) | Regional Kerala Malayalam phonetic precision |
| **Mock / Offline** | Synthetic tone | `mock` | Automated testing & offline development |

### API Key Setup (.env)
Add your API keys to the root `.env` file (never expose keys to the frontend):

```env
# Text-to-Speech Provider Configuration
TTS_PROVIDER=gemini
MALAYALAM_TTS_PROVIDER=gemini

# Google Gemini TTS (Get key from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_TTS_MODEL=gemini-3.8-flash-tts
GEMINI_TTS_VOICE=Kore

# Sarvam AI (Get key from https://sarvam.ai/)
SARVAM_API_KEY=your_sarvam_api_key_here
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=shubh
```

### AI Voice Quality Evaluation Lab
Access the **Voice Lab** tab directly in the web app navigation or test via the API:
- **Side-by-Side Comparison**: Listen to Google Gemini and Sarvam Bulbul v3 speaking the exact same benchmark sentence side-by-side.
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
  "provider": "gemini",
  "voice": "Kore"
}
```

Response:
```json
{
  "audio_base64": "UklGRi...",
  "mime_type": "audio/wav",
  "provider": "gemini",
  "model": "gemini-3.8-flash-tts",
  "speaker": "Kore",
  "speech_language": "ml-IN",
  "original_text": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
  "text_sent": "കൈകൾ പതുക്കെ ഉയർത്തുക.",
  "compatible": true
}
```

## Gemini Malayalam TTS (Windows)

The backend defaults are `MALAYALAM_VOICE_PROVIDER=sarvam` for patient speech transcription and `MALAYALAM_TTS_PROVIDER=gemini` for spoken application messages. Sarvam STT is not replaced by this change.

1. Create a Gemini API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Add the key to the root `.env` file (never to a `VITE_*` variable or frontend file):

  ```env
  GEMINI_API_KEY=your_gemini_api_key
  GEMINI_TTS_MODEL=gemini-3.8-flash-tts
  GEMINI_TTS_VOICE=Kore
  MALAYALAM_TTS_PROVIDER=gemini
  ```

3. Install the backend SDK in the activated project environment:

  ```powershell
  .\.venv\Scripts\Activate.ps1
  pip install -r backend\requirements.txt
  ```

4. Start/restart Django after changing `.env`:

  ```powershell
  python backend\manage.py runserver
  ```

The existing endpoint is `POST http://localhost:8000/api/v1/voice/speak/`. In Postman, select **Body > raw > JSON**, set `Content-Type: application/json`, and send:

```json
{
  "text": "ദയവായി നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക.",
  "language_code": "ml-IN"
}
```

The response remains JSON with `audio_base64` and `mime_type: "audio/wav"`. To play the returned base64 in a browser console, paste the response object as `result`, then run:

```javascript
const bytes = Uint8Array.from(atob(result.audio_base64), (character) => character.charCodeAt(0));
const audioUrl = URL.createObjectURL(new Blob([bytes], { type: result.mime_type }));
const player = new Audio(audioUrl);
player.onended = () => URL.revokeObjectURL(audioUrl);
player.onerror = () => URL.revokeObjectURL(audioUrl);
await player.play();
```

The React client already plays the response at 1.0x and serializes queued messages. To switch models or voices, change `GEMINI_TTS_MODEL` or `GEMINI_TTS_VOICE` in `.env` and restart Django. The documented alternatives are `gemini-3.8-flash-lite-tts` and the prebuilt voice catalog; available account access must be verified with the configured key. Compare voices without touching the frontend using:

```powershell
python backend\manage.py test_gemini_voice --text "നിങ്ങളുടെ കൈ പതുക്കെ ഉയർത്തുക." --compare-voices Kore,Puck --compare-text --save
```

This live comparison makes multiple billable requests. Preview text without a key or API calls with:

```powershell
python backend\manage.py test_gemini_voice --preview-only
```

Run the separate, billable live smoke test only when the backend `.env` contains a valid key:

```powershell
$env:RUN_GEMINI_LIVE_TESTS = '1'
python backend\manage.py test tests.test_gemini_tts_live
Remove-Item Env:RUN_GEMINI_LIVE_TESTS
```

Troubleshooting: a missing key returns 503; invalid credentials or unavailable models return a sanitized provider error; quota/rate limits return 429; timeouts return 504. Confirm the key belongs to the intended AI Studio project, that billing/quota permits Gemini 3.8 TTS, and that the chosen model and voice are enabled for that account. Do not paste keys into frontend configuration or commit `.env`.

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
