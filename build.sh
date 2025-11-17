#!/bin/bash

# ASPAS Modern - Build Script
# This script builds all packages in the correct order with proper type generation

echo "🔨 ASPAS Modern - Build System"
echo "==============================="

# Function to check if command succeeded
check_status() {
    if [ $? -ne 0 ]; then
        echo "❌ $1"
        exit 1
    fi
    echo "✅ $1"
}

# Clean previous builds
echo ""
echo "🧹 Cleaning previous builds..."
rm -rf packages/core/dist
rm -rf packages/renderer/dist
rm -rf packages/builder/dist
check_status "Cleaned build directories"

# Install dependencies if needed
echo ""
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    check_status "Installed root dependencies"
    
    npm install --workspaces
    check_status "Installed workspace dependencies"
else
    echo "✅ Dependencies already installed"
fi

# Build core package
echo ""
echo "🔨 Building @asaps/core..."
cd packages/core

# Generate type declarations first
echo "  Generating type declarations..."
npx tsc --emitDeclarationOnly
check_status "Generated core type declarations"

# Build the library
echo "  Building library..."
npx vite build
check_status "Built core library"

# Verify the output
if [ -f "dist/index.d.ts" ]; then
    echo "  ✅ Type declarations generated successfully"
else
    echo "  ⚠️  Warning: index.d.ts not found, generating manually..."
    npx tsc --declaration --emitDeclarationOnly --outDir dist
fi

cd ../..

# Build renderer package
echo ""
echo "🔨 Building @asaps/renderer..."
cd packages/renderer

# Generate type declarations
echo "  Generating type declarations..."
npx tsc --emitDeclarationOnly
check_status "Generated renderer type declarations"

# Build the library
echo "  Building library..."
npx vite build
check_status "Built renderer library"

cd ../..

# Summary
echo ""
echo "==============================="
echo "✨ Build complete!"
echo ""
echo "Package outputs:"
echo "  📦 @asaps/core     -> packages/core/dist/"
echo "  📦 @asaps/renderer -> packages/renderer/dist/"
echo ""
echo "To start the development server:"
echo "  npm run dev"
echo "==============================="
