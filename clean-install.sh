#!/bin/bash

# ASPAS Modern - Clean Install Script
# This script performs a clean installation of all dependencies

echo "🧹 ASPAS Modern - Clean Installation"
echo "====================================="

# Clean existing installations
echo "Cleaning previous installations..."
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf packages/*/dist
rm -f package-lock.json
rm -f packages/*/package-lock.json

echo "✅ Cleaned previous installations"

# Install root dependencies
echo ""
echo "📦 Installing root dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install root dependencies"
    exit 1
fi

# Install all workspace dependencies
echo ""
echo "📦 Installing workspace dependencies..."
npm install --workspaces

if [ $? -ne 0 ]; then
    echo "❌ Failed to install workspace dependencies"
    exit 1
fi

echo "✅ All dependencies installed successfully"

# Build packages in order
echo ""
echo "🔨 Building packages..."

# Build core first (dependency for others)
echo "Building @asaps/core..."
npm run build -w @asaps/core

if [ $? -ne 0 ]; then
    echo "❌ Failed to build core package"
    exit 1
fi

# Build renderer (depends on core)
echo "Building @asaps/renderer..."
npm run build -w @asaps/renderer

if [ $? -ne 0 ]; then
    echo "❌ Failed to build renderer package"
    exit 1
fi

echo "✅ All packages built successfully"

echo ""
echo "====================================="
echo "✨ Clean installation complete!"
echo "Run './start.sh' or 'npm run dev' to start the development server"
echo "====================================="
