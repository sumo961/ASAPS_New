@echo off
REM ASPAS Modern - Quick Setup Script for Windows
REM This script sets up and starts the ASPAS Modern development environment

echo ==========================================
echo  ASPAS Modern - Quick Setup (Windows)
echo ==========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js version: %NODE_VERSION%

REM Check npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed. Please install npm 7+ first.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [OK] npm version: %NPM_VERSION%

REM Install dependencies
echo.
echo Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo [OK] Dependencies installed successfully

REM Build core package
echo.
echo Building core package...
call npm run build:core

if %errorlevel% neq 0 (
    echo ERROR: Failed to build core package
    pause
    exit /b 1
)

echo [OK] Core package built successfully

REM Start development server
echo.
echo ==========================================
echo Starting development server...
echo The ASPAS Builder will open at http://localhost:5173
echo Press Ctrl+C to stop the server
echo ==========================================
echo.

call npm run dev
