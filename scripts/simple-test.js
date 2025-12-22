#!/usr/bin/env node

/**
 * Simple test runner to verify testing setup without Vitest dependency issues
 * This demonstrates that the test infrastructure is properly configured
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 ASPAS Modern Testing Setup Verification');
console.log('==========================================\n');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

function assert(condition, message) {
  if (condition) {
    results.passed++;
    console.log(`✅ ${message}`);
  } else {
    results.failed++;
    console.log(`❌ ${message}`);
    results.errors.push(message);
  }
}

function test(name, fn) {
  try {
    console.log(`\n📋 Testing: ${name}`);
    fn();
  } catch (error) {
    results.failed++;
    console.log(`❌ ${name} - Error: ${error.message}`);
    results.errors.push(`${name}: ${error.message}`);
  }
}

// Test 1: Verify test configuration files exist
test('Test configuration files', () => {
  const configs = [
    'packages/core/vitest.config.ts',
    'packages/builder/vitest.config.ts',
    'packages/renderer/vitest.config.ts',
    'packages/core/tests/setup.ts',
    'packages/builder/src/test/setup.ts',
    'packages/renderer/tests/setup.ts'
  ];

  configs.forEach(config => {
    assert(fs.existsSync(config), `Configuration file exists: ${config}`);
  });
});

// Test 2: Verify test utilities exist
test('Test utilities', () => {
  assert(fs.existsSync('packages/core/tests/test-utils.ts'), 'Core test utilities exist');
  assert(fs.existsSync('packages/core/tests/beats/Beat.test.ts'), 'Beat tests exist');
  assert(fs.existsSync('packages/core/tests/beats/BeatRegistry.test.ts'), 'Beat registry tests exist');
  assert(fs.existsSync('packages/core/tests/engine/Story.test.ts'), 'Story engine tests exist');
  assert(fs.existsSync('packages/core/tests/xml/ASMLProcessor.test.ts'), 'XML processor tests exist');
});

// Test 3: Verify component tests exist
test('Component tests', () => {
  assert(fs.existsSync('packages/builder/src/components/__tests__/StoryEditor.test.tsx'), 'StoryEditor component tests exist');
  assert(fs.existsSync('packages/builder/src/components/visual/__tests__/positioning.test.ts'), 'Positioning tests exist');
});

// Test 4: Verify test scripts exist
test('Test scripts and configuration', () => {
  assert(fs.existsSync('scripts/test.sh'), 'Comprehensive test script exists');
  assert(fs.existsSync('.github/workflows/ci.yml'), 'CI workflow exists');
  assert(fs.existsSync('TESTING.md'), 'Testing documentation exists');
});

// Test 5: Verify package.json test configurations
test('Package.json test configurations', () => {
  const packages = ['core', 'builder', 'renderer'];

  packages.forEach(pkg => {
    const packagePath = `packages/${pkg}/package.json`;
    assert(fs.existsSync(packagePath), `Package.json exists for ${pkg}`);

    if (fs.existsSync(packagePath)) {
      const pkgJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      assert(pkgJson.scripts?.test, `Test script exists in ${pkg} package.json`);
      assert(pkgJson.scripts?.test?.includes('vitest'), `Vitest configured in ${pkg} test script`);
    }
  });
});

// Test 6: Verify TypeScript compilation
test('TypeScript compilation', () => {
  try {
    const { execSync } = require('child_process');

    // Test core package compilation
    execSync('cd packages/core && npx tsc --noEmit', { stdio: 'pipe' });
    assert(true, 'Core package TypeScript compilation successful');

    // Test builder package compilation
    execSync('cd packages/builder && npx tsc --noEmit', { stdio: 'pipe' });
    assert(true, 'Builder package TypeScript compilation successful');

    // Test renderer package compilation
    execSync('cd packages/renderer && npx tsc --noEmit', { stdio: 'pipe' });
    assert(true, 'Renderer package TypeScript compilation successful');

  } catch (error) {
    assert(false, `TypeScript compilation failed: ${error.message}`);
  }
});

// Test 7: Verify test content quality
test('Test content quality', () => {
  // Check that test files contain proper test structure
  const testFiles = [
    'packages/core/tests/beats/Beat.test.ts',
    'packages/core/tests/engine/Story.test.ts',
    'packages/core/tests/xml/ASMLProcessor.test.ts'
  ];

  testFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      assert(content.includes('describe('), `${file} contains describe blocks`);
      assert(content.includes('it(') || content.includes('test('), `${file} contains test cases`);
      assert(content.includes('expect('), `${file} contains assertions`);
    }
  });
});

// Test 8: Verify coverage configuration
test('Coverage configuration', () => {
  const vitestConfigs = [
    'packages/core/vitest.config.ts',
    'packages/builder/vitest.config.ts',
    'packages/renderer/vitest.config.ts'
  ];

  vitestConfigs.forEach(config => {
    if (fs.existsSync(config)) {
      const content = fs.readFileSync(config, 'utf8');
      assert(content.includes('coverage'), `${config} includes coverage configuration`);
      assert(content.includes('thresholds'), `${config} includes coverage thresholds`);
    }
  });
});

// Test 9: Verify mock setup
test('Mock setup verification', () => {
  const setupFiles = [
    'packages/core/tests/setup.ts',
    'packages/builder/src/test/setup.ts',
    'packages/renderer/tests/setup.ts'
  ];

  setupFiles.forEach(setup => {
    if (fs.existsSync(setup)) {
      const content = fs.readFileSync(setup, 'utf8');
      assert(content.includes('vi'), `${setup} includes vitest imports`);
      assert(content.includes('mock') || content.includes('Mock'), `${setup} includes mock setup`);
    }
  });
});

// Test 10: Verify test utilities
test('Test utilities functionality', () => {
  if (fs.existsSync('packages/core/tests/test-utils.ts')) {
    const content = fs.readFileSync('packages/core/tests/test-utils.ts', 'utf8');

    // Check for key utility functions
    assert(content.includes('createTestStory'), 'createTestStory utility exists');
    assert(content.includes('createTestBeat'), 'createTestBeat utility exists');
    assert(content.includes('TestXML'), 'TestXML data exists');
    assert(content.includes('StoryFlowTester'), 'StoryFlowTester utility exists');
    assert(content.includes('MockBeat'), 'MockBeat implementation exists');
  }
});

// Final results
console.log('\n' + '='.repeat(50));
console.log('📊 Test Setup Verification Results');
console.log('='.repeat(50));
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📈 Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);

if (results.errors.length > 0) {
  console.log('\n🔍 Errors Found:');
  results.errors.forEach(error => {
    console.log(`  - ${error}`);
  });
}

// Overall status
if (results.failed === 0) {
  console.log('\n🎉 All tests passed! Testing setup is properly configured.');
  console.log('\n🚀 Ready to run actual tests with: npm run test');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Check the errors above.');
  console.log('\n💡 Once Vitest dependencies are resolved, you can run: npm run test');
  process.exit(1);
}