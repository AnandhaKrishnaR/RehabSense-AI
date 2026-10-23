# RehabSense AI — Collaboration and Git Workflow Guide

This document defines how the three team members collaborate independently and merge their work without merge conflicts or breaking changes.

---

## 1. Team Ownership & Responsibilities

| Member | Domain | Dedicated Working Directories | Primary Reviewer For |
|---|---|---|---|
| **Member 1** | Frontend & 3D Avatar | `frontend/src/features/avatar/`<br>`frontend/src/components/`<br>`frontend/src/features/sessions/`<br>`frontend/src/features/progress/` | UI/UX, Three.js 3D Avatar, Session controls, Layout |
| **Member 2** | Computer Vision | `frontend/src/features/movement/`<br>`vision-contracts/`<br>`frontend/src/tests/movement/` | MediaPipe tracking, Angle calculations, Repetition counters |
| **Member 3** | Backend, Voice, Safety | `backend/`<br>`docs/api-contracts.md`<br>`docs/safety-rules.md` | Django models, REST APIs, Malayalam Voice, Safety engine |

### Shared Files Requiring Team Consensus
- `frontend/src/types/api.ts` & `vision.ts`: Must strictly match `vision-contracts/schemas/` and `docs/api-contracts.md`.
- `frontend/src/services/apiClient.ts`: Shared API client wrapper.
- `.env.example`: Must be updated if new environment variables are introduced.

---

## 2. Git Branching Strategy

1. **Main Branch (`main`)**: Always deployable, stable integration branch.
2. **Feature Branches**:
   - `feature/frontend-avatar`: Member 1
   - `feature/vision-analysis`: Member 2
   - `feature/backend-voice-safety`: Member 3
3. **Commit Message Format**:
   - `feat(frontend): add 3d avatar exercise animation`
   - `feat(vision): implement squat repetition state machine`
   - `feat(backend): add deterministic safety evaluation endpoint`
   - `test(vision): add unit tests for shoulder flexion angles`
   - `docs: update api contracts`

---

## 3. Merge Protocol & Integration Order

To avoid integration friction during the hackathon, follow this merge order:

1. **Step 1: Scaffold & Contracts (Merged to `main`)**
   - Directory structures, types, contract schemas, `.env.example`, documentation.
2. **Step 2: Member 3 Backend APIs (`feature/backend-voice-safety` -> `main`)**
   - Health endpoint, Exercise catalog, Sessions API, Measurement & Symptom endpoints.
3. **Step 3: Member 2 Computer Vision Engine (`feature/vision-analysis` -> `main`)**
   - MediaPipe integration, angle math, rep counter tests, verified against schema.
4. **Step 4: Member 1 UI & Avatar Integration (`feature/frontend-avatar` -> `main`)**
   - Avatar renderer, webcam overlay, connection to API client and movement engine.
5. **Step 5: End-to-End Testing & Polish**
   - Integration checks across all 3 modules on `main`.

---

## 4. Ground Rules

- **No Secrets in Git**: Never commit `.env`, private keys, or passwords.
- **Demo Mode Independence**: Frontend must run in mock/demo mode when backend is offline, and switch seamlessly when backend is active.
- **Run Tests Before Push**:
  - Backend: `python manage.py test`
  - Frontend / Vision: `npm test` or `npm run build`
