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
- **Malayalam Voice Interaction**: Provider-independent speech-to-text and text-to-speech adapter enabling patients to report symptoms in Malayalam (മലയാളം) or English.
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

# 3. Configure environment variables (optional, defaults to local SQLite + mock voice)
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

---

## 🧪 Automated Testing

### Run Backend Tests (Member 3)
```powershell
# Run the complete test suite (45 automated test cases)
.\.venv\Scripts\python backend\manage.py test tests -v 2 --settings=config.settings
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
