#!/bin/bash
set -e

echo "========================================================"
echo "Running RehabSense AI Test Suites (Backend + Frontend)"
echo "========================================================"

echo ""
echo "[1/2] Running Backend Django Unit Tests..."
source .venv/bin/activate 2>/dev/null || source venv/bin/activate 2>/dev/null || true
python backend/manage.py test tests

echo ""
echo "[2/2] Running Frontend & Computer Vision Unit Tests..."
cd frontend
npm test
cd ..

echo ""
echo "========================================================"
echo "SUCCESS: All RehabSense AI automated tests passed!"
echo "========================================================"
