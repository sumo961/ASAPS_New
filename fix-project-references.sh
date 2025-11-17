#!/bin/bash

# TypeScript Project References Fix
# This script rebuilds packages in dependency order with proper type checking

set -e

PROJECT_ROOT="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"
cd "$PROJECT_ROOT"

echo "=========================================="
echo "TypeScript Build Fix - Project References"
echo "=========================================="
echo ""

echo "Step 1: Clean all .tsbuildinfo files (type cache)"
find . -name "*.tsbuildinfo" -type f -delete
echo "✓ Build info files cleared"
echo ""

echo "Step 2: Clean dist directories"
rm -rf packages/core/dist
rm -rf packages/renderer/dist
rm -rf packages/builder/dist
echo "✓ Dist directories cleared"
echo ""

echo "Step 3: Build core package (base dependency)"
cd packages/core
echo "Building @asaps/core..."
npm run build
if [ $? -eq 0 ]; then
    echo "✓ Core package built successfully"
else
    echo "✗ Core package build failed"
    exit 1
fi
echo ""

echo "Step 4: Build renderer package (depends on core)"
cd ../renderer
echo "Building @asaps/renderer..."
npm run build
if [ $? -eq 0 ]; then
    echo "✓ Renderer package built successfully"
else
    echo "✗ Renderer package build failed"
    exit 1
fi
echo ""

echo "Step 5: Build builder package (depends on core + renderer)"
cd ../builder
echo "Building @asaps/builder..."
npm run build
if [ $? -eq 0 ]; then
    echo "✓ Builder package built successfully"
else
    echo "✗ Builder package build failed - checking for type errors..."
    echo ""
    echo "Running type-only check..."
    npx tsc --noEmit --pretty 2>&1 | head -20
    echo ""
    echo "Full errors logged above. This may be the ReactRenderer type issue."
    exit 1
fi
echo ""

cd "$PROJECT_ROOT"

echo "Step 6: Final type check across all packages"
npx tsc -b --force packages/core packages/renderer packages/builder

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ SUCCESS - All packages built and typed!"
    echo "=========================================="
    echo ""
    echo "The ReactRenderer type error should now be resolved."
else
    echo ""
    echo "=========================================="
    echo "⚠️  Type errors still present"
    echo "=========================================="
    echo ""
    echo "This indicates a deeper issue. Please check:"
    echo "  1. Are all package.json dependencies correct?"
    echo "  2. Run 'npm install' in the root directory"
    echo "  3. Check if node_modules are properly linked"
fi

echo ""
echo "Build complete!"
