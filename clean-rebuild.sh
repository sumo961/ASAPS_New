#!/bin/bash

# Clean Rebuild Script for ASPS Modern
# This script performs a complete clean and rebuild of all packages

echo "🧹 Cleaning all build artifacts..."

# Remove all dist directories
rm -rf packages/core/dist
rm -rf packages/renderer/dist
rm -rf packages/builder/dist

# Remove all node_modules in packages (but not root)
rm -rf packages/core/node_modules
rm -rf packages/renderer/node_modules
rm -rf packages/builder/node_modules

echo "✅ Clean complete"
echo ""
echo "📦 Reinstalling dependencies..."

# Reinstall from root (handles workspace links)
npm install

echo "✅ Dependencies installed"
echo ""
echo "🔨 Building packages in order..."

# Build core
echo "Building @asaps/core..."
cd packages/core
npm run build
cd ../..
echo "✅ Core built"
echo ""

# Build renderer
echo "Building @asaps/renderer..."
cd packages/renderer
npm run build
cd ../..
echo "✅ Renderer built"
echo ""

# Build builder
echo "Building @asaps/builder..."
cd packages/builder
npm run build
cd ../..
echo "✅ Builder built"
echo ""

echo "🎉 Complete! All packages built successfully."
echo ""
echo "Next steps:"
echo "1. Start the dev server: npm run dev"
echo "2. Test visual editor and preview"
