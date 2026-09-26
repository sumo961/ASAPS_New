import { describe, it, expect } from 'vitest';
import { inferLayoutMode, resolveProjectLayoutMode } from '../../src/utils/layoutMode';

describe('resolveProjectLayoutMode', () => {
  it('uses the explicit setting', () => {
    expect(resolveProjectLayoutMode('fixed', [])).toBe('fixed');
    expect(resolveProjectLayoutMode('responsive', [{ locations: { a: 1 } }])).toBe('responsive');
  });
  it('infers fixed only from baked locations', () => {
    expect(inferLayoutMode([{ locations: new Map() }, {}])).toBe('responsive');
    expect(inferLayoutMode([{ locations: new Map([['text', {}]]) }])).toBe('fixed');
    expect(resolveProjectLayoutMode(undefined, [{ locations: [{}] }])).toBe('fixed');
    expect(resolveProjectLayoutMode(undefined, null)).toBe('responsive');
  });
});
