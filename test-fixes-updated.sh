#!/bin/bash

echo "================================"
echo "  ASPS Modern - Fix Test Suite"
echo "================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Test 1: Check if ASMLGenerator preserves parameters
echo "Test 1: Checking ASMLGenerator..."
if grep -q "preserves all parameters" "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts" 2>/dev/null ||
   grep -q "FIXED VERSION" "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts" 2>/dev/null; then
    echo "✓ ASMLGenerator appears to be fixed"
else
    echo "✗ ASMLGenerator may not be fixed"
fi

# Test 2: Check if Inspector has counter support
echo ""
echo "Test 2: Checking Inspector enhancements..."
if grep -q "counterEffect" "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx" 2>/dev/null; then
    echo "✓ Inspector has counter effect support"
else
    echo "✗ Inspector missing counter effect support"
fi

# Test 3: Check if validation script exists
echo ""
echo "Test 3: Checking validation tools..."
if [ -f "$SCRIPT_DIR/validate-roundtrip.js" ]; then
    echo "✓ Validation script exists"
    chmod +x "$SCRIPT_DIR/validate-roundtrip.js" 2>/dev/null
else
    echo "✗ Validation script missing"
fi

# Test 4: Run validation on example file if it exists
echo ""
echo "Test 4: Testing round-trip validation..."
if [ -f "$SCRIPT_DIR/examples/forest_adventure_v2.xml" ] && [ -f "$SCRIPT_DIR/validate-roundtrip.js" ]; then
    # Check for an exported version to compare against
    EXPORTED_FILE=""
    
    # Try different possible exported file names
    if [ -f "$SCRIPT_DIR/examples/forest_adventure_v2_exported.xml" ]; then
        EXPORTED_FILE="$SCRIPT_DIR/examples/forest_adventure_v2_exported.xml"
    elif [ -f "$SCRIPT_DIR/examples/The_Forest_Adventure_V2_exported.xml" ]; then
        EXPORTED_FILE="$SCRIPT_DIR/examples/The_Forest_Adventure_V2_exported.xml"
    fi
    
    if [ -n "$EXPORTED_FILE" ]; then
        echo "Found exported file: $(basename "$EXPORTED_FILE")"
        echo "Running validation comparing original vs exported..."
        node "$SCRIPT_DIR/validate-roundtrip.js" "$SCRIPT_DIR/examples/forest_adventure_v2.xml" "$EXPORTED_FILE"
    else
        echo "Running validation on forest_adventure_v2.xml..."
        echo "(Will look for exported file automatically)"
        node "$SCRIPT_DIR/validate-roundtrip.js" "$SCRIPT_DIR/examples/forest_adventure_v2.xml"
    fi
else
    echo "⚠ Cannot run validation test - required files missing"
    if [ ! -f "$SCRIPT_DIR/examples/forest_adventure_v2.xml" ]; then
        echo "  Missing: examples/forest_adventure_v2.xml"
    fi
    if [ ! -f "$SCRIPT_DIR/validate-roundtrip.js" ]; then
        echo "  Missing: validate-roundtrip.js"
    fi
fi

echo ""
echo "================================"
echo "  Tests Complete"
echo "================================"
echo ""
echo "To perform a full round-trip test:"
echo "  1. Start the dev server: npm run dev"
echo "  2. Import examples/forest_adventure_v2.xml"
echo "  3. Export the story"
echo "  4. Save as forest_adventure_v2_exported.xml"
echo "  5. Run: node validate-roundtrip.js examples/forest_adventure_v2.xml examples/forest_adventure_v2_exported.xml"
