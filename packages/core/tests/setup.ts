import { vi } from 'vitest';

// Mock IndexedDB for testing
const mockIndexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
  databases: vi.fn().mockResolvedValue([]),
  cmp: vi.fn()
};

// Mock browser APIs
global.indexedDB = mockIndexedDB as any;
global.IDBKeyRange = vi.fn() as any;

// Mock EventEmitter for consistent testing
global.Event = class Event {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
} as any;

// Setup test environment
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

// Global test utilities
global.console = {
  ...console,
  // Suppress console logs during tests unless explicitly needed
  log: vi.fn(),
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};