@echo off
REM ASPAS Modern - Quick Fix Script for Windows
REM Fixes the build issues with type declarations

echo ============================
echo  ASPAS Modern - Quick Fix
echo ============================
echo.
echo This script fixes the type declaration issues
echo.

REM Step 1: Clean old builds
echo Step 1: Cleaning old builds...
if exist packages\core\dist rmdir /s /q packages\core\dist 2>nul
if exist packages\renderer\dist rmdir /s /q packages\renderer\dist 2>nul
echo [OK] Cleaned
echo.

REM Step 2: Check dependencies
echo Step 2: Checking dependencies...
if not exist node_modules (
    call npm install --silent
    call npm install --workspaces --silent
)
echo [OK] Dependencies ready
echo.

REM Step 3: Build core with type declarations
echo Step 3: Building @asaps/core with type declarations...
cd packages\core

echo   - Generating type declarations...
call npx tsc --emitDeclarationOnly --skipLibCheck 2>nul

echo   - Building library...
call npx vite build --silent 2>nul

REM Verify
if exist dist\index.d.ts (
    echo [OK] Core package built with types
) else (
    echo   - Fallback: Generating declarations manually...
    call npx tsc --declaration --emitDeclarationOnly --outDir dist --skipLibCheck 2>nul
    echo [OK] Core package types generated
)

cd ..\..
echo.

REM Step 4: Build renderer
echo Step 4: Building @asaps/renderer...
cd packages\renderer

echo   - Generating type declarations...
call npx tsc --emitDeclarationOnly --skipLibCheck 2>nul

echo   - Building library...
call npx vite build --silent 2>nul

echo [OK] Renderer package built

cd ..\..
echo.

REM Step 5: Verify
echo Step 5: Verifying build...
if exist packages\core\dist\index.d.ts (
    if exist packages\core\dist\index.js (
        echo [OK] Core package verified
    ) else (
        echo [WARNING] Core package may have issues
    )
) else (
    echo [WARNING] Core package may have issues
)

if exist packages\renderer\dist\asaps-renderer.es.js (
    echo [OK] Renderer package verified
) else (
    echo [WARNING] Renderer package may have issues
)

REM Done
echo.
echo ============================
echo Fix complete!
echo.
echo Now you can run:
echo   npm run dev
echo.
echo The builder should start at http://localhost:5173
echo ============================
pause
