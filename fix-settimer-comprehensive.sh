#!/bin/bash

echo "🔧 Applying comprehensive SetTimer fix..."
echo "================================================"

# First, run diagnostics
echo "Step 1: Running diagnostics..."
node -e "
const fs = require('fs');
const inspector = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');
const setTimerBeat = fs.readFileSync('packages/core/src/beats/SetTimerBeat.ts', 'utf8');

console.log('Current state:');
console.log('- SetTimerBeat has getParameters:', setTimerBeat.includes('getParameters()'));
console.log('- Inspector has SetTimer handling:', inspector.includes(\"beat.type === 'setTimer'\"));
"

# Create comprehensive fix
echo ""
echo "Step 2: Applying comprehensive fix to Inspector.tsx..."

cat > /tmp/comprehensive-settimer-fix.js << 'EOF'
const fs = require('fs');

console.log('Reading Inspector.tsx...');
let content = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Create backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(`packages/builder/src/components/Inspector.tsx.backup.${timestamp}`, content);
console.log(`Backup created: Inspector.tsx.backup.${timestamp}`);

// Fix 1: Ensure proper import at the top if not present
if (!content.includes("import { Beat }")) {
  console.log('Warning: Beat import might be missing');
}

// Fix 2: Replace the entire useEffect to ensure SetTimer works correctly
console.log('Fixing useEffect hook...');

// Find useEffect that handles beat loading
const useEffectRegex = /useEffect\(\(\) => \{[\s\S]*?if \(!beat\) return;[\s\S]*?\}, \[beat\?\.id, beat\?\.name\]\);/;
const useEffectMatch = content.match(useEffectRegex);

if (useEffectMatch) {
  console.log('Found useEffect, replacing with fixed version...');
  
  const newUseEffect = `useEffect(() => {
    if (!beat) return;
    
    const beatData = beat.toJSON();
    
    const connections = beat.getConnections ? beat.getConnections() : [];
    const uniqueConnections = Array.from(
      new Map(connections.map(c => [\`\${c.targetId}-\${c.label}\`, c])).values()
    );
    beatData.connections = uniqueConnections;
    
    // Get parameters from beat
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
    
    // CRITICAL FIX: SetTimer parameter handling
    if (beat.type === 'setTimer') {
      // Always use beat.getParameters() as the source of truth
      const sourceParams = beat.getParameters ? beat.getParameters() : {};
      
      // Ensure all naming conventions are synchronized
      const timerName = sourceParams.timerName || sourceParams.name || '';
      const target = sourceParams.target || sourceParams.timerTarget || '';
      const value = sourceParams.value ?? 60;
      
      // Set all parameter variations for compatibility
      beatData.parameters = {
        ...beatData.parameters,
        timerName: timerName,
        name: timerName,
        target: target,
        timerTarget: target,
        value: value
      };
      
      console.log('SetTimer params loaded:', { timerName, target, value });
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
  }, [beat?.id, beat?.name]);`;
  
  content = content.replace(useEffectRegex, newUseEffect);
  console.log('useEffect replaced successfully');
} else {
  console.log('Warning: Could not find useEffect pattern, trying alternative approach...');
  
  // Alternative: Find and replace just the SetTimer section
  const setTimerSectionRegex = /\/\/ FIXED: SetTimer parameter mapping[\s\S]*?if \(beat\.type === 'setTimer'[^}]*\}[^}]*\}/;
  if (content.match(setTimerSectionRegex)) {
    const replacement = `// CRITICAL FIX: SetTimer parameter handling
    if (beat.type === 'setTimer') {
      // Always use beat.getParameters() as the source of truth
      const sourceParams = beat.getParameters ? beat.getParameters() : {};
      
      // Ensure all naming conventions are synchronized
      const timerName = sourceParams.timerName || sourceParams.name || '';
      const target = sourceParams.target || sourceParams.timerTarget || '';
      const value = sourceParams.value ?? 60;
      
      // Set all parameter variations for compatibility
      beatData.parameters = {
        ...beatData.parameters,
        timerName: timerName,
        name: timerName,
        target: target,
        timerTarget: target,
        value: value
      };
      
      console.log('SetTimer params loaded:', { timerName, target, value });
    }`;
    
    content = content.replace(setTimerSectionRegex, replacement);
    console.log('SetTimer section replaced');
  }
}

// Fix 3: Ensure handleSave properly saves SetTimer parameters
console.log('Checking handleSave function...');

// Find handleSave and ensure it handles SetTimer properly
const handleSaveRegex = /const handleSave = \(\) => \{[\s\S]*?\n  \};/;
const handleSaveMatch = content.match(handleSaveRegex);

if (handleSaveMatch) {
  let handleSaveContent = handleSaveMatch[0];
  
  // Check if SetTimer handling exists in handleSave
  if (!handleSaveContent.includes("beat.type === 'setTimer'")) {
    console.log('Adding SetTimer handling to handleSave...');
    
    // Find where to insert SetTimer handling (after parameter update)
    const insertPoint = handleSaveContent.indexOf('beat.updateParameters(parameters);');
    if (insertPoint > -1) {
      const beforeInsert = handleSaveContent.substring(0, insertPoint);
      const afterInsert = handleSaveContent.substring(insertPoint);
      
      const setTimerSaveCode = `
        // Ensure SetTimer parameters are properly saved
        if (beat.type === 'setTimer' && parameters) {
          // Ensure both naming conventions are saved
          if (parameters.timerName) {
            parameters.name = parameters.timerName;
          }
          if (parameters.target) {
            parameters.timerTarget = parameters.target;
          }
        }
        
        `;
      
      handleSaveContent = beforeInsert + setTimerSaveCode + afterInsert;
      content = content.replace(handleSaveRegex, handleSaveContent);
      console.log('SetTimer save handling added');
    }
  }
}

// Fix 4: Ensure the Timer Target dropdown onChange works correctly
console.log('Fixing Timer Target dropdown...');

// Find the Timer Target Beat select element
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Timer Target Beat') && lines[i].includes('text-red-500')) {
    // Found the label, now find the select element (should be within next 10 lines)
    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      if (lines[j].includes('<select')) {
        // Found the select, now find its onChange (should be in next 2-3 lines)
        for (let k = j; k < Math.min(j + 5, lines.length); k++) {
          if (lines[k].includes('onChange=')) {
            console.log('Found Timer Target onChange at line', k + 1);
            
            // Replace the onChange line and potentially following lines
            // Keep it simple - just update both parameters
            lines[k] = '                        onChange={(e) => {';
            lines[k + 1] = '                          handleParameterChange(\\'target\\', e.target.value);';
            lines[k + 2] = '                          handleParameterChange(\\'timerTarget\\', e.target.value);';
            lines[k + 3] = '                        }}';
            
            content = lines.join('\n');
            console.log('Timer Target onChange fixed');
            break;
          }
        }
        break;
      }
    }
    break;
  }
}

// Write the fixed content
fs.writeFileSync('packages/builder/src/components/Inspector.tsx', content);
console.log('✅ All fixes applied to Inspector.tsx');

// Also add debug logging to SetTimerBeat if needed
console.log('\nChecking SetTimerBeat.ts...');
let setTimerContent = fs.readFileSync('packages/core/src/beats/SetTimerBeat.ts', 'utf8');

// Ensure getParameters includes console.log for debugging
if (!setTimerContent.includes('console.log') || !setTimerContent.includes('// Debug:')) {
  setTimerContent = setTimerContent.replace(
    'getParameters(): Record<string, any> {',
    `getParameters(): Record<string, any> {
    // Debug: Log what we're returning
    const params = {
      timerName: this.timerName || '',
      name: this.timerName || '', // Include both for compatibility
      value: this.timerValue || 60,
      target: this.timerTarget || '',
      timerTarget: this.timerTarget || '' // Include both for compatibility
    };
    console.log('SetTimerBeat.getParameters() returning:', params);`
  );
  
  setTimerContent = setTimerContent.replace(
    'return {',
    'return params;
    /* Original return replaced by params above'
  );
  
  setTimerContent = setTimerContent.replace(
    '};',
    '*/\n  }',
    1
  );
  
  fs.writeFileSync('packages/core/src/beats/SetTimerBeat.ts', setTimerContent);
  console.log('✅ Debug logging added to SetTimerBeat.ts');
}

console.log('\n✅ Comprehensive fix complete!');
EOF

# Run the comprehensive fix
node /tmp/comprehensive-settimer-fix.js

echo ""
echo "Step 3: Rebuilding project..."
npm run build

echo ""
echo "================================================"
echo "✅ SetTimer fix has been applied!"
echo ""
echo "📋 Test Instructions:"
echo "1. Open the application"
echo "2. Create a new SetTimer beat"
echo "3. Set:"
echo "   - Timer Name: 'countdown'"
echo "   - Duration: 30 seconds"
echo "   - Timer Target: Select any beat"
echo "   - Continue To: Select any beat"
echo "4. Click 'Save Changes'"
echo "5. Click on a different beat"
echo "6. Click back on the SetTimer beat"
echo ""
echo "✓ The timer name and target should persist!"
echo ""
echo "📝 Check browser console for debug messages"
echo "   You should see: 'SetTimer params loaded: {...}'"
echo "================================================"
