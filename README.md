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
- **Malayalam Voice Interaction**: Provider-independent speech-to-text and text-to-speech adapter enabling patients to report symptoms in Malayalam (or English).
- **Conservative Symptom Extraction**: Natural language extraction of pain scores and difficulty with mandatory patient confirmation.
- **Deterministic Safety Engine**: Real-time evaluation of pain progression, red-flag symptoms, and camera reliability that automatically flags sessions for clinician review and provides cautious pause guidance.
- **Clinician Dashboard & Progress Tracking**: Review flagged sessions, analyze movement history, record resolution audit logs, and download progress reports.

---

## 🏛️ Architecture and Decoupled Team Ownership

Designed for three independent developer streams:

```
rehabsense-ai/
  docs/                   # Architecture, API contracts, safety rules, data model
  vision-contracts/       # Schemas and contracts for computer vision results
  frontend/               # React + TypeScript + Vite + Three.js + MediaPipe (Members 1 & 2)
  backend/                # Django 5 + Django REST Framework API (Member 3)
  assets/                 # 3D models and audio resources
  scripts/                # Quickstart and testing utilities
```

- **Member 1 (Frontend & Avatar)**: `frontend/src/features/avatar/`, UI components, session dashboard.
- **Member 2 (Computer Vision)**: `frontend/src/features/movement/`, `vision-contracts/`, MediaPipe pose engine.
- **Member 3 (Backend & Safety)**: `backend/`, DRF APIs, Malayalam voice adapters, database models, safety engine.

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js (v18+)
- Python (3.10+)

### 2. Backend Setup
```bash
# Activate virtual environment
.venv\Scripts\activate   # Windows
# or: source .venv/bin/activate  # Linux/macOS

# Navigate to backend
cd backend

# Install dependencies
pip install -r requirements.txt

# Run migrations and seed demo data
python manage.py migrate
python manage.py seed_demo_data

# Start backend server (port 8000)
python manage.py runserver
```

### 3. Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🧪 Testing

```bash
# Run backend tests
cd backend && python manage.py test

# Run frontend tests
cd frontend && npm test
```

---

## 📄 Documentation

- [Architecture Design](docs/architecture.md)
- [API Contracts](docs/api-contracts.md)
- [Vision Result Schema](vision-contracts/schemas/movement-result.schema.json)
- [Data Model & Database Schema](docs/data-model.md)
- [Deterministic Safety Rules](docs/safety-rules.md)
- [Collaboration & Git Workflow](docs/collaboration.md)
- [Setup Guide](docs/setup-guide.md)
- [Integration Verification Checklist](docs/integration-checklist.md)
