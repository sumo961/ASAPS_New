import { describe, it, expect, beforeEach } from 'vitest';
import { readSavedViewport, saveViewport } from '../GraphEditor';

describe('per-project graph viewport memory', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a viewport keyed by project id', () => {
    saveViewport('p1', { x: 12.5, y: -30, zoom: 0.8 });
    expect(readSavedViewport('p1')).toEqual({ x: 12.5, y: -30, zoom: 0.8 });
    expect(readSavedViewport('p2')).toBeNull();
  });

  it('has nothing to say without a project id (untitled projects fit to view)', () => {
    saveViewport(undefined, { x: 1, y: 1, zoom: 1 });
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(readSavedViewport(undefined)).toBeNull();
  });

  it('ignores corrupt or impossible stored values', () => {
    localStorage.setItem('asaps.graphViewport.p1', '{not json');
    expect(readSavedViewport('p1')).toBeNull();
    localStorage.setItem('asaps.graphViewport.p1', JSON.stringify({ x: 0, y: 0, zoom: 0 }));
    expect(readSavedViewport('p1')).toBeNull();
  });
});
