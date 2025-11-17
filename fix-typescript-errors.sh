#!/bin/bash

# Comprehensive TypeScript Error Fix Script
# This script clears caches and rebuilds all packages to fix type synchronization issues

set -e  # Exit on error

echo "======================================"
echo "TypeScript Error Fix - Clean Rebuild"
echo "======================================"
echo ""

PROJECT_ROOT="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"
cd "$PROJECT_ROOT"

echo "Step 1: Cleaning TypeScript build info..."
find packages -name "*.tsbuildinfo" -delete
echo "✓ TypeScript build info cleared"
echo ""

echo "Step 2: Cleaning dist directories..."
rm -rf packages/core/dist
rm -rf packages/renderer/dist
rm -rf packages/builder/dist
echo "✓ Dist directories cleared"
echo ""

echo "Step 3: Cleaning node_modules cache..."
rm -rf node_modules/.cache
rm -rf packages/*/node_modules/.cache
echo "✓ Cache cleared"
echo ""

echo "Step 4: Rebuilding core package..."
cd packages/core
npm run build
echo "✓ Core package built"
echo ""

echo "Step 5: Rebuilding renderer package..."
cd ../renderer
npm run build
echo "✓ Renderer package built"
echo ""

echo "Step 6: Rebuilding builder package..."
cd ../builder
npm run build
echo "✓ Builder package built"
echo ""

cd "$PROJECT_ROOT"

echo "Step 7: Running TypeScript type check..."
npx tsc --noEmit 2>&1 | tee typescript-check-results.txt
EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "======================================"
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ SUCCESS: All TypeScript errors resolved!"
    echo "======================================"
    echo ""
    echo "Results saved to: typescript-check-results.txt"
else
    echo "⚠️  WARNING: TypeScript check found errors"
    echo "======================================"
    echo ""
    echo "Full error details saved to: typescript-check-results.txt"
    echo ""
    echo "If errors persist, please review the error log and check:"
    echo "  1. Package version compatibility"
    echo "  2. tsconfig.json settings"
    echo "  3. Import paths and module resolution"
fi

echo ""
echo "Build process complete!"
