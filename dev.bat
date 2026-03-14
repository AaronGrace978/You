@echo off
title You - Development
echo.
echo  ========================================
echo    You - Development Server
echo  ========================================
echo.

where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [INFO] Rust not found. Starting web-only mode...
    echo  Open http://localhost:1420 in your browser.
    echo.
    call npm run dev
) else (
    echo  [INFO] Starting Tauri desktop app...
    echo.
    call npm run tauri dev
)
