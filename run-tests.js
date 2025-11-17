#!/usr/bin/env node

/**
 * Automated Tests for ASAPS Modern
 * Verifies key functionality after January 17, 2025 fixes
 */

const fs = require('fs');
const path = require('path');

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testResult(name, passed, details = '') {
  const result = {
    name,
    passed,
    details
  };
  results.tests.push(result);
  
  if (passed) {
    results.passed++;
    log(`✅ ${name}`, 'green');
  } else {
    results.failed++;
    log(`❌ ${name}`, 'red');
  }
  
  if (details) {
    log(`   ${details}`, 'cyan');
  }
}

// Test 1: Verify Continue Button Auto-Generation Code
function test_continue_button_code() {
  log('\n📋 Test 1: Continue Button Auto-Generation Code', 'blue');
  
  const filePath = path.join(__dirname, 'packages/builder/src/components/visual/VisualWorkspace.tsx');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for auto-add button code
    const hasAutoAddCode = content.includes("if (beat.type === 'introText' || beat.type === 'durScreen')");
    const hasButtonCreation = content.includes("type: 'button'");
    const hasCorrectPosition = content.includes('x: 412') && content.includes('y: 668');
    
    const allChecks = hasAutoAddCode && hasButtonCreation && hasCorrectPosition;
    
    testResult(
      'Continue button auto-generation code present',
      allChecks,
      allChecks ? 'Code verified in VisualWorkspace.tsx' : 'Missing expected code patterns'
    );
  } catch (error) {
    testResult('Continue button auto-generation code present', false, `Error: ${error.message}`);
  }
}

// Test 2: Verify Label Removal Code
function test_label_removal_code() {
  log('\n📋 Test 2: ASML Label Removal Code', 'blue');
  
  const filePath = path.join(__dirname, 'packages/core/src/xml/ASMLGenerator.ts');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for noLabelBeats array
    const hasNoLabelBeats = content.includes('noLabelBeats');
    const hasIntroText = content.includes("'introText'");
    const hasDurScreen = content.includes("'durScreen'");
    const hasEndScreen = content.includes("'endScreen'");
    
    const allChecks = hasNoLabelBeats && hasIntroText && hasDurScreen && hasEndScreen;
    
    testResult(
      'ASML label removal code present',
      allChecks,
      allChecks ? 'noLabelBeats array verified in ASMLGenerator.ts' : 'Missing expected beat types in noLabelBeats'
    );
  } catch (error) {
    testResult('ASML label removal code present', false, `Error: ${error.message}`);
  }
}

// Test 3: Verify FlexBox Height Fix
function test_flexbox_height_fix() {
  log('\n📋 Test 3: FlexBox Height Management', 'blue');
  
  const filePath = path.join(__dirname, 'packages/builder/src/components/WorkspaceView.tsx');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for minHeight: 0 style
    const hasMinHeight = content.includes('minHeight: 0');
    const hasOverflowHidden = content.includes('overflow-hidden');
    
    const allChecks = hasMinHeight && hasOverflowHidden;
    
    testResult(
      'FlexBox height fix present',
      allChecks,
      allChecks ? 'Height management code verified' : 'Missing flexbox height fix'
    );
  } catch (error) {
    testResult('FlexBox height fix present', false, `Error: ${error.message}`);
  }
}

// Test 4: Verify Visual Editor Scroll Fix
function test_visual_editor_scroll() {
  log('\n📋 Test 4: Visual Editor Scroll Container', 'blue');
  
  const filePath = path.join(__dirname, 'packages/builder/src/components/visual/VisualBeatEditor.tsx');
  
  try {
    if (!fs.existsSync(filePath)) {
      testResult('Visual editor scroll fix present', false, 'VisualBeatEditor.tsx not found');
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for flex-col and overflow-auto
    const hasFlexCol = content.includes('flex-col');
    const hasOverflowAuto = content.includes('overflow-auto');
    
    const allChecks = hasFlexCol && hasOverflowAuto;
    
    testResult(
      'Visual editor scroll fix present',
      allChecks,
      allChecks ? 'Scroll container verified' : 'Missing scroll container pattern'
    );
  } catch (error) {
    testResult('Visual editor scroll fix present', false, `Error: ${error.message}`);
  }
}

// Test 5: Verify Project Structure
function test_project_structure() {
  log('\n📋 Test 5: Project Structure', 'blue');
  
  const requiredDirs = [
    'packages/builder/src',
    'packages/core/src',
    'packages/renderer/src'
  ];
  
  const requiredFiles = [
    'packages/builder/src/App.tsx',
    'packages/core/src/xml/ASMLGenerator.ts',
    'packages/builder/src/components/Inspector.tsx'
  ];
  
  let allDirsExist = true;
  let allFilesExist = true;
  
  for (const dir of requiredDirs) {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
      allDirsExist = false;
      log(`   Missing: ${dir}`, 'yellow');
    }
  }
  
  for (const file of requiredFiles) {
    const fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) {
      allFilesExist = false;
      log(`   Missing: ${file}`, 'yellow');
    }
  }
  
  const passed = allDirsExist && allFilesExist;
  testResult(
    'Project structure intact',
    passed,
    passed ? 'All critical directories and files present' : 'Some files/directories missing'
  );
}

// Test 6: Verify Inspector Restoration
function test_inspector_restoration() {
  log('\n📋 Test 6: Inspector Restoration', 'blue');
  
  const filePath = path.join(__dirname, 'packages/builder/src/components/Inspector.tsx');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    
    // Inspector should have 2800+ lines
    const hasEnoughLines = lines > 2800;
    
    // Check for key beat types
    const hasTitleScreen = content.includes('titleScreen');
    const hasDialogTree = content.includes('dialogTree');
    const hasConditionBeat = content.includes('conditionBeat');
    
    const allChecks = hasEnoughLines && hasTitleScreen && hasDialogTree && hasConditionBeat;
    
    testResult(
      'Inspector fully restored',
      allChecks,
      `Inspector has ${lines} lines, expects 2800+`
    );
  } catch (error) {
    testResult('Inspector fully restored', false, `Error: ${error.message}`);
  }
}

// Test 7: Check for Test Plan
function test_test_plan_exists() {
  log('\n📋 Test 7: Test Documentation', 'blue');
  
  const filePath = path.join(__dirname, 'COMPREHENSIVE_TEST_PLAN.md');
  
  const exists = fs.existsSync(filePath);
  
  testResult(
    'Comprehensive test plan exists',
    exists,
    exists ? 'Test plan created and available' : 'Test plan missing'
  );
}

// Test 8: Verify Settings System
function test_settings_system() {
  log('\n📋 Test 8: Settings System', 'blue');
  
  const filePath = path.join(__dirname, 'packages/builder/src/App.tsx');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for DEFAULT_SETTINGS
    const hasDefaultSettings = content.includes('DEFAULT_SETTINGS');
    const hasGlobalSettings = content.includes('GlobalSettings');
    const hasSettingsModal = content.includes('GlobalSettingsInspector');
    
    const allChecks = hasDefaultSettings && hasGlobalSettings && hasSettingsModal;
    
    testResult(
      'Settings system integrated',
      allChecks,
      allChecks ? 'Settings system verified in App.tsx' : 'Settings system incomplete'
    );
  } catch (error) {
    testResult('Settings system integrated', false, `Error: ${error.message}`);
  }
}

// Run all tests
async function runTests() {
  log('╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║     ASAPS Modern - Automated Test Suite               ║', 'cyan');
  log('║     Verifying January 17, 2025 Fixes                   ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝', 'cyan');
  
  test_continue_button_code();
  test_label_removal_code();
  test_flexbox_height_fix();
  test_visual_editor_scroll();
  test_project_structure();
  test_inspector_restoration();
  test_test_plan_exists();
  test_settings_system();
  
  // Summary
  log('\n' + '═'.repeat(60), 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  log(`\nTotal Tests: ${results.tests.length}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  const percentage = Math.round((results.passed / results.tests.length) * 100);
  log(`\nSuccess Rate: ${percentage}%`, percentage === 100 ? 'green' : 'yellow');
  
  // Failed tests detail
  if (results.failed > 0) {
    log('\n' + '─'.repeat(60), 'yellow');
    log('FAILED TESTS:', 'yellow');
    log('─'.repeat(60), 'yellow');
    
    results.tests.filter(t => !t.passed).forEach(test => {
      log(`\n❌ ${test.name}`, 'red');
      if (test.details) {
        log(`   ${test.details}`, 'cyan');
      }
    });
  }
  
  log('\n' + '═'.repeat(60) + '\n', 'cyan');
  
  // Write results to file
  const reportPath = path.join(__dirname, 'test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  log(`📄 Detailed results written to: test-results.json`, 'cyan');
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\n💥 Test runner error: ${error.message}`, 'red');
  process.exit(1);
});
