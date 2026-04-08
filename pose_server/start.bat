@echo off
REM ─── BailarCon Pose Server Launcher (Windows) ───────────────────────────────
REM Runs pose_server.py inside the ar_game conda environment.
REM If conda is not available, falls back to the system Python.

echo [BailarCon] Starting pose server...
echo [BailarCon] Press Q in the preview window to quit.
echo.

REM Try conda ar_game environment first
where conda >nul 2>&1
if %errorlevel% == 0 (
    echo [BailarCon] Using conda environment: ar_game
    conda run -n ar_game python "%~dp0pose_server.py" %*
) else (
    echo [BailarCon] conda not found, using system Python
    python "%~dp0pose_server.py" %*
)

pause
