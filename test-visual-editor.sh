#!/bin/bash

# Test Visual Editor Fixes
# This script helps test the visual editor improvements

echo "🧪 Visual Editor Test Guide"
echo "=========================="
echo ""
echo "This script will guide you through testing the visual editor fixes."
echo ""

# Check if the fixes have been applied
if [ ! -f "enhance-visual-workspace.sh" ]; then
    echo "❌ Fix scripts not found. Please run from the project root."
    exit 1
fi

echo "Step 1: Build the Project"
echo "-------------------------"
echo "Building the project with visual editor fixes..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check for TypeScript errors."
    exit 1
fi

echo "✅ Build successful!"
echo ""

echo "Step 2: Start the Application"
echo "-----------------------------"
echo "Starting the ASPS Modern application..."
echo "Press Ctrl+C when you're done testing."
echo ""
npm run dev &
DEV_PID=$!

sleep 3
echo ""
echo "Step 3: Testing Checklist"
echo "-------------------------"
echo ""
echo "📋 Visual Editor Testing Checklist:"
echo ""
echo "1. CREATE A TITLE SCREEN BEAT:"
echo "   [ ] Click 'Add Beat' and select 'titleScreen'"
echo "   [ ] Enter a title and author in the Inspector"
echo "   [ ] Save the beat properties"
echo ""
echo "2. SWITCH TO VISUAL EDITOR:"
echo "   [ ] Click the 'Visual Editor' tab (should appear when titleScreen is selected)"
echo "   [ ] Verify the workspace switches to visual mode"
echo "   [ ] Check that Inspector no longer has visual controls"
echo ""
echo "3. VERIFY AUTO-ADDED ELEMENTS:"
echo "   [ ] Check that 'Start' button appears automatically"
echo "   [ ] Check that Title text appears"
echo "   [ ] Check that Author text appears"
echo "   [ ] Verify elements appear in the Layers panel"
echo ""
echo "4. TEST BACKGROUND SELECTION:"
echo "   [ ] Click 'Choose Background' button"
echo "   [ ] Verify asset selection modal opens"
echo "   [ ] Select a background image"
echo "   [ ] Verify background appears on stage"
echo ""
echo "5. ADD VISUAL ELEMENTS:"
echo "   [ ] Click 'Character' button and select an asset"
echo "   [ ] Click 'Prop' button and select an asset"
echo "   [ ] Click 'Hotspot' button to add a hotspot"
echo "   [ ] Click 'Text' button to add text"
echo "   [ ] Drag elements around the stage"
echo ""
echo "6. TEST LAYER MANAGEMENT:"
echo "   [ ] Click eye icon to toggle visibility"
echo "   [ ] Click lock icon to lock/unlock elements"
echo "   [ ] Select different elements from layers list"
echo "   [ ] Delete an element with trash icon"
echo ""
echo "7. TEST ZOOM CONTROLS:"
echo "   [ ] Use zoom in/out buttons"
echo "   [ ] Reset zoom to 100%"
echo "   [ ] Verify stage scales properly"
echo ""
echo "8. SAVE VISUAL CHANGES:"
echo "   [ ] Click 'Save Visual Changes' button"
echo "   [ ] Verify 'Visual changes saved!' notification"
echo "   [ ] Switch to Flowchart and back - verify changes persist"
echo ""
echo "9. EXPORT AND VERIFY ASML:"
echo "   [ ] Export the story to ASML"
echo "   [ ] Open the exported XML file"
echo "   [ ] Verify <node> element contains background"
echo "   [ ] Verify <locs> contains all visual elements"
echo "   [ ] Check element positions and properties"
echo ""
echo "10. TEST SCREEN RESPONSIVENESS:"
echo "    [ ] Resize browser window"
echo "    [ ] Verify interface fits on screen"
echo "    [ ] Toggle properties panel with arrow button"
echo "    [ ] Verify flowchart uses full height"
echo ""
echo "Expected ASML Output Example:"
echo "-----------------------------"
cat << 'EXAMPLE'
<beat>
  <id id="1" name="Title Screen"/>
  <transition type="Fade" duration="1"/>
  <sound name=""/>
  <node>background_asset_id</node>
  <locs>
    <loc kind="text" name="My Story Title" x="312" y="200" z="1" width="400" height="60"/>
    <loc kind="text" name="by Author Name" x="362" y="270" z="2" width="300" height="40"/>
    <loc kind="button" name="Start" x="412" y="500" z="3" width="200" height="50"/>
    <loc kind="char" name="Hero" assetId="char_1" x="200" y="300" z="4" width="150" height="150"/>
  </locs>
  <defaulttarget targetBeat="2" val="0"/>
  <function kind="titleScreen" title="My Story Title" author="Author Name"/>
</beat>
EXAMPLE

echo ""
echo "Press Enter when you're ready to stop the dev server..."
read

# Kill the dev server
kill $DEV_PID 2>/dev/null

echo ""
echo "✅ Testing complete!"
echo ""
echo "If all checkboxes are completed successfully, the visual editor fixes are working!"
echo ""
echo "Report any issues in Issues.md"
