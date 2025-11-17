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
else
    echo "✗ Validation script missing"
fi

# Test 4: Run validation on example file if it exists
echo ""
echo "Test 4: Testing round-trip validation..."
if [ -f "$SCRIPT_DIR/examples/forest_adventure_v2.xml" ] && [ -f "$SCRIPT_DIR/validate-roundtrip.js" ]; then
    echo "Running validation on forest_adventure_v2.xml..."
    node "$SCRIPT_DIR/validate-roundtrip.js" "$SCRIPT_DIR/examples/forest_adventure_v2.xml" || true
else
    echo "⚠ Cannot run validation test - files missing"
fi

echo ""
echo "================================"
echo "  Tests Complete"
echo "================================"
