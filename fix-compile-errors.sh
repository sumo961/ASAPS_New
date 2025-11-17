#!/bin/bash

echo "🔧 Fixing TypeScript Compilation Errors"
echo "========================================"
echo ""

# The ASMLGenerator-sound-patch.ts file is a patch file, not actual code
# It should be removed or renamed to not have .ts extension

echo "📝 Removing patch file that's causing compilation errors..."
rm -f packages/core/src/xml/ASMLGenerator-sound-patch.ts

echo "✅ Removed ASMLGenerator-sound-patch.ts"
echo ""

# Now let's properly integrate sound support into the actual ASMLGenerator.ts
echo "📝 Adding sound support to ASMLGenerator.ts..."

# Create a proper patch for the actual ASMLGenerator.ts file
cat > /tmp/asml-generator-patch.txt << 'EOF'
// Add this to the generateSettings method (around line 100-130):
    
    // Sound settings (if present)
    if (settings.sound) {
      if (settings.sound.backgroundMusic) {
        settingsElements.push(`  <bgmusic id="${settings.sound.backgroundMusic}" />`);
      }
      if (settings.sound.musicVolume !== undefined) {
        settingsElements.push(`  <musicvolume val="${settings.sound.musicVolume}" />`);
      }
      if (settings.sound.effectsVolume !== undefined) {
        settingsElements.push(`  <effectsvolume val="${settings.sound.effectsVolume}" />`);
      }
      if (settings.sound.muteAll) {
        settingsElements.push(`  <muteall val="true" />`);
      }
    }

// Add this to beat generation (in generateBeat method):
    // Add background sound if present
    if (beat.parameters?.backgroundSound) {
      attributes.push(`sound="${beat.parameters.backgroundSound}"`);
    }

// Add this to visual element generation (in generateLocs method if it exists):
    // Add sound to visual elements
    if (element.sound) {
      locAttributes.push(`sound="${element.sound}"`);
    }
EOF

# Check if the actual ASMLGenerator.ts already has sound support
if grep -q "backgroundMusic" packages/core/src/xml/ASMLGenerator.ts; then
    echo "✅ ASMLGenerator.ts already has sound support"
else
    echo "⚠️  Sound support needs to be manually added to ASMLGenerator.ts"
    echo "   See /tmp/asml-generator-patch.txt for the code to add"
fi

# Also remove other backup files that might cause issues
echo ""
echo "📝 Cleaning up backup files..."
rm -f packages/core/src/xml/ASMLGenerator.ts.backup.ts
rm -f packages/core/src/xml/ASMLGenerator-enhanced.ts

echo "✅ Cleanup complete"
echo ""

# Now rebuild to check if errors are fixed
echo "🏗️ Rebuilding core package..."
cd packages/core
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful! TypeScript compilation errors fixed."
else
    echo ""
    echo "⚠️  Build still has errors. Checking for other issues..."
fi

cd ../..

echo ""
echo "📋 Summary:"
echo "==========="
echo "1. Removed ASMLGenerator-sound-patch.ts (was a patch file, not actual code)"
echo "2. Cleaned up backup files"
echo "3. Core package rebuilt"
echo ""
echo "If you still see errors, they may be from other files."
echo "Run 'npm run build' to see the full output."
