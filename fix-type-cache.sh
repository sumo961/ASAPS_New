#!/bin/bash
# Fix TypeScript type caching issue
# This clears caches and rebuilds packages in the correct order

echo "🧹 Cleaning TypeScript caches..."

# Clean TypeScript build info and caches
find . -name "*.tsbuildinfo" -delete
find . -name ".tsbuildinfo" -delete

# Clean node_modules cache (optional but thorough)
echo "🧹 Cleaning node_modules cache..."
rm -rf packages/*/node_modules/.cache

# Clean dist folders
echo "🧹 Cleaning dist folders..."
rm -rf packages/core/dist
rm -rf packages/renderer/dist  
rm -rf packages/builder/dist

echo "🔨 Rebuilding packages in order..."

# Rebuild core first (types need to be fresh)
echo "📦 Building @asaps/core..."
npm run build -w @asaps/core

# Rebuild renderer (depends on core)
echo "📦 Building @asaps/renderer..."
npm run build -w @asaps/renderer

# Rebuild builder (depends on core and renderer)
echo "📦 Building @asaps/builder..."
npm run build -w @asaps/builder

echo "✅ Type cache cleared and packages rebuilt!"
echo ""
echo "Now run: npm run dev"
