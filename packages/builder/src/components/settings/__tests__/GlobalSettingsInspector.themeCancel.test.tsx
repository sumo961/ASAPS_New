/**
 * Picking a theme takes effect at once (the project's picture copy follows
 * it), its fonts, sizes and colours only on Save. Closing Project Settings
 * without saving puts back the theme and theme pictures of the last save
 * (2026-10-28: an imported kit's frame over the previous theme's fonts).
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../hooks/useThemes', () => ({
  useThemes: () => ({
    themes: [
      { id: 'kit-a', name: 'Kit A', source: 'imported' },
      { id: 'kit-b', name: 'Kit B', source: 'imported' },
    ],
    selectedThemeId: 'kit-a', loading: false, error: null, themeAssets: null,
    selectTheme: vi.fn(), getTheme: vi.fn(),
    applyThemeToSettings: vi.fn(async (_id: string, s: any) => ({ ...s, fonts: { ...s.fonts, textFont: 'Kit B Sans' } })),
    saveAsTheme: vi.fn(), refresh: vi.fn(), isBuiltIn: () => false,
    loadThemeAssets: vi.fn(async () => null), clearSelection: vi.fn(),
  }),
}));

import { GlobalSettingsInspector } from '../GlobalSettingsInspector';
import { ProjectAssetsProvider } from '../../../contexts/ProjectAssetsContext';
import { normalizeGlobalSettings } from '../../../utils/themeConverter';

const kitAPictures = { fromThemeId: 'kit-a', textboxFrameAssetId: 'asset_frame_a' };

function open() {
  const handlers = { onUpdate: vi.fn(), onClose: vi.fn(), onThemeChange: vi.fn(), onRevertTheme: vi.fn() };
  const settings = { ...normalizeGlobalSettings(undefined), themeGraphics: kitAPictures };
  render(
    <ProjectAssetsProvider assets={[]} onAssetAdd={async () => true}>
      <GlobalSettingsInspector settings={settings} assets={[]} themeId="kit-a" {...handlers} />
    </ProjectAssetsProvider>,
  );
  return handlers;
}

async function pickKitB(h: ReturnType<typeof open>) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Kit A' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Kit B' }));
  await waitFor(() => expect(h.onThemeChange).toHaveBeenCalledWith('kit-b'));
}

describe('closing Project Settings without saving', () => {
  it('Cancel after picking a theme puts back the saved theme and its pictures', async () => {
    const h = open();
    await pickKitB(h);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onRevertTheme).toHaveBeenCalledWith('kit-a', kitAPictures);
    expect(h.onClose).toHaveBeenCalled();
  });

  it('after Save the picked theme stays', async () => {
    const h = open();
    await pickKitB(h);
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/ }));
    expect(h.onUpdate.mock.calls[0][0].fonts.textFont).toBe('Kit B Sans');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onRevertTheme).not.toHaveBeenCalled();
    expect(h.onClose).toHaveBeenCalled();
  });

  it('closing without a theme change touches nothing', () => {
    const h = open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onRevertTheme).not.toHaveBeenCalled();
    expect(h.onThemeChange).not.toHaveBeenCalled();
  });
});

describe('an import finishing after the window closed', () => {
  it('does not switch the theme', async () => {
    const h = open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // The window is closed; a late theme pick from a running import:
    fireEvent.click(screen.getAllByRole('button', { name: 'Kit A' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Kit B' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.onThemeChange).not.toHaveBeenCalled();
  });
});

describe('choosing no theme (Custom)', () => {
  it('can be saved, and Cancel without saving puts the theme back', async () => {
    const h = open();
    fireEvent.click(screen.getAllByRole('button', { name: 'Kit A' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Custom \(No Theme\)/ }));
    expect(h.onThemeChange).toHaveBeenCalledWith(undefined);
    const save = screen.getByRole('button', { name: /Save Settings/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onRevertTheme).toHaveBeenCalledWith('kit-a', kitAPictures);
  });
});
