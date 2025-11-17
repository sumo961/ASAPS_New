#!/bin/bash

echo "=========================================="
echo "Complete TypeScript Rebuild"
echo "=========================================="

# Clean all build artifacts
echo ""
echo "Step 1: Cleaning all build artifacts..."
rm -rf packages/core/dist
rm -rf packages/renderer/dist
rm -rf packages/builder/dist

# Rebuild core package first (since renderer depends on it)
echo ""
echo "Step 2: Building core package..."
cd packages/core
npm run build
cd ../..

# Rebuild renderer package
echo ""
echo "Step 3: Building renderer package..."
cd packages/renderer
npm run build
cd ../..

# Check for TypeScript errors
echo ""
echo "Step 4: Checking for TypeScript errors..."
cd packages/renderer
npx tsc --noEmit 2>&1 | tee ../../ts-check-results.txt
cd ../..

echo ""
echo "=========================================="
echo "Build complete! Check ts-check-results.txt for any errors."
echo "=========================================="
