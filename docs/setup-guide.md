# RehabSense AI — Setup and Developer Guide

This guide walks every team member through setting up the frontend, backend, computer vision module, and running tests locally.

---

## 1. Prerequisites

- **Node.js**: v18+ (tested on Node v20 / v24)
- **Python**: 3.10+ (tested on Python 3.13)
- **Package Managers**: `npm` and `pip`
- Modern browser with WebGL & Camera access (Chrome, Edge, Firefox, Brave)

---

## 2. Backend Setup (Member 3 & Full Stack)

```bash
# 1. Navigate to backend directory or use root virtualenv
cd backend

# 2. Activate Python virtual environment
# Windows (PowerShell):
..\.venv\Scripts\Activate.ps1
# Linux/macOS:
source ../.venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy environment configuration
cp ../.env.example .env

# 5. Apply database migrations
python manage.py migrate

# 6. Seed demo exercises and therapy plan data
python manage.py seed_demo_data

# 7. Run backend server (default port 8000)
python manage.py runserver
```

Verify backend health at: [http://localhost:8000/api/v1/health/](http://localhost:8000/api/v1/health/)

---

## 3. Frontend Setup (Member 1 & Member 2)

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 4. Running Automated Tests

### Backend Tests
```bash
cd backend
python manage.py test
```

### Frontend & Vision Unit Tests
```bash
cd frontend
npm test
# Or test build
npm run build
```

---

## 5. Offline Demo Mode

If the backend server is not running or external speech services are unavailable:
- Set `VITE_DEMO_MODE=true` in `frontend/.env`.
- The frontend will automatically use mock API adapters and local synthetic data, ensuring that the 3D avatar, MediaPipe webcam tracking, and rep counters function 100% offline.
