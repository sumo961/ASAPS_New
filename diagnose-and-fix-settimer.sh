#!/bin/bash

echo "Running SetTimer diagnostics..."

# Create a diagnostic component to test SetTimer behavior
cat > /tmp/test-settimer.js << 'EOF'
// Test script to diagnose SetTimer issues
const fs = require('fs');

console.log('=== SetTimer Diagnostic Report ===\n');

// Check SetTimerBeat.ts
console.log('1. Checking SetTimerBeat.ts implementation...');
const setTimerBeat = fs.readFileSync('packages/core/src/beats/SetTimerBeat.ts', 'utf8');

// Check getParameters method
if (setTimerBeat.includes('getParameters(): Record<string, any>')) {
  console.log('✓ getParameters method exists');
  
  // Extract the getParameters method
  const getParamsMatch = setTimerBeat.match(/getParameters\(\)[^{]*{([^}]*)}/s);
  if (getParamsMatch) {
    console.log('  Returns:', getParamsMatch[1].trim());
  }
} else {
  console.log('✗ getParameters method not found');
}

// Check updateParameters method
if (setTimerBeat.includes('updateParameters(params: Record<string, any>)')) {
  console.log('✓ updateParameters method exists');
} else {
  console.log('✗ updateParameters method not found');
}

console.log('\n2. Checking Inspector.tsx handling...');
const inspector = fs.readFileSync('packages/builder/src/components/Inspector.tsx', 'utf8');

// Check if SetTimer section exists in useEffect
if (inspector.includes("beat.type === 'setTimer'")) {
  console.log('✓ SetTimer handling found in useEffect');
  
  // Check what parameters are being set
  const setTimerSection = inspector.match(/if \(beat\.type === 'setTimer'[^}]*}/gs);
  if (setTimerSection) {
    console.log('  SetTimer section found');
  }
} else {
  console.log('✗ SetTimer handling not found in useEffect');
}

// Check SetTimer UI section
if (inspector.includes('{beat.type === \'setTimer\' && (')) {
  console.log('✓ SetTimer UI section exists');
} else {
  console.log('✗ SetTimer UI section not found');
}

console.log('\n3. Parameter mapping check...');

// Check for timerName field
if (inspector.includes('value={localBeat.parameters?.timerName')) {
  console.log('✓ timerName field binding found');
} else {
  console.log('✗ timerName field binding not found');
}

// Check for target field
if (inspector.includes('value={localBeat.parameters?.target')) {
  console.log('✓ target field binding found');
} else {
  console.log('✗ target field binding not found');
}

console.log('\n=== End Diagnostic Report ===');
EOF

node /tmp/test-settimer.js

echo ""
echo "Now let's apply a comprehensive fix..."

# Apply the comprehensive fix
chmod +x fix-settimer-direct.sh
./fix-settimer-direct.sh
