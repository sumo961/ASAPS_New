#!/bin/bash

echo "🚀 ASPS System - Complete Rebuild & Test Sequence"
echo "================================================"
echo ""

echo "📋 SUMMARY OF FIXES APPLIED:"
echo "✅ Parameter serialization architecture (all beat classes)"
echo "✅ ASML condition syntax (counter, variable, inventory, counterCompare)" 
echo "✅ Export format improvements (no unnecessary buttonText)"
echo "✅ Visual connection cleanup (no duplicate edges)"
echo "✅ Enhanced hierarchical layout algorithm"
echo "✅ SWFBeat renderer interface compatibility"
echo ""

echo "🔨 REBUILDING SYSTEM..."
echo ""

# Clean and rebuild all packages in correct order
echo "1. Cleaning previous builds..."
rm -rf packages/core/dist
rm -rf packages/renderer/dist  
rm -rf packages/builder/dist

echo ""
echo "2. Building core package..."
cd packages/core
npm run build
BUILD_CORE=$?

cd ../..

if [ $BUILD_CORE -eq 0 ]; then
    echo "✅ Core package built successfully"
else
    echo "❌ Core package build failed"
    echo "Check console output above for TypeScript errors"
    exit 1
fi

echo ""
echo "3. Building renderer package..."
cd packages/renderer
npm run build
BUILD_RENDERER=$?

cd ../..

if [ $BUILD_RENDERER -eq 0 ]; then
    echo "✅ Renderer package built successfully"
else
    echo "❌ Renderer package build failed" 
    echo "Check console output above for errors"
    exit 1
fi

echo ""
echo "4. Building builder package..."
cd packages/builder
npm run build
BUILD_BUILDER=$?

cd ../..

if [ $BUILD_BUILDER -eq 0 ]; then
    echo "✅ Builder package built successfully"
else
    echo "❌ Builder package build failed"
    echo "Check console output above for errors"
    exit 1
fi

echo ""
echo "🎉 ALL PACKAGES BUILT SUCCESSFULLY!"
echo ""

echo "🧪 RECOMMENDED TESTING SEQUENCE:"
echo ""
echo "1. Start development server:"
echo "   npm run dev"
echo ""
echo "2. Test Parameter Persistence:"
echo "   • Import examples/forest_adventure_v2.xml"
echo "   • Select Title Screen beat"
echo "   • Edit title/author in Inspector"
echo "   • Click Save Changes" 
echo "   • Reselect beat → verify changes persist"
echo ""
echo "3. Test Condition Syntax:"
echo "   • Find Dark Path Courage Check beat"
echo "   • Check condition shows in Inspector"
echo "   • Export story → verify condition uses proper ASML syntax"
echo ""
echo "4. Test Layout:"
echo "   • Import story → verify beats arrange in layers (not single line)"
echo "   • Check proper spacing and hierarchy"
echo ""
echo "5. Test Connection Management:"
echo "   • Replace a beat connection" 
echo "   • Verify old connection disappears"
echo "   • Verify new connection appears correctly"
echo ""
echo "6. Test Export/Import Cycle:"
echo "   • Edit multiple beat parameters"
echo "   • Export story to new file"
echo "   • Compare exported XML structure"
echo "   • Re-import → verify data preservation"
echo ""

echo "📊 EXPECTED RESULTS:"
echo ""
echo "✅ Inspector shows beat parameters immediately when selected"
echo "✅ Parameter changes persist after saving"  
echo "✅ Exported XML contains all edited content"
echo "✅ Condition beats use correct ASML syntax"
echo "✅ No duplicate/ghost connections in visual editor"
echo "✅ Beats arrange in hierarchical layers"
echo "✅ Full import/export round-trip data integrity"
echo ""

echo "🎯 SUCCESS CRITERIA:"
echo ""
echo "If all tests pass, then all major Issues2.md problems are resolved!"
echo "The ASPS system should now work reliably for story creation and editing."
echo ""

echo "Ready to test! Run 'npm run dev' to start the development server."

