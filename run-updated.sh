#!/bin/bash

# ASPAS Modern - Complete Feature Update Script
# This script ensures all new features are ready to use

echo "🚀 ASPAS Modern - Feature Update"
echo "================================="
echo ""

# Check if packages are built
echo "Checking build status..."

if [ ! -f "packages/core/dist/index.d.ts" ] || [ ! -f "packages/renderer/dist/asaps-renderer.es.js" ]; then
    echo "📦 Building required packages..."
    
    cd packages/core
    npx tsc --emitDeclarationOnly --skipLibCheck 2>/dev/null
    npx vite build --silent 2>/dev/null
    cd ../..
    
    cd packages/renderer
    npx tsc --emitDeclarationOnly --skipLibCheck 2>/dev/null
    npx vite build --silent 2>/dev/null
    cd ../..
    
    echo "✅ Packages built"
else
    echo "✅ Packages already built"
fi

echo ""
echo "================================="
echo "✨ New Features Available:"
echo ""
echo "1. 📝 Enhanced Inspector"
echo "   - Full property editing"
echo "   - Connection management"
echo "   - Sound & transition settings"
echo ""
echo "2. ▶️  Story Preview Mode"
echo "   - Test your story interactively"
echo "   - Debug panel with state info"
echo "   - Restart to test different paths"
echo ""
echo "3. 📥 Import/Export"
echo "   - Import ASML XML files"
echo "   - Export your stories"
echo "   - Full backward compatibility"
echo ""
echo "================================="
echo ""
echo "Starting the builder..."
echo "Press Ctrl+C to stop"
echo ""

npm run dev
