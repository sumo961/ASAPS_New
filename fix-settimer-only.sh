#!/bin/bash

echo "Fixing SetTimer parameter persistence issue..."

# Create a backup
cp packages/builder/src/components/Inspector.tsx packages/builder/src/components/Inspector.tsx.backup

# Fix the SetTimer parameter handling in Inspector.tsx
cat > /tmp/fix-settimer.js << 'EOF'
const fs = require('fs');

// Read the Inspector.tsx file
let content = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Fix 1: Fix the useEffect hook for SetTimer parameter mapping
// Find the useEffect section and fix it
const useEffectFix = `  useEffect(() => {
    if (beat) {
      const beatData = beat.toJSON();
      
      const connections = beat.getConnections ? beat.getConnections() : [];
      const uniqueConnections = Array.from(
        new Map(connections.map(c => [\`\${c.targetId}-\${c.label}\`, c])).values()
      );
      beatData.connections = uniqueConnections;
      
      beatData.parameters = beat.getParameters ? beat.getParameters() : {};
      
      // Initialize visual elements and sound properties
      if (!beatData.parameters.visualElements) {
        beatData.parameters.visualElements = [];
      }
      if (!beatData.parameters.backgroundSound) {
        beatData.parameters.backgroundSound = '';
      }
      
      const beatDef = getBeatDefinition(beat.type);
      if (beatDef?.connectionType === 'multiple') {
        if (beat.type === 'movementChoice' && !beatData.parameters.choices) {
          beatData.parameters.choices = [];
        } else if (beat.type === 'pickProp' && !beatData.parameters.props) {
          beatData.parameters.props = [];
        } else if (beat.type === 'dialogTree' && !beatData.parameters.dialogTree) {
          const npcCharacters = getAvailableCharacters();
          beatData.parameters.dialogTree = {
            id: 'root',
            speaker: beatData.parameters.speaker || npcCharacters[0],
            text: beatData.parameters.text || 'Greetings, traveler...',
            emotion: beatData.parameters.emotion || 'neutral'
          };
        }
      }
      
      // Initialize randomTarget choices if not present
      if (beat.type === 'randomTarget' && !beatData.parameters.choices) {
        beatData.parameters.choices = [];
      }
      
      // FIXED: SetTimer parameter mapping - use beat's getParameters() for consistency
      if (beat.type === 'setTimer') {
        // Get the actual parameters from the beat
        const actualParams = beat.getParameters ? beat.getParameters() : {};
        console.log('SetTimer actualParams:', actualParams);
        
        // Use the actual parameters, ensuring both naming conventions work
        beatData.parameters.timerName = actualParams.timerName || actualParams.name || '';
        beatData.parameters.name = beatData.parameters.timerName;
        beatData.parameters.target = actualParams.target || actualParams.timerTarget || '';
        beatData.parameters.timerTarget = beatData.parameters.target;
        beatData.parameters.value = actualParams.value || 60;
        
        console.log('SetTimer beatData.parameters:', beatData.parameters);
      }
      
      setLocalBeat(beatData);
      setHasChanges(false);
      setValidationErrors([]);
      
      // Load visual elements from beat parameters
      const savedVisualElements = beatData.parameters?.visualElements || [];
      setVisualElements(savedVisualElements);
      
      // Set default tab based on beat type
      if (supportsVisualEditor(beat.type)) {
        setActiveTab('properties');
      }
    }
  }, [beat?.id, beat?.name]);`;

// Replace the existing useEffect
const useEffectPattern = /useEffect\(\(\) => \{[\s\S]*?\n  \}, \[beat\?\.id, beat\?\.name\]\);/;
content = content.replace(useEffectPattern, useEffectFix);

// Fix 2: Fix the Timer Target Beat onChange handler (around line 1557)
// Fix the onChange for Timer Target Beat dropdown
const timerTargetFix = `onChange={(e) => {
                          const targetId = e.target.value;
                          handleParameterChange('target', targetId);
                          handleParameterChange('timerTarget', targetId);
                        }}`;

// Find and replace the problematic onChange handler for Timer Target Beat
content = content.replace(
  /onChange=\{[\s\S]*?handleParameterChange\('target', targetId\);[\s\S]*?setHasChanges\(true\);[\s\S]*?\}\}/,
  timerTargetFix
);

// Write the fixed content back
fs.writeFileSync('packages/builder/src/components/Inspector.tsx', content);
console.log('SetTimer fix applied successfully');
EOF

# Run the fix
node /tmp/fix-settimer.js

echo ""
echo "SetTimer fix applied. Now rebuilding..."
npm run build

echo ""
echo "Build complete! Test the SetTimer beat:"
echo "1. Create a new SetTimer beat"
echo "2. Set timer name (e.g., 'countdown')"
echo "3. Set timer target beat"
echo "4. Save the beat"
echo "5. Click on another beat, then click back on the SetTimer beat"
echo "6. The timer name and target should still be visible"
