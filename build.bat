@echo off
title You - Building Installer
echo.
echo  ========================================
echo    You - Building Installer
echo  ========================================
echo.

where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Rust is not installed.
    echo  Install from https://rustup.rs to build the desktop app.
    pause
    exit /b 1
)

echo  [1/3] Building frontend...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Frontend build failed.
    pause
    exit /b 1
)

echo.
echo  [2/3] Building Tauri app + installer...
echo  This may take a few minutes on first build.
echo.
call npm run tauri build
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Tauri build failed.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo    Build complete!
echo  ========================================
echo.
echo  Installer location:
echo    src-tauri\target\release\bundle\nsis\
echo    src-tauri\target\release\bundle\msi\
echo.
pause
