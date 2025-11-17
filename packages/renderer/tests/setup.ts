import { vi } from 'vitest';

// Mock Canvas API for rendering tests
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn().mockReturnValue({
    data: new Array(4 * 100 * 100).fill(0)
  }),
  putImageData: vi.fn(),
  createImageData: vi.fn().mockReturnValue({
    data: new Array(4 * 100 * 100).fill(0)
  }),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 100 }),
  fillStyle: '',
  strokeStyle: '',
  font: '',
  textAlign: 'left',
  textBaseline: 'alphabetic'
});

// Mock Image constructor
global.Image = class Image {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src: string = '';
  width: number = 0;
  height: number = 0;

  constructor() {
    // Simulate async image loading
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 0);
  }
};

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((callback) => {
  return setTimeout(callback, 16) as any;
});

global.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id);
});

// Mock performance.now
global.performance = {
  ...global.performance,
  now: vi.fn(() => Date.now())
};

// Mock CSSStyleDeclaration for style testing
global.CSSStyleDeclaration = class CSSStyleDeclaration {
  [key: string]: any;

  setProperty(property: string, value: string | null, priority?: string): void {
    this[property] = value;
  }

  getPropertyValue(property: string): string {
    return this[property] || '';
  }

  removeProperty(property: string): string {
    const value = this[property];
    delete this[property];
    return value || '';
  }
} as any;

// Setup test environment
beforeEach(() => {
  vi.clearAllMocks();
});

// Test utilities for rendering
export const createMockCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export const createMockContext2D = (): CanvasRenderingContext2D => {
  return {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4 * 100 * 100) }),
    putImageData: vi.fn(),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4 * 100 * 100) }),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 100 }),
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic'
  } as any;
};