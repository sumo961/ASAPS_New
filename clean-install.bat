@echo off
REM ASPAS Modern - Clean Install Script for Windows
REM This script performs a clean installation of all dependencies

echo ==========================================
echo  ASPAS Modern - Clean Installation
echo ==========================================
echo.

REM Clean existing installations
echo Cleaning previous installations...
if exist node_modules rmdir /s /q node_modules
if exist packages\core\node_modules rmdir /s /q packages\core\node_modules
if exist packages\builder\node_modules rmdir /s /q packages\builder\node_modules
if exist packages\renderer\node_modules rmdir /s /q packages\renderer\node_modules
if exist packages\core\dist rmdir /s /q packages\core\dist
if exist packages\builder\dist rmdir /s /q packages\builder\dist
if exist packages\renderer\dist rmdir /s /q packages\renderer\dist
if exist package-lock.json del package-lock.json

echo [OK] Cleaned previous installations
echo.

REM Install root dependencies
echo Installing root dependencies...
call npm install

if %errorlevel% neq 0 (
    echo ERROR: Failed to install root dependencies
    pause
    exit /b 1
)

REM Install all workspace dependencies
echo.
echo Installing workspace dependencies...
call npm install --workspaces

if %errorlevel% neq 0 (
    echo ERROR: Failed to install workspace dependencies
    pause
    exit /b 1
)

echo [OK] All dependencies installed successfully
echo.

REM Build packages in order
echo Building packages...
echo.

REM Build core first
echo Building @asaps/core...
call npm run build -w @asaps/core

if %errorlevel% neq 0 (
    echo ERROR: Failed to build core package
    pause
    exit /b 1
)

REM Build renderer
echo Building @asaps/renderer...
call npm run build -w @asaps/renderer

if %errorlevel% neq 0 (
    echo ERROR: Failed to build renderer package
    pause
    exit /b 1
)

echo [OK] All packages built successfully
echo.

echo ==========================================
echo Clean installation complete!
echo Run 'start.bat' or 'npm run dev' to start the development server
echo ==========================================
pause
