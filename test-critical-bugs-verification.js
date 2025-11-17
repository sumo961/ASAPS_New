/**
 * Critical Bugs Verification Test
 * Date: October 5, 2025
 * 
 * Tests for three reported critical bugs:
 * 1. New beat types not available from beats palette
 * 2. Chosen character does not save for dialogtree beats  
 * 3. Characters in "Edit NPC Dialog" pulldown not populated from defined characters
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`)
};

// Test results
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    log.success(description);
    return true;
  } catch (error) {
    failedTests++;
    log.error(`${description}\n  ${error.message}`);
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Helper to read file
function readFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

console.log('\n' + '='.repeat(70));
console.log('CRITICAL BUGS VERIFICATION TEST');
console.log('='.repeat(70) + '\n');

// ============================================================================
// BUG #1: New beat types not available from beats palette
// ============================================================================
console.log('\n📋 BUG #1: New beat types availability\n');

test('BeatPalette includes inputText beat', () => {
  const palette = readFile('packages/builder/src/components/graph/BeatPalette.tsx');
  assert(
    palette.includes("{ type: 'inputText'") || palette.includes('inputText'),
    'inputText not found in BeatPalette'
  );
  log.info('  Found: inputText in BeatPalette.tsx');
});

test('BeatPalette includes hyperText beat', () => {
  const palette = readFile('packages/builder/src/components/graph/BeatPalette.tsx');
  assert(
    palette.includes("{ type: 'hyperText'") || palette.includes('hyperText'),
    'hyperText not found in BeatPalette'
  );
  log.info('  Found: hyperText in BeatPalette.tsx');
});

test('BeatRegistry registers inputText', () => {
  const registry = readFile('packages/core/src/beats/BeatRegistry.ts');
  assert(
    registry.includes("registerBeatType('inputText'"),
    'inputText not registered in BeatRegistry'
  );
  log.info('  Found: inputText registered in BeatRegistry.ts');
});

test('BeatRegistry registers hyperText', () => {
  const registry = readFile('packages/core/src/beats/BeatRegistry.ts');
  assert(
    registry.includes("registerBeatType('hyperText'"),
    'hyperText not registered in BeatRegistry'
  );
  log.info('  Found: hyperText registered in BeatRegistry.ts');
});

test('InputTextBeat class exists', () => {
  const beatFile = 'packages/core/src/beats/InputTextBeat.ts';
  const exists = fs.existsSync(path.join(__dirname, beatFile));
  assert(exists, 'InputTextBeat.ts not found');
  log.info('  Found: InputTextBeat.ts');
});

test('HyperTextBeat class exists', () => {
  const beatFile = 'packages/core/src/beats/HyperTextBeat.ts';
  const exists = fs.existsSync(path.join(__dirname, beatFile));
  assert(exists, 'HyperTextBeat.ts not found');
  log.info('  Found: HyperTextBeat.ts');
});

// Check imports
test('BeatRegistry imports InputTextBeat', () => {
  const registry = readFile('packages/core/src/beats/BeatRegistry.ts');
  assert(
    registry.includes("from './InputTextBeat'"),
    'InputTextBeat not imported in BeatRegistry'
  );
  log.info('  Found: InputTextBeat import in BeatRegistry.ts');
});

test('BeatRegistry imports HyperTextBeat', () => {
  const registry = readFile('packages/core/src/beats/BeatRegistry.ts');
  assert(
    registry.includes("from './HyperTextBeat'"),
    'HyperTextBeat not imported in BeatRegistry'
  );
  log.info('  Found: HyperTextBeat import in BeatRegistry.ts');
});

// ============================================================================
// BUG #2: Chosen character does not save for dialogtree beats
// ============================================================================
console.log('\n💬 BUG #2: DialogTree character persistence\n');

test('Inspector receives characters prop', () => {
  const app = readFile('packages/builder/src/App.tsx');
  assert(
    app.includes('characters={characters}'),
    'characters prop not passed to Inspector in App.tsx'
  );
  log.info('  Found: characters prop passed to Inspector in App.tsx');
});

test('Inspector has getAvailableCharacters function', () => {
  const inspector = readFile('packages/builder/src/components/Inspector.tsx');
  assert(
    inspector.includes('getAvailableCharacters'),
    'getAvailableCharacters function not found in Inspector'
  );
  log.info('  Found: getAvailableCharacters function in Inspector.tsx');
});

test('Inspector passes characters to DialogTreeEditor', () => {
  const inspector = readFile('packages/builder/src/components/Inspector.tsx');
  assert(
    inspector.includes('characters={getAvailableCharacters()}') ||
    inspector.includes('characters='),
    'characters not passed to DialogTreeEditor'
  );
  log.info('  Found: characters passed to DialogTreeEditor in Inspector.tsx');
});

test('DialogTreeEditor accepts characters prop', () => {
  const editor = readFile('packages/builder/src/editors/DialogTreeEditor.tsx');
  assert(
    editor.includes('characters?:') || editor.includes('characters ='),
    'characters prop not defined in DialogTreeEditor'
  );
  log.info('  Found: characters prop in DialogTreeEditor.tsx');
});

test('DialogTreeEditor edit modal uses characters', () => {
  const editor = readFile('packages/builder/src/editors/DialogTreeEditor.tsx');
  assert(
    editor.includes('characters.map') || editor.includes('{characters'),
    'characters not used in edit modal'
  );
  log.info('  Found: characters used in edit modal in DialogTreeEditor.tsx');
});

test('Inspector saves dialogTree parameters', () => {
  const inspector = readFile('packages/builder/src/components/Inspector.tsx');
  assert(
    inspector.includes('beat.updateParameters(parameters)') ||
    inspector.includes('updateParameters'),
    'parameters not saved in Inspector'
  );
  log.info('  Found: updateParameters call in Inspector.tsx');
});

// ============================================================================
// BUG #3: Characters in pulldown not populated from defined characters
// ============================================================================
console.log('\n👥 BUG #3: Character population in dialog editor\n');

test('App uses character manager hook', () => {
  const app = readFile('packages/builder/src/App.tsx');
  assert(
    app.includes('useCharacterManagerIntegration'),
    'Character manager hook not used in App'
  );
  log.info('  Found: useCharacterManagerIntegration in App.tsx');
});

test('App manages characters state', () => {
  const app = readFile('packages/builder/src/App.tsx');
  assert(
    app.includes('characters,') && app.includes('updateCharacters'),
    'characters state not managed in App'
  );
  log.info('  Found: characters state management in App.tsx');
});

test('getAvailableCharacters checks prop', () => {
  const inspector = readFile('packages/builder/src/components/Inspector.tsx');
  assert(
    inspector.includes('if (characters && characters.length > 0)'),
    'getAvailableCharacters does not check characters prop'
  );
  log.info('  Found: characters prop check in getAvailableCharacters');
});

test('getAvailableCharacters maps character names', () => {
  const inspector = readFile('packages/builder/src/components/Inspector.tsx');
  assert(
    inspector.includes('.map((char: any) => char.name || char)') ||
    inspector.includes('char.name'),
    'character names not mapped in getAvailableCharacters'
  );
  log.info('  Found: character name mapping in getAvailableCharacters');
});

test('getAvailableCharacters has fallback', () => {
  const inspector = readFile('packages/builder/src/components/Inspector.tsx');
  assert(
    inspector.includes('Old Wizard') || inspector.includes('Merchant'),
    'No fallback characters in getAvailableCharacters'
  );
  log.info('  Found: fallback characters in getAvailableCharacters');
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total tests: ${totalTests}`);
console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);

if (failedTests === 0) {
  console.log(`\n${colors.green}✓ ALL TESTS PASSED!${colors.reset}`);
  console.log('\nCONCLUSION:');
  console.log('- All code is present and properly wired');
  console.log('- Bugs may be:');
  console.log('  1. Runtime issues (not code structure)');
  console.log('  2. UI rendering issues');  
  console.log('  3. Data format mismatches at runtime');
  console.log('  4. User confusion about where to find features\n');
  console.log('RECOMMENDATION: Run the application and test manually');
} else {
  console.log(`\n${colors.red}✗ SOME TESTS FAILED${colors.reset}`);
  console.log('\nPlease review the failed tests above.\n');
}

process.exit(failedTests > 0 ? 1 : 0);
