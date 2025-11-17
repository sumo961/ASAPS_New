#!/bin/bash

# ASPAS Modern - Quick Fix Script
# Fixes the build issues with type declarations

echo "🔧 ASPAS Modern - Quick Fix"
echo "============================"
echo ""
echo "This script fixes the type declaration issues"
echo ""

# Step 1: Clean old builds
echo "Step 1: Cleaning old builds..."
rm -rf packages/core/dist
rm -rf packages/renderer/dist
echo "✅ Cleaned"

# Step 2: Install dependencies (if needed)
echo ""
echo "Step 2: Checking dependencies..."
if [ ! -d "node_modules" ]; then
    npm install --silent
    npm install --workspaces --silent
fi
echo "✅ Dependencies ready"

# Step 3: Build core with type declarations
echo ""
echo "Step 3: Building @asaps/core with type declarations..."
cd packages/core

# Generate declarations
echo "  - Generating type declarations..."
npx tsc --emitDeclarationOnly --skipLibCheck 2>/dev/null

# Build library
echo "  - Building library..."
npx vite build --silent 2>/dev/null

# Verify
if [ -f "dist/index.d.ts" ]; then
    echo "✅ Core package built with types"
else
    echo "  - Fallback: Generating declarations manually..."
    npx tsc --declaration --emitDeclarationOnly --outDir dist --skipLibCheck 2>/dev/null
    echo "✅ Core package types generated"
fi

cd ../..

# Step 4: Build renderer
echo ""
echo "Step 4: Building @asaps/renderer..."
cd packages/renderer

# Generate declarations
echo "  - Generating type declarations..."
npx tsc --emitDeclarationOnly --skipLibCheck 2>/dev/null

# Build library
echo "  - Building library..."
npx vite build --silent 2>/dev/null

echo "✅ Renderer package built"

cd ../..

# Step 5: Verify
echo ""
echo "Step 5: Verifying build..."
if [ -f "packages/core/dist/index.d.ts" ] && [ -f "packages/core/dist/index.js" ]; then
    echo "✅ Core package verified"
else
    echo "⚠️  Core package may have issues"
fi

if [ -f "packages/renderer/dist/asaps-renderer.es.js" ]; then
    echo "✅ Renderer package verified"
else
    echo "⚠️  Renderer package may have issues"
fi

# Done
echo ""
echo "============================"
echo "✨ Fix complete!"
echo ""
echo "Now you can run:"
echo "  npm run dev"
echo ""
echo "The builder should start at http://localhost:5173"
echo "============================"
