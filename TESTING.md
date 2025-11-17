# ASPAS Modern Testing Guide

This document provides comprehensive information about the testing setup and practices for the ASPAS Modern project.

## Test Architecture

ASPAS Modern uses **Vitest** as the primary testing framework across all packages, with specialized configurations for different types of tests:

- **Unit Tests**: Test individual functions, classes, and components in isolation
- **Integration Tests**: Test interactions between different modules and systems
- **Component Tests**: Test React components with realistic DOM interactions
- **E2E Tests**: Test complete user workflows (planned for future implementation)

## Package Structure

```
packages/
├── core/          # Core story engine and beat system tests
├── builder/       # React-based visual story builder tests
├── renderer/      # Rendering engines tests
└── shared/        # Shared test utilities and helpers
```

## Running Tests

### Quick Start

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Package-Specific Testing

```bash
# Test core package only
npm run test -w @asaps/core

# Test builder package only
npm run test -w @asaps/builder

# Test renderer package only
npm run test -w @asaps/renderer
```

### Using the Test Script

A comprehensive test runner script is available at `scripts/test.sh`:

```bash
# Run complete test suite
./scripts/test.sh

# Run specific test types
./scripts/test.sh unit          # Unit tests only
./scripts/test.sh coverage      # Coverage tests only
./scripts/test.sh type-check    # TypeScript type checking
./scripts/test.sh lint          # ESLint only

# Run package-specific tests
./scripts/test.sh core          # Core package tests
./scripts/test.sh builder       # Builder package tests
./scripts/test.sh renderer      # Renderer package tests
```

## Test Configuration

### Core Package (`packages/core/vitest.config.ts`)

- **Environment**: Node.js
- **Coverage**: 80% threshold for lines, functions, and statements
- **Setup**: `./tests/setup.ts` for test environment configuration

### Builder Package (`packages/builder/vitest.config.ts`)

- **Environment**: jsdom (for DOM testing)
- **Coverage**: 70% threshold for React components
- **Setup**: `./src/test/setup.ts` for React-specific mocks
- **UI Testing**: Vitest UI available via `npm run test:ui`

### Renderer Package (`packages/renderer/vitest.config.ts`)

- **Environment**: jsdom with Canvas API mocking
- **Coverage**: 75% threshold for rendering logic
- **Setup**: `./tests/setup.ts` for Canvas and rendering mocks

## Test Utilities

### Core Test Utilities (`packages/core/tests/test-utils.ts`)

```typescript
import { TestUtils } from '../tests/test-utils';

// Create test stories
const story = TestUtils.createTestStory();

// Create test beats
const beat = TestUtils.createTestBeat({
  id: 'test-beat',
  name: 'Test Beat',
  type: 'titleScreen'
});

// Test XML data
const xml = TestXML.minimalStory;
const complexXml = TestXML.storyWithMultipleBeats;

// Async testing utilities
await TestUtils.expectAsyncError(async () => {
  await someAsyncFunction();
}, 'Expected error message');

// Story flow testing
const flowTester = new TestUtils.StoryFlowTester(story);
await flowTester.visitBeat('beat-1');
await flowTester.followPath(['beat-1', 'beat-2', 'beat-3']);
```

### Component Test Utilities

```typescript
// Mock file creation
const mockFile = createMockFile('test.asml', 1024, 'text/xml');

// Mock drag events
const dragEvent = createMockDragEvent([mockFile]);

// Mock canvas for rendering tests
const canvas = createMockCanvas(800, 600);
const ctx = createMockContext2D();
```

## Test Categories

### Beat System Tests

Tests for the core beat system including:

- **Beat lifecycle**: `onEnter`, `performAction`, `onExit` execution order
- **Parameter management**: Default parameters, updates, validation
- **Event system**: Event emission and handling
- **Registry**: Beat type registration and creation

Example:
```typescript
describe('Beat Base Class', () => {
  it('should execute lifecycle methods in sequence', async () => {
    const beat = new TestBeat(config);
    const onEnterSpy = vi.spyOn(beat, 'onEnter');
    const onExitSpy = vi.spyOn(beat, 'onExit');

    await beat.execute(context);

    expect(onEnterSpy).toHaveBeenCalledBefore(onExitSpy);
  });
});
```

### Story Engine Tests

Tests for story execution and management:

- **Story creation**: Metadata, settings, characters
- **Beat management**: Adding, removing, ordering
- **Execution flow**: Starting beat, transitions
- **Serialization**: JSON export/import
- **Validation**: Story structure validation

### XML Processing Tests

Tests for ASML XML parsing and processing:

- **XML parsing**: Valid and invalid XML handling
- **Beat creation**: All beat types from XML
- **Migration**: Legacy format conversion
- **Error handling**: Malformed XML, missing attributes

### Component Tests

Tests for React components in the builder:

- **Rendering**: Component rendering with props
- **User interactions**: Click, drag, keyboard events
- **State management**: Store integration
- **Error handling**: Error boundaries and fallbacks

## Coverage Goals

| Package | Lines | Functions | Branches | Statements |
|---------|-------|-----------|----------|------------|
| Core    | 80%   | 80%       | 70%      | 80%        |
| Builder | 70%   | 70%       | 60%      | 70%        |
| Renderer| 75%   | 75%       | 65%      | 75%        |

## Best Practices

### 1. Test Naming

Use descriptive test names that explain what is being tested:

```typescript
// Good
it('should center text elements horizontally using the correct formula', () => {
  // test implementation
});

// Avoid
it('test centering', () => {
  // test implementation
});
```

### 2. Test Structure

Follow the AAA pattern (Arrange, Act, Assert):

```typescript
it('should update beat parameters correctly', () => {
  // Arrange
  const beat = new TestBeat(config);
  const newParams = { title: 'New Title' };

  // Act
  beat.updateParameters(newParams);

  // Assert
  expect(beat.getParameters().title).toBe('New Title');
});
```

### 3. Mocking

Use mocks appropriately:

```typescript
// Mock external dependencies
vi.mock('../../stores/storyStore', () => ({
  useStoryStore: vi.fn()
}));

// Mock browser APIs
global.indexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn()
};
```

### 4. Async Testing

Handle async operations properly:

```typescript
it('should parse XML asynchronously', async () => {
  const result = await processor.parseASML(xml);
  expect(result.story).toBeDefined();
});

it('should handle async errors', async () => {
  await expect(async () => {
    await invalidOperation();
  }).rejects.toThrow('Expected error');
});
```

## Continuous Integration

The project includes GitHub Actions workflows for:

- **Unit Testing**: Run on every push and PR
- **Type Checking**: Ensure TypeScript compilation
- **Linting**: Code style and quality checks
- **Security Auditing**: Dependency vulnerability scanning
- **Performance Testing**: Bundle size and performance metrics
- **Cross-platform Testing**: Windows, macOS, Linux compatibility

## Debugging Tests

### Using Vitest UI

```bash
# Start Vitest UI for interactive debugging
npm run test:ui

# In specific package
cd packages/builder
npm run test:ui
```

### Console Output

```typescript
// Enable console output for debugging
it('should debug beat execution', () => {
  console.log('Beat ID:', beat.id);
  console.log('Parameters:', beat.getParameters());

  // Your test code
});
```

### Test Isolation

Use `beforeEach` and `afterEach` for test isolation:

```typescript
beforeEach(() => {
  // Reset state before each test
  vi.clearAllMocks();
  story = new Story();
});

afterEach(() => {
  // Clean up after each test
  cleanup();
});
```

## Troubleshooting

### Common Issues

1. **Module not found errors**: Check import paths and TypeScript configuration
2. **Mock not working**: Ensure mocks are defined before imports
3. **Async test timeouts**: Increase timeout for complex operations
4. **Coverage not generating**: Check Vitest configuration and thresholds

### Performance Issues

- Use `test.concurrent` for independent tests
- Mock heavy dependencies
- Use `vi.mock` for external modules
- Consider test sharding for large test suites

## Future Enhancements

- **E2E Testing**: Playwright integration for full workflow testing
- **Visual Regression**: Screenshot testing for UI components
- **Performance Benchmarks**: Automated performance regression detection
- **Mutation Testing**: Test quality assessment
- **Parallel Testing**: Distributed test execution

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure coverage meets package thresholds
3. Update this documentation if adding new test utilities
4. Run the complete test suite before submitting PRs

For questions about testing, please refer to the project documentation or create an issue in the repository.