#!/bin/bash

# ASPAS Modern - Quick Setup Script
# This script sets up and starts the ASPAS Modern development environment

echo "🚀 ASPAS Modern - Quick Setup"
echo "=============================="

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check npm version
NPM_VERSION=$(npm -v 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ npm is not installed. Please install npm 7+ first."
    exit 1
fi

echo "✅ npm version: $NPM_VERSION"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Build core package first (required by other packages)
echo ""
echo "🔨 Building core package..."
npm run build:core

if [ $? -ne 0 ]; then
    echo "❌ Failed to build core package"
    exit 1
fi

echo "✅ Core package built successfully"

# Start the development server
echo ""
echo "🎯 Starting development server..."
echo "================================"
echo "The ASPAS Builder will open at http://localhost:5173"
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
