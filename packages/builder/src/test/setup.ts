import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Import fake-indexeddb for proper IndexedDB testing
import 'fake-indexeddb/auto';

// lucide-react barrel imports are transformed to direct icon imports by the
// lucideDirectImports plugin in vitest.config.ts. Without this, vitest hangs
// trying to resolve 1700+ icon modules from the barrel export file.

// Mock ReactFlow
(global as any).ReactFlow = {
  ReactFlow: ({ children }: any) => children,
  Controls: () => null,
  Background: () => null,
  MiniMap: () => null,
  useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  addEdge: vi.fn(),
  applyEdgeChanges: vi.fn(),
  applyNodeChanges: vi.fn(),
  Handle: ({ children }: any) => children
} as any;

// Mock file system APIs
(global as any).showOpenFilePicker = vi.fn().mockResolvedValue([]);
(global as any).showSaveFilePicker = vi.fn().mockResolvedValue({
  createWritable: vi.fn().mockResolvedValue({
    write: vi.fn(),
    close: vi.fn()
  })
});

// Mock URL.createObjectURL and revokeObjectURL (not available in jsdom)
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
}

// Mock Cache API (not available in jsdom)
const mockCache = {
  match: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  keys: vi.fn().mockResolvedValue([]),
  add: vi.fn().mockResolvedValue(undefined),
  addAll: vi.fn().mockResolvedValue(undefined),
  matchAll: vi.fn().mockResolvedValue([]),
};

const mockCaches = {
  open: vi.fn().mockResolvedValue(mockCache),
  has: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
  keys: vi.fn().mockResolvedValue(['assets']),
  match: vi.fn().mockResolvedValue(undefined),
};

if (typeof globalThis.caches === 'undefined') {
  (globalThis as any).caches = mockCaches;
}

// Mock FileReader for data URL conversion
class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: ((error: any) => void) | null = null;

  readAsDataURL(blob: Blob) {
    // Simulate async reading
    setTimeout(() => {
      this.result = `data:${blob.type};base64,dGVzdA==`;
      if (this.onload) this.onload();
    }, 0);
  }

  readAsArrayBuffer(blob: Blob) {
    setTimeout(() => {
      this.result = new ArrayBuffer(8);
      if (this.onload) this.onload();
    }, 0);
  }
}

if (typeof globalThis.FileReader === 'undefined') {
  (globalThis as any).FileReader = MockFileReader;
}

// IndexedDB is now provided by fake-indexeddb/auto imported above

// Mock window.matchMedia (only in browser-like environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
}

// Mock ResizeObserver
(global as any).ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// Mock IntersectionObserver
(global as any).IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// Mock drag and drop
(global as any).DragEvent = class DragEvent extends Event {
  dataTransfer: any;
  constructor(type: string, init?: any) {
    super(type, init);
    this.dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(),
      clearData: vi.fn(),
      files: [],
      items: [],
      types: [],
      effectAllowed: 'all',
      dropEffect: 'none'
    };
  }
};

// Setup test environment
import { beforeEach } from 'vitest';
beforeEach(() => {
  vi.clearAllMocks();
});

// Utility functions for testing
export const createMockFile = (name: string, size: number, type: string): File => {
  return new File([''], name, { type });
};

export const createMockDragEvent = (files: File[] = []): DragEvent => {
  const event = new DragEvent('drop') as any;
  event.dataTransfer.files = files;
  return event;
};