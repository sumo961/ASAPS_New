import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { aiFeaturesEnabled, setAIFeaturesEnabled, useAIFeatures, setBeatSuggestionsEnabled, useBeatSuggestions } from '../aiFeatures';

function Probe() {
  return <span data-testid="ai">{useAIFeatures() ? 'on' : 'off'}</span>;
}

function SuggestionsProbe() {
  return <span data-testid="sg">{useBeatSuggestions() ? 'on' : 'off'}</span>;
}

// Node 25 exposes its own global localStorage that throws without
// --localstorage-file; give each test a fresh in-memory Storage.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('Show AI features', () => {
  it('is on until switched off, and is remembered', () => {
    expect(aiFeaturesEnabled()).toBe(true);
    setAIFeaturesEnabled(false);
    expect(localStorage.getItem('asaps_ai_features')).toBe('off');
    expect(aiFeaturesEnabled()).toBe(false);
    setAIFeaturesEnabled(true);
    expect(localStorage.getItem('asaps_ai_features')).toBeNull();
  });

  it('updates what is on screen when switched, here or in another window', () => {
    render(<Probe />);
    expect(screen.getByTestId('ai').textContent).toBe('on');
    act(() => setAIFeaturesEnabled(false));
    expect(screen.getByTestId('ai').textContent).toBe('off');
    // Another window switched it back on.
    act(() => {
      localStorage.removeItem('asaps_ai_features');
      window.dispatchEvent(new StorageEvent('storage', { key: 'asaps_ai_features' }));
    });
    expect(screen.getByTestId('ai').textContent).toBe('on');
  });

  it('beat suggestions have their own switch, and go with the AI features too', () => {
    render(<SuggestionsProbe />);
    const shown = () => screen.getByTestId('sg').textContent;
    expect(shown()).toBe('on');
    act(() => setBeatSuggestionsEnabled(false));
    expect(shown()).toBe('off');
    expect(aiFeaturesEnabled()).toBe(true);
    act(() => setBeatSuggestionsEnabled(true));
    act(() => setAIFeaturesEnabled(false));
    expect(shown()).toBe('off');
    act(() => setAIFeaturesEnabled(true));
    expect(shown()).toBe('on');
  });
});
