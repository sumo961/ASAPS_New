import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readProjectUiState, writeProjectUiState } from '../projectUiState';

describe('project UI state', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => { items.set(k, v); },
      get length() { return items.size; },
    });
  });

  it('a project never opened has nothing saved', () => {
    expect(readProjectUiState('p1')).toEqual({});
  });

  it('keeps each project apart and merges what is written', () => {
    writeProjectUiState('p1', { view: 'visual' });
    writeProjectUiState('p1', { beatId: 'b1' });
    writeProjectUiState('p2', { view: 'script' });
    expect(readProjectUiState('p1')).toEqual({ view: 'visual', beatId: 'b1' });
    expect(readProjectUiState('p2')).toEqual({ view: 'script' });
  });

  it('corrupt data reads as nothing saved; no project writes nothing', () => {
    localStorage.setItem('asaps_ui_project_p1', '{oops');
    expect(readProjectUiState('p1')).toEqual({});
    writeProjectUiState(undefined, { view: 'visual' });
    expect(localStorage.length).toBe(1);
  });
});
