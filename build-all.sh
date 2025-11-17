#!/bin/bash

# Correct Build Script - Builds from inside each package directory
# This avoids TypeScript project reference issues

set -e  # Exit on any error

echo "🧹 Cleaning build artifacts..."
rm -rf packages/*/dist
echo "✅ Clean complete"
echo ""

echo "🔨 Building packages..."
echo ""

# Build Core
echo "📦 Building @asaps/core..."
cd packages/core
npm run build
cd ../..
echo "✅ Core built successfully"
echo ""

# Build Renderer
echo "📦 Building @asaps/renderer..."
cd packages/renderer
npm run build
cd ../..
echo "✅ Renderer built successfully"
echo ""

# Build Builder
echo "📦 Building @asaps/builder..."
cd packages/builder
npm run build
cd ../..
echo "✅ Builder built successfully"
echo ""

echo "🎉 All packages built successfully!"
echo ""
echo "Next steps:"
echo "  npm run dev    # Start development server"
