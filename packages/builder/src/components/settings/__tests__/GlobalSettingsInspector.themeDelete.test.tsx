/**
 * Deleting an imported or saved theme from the Theme menu, with its
 * pictures and fonts (2026-10-28). The project keeps its own copies and
 * settings; it only stops naming the deleted theme.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const deleteTheme = vi.fn(async () => {});
const confirm = vi.fn(async () => true);

vi.mock('../../../hooks/useThemes', () => ({
  useThemes: () => ({
    themes: [
      { id: 'builtin-ink-and-brass', name: 'Ink & Brass', source: 'built-in' },
      { id: 'kit-a', name: 'Kit A', source: 'imported' },
      { id: 'kit-b', name: 'Kit B', source: 'imported' },
    ],
    selectedThemeId: 'kit-a', loading: false, error: null, themeAssets: null,
    selectTheme: vi.fn(), getTheme: vi.fn(), applyThemeToSettings: vi.fn(), saveAsTheme: vi.fn(),
    refresh: vi.fn(), isBuiltIn: (id: string) => id.startsWith('builtin-'),
    loadThemeAssets: vi.fn(async () => null), clearSelection: vi.fn(),
    countThemeFiles: vi.fn(async () => 7), deleteTheme,
  }),
}));

// The project's copies: the frame and the font of Kit A; Kit B (a re-import)
// has the same files.
const frame = { id: 'p-frame', name: 'textbox.png', type: 'image', size: 10, url: 'blob:f' };
const font = { id: 'p-font', name: 'Queen Serif.otf', type: 'font', size: 20, url: 'blob:q' };
const findThemeCopies = vi.fn(async () => [frame, font]);
vi.mock('../../../utils/themeGraphics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/themeGraphics')>()),
  findThemeCopies: (...args: unknown[]) => (findThemeCopies as any)(...args),
}));
vi.mock('../../../services/ThemeService', () => ({ getThemeService: () => ({ initialize: async () => {} }) }));

vi.mock('../../../utils/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/notify')>()),
  confirmAction: (opts: unknown) => confirm(opts),
}));

import { GlobalSettingsInspector } from '../GlobalSettingsInspector';
import { ProjectAssetsProvider } from '../../../contexts/ProjectAssetsContext';
import { normalizeGlobalSettings } from '../../../utils/themeConverter';

function open() {
  const handlers = { onUpdate: vi.fn(), onClose: vi.fn(), onThemeChange: vi.fn(), onRevertTheme: vi.fn(), onRemoveThemeCopies: vi.fn() };
  const base = normalizeGlobalSettings(undefined);
  const settings = { ...base, themeGraphics: { fromThemeId: 'kit-a', textboxFrameAssetId: 'p-frame' }, fonts: { ...base.fonts, titleFont: 'Queen Serif' } };
  render(
    <ProjectAssetsProvider assets={[frame as any, font as any]} onAssetAdd={async () => true}>
      <GlobalSettingsInspector settings={settings} assets={[frame as any, font as any]} themeId="kit-a" {...handlers} />
    </ProjectAssetsProvider>,
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Kit A' })[0]);
  return handlers;
}

beforeEach(() => { deleteTheme.mockClear(); confirm.mockClear(); confirm.mockResolvedValue(true); });

describe('deleting a theme', () => {
  it('only imported and saved themes can be deleted', () => {
    open();
    expect(screen.getByRole('button', { name: 'Delete the theme Kit A' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete the theme Ink & Brass' })).toBeNull();
  });

  it('another theme: its copies go, except those the current theme uses too', async () => {
    const h = open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete the theme Kit B' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    const opts = confirm.mock.calls[0][0] as { title: string; message: string; confirmLabel: string };
    expect(opts.title).toBe('Delete the theme "Kit B"?');
    expect(opts.message).toMatch(/with the 7 files it brought/);
    expect(opts.message).toMatch(/2 copies that this project's current theme also uses stay/);
    await waitFor(() => expect(deleteTheme).toHaveBeenCalledWith('kit-b'));
    expect(h.onRemoveThemeCopies).not.toHaveBeenCalled();     // both are in use by Kit A
    expect(h.onThemeChange).not.toHaveBeenCalled();
  });

  it('the project\'s own theme: it says so first, then removes the copies too', async () => {
    const h = open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete the theme Kit A' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    const opts = confirm.mock.calls[0][0] as { title: string; message: string; confirmLabel: string };
    expect(opts.title).toBe('This project uses the theme "Kit A"');
    expect(opts.message).toMatch(/removes its 2 picture and font files from this project/);
    expect(opts.confirmLabel).toBe('Delete theme and its files');
    await waitFor(() => expect(h.onRemoveThemeCopies).toHaveBeenCalledWith([frame, font]));
    expect(deleteTheme).toHaveBeenCalledWith('kit-a');
    expect(h.onThemeChange).toHaveBeenCalledWith(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onRevertTheme).not.toHaveBeenCalled();
  });

  it('nothing happens when the question is answered with Cancel', async () => {
    const h = open();
    confirm.mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete the theme Kit A' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(deleteTheme).not.toHaveBeenCalled();
    expect(h.onRemoveThemeCopies).not.toHaveBeenCalled();
  });
});
