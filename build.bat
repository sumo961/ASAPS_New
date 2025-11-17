@echo off
REM ASPAS Modern - Build Script for Windows
REM This script builds all packages in the correct order with proper type generation

echo ==========================================
echo  ASPAS Modern - Build System
echo ==========================================
echo.

REM Clean previous builds
echo Cleaning previous builds...
if exist packages\core\dist rmdir /s /q packages\core\dist
if exist packages\renderer\dist rmdir /s /q packages\renderer\dist
if exist packages\builder\dist rmdir /s /q packages\builder\dist
echo [OK] Cleaned build directories
echo.

REM Check dependencies
echo Checking dependencies...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install root dependencies
        pause
        exit /b 1
    )
    
    call npm install --workspaces
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install workspace dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)
echo.

REM Build core package
echo Building @asaps/core...
cd packages\core

echo   Generating type declarations...
call npx tsc --emitDeclarationOnly
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate core type declarations
    pause
    exit /b 1
)
echo   [OK] Generated type declarations

echo   Building library...
call npx vite build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build core library
    pause
    exit /b 1
)
echo   [OK] Built library

REM Verify type declarations
if exist dist\index.d.ts (
    echo   [OK] Type declarations verified
) else (
    echo   Warning: index.d.ts not found, generating manually...
    call npx tsc --declaration --emitDeclarationOnly --outDir dist
)

cd ..\..
echo [OK] Core package built successfully
echo.

REM Build renderer package
echo Building @asaps/renderer...
cd packages\renderer

echo   Generating type declarations...
call npx tsc --emitDeclarationOnly
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate renderer type declarations
    pause
    exit /b 1
)
echo   [OK] Generated type declarations

echo   Building library...
call npx vite build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build renderer library
    pause
    exit /b 1
)
echo   [OK] Built library

cd ..\..
echo [OK] Renderer package built successfully
echo.

REM Summary
echo ==========================================
echo Build complete!
echo.
echo Package outputs:
echo   @asaps/core     - packages\core\dist\
echo   @asaps/renderer - packages\renderer\dist\
echo.
echo To start the development server:
echo   npm run dev
echo ==========================================
pause
