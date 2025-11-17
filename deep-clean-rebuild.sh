#!/bin/bash

echo "🧹 Deep clean and rebuild..."

# Clean renderer
cd packages/renderer
rm -rf dist node_modules/.vite tsconfig.tsbuildinfo
echo "Building renderer..."
npm run build
cd ../..

# Clean builder
cd packages/builder  
rm -rf dist node_modules/.vite node_modules/@asaps tsconfig.tsbuildinfo
echo "Reinstalling builder dependencies..."
npm install
echo "Building builder..."
npm run build
cd ../..

echo "Done!"
