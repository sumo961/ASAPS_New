#!/bin/bash
# Rebuild renderer package after fixing background styles

set -e

echo "=== Rebuilding renderer package ==="
cd packages/renderer
npm run build

echo ""
echo "=== Rebuilding builder package ==="
cd ../builder
npm run build

echo ""
echo "✅ Build complete!"
