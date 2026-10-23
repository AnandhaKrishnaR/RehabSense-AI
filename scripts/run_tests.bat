@echo off
echo ========================================================
echo Running RehabSense AI Test Suites (Backend + Frontend)
echo ========================================================

echo.
echo [1/2] Running Backend Django Unit Tests...
call .venv\Scripts\python.exe backend\manage.py test tests
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Backend tests failed.
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Running Frontend and Computer Vision Unit Tests...
cd frontend
call npm test
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend tests failed.
    exit /b %ERRORLEVEL%
)
cd ..

echo.
echo ========================================================
echo SUCCESS: All RehabSense AI automated tests passed!
echo ========================================================
