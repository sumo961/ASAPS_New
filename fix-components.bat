@echo off
REM ASPAS Modern - Component Fix Script for Windows
REM This script rebuilds after fixing missing components

echo ================================
echo  ASPAS Modern - Component Fix
echo ================================
echo.

REM Step 1: Rebuild core and renderer if needed
echo Step 1: Ensuring base packages are built...

cd packages\core
if not exist dist\index.d.ts (
    echo   Building @asaps/core...
    call npx tsc --emitDeclarationOnly --skipLibCheck 2>nul
    call npx vite build --silent 2>nul
)
cd ..\..

cd packages\renderer
if not exist dist\asaps-renderer.es.js (
    echo   Building @asaps/renderer...
    call npx tsc --emitDeclarationOnly --skipLibCheck 2>nul
    call npx vite build --silent 2>nul
)
cd ..\..

echo [OK] Base packages ready
echo.

REM Step 2: Start dev server
echo Step 2: Starting development server...
echo.
echo ================================
echo Components fixed!
echo.
echo Starting the builder at http://localhost:5173
echo Press Ctrl+C to stop
echo ================================
echo.

call npm run dev
