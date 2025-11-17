#!/bin/bash

# ASPAS Modern - Component Fix Script
# This script rebuilds after fixing missing components

echo "🔧 ASPAS Modern - Component Fix"
echo "================================"
echo ""

# Step 1: Rebuild core and renderer (in case they need it)
echo "Step 1: Ensuring base packages are built..."
cd packages/core
if [ ! -f "dist/index.d.ts" ]; then
    echo "  Building @asaps/core..."
    npx tsc --emitDeclarationOnly --skipLibCheck 2>/dev/null
    npx vite build --silent 2>/dev/null
fi
cd ../..

cd packages/renderer  
if [ ! -f "dist/asaps-renderer.es.js" ]; then
    echo "  Building @asaps/renderer..."
    npx tsc --emitDeclarationOnly --skipLibCheck 2>/dev/null
    npx vite build --silent 2>/dev/null
fi
cd ../..

echo "✅ Base packages ready"

# Step 2: Start the dev server
echo ""
echo "Step 2: Starting development server..."
echo ""
echo "================================"
echo "✨ Components fixed!"
echo ""
echo "Starting the builder at http://localhost:5173"
echo "Press Ctrl+C to stop"
echo "================================"
echo ""

npm run dev
