import { vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

// Import fake-indexeddb for proper IndexedDB testing
import 'fake-indexeddb/auto';

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const mockIcon = (props: any) => React.createElement('svg', props, null);
  return new Proxy({}, {
    get: () => mockIcon
  });
});

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