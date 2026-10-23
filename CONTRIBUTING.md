# Contributing to RehabSense AI

Thank you for contributing to RehabSense AI! This document outlines coding standards, branching, and pull request procedures for team members.

---

## Code of Conduct & Medical Disclaimer

RehabSense AI is a prototype exercise companion and clinician review tool.
- **Never claim medical certification or clinical diagnosis** in documentation, commit messages, or UI copy.
- Always identify biomechanical thresholds as demonstration parameters until clinically validated.

---

## Development Workflow

1. Always branch off up-to-date `main`.
2. Keep branches short-lived and aligned to your domain:
   - `feature/frontend-avatar` (Member 1)
   - `feature/vision-analysis` (Member 2)
   - `feature/backend-voice-safety` (Member 3)
3. Ensure automated tests pass before creating a pull request:
   - Backend: `python manage.py test`
   - Frontend: `npm run build && npm test`
4. Update `docs/api-contracts.md` or `vision-contracts/` if modifying shared schemas.
5. Never commit secrets, credentials, or `.env` files.
