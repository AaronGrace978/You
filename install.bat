@echo off
title You - Installing Dependencies
echo.
echo  ========================================
echo    You - Installing Dependencies
echo  ========================================
echo.

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo  Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo  [1/2] Installing frontend dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo  [2/2] Checking Rust toolchain...
where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [WARNING] Rust is not installed.
    echo  Install from https://rustup.rs for native builds.
    echo  You can still run the web frontend with dev.bat
) else (
    echo  Rust found: OK
)

echo.
echo  ========================================
echo    Installation complete!
echo  ========================================
echo.
echo  Run dev.bat to start developing.
echo  Run build.bat to create the installer.
echo.
pause
