@echo off
title Synapse AI - Startup
color 0B
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║            SYNAPSE — Neural AI Interface                ║
echo  ║              Production Launcher (Windows)              ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: ─── Check Node.js ────────────────────────────────────────────
echo [1/4] Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo  ❌  Node.js is NOT installed.
    echo      Please install it from: https://nodejs.org/
    echo      Or run: winget install OpenJS.NodeJS
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo      ✅  Node.js %NODE_VER% found.

:: ─── Install Dependencies ─────────────────────────────────────
echo.
echo [2/4] Installing dependencies...
if not exist "node_modules" (
    call npm install --silent
    echo      ✅  Dependencies installed.
) else (
    echo      ✅  Dependencies already installed.
)

:: ─── Check Ollama ─────────────────────────────────────────────
echo.
echo [3/4] Checking Ollama...
curl -s http://localhost:11434/api/tags >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo      ⚠️   Ollama is not running on localhost:11434.
    echo      Starting Ollama in the background...
    start /min "Ollama" ollama serve
    timeout /t 3 /nobreak >nul
    curl -s http://localhost:11434/api/tags >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo      ⚠️   Could not start Ollama automatically.
        echo      Please start it manually: ollama serve
        echo      The UI will still launch, but AI features won't work.
    ) else (
        echo      ✅  Ollama started successfully.
    )
) else (
    echo      ✅  Ollama is running.
)

:: ─── Launch ───────────────────────────────────────────────────
echo.
echo [4/4] Launching Synapse...
echo.
echo  ┌──────────────────────────────────────────────────────┐
echo  │  Local:   http://localhost:8080                      │
echo  │  Tunnel:  Check the TUNNEL log below for public URL │
echo  │                                                      │
echo  │  Press Ctrl+C to stop all services.                 │
echo  └──────────────────────────────────────────────────────┘
echo.

:: Run server + tunnel together
call npm run tunnel

pause
