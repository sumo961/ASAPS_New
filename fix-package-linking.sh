#!/bin/bash

# Fix package linking and ensure builder sees latest renderer types

set -e

PROJECT_ROOT="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"
cd "$PROJECT_ROOT"

echo "============================================"
echo "Fixing Package Linking Issue"
echo "============================================"
echo ""

echo "Step 1: Check if this is a workspace project..."
if [ -f "package.json" ]; then
    if grep -q '"workspaces"' package.json; then
        echo "✓ Found workspaces configuration"
        USING_WORKSPACES=1
    else
        echo "⚠ No workspaces found - will use manual linking"
        USING_WORKSPACES=0
    fi
else
    echo "⚠ No root package.json - will use manual linking"
    USING_WORKSPACES=0
fi
echo ""

echo "Step 2: Remove builder's node_modules to force fresh install..."
rm -rf packages/builder/node_modules
echo "✓ Removed packages/builder/node_modules"
echo ""

if [ $USING_WORKSPACES -eq 1 ]; then
    echo "Step 3: Reinstalling with workspaces..."
    npm install
    echo "✓ Workspace packages linked"
else
    echo "Step 3: Manual linking of local packages..."
    
    # Install dependencies in core
    cd packages/core
    npm install
    
    # Install dependencies in renderer and link to core
    cd ../renderer
    npm install
    
    # Install dependencies in builder and link to local packages
    cd ../builder
    
    # Create/update package.json to use file: protocol for local packages
    echo "Creating local package links..."
    
    # Update package.json to use local packages
    npm install --save ../../core ../../renderer
    
    cd "$PROJECT_ROOT"
    
    echo "✓ Manual package linking complete"
fi
echo ""

echo "Step 4: Verify package linking..."
echo "Checking builder's node_modules..."

if [ -d "packages/builder/node_modules/@asaps/core" ]; then
    echo "✓ @asaps/core is linked"
else
    echo "✗ @asaps/core is NOT linked"
fi

if [ -d "packages/builder/node_modules/@asaps/renderer" ]; then
    echo "✓ @asaps/renderer is linked"
    
    # Check if it's a symlink or a copy
    if [ -L "packages/builder/node_modules/@asaps/renderer" ]; then
        echo "  (symlinked)"
    else
        echo "  (copied)"
    fi
else
    echo "✗ @asaps/renderer is NOT linked"
fi
echo ""

echo "Step 5: Rebuild all packages to ensure fresh types..."
cd packages/core
npm run build
cd ../renderer  
npm run build
cd ../..
echo "✓ Packages rebuilt"
echo ""

echo "Step 6: Try building builder package..."
cd packages/builder
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "✅ SUCCESS! Build completed without errors"
    echo "============================================"
else
    echo ""
    echo "============================================"
    echo "❌ Build still failing"
    echo "============================================"
    echo ""
    echo "Additional debugging needed. Check:"
    echo "  1. Are there multiple versions of @asaps/core?"
    echo "     Run: npm ls @asaps/core"
    echo "  2. Are there multiple versions of TypeScript?"
    echo "     Run: npm ls typescript"
    echo "  3. Check renderer dist folder has correct types:"
    echo "     cat packages/renderer/dist/index.d.ts | grep 'class ReactRenderer'"
fi
