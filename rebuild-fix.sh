#!/bin/bash

# ASPS Rebuild Fix Script - Builds packages in correct order
# This ensures type definitions are updated before dependent packages are built

echo "================================================"
echo "  ASPS Rebuild with Connection Fixes"
echo "================================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${YELLOW}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# ============================================
# STEP 1: Clean old build artifacts
# ============================================
print_status "Cleaning old build artifacts..."

# Clean core dist
if [ -d "$SCRIPT_DIR/packages/core/dist" ]; then
    rm -rf "$SCRIPT_DIR/packages/core/dist"
    print_success "Cleaned core/dist"
fi

# Clean builder dist
if [ -d "$SCRIPT_DIR/packages/builder/dist" ]; then
    rm -rf "$SCRIPT_DIR/packages/builder/dist"
    print_success "Cleaned builder/dist"
fi

# Clean renderer dist
if [ -d "$SCRIPT_DIR/packages/renderer/dist" ]; then
    rm -rf "$SCRIPT_DIR/packages/renderer/dist"
    print_success "Cleaned renderer/dist"
fi

echo ""

# ============================================
# STEP 2: Temporarily fix Inspector to work with both old and new API
# ============================================
print_status "Applying temporary Inspector compatibility fix..."

# Create a temporary fix that works with both old and new Beat API
cat > "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx.fix" << 'EOF'
      // Clear ALL existing connections first
      // Compatible with both old and new Beat API
      if (typeof beat.clearConnections === 'function') {
        beat.clearConnections();
      } else {
        // Direct assignment for older API
        beat.connections = [];
      }
EOF

# Apply the fix by replacing the problematic line
if [ -f "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx" ]; then
    # Use a more robust replacement
    perl -i -pe 's/if \(beat\.clearConnections\).*\} else \{.*\}/
      \/\/ Clear ALL existing connections first (fixed for compatibility)
      if (typeof (beat as any).clearConnections === "function") {
        (beat as any).clearConnections();
      } else {
        \/\/ Direct assignment for older API
        beat.connections = [];
      }/gx' "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx"
    
    print_success "Applied Inspector compatibility fix"
fi

echo ""

# ============================================
# STEP 3: Build packages in correct order
# ============================================
print_status "Building packages in dependency order..."

cd "$SCRIPT_DIR"

# Build core first (this updates the type definitions)
print_status "Building @asaps/core..."
cd "$SCRIPT_DIR/packages/core"
npm run build
if [ $? -eq 0 ]; then
    print_success "Core package built successfully"
else
    print_error "Core package build failed"
    echo "Trying to continue anyway..."
fi

echo ""

# Build renderer
print_status "Building @asaps/renderer..."
cd "$SCRIPT_DIR/packages/renderer"
npm run build
if [ $? -eq 0 ]; then
    print_success "Renderer package built successfully"
else
    print_error "Renderer package build failed"
    echo "Trying to continue anyway..."
fi

echo ""

# Build builder last (depends on core and renderer)
print_status "Building @asaps/builder..."
cd "$SCRIPT_DIR/packages/builder"
npm run build
if [ $? -eq 0 ]; then
    print_success "Builder package built successfully"
else
    print_error "Builder package build failed"
    
    # If it still fails, we need a different approach
    echo ""
    print_status "Applying alternative fix..."
    
    # Create a more aggressive fix using type assertion
    cat > "$SCRIPT_DIR/fix-inspector-types.js" << 'EOF'
const fs = require('fs');
const path = require('path');

const inspectorPath = path.join(__dirname, 'packages/builder/src/components/Inspector.tsx');
let content = fs.readFileSync(inspectorPath, 'utf8');

// Replace the problematic line with type-safe version
content = content.replace(
  /if \(beat\.clearConnections\).*?\} else \{.*?\}/,
  `// Clear connections using type assertion for compatibility
      const beatWithMethods = beat as any;
      if (beatWithMethods.clearConnections) {
        beatWithMethods.clearConnections();
      } else {
        beat.connections = [];
      }`
);

fs.writeFileSync(inspectorPath, content);
console.log('Applied type-safe fix to Inspector.tsx');
EOF
    
    node "$SCRIPT_DIR/fix-inspector-types.js"
    
    # Try building again
    print_status "Retrying builder build..."
    npm run build
fi

echo ""

# ============================================
# STEP 4: Verify the fix
# ============================================
print_status "Verifying the build..."

cd "$SCRIPT_DIR"

# Check if dist directories exist
if [ -d "$SCRIPT_DIR/packages/core/dist" ] && 
   [ -d "$SCRIPT_DIR/packages/builder/dist" ] && 
   [ -d "$SCRIPT_DIR/packages/renderer/dist" ]; then
    print_success "All packages built successfully!"
    
    # Check if the new methods are in the type definitions
    if grep -q "clearConnections" "$SCRIPT_DIR/packages/core/dist/index.d.ts" 2>/dev/null; then
        print_success "New connection methods are in type definitions"
    else
        print_error "New methods not found in type definitions - manual intervention needed"
    fi
else
    print_error "Some packages failed to build"
fi

echo ""

# ============================================
# Summary
# ============================================
echo "================================================"
echo -e "${GREEN}  Rebuild Complete${NC}"
echo "================================================"
echo ""
echo "If the build succeeded:"
echo "  1. Start the dev server: npm run dev"
echo "  2. Test connection replacement in the Inspector"
echo ""
echo "If the build failed:"
echo "  1. Check that Beat.ts has the new methods"
echo "  2. Try building core first: cd packages/core && npm run build"
echo "  3. Then build builder: cd packages/builder && npm run build"
echo ""
echo "Alternative manual fix for Inspector.tsx:"
echo "  Replace the clearConnections line with:"
echo "  (beat as any).clearConnections ? (beat as any).clearConnections() : beat.connections = [];"
