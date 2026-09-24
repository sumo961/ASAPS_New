import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppPreferencesDialog } from '../AppPreferencesDialog';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null), key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, String(v)); },
  };
}
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

const noop = () => {};

describe('AppPreferencesDialog (browser build)', () => {
  it('summarises machine settings and routes Configure to the provider dialog', () => {
    localStorage.setItem('asaps_ai_config', JSON.stringify({ provider: 'openai', providerType: 'openai', model: 'gpt-6-astra', apiKey: 'k' }));
    const onOpenAIConfig = vi.fn();
    const onClose = vi.fn();
    render(<AppPreferencesDialog isOpen onClose={onClose} onOpenAIConfig={onOpenAIConfig} onOpenTTSConfig={noop} onOpenSTTConfig={noop} />);
    expect(screen.getByText('OpenAI · gpt-6-astra')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Configure…')[0]);
    expect(onClose).toHaveBeenCalled();
    expect(onOpenAIConfig).toHaveBeenCalled();
    // no desktop bridge → no update toggle
    expect(screen.queryByText('Check for updates automatically')).toBeNull();
    expect(screen.getByText(/saved in this browser/)).toBeTruthy();
  });

  it('MCP toggle persists and notifies App without a reload', () => {
    const heard: boolean[] = [];
    const onEvt = (e: Event) => heard.push((e as CustomEvent).detail.enabled);
    window.addEventListener('asaps:mcp-setting-changed', onEvt);
    render(<AppPreferencesDialog isOpen onClose={noop} onOpenAIConfig={noop} onOpenTTSConfig={noop} onOpenSTTConfig={noop} />);
    const sw = screen.getByRole('switch', { name: 'Claude Desktop integration' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(localStorage.getItem('asaps_mcp_enabled')).toBe('true');
    expect(heard).toEqual([true]);
    window.removeEventListener('asaps:mcp-setting-changed', onEvt);
  });
});
