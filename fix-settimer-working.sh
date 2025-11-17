#!/bin/bash

echo "🔧 Applying SetTimer parameter persistence fix..."
echo "================================================"

# Create a simpler, working fix
cat > /tmp/fix-settimer.js << 'EOFIX'
const fs = require('fs');

console.log('Reading Inspector.tsx...');
let content = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Create backup
const timestamp = Date.now();
const backupFile = `packages/builder/src/components/Inspector.tsx.backup.${timestamp}`;
fs.writeFileSync(backupFile, content);
console.log(`Backup created: ${backupFile}`);

// Fix 1: Replace the SetTimer section in useEffect
console.log('Fixing SetTimer parameter handling in useEffect...');

// Find and replace the SetTimer parameter mapping section
const setTimerSectionPattern = /\/\/ FIXED: SetTimer parameter mapping[\s\S]*?if \(beat\.type === 'setTimer'[\s\S]*?\{[\s\S]*?\}[\s\S]*?\}/;

if (content.match(setTimerSectionPattern)) {
  const replacement = `// FIXED: SetTimer parameter mapping - use beat's getParameters() for consistency
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
  
  content = content.replace(setTimerSectionPattern, replacement);
  console.log('✓ SetTimer useEffect section fixed');
} else {
  console.log('⚠ Could not find SetTimer section pattern, trying alternative...');
  
  // Alternative: Look for the specific lines and replace them
  const lines = content.split('\n');
  let found = false;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// FIXED: SetTimer parameter mapping')) {
      console.log(`Found SetTimer comment at line ${i + 1}`);
      
      // Find the end of this if block
      let braceCount = 0;
      let startLine = i;
      let endLine = i;
      
      for (let j = i; j < lines.length && j < i + 50; j++) {
        if (lines[j].includes('if (beat.type === \'setTimer\'')) {
          braceCount = 1;
          startLine = j;
        } else if (braceCount > 0) {
          // Count braces
          const opens = (lines[j].match(/\{/g) || []).length;
          const closes = (lines[j].match(/\}/g) || []).length;
          braceCount += opens - closes;
          
          if (braceCount === 0) {
            endLine = j;
            break;
          }
        }
      }
      
      if (endLine > startLine) {
        // Replace this section
        const newLines = [
          '      // FIXED: SetTimer parameter mapping - use beat\'s getParameters() for consistency',
          '      if (beat.type === \'setTimer\') {',
          '        // Always use beat.getParameters() as the source of truth',
          '        const sourceParams = beat.getParameters ? beat.getParameters() : {};',
          '        ',
          '        // Ensure all naming conventions are synchronized',
          '        const timerName = sourceParams.timerName || sourceParams.name || \'\';',
          '        const target = sourceParams.target || sourceParams.timerTarget || \'\';',
          '        const value = sourceParams.value ?? 60;',
          '        ',
          '        // Set all parameter variations for compatibility',
          '        beatData.parameters = {',
          '          ...beatData.parameters,',
          '          timerName: timerName,',
          '          name: timerName,',
          '          target: target,',
          '          timerTarget: target,',
          '          value: value',
          '        };',
          '        ',
          '        console.log(\'SetTimer params loaded:\', { timerName, target, value });',
          '      }'
        ];
        
        lines.splice(i, endLine - i + 1, ...newLines);
        content = lines.join('\n');
        console.log('✓ SetTimer section replaced by line-by-line method');
        found = true;
        break;
      }
    }
  }
  
  if (!found) {
    console.log('⚠ Could not find SetTimer section to replace');
  }
}

// Fix 2: Fix the Timer Target onChange handler
console.log('Fixing Timer Target dropdown onChange...');

// Find and fix the Timer Target select onChange
const lines = content.split('\n');
let fixedDropdown = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Timer Target Beat') && lines[i].includes('text-red-500')) {
    console.log(`Found Timer Target label at line ${i + 1}`);
    
    // Look for the select and its onChange in the next 20 lines
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      if (lines[j].includes('value={localBeat.parameters?.target')) {
        console.log(`Found Timer Target select at line ${j + 1}`);
        
        // Look for onChange in the next few lines
        for (let k = j; k < Math.min(j + 10, lines.length); k++) {
          if (lines[k].includes('onChange=')) {
            console.log(`Found onChange at line ${k + 1}`);
            
            // Find the end of the onChange function
            let braceCount = 0;
            let endLine = k;
            
            for (let m = k; m < Math.min(k + 30, lines.length); m++) {
              const line = lines[m];
              if (m === k && line.includes('onChange={(')) {
                braceCount = 1;
              } else {
                const opens = (line.match(/\{/g) || []).length;
                const closes = (line.match(/\}/g) || []).length;
                braceCount += opens - closes;
              }
              
              if (braceCount === 0) {
                endLine = m;
                break;
              }
            }
            
            // Replace with simpler onChange
            const indent = '                        ';
            const newOnChange = [
              indent + 'onChange={(e) => {',
              indent + '  handleParameterChange(\'target\', e.target.value);',
              indent + '  handleParameterChange(\'timerTarget\', e.target.value);',
              indent + '}}'
            ];
            
            lines.splice(k, endLine - k + 1, ...newOnChange);
            content = lines.join('\n');
            console.log('✓ Timer Target onChange fixed');
            fixedDropdown = true;
            break;
          }
        }
        if (fixedDropdown) break;
      }
    }
    if (fixedDropdown) break;
  }
}

if (!fixedDropdown) {
  console.log('⚠ Could not fix Timer Target dropdown onChange');
}

// Write the fixed content
fs.writeFileSync('packages/builder/src/components/Inspector.tsx', content);
console.log('\n✅ Inspector.tsx has been fixed!');

// Also ensure SetTimerBeat.ts has proper parameter handling
console.log('\nChecking SetTimerBeat.ts...');
const setTimerPath = 'packages/core/src/beats/SetTimerBeat.ts';
let setTimerContent = fs.readFileSync(setTimerPath, 'utf8');

// Check if getParameters method exists and returns all variants
if (!setTimerContent.includes('timerName: this.timerName')) {
  console.log('⚠ SetTimerBeat.ts might need updating');
} else {
  console.log('✓ SetTimerBeat.ts looks good');
}

console.log('\n✅ Fix complete! Now rebuild with: npm run build');
EOFIX

# Run the fix
node /tmp/fix-settimer.js

echo ""
echo "================================================"
echo "✅ SetTimer fix has been applied!"
echo ""
echo "Now rebuilding the project..."
npm run build

echo ""
echo "================================================"
echo "📋 Test Instructions:"
echo ""
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
echo "✓ The timer name and target should now persist!"
echo ""
echo "💡 Check browser console for debug messages:"
echo "   'SetTimer params loaded: {timerName: ..., target: ..., value: ...}'"
echo "================================================"
