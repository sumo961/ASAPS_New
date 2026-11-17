/**
 * Project Settings tabs after the regrouping: what a setting does decides
 * where it is, and nothing is left on a Debug tab.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../hooks/useThemes', () => ({
  useThemes: () => ({
    themes: [], selectedThemeId: 'builtin-ink-and-brass', loading: false, error: null, themeAssets: null,
    selectTheme: vi.fn(), getTheme: vi.fn(), applyThemeToSettings: vi.fn(), saveAsTheme: vi.fn(),
    refresh: vi.fn(), isBuiltIn: () => true, loadThemeAssets: vi.fn(async () => null), clearSelection: vi.fn(),
  }),
}));

import { GlobalSettingsInspector } from '../GlobalSettingsInspector';
import { ProjectAssetsProvider } from '../../../contexts/ProjectAssetsContext';
import { normalizeGlobalSettings } from '../../../utils/themeConverter';

function open(beats: any[] = []) {
  render(
    <ProjectAssetsProvider assets={[]} onAssetAdd={async () => true}>
      <GlobalSettingsInspector settings={normalizeGlobalSettings(undefined)} onUpdate={vi.fn()} onClose={() => {}} assets={[]} themeId="builtin-ink-and-brass" beats={beats} />
    </ProjectAssetsProvider>,
  );
}
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent?.trim());

describe('Project Settings tabs', () => {

  it('has the regrouped tabs and no Debug, Effects or HUD tab', () => {
    open();
    expect(tabNames()).toEqual(['Project', 'Look', 'Dialogue', 'Screen panels', 'Sound', 'Languages & culture', 'About']);
  });

  it('sets where the story starts on the Project tab', () => {
    open();
    expect(screen.getByTestId('setting-story-start').textContent).toContain('Story starts at');
  });

  it('keeps message history with the speaker settings under Dialogue', () => {
    open();
    fireEvent.click(tab(/^Dialogue$/));
    expect(screen.getByTestId('setting-message-history')).toBeTruthy();
    expect(screen.getByText('Speaker Display')).toBeTruthy();
    fireEvent.click(tab(/^Screen panels$/));
    expect(screen.queryByTestId('setting-message-history')).toBeNull();
  });

  it('has text motion and hotspots as sections of Look', () => {
    open();
    fireEvent.click(tab(/^Look$/));
    fireEvent.click(tab(/Text & button motion/));
    expect(screen.getByText('Text Animation')).toBeTruthy();
    fireEvent.click(tab(/^Hotspots$/));
    expect(screen.getByText('Hotspot Opacity')).toBeTruthy();
  });

  it('turns the Knowledge Graph view on under Languages & culture', () => {
    open();
    fireEvent.click(tab(/Languages & culture/));
    expect(screen.getByText(/Show Knowledge Graph view/)).toBeTruthy();
  });

  it('starts another tab at its top', () => {
    open();
    fireEvent.click(tab(/^Dialogue$/));
    const scroller = screen.getByTestId('setting-message-history').closest('.overflow-y-auto') as HTMLElement;
    scroller.scrollTop = 300;
    fireEvent.click(tab(/^Screen panels$/));
    expect(scroller.scrollTop).toBe(0);
  });

  it('shows Location & AR only for a story with location beats', () => {
    open([{ id: 'b1', type: 'gpsLocation', name: 'Harbour' }]);
    expect(tabNames()).toContain('Location & AR');
  });
});
