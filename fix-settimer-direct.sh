#!/bin/bash

echo "Applying targeted SetTimer fix..."

# Create backup with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
cp packages/builder/src/components/Inspector.tsx "packages/builder/src/components/Inspector.tsx.backup.$TIMESTAMP"

# Create the fix script
cat > /tmp/fix_settimer_direct.js << 'EOF'
const fs = require('fs');

// Read the file
let content = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Count original occurrences for verification
const originalLines = content.split('\n');
console.log('Original file has', originalLines.length, 'lines');

// Fix 1: Fix the useEffect section for SetTimer
// Find the section that starts with "// FIXED: SetTimer parameter mapping"
// and replace the entire SetTimer fixing block

const findStart = '      // FIXED: SetTimer parameter mapping - ensure consistency';
const findEnd = '      }';

// Split by lines to find and replace the section
const lines = content.split('\n');
let startIdx = -1;
let endIdx = -1;

// Find the start of the SetTimer fix section
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// FIXED: SetTimer parameter mapping')) {
    startIdx = i;
    // Find the matching closing brace
    let braceCount = 0;
    for (let j = i; j < lines.length; j++) {
      if (lines[j].includes('if (beat.type === \'setTimer\'')) {
        braceCount = 1;
      } else if (braceCount > 0) {
        if (lines[j].includes('{')) braceCount++;
        if (lines[j].includes('}')) {
          braceCount--;
          if (braceCount === 0) {
            endIdx = j;
            break;
          }
        }
      }
    }
    break;
  }
}

if (startIdx >= 0 && endIdx >= 0) {
  console.log('Found SetTimer section from line', startIdx + 1, 'to', endIdx + 1);
  
  // Replace with the fixed version
  const fixedSection = `      // FIXED: SetTimer parameter mapping - use beat's getParameters() for consistency
      if (beat.type === 'setTimer') {
        // Get the actual parameters from the beat's getParameters() method
        const actualParams = beat.getParameters ? beat.getParameters() : {};
        
        // Ensure all parameter variations are set for compatibility
        beatData.parameters.timerName = actualParams.timerName || actualParams.name || beatData.parameters.timerName || beatData.parameters.name || '';
        beatData.parameters.name = beatData.parameters.timerName;
        beatData.parameters.target = actualParams.target || actualParams.timerTarget || beatData.parameters.target || beatData.parameters.timerTarget || '';
        beatData.parameters.timerTarget = beatData.parameters.target;
        beatData.parameters.value = actualParams.value ?? beatData.parameters.value ?? 60;
      }`;
  
  // Replace the lines
  lines.splice(startIdx, endIdx - startIdx + 1, ...fixedSection.split('\n'));
  content = lines.join('\n');
  console.log('Replaced SetTimer section in useEffect');
} else {
  console.log('Warning: Could not find SetTimer section in useEffect');
}

// Fix 2: Fix the Timer Target Beat dropdown onChange handler
// Find the line with the problematic onChange handler
const problemLine = 'onChange={(e) => {';
const contextLine = 'Timer Target Beat <span className="text-red-500">*</span>';

// Find and fix the onChange handler for Timer Target Beat
lines2 = content.split('\n');
for (let i = 0; i < lines2.length; i++) {
  if (lines2[i].includes('Timer Target Beat') && lines2[i].includes('text-red-500')) {
    // Found the Timer Target Beat label, now find its select onChange
    for (let j = i; j < Math.min(i + 20, lines2.length); j++) {
      if (lines2[j].includes('onChange={(e) =>')) {
        console.log('Found Timer Target onChange at line', j + 1);
        
        // Find the end of this onChange handler
        let braceCount = 0;
        let startLine = j;
        let endLine = j;
        
        for (let k = j; k < Math.min(j + 30, lines2.length); k++) {
          const line = lines2[k];
          if (k === j) {
            braceCount = 1; // Starting with onChange={(
          } else {
            for (let c of line) {
              if (c === '{') braceCount++;
              if (c === '}') braceCount--;
            }
          }
          
          if (braceCount === 0 && line.includes('}}')) {
            endLine = k;
            break;
          }
        }
        
        if (endLine > startLine) {
          // Replace with simpler onChange
          const simpleOnChange = `                        onChange={(e) => {
                          handleParameterChange('target', e.target.value);
                          handleParameterChange('timerTarget', e.target.value);
                        }}`;
          
          lines2.splice(startLine, endLine - startLine + 1, ...simpleOnChange.split('\n'));
          content = lines2.join('\n');
          console.log('Fixed Timer Target onChange handler');
          break;
        }
      }
    }
    break;
  }
}

// Write the fixed content
fs.writeFileSync('packages/builder/src/components/Inspector.tsx', content);
console.log('Fix complete!');
EOF

# Run the fix
node /tmp/fix_settimer_direct.js

echo ""
echo "Fix applied. Building project..."
npm run build

echo ""
echo "✅ SetTimer fix complete!"
echo ""
echo "Test instructions:"
echo "1. Create a SetTimer beat"
echo "2. Enter timer name: 'countdown'"
echo "3. Set duration: 30"
echo "4. Select a timer target beat"
echo "5. Save the beat"
echo "6. Click away to another beat"
echo "7. Click back to the SetTimer beat"
echo "8. ✓ Timer name and target should still be visible"
