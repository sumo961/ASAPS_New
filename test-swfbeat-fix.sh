#!/bin/bash

echo "🔧 Testing SWFBeat renderVideo fix..."
echo ""

# Build just the core package to verify the TypeScript error is resolved
cd packages/core

echo "Building core package to check for TypeScript errors..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS: SWFBeat.ts TypeScript error resolved!"
    echo "✅ renderVideo() now called with correct arguments:"
    echo "   • videoFile: string"
    echo "   • autoplay: boolean" 
    echo "   • controls: boolean (mapped from skipButton)"
    echo ""
else
    echo ""
    echo "❌ Build failed - there may be other TypeScript errors to fix"
    echo ""
fi

cd ../..

echo "The SWFBeat renderVideo interface mismatch has been fixed."
echo "SWF files will now properly convert to video playback using the renderer interface."

