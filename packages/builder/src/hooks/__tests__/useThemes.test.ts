/**
 * Tests for useThemes / useTheme — React hooks over the ThemeService singleton.
 * Runs against the real idb schema on fake-indexeddb. The singleton caches its
 * db handle, so afterEach must close() it BEFORE deleteDatabase() or the next
 * mount blocks on the open connection (see ThemeService gotcha).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useThemes, useTheme } from '../useThemes';
import { getThemeService } from '../../services/ThemeService';
import { deleteDatabase } from '../../storage/schema';

beforeEach(async () => {
  getThemeService().close();
  await deleteDatabase();
});

afterEach(async () => {
  getThemeService().close();
  await deleteDatabase();
});

const minimalSettings = () =>
  ({
    colors: {
      pcolor: '#3b82f6',
      palpha: 100,
      nonpcolor: '#16213e',
      nonpalpha: 90,
      ptextcolor: '',
      nonptextcolor: '#ffffff',
      bgColor: '#101010',
      textBoxBorder: '#4a90d9',
    },
    fonts: { titleFont: 'Georgia', textFont: 'Arial', btnFont: 'Verdana', fontSize: { title: 32, text: 16, button: 14 } },
    textbox: { borderWidth: 2, radius: 12, padding: 10, opacity: 95, position: 'bottom', hideTitleTextBox: false, boxVisibility: 'all' },
    textEffects: { animation: 'none', typewriterSpeed: 30, fadeInDuration: 300 },
    hotspots: { visible: true, labels: true, highlightColor: '#ffff00', opacity: 80, showInPreview: true, labelDisplay: 'hover' },
  }) as any;

describe('useThemes', () => {
  it('initializes and lists the built-in themes', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.themes.length).toBeGreaterThan(0);
    expect(result.current.themes.some((t) => t.source === 'built-in')).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('isBuiltIn recognizes the builtin- id prefix', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isBuiltIn('builtin-classic')).toBe(true);
    expect(result.current.isBuiltIn('custom-123')).toBe(false);
  });

  it('saveAsTheme persists a custom theme and refresh surfaces it', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let newId = '';
    await act(async () => {
      newId = await result.current.saveAsTheme(minimalSettings(), 'My Custom Theme');
    });
    expect(newId).toBeTruthy();

    await waitFor(() =>
      expect(result.current.themes.some((t) => t.id === newId && t.source === 'custom')).toBe(true),
    );
  });

  it('selectTheme resolves a theme and tracks the selection', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let savedId = '';
    await act(async () => {
      savedId = await result.current.saveAsTheme(minimalSettings(), 'Selectable');
    });

    let resolved: any = null;
    await act(async () => {
      resolved = await result.current.selectTheme(savedId);
    });
    expect(resolved?.meta.id).toBe(savedId);
    expect(result.current.selectedThemeId).toBe(savedId);
  });

  it('applyThemeToSettings converts a theme back into GlobalSettings', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let savedId = '';
    await act(async () => {
      savedId = await result.current.saveAsTheme(minimalSettings(), 'Applied');
    });

    let applied: any = null;
    await act(async () => {
      applied = await result.current.applyThemeToSettings(savedId, minimalSettings());
    });
    expect(applied).not.toBeNull();
    expect(applied.colors.bgColor).toBe('#101010');
    expect(result.current.selectedThemeId).toBe(savedId);
  });

  it('applyThemeToSettings returns null for a missing theme', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let applied: any = 'sentinel';
    await act(async () => {
      applied = await result.current.applyThemeToSettings('does-not-exist', minimalSettings());
    });
    expect(applied).toBeNull();
  });

  it('loadThemeAssets returns empty asset maps for a theme without assets', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let savedId = '';
    await act(async () => {
      savedId = await result.current.saveAsTheme(minimalSettings(), 'NoAssets');
    });

    let assets: any = null;
    await act(async () => {
      assets = await result.current.loadThemeAssets(savedId);
    });
    expect(assets).not.toBeNull();
    expect(assets.fonts.size).toBe(0);
    expect(assets.graphics.size).toBe(0);
  });

  it('clearSelection drops the selected theme and assets', async () => {
    const { result } = renderHook(() => useThemes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let savedId = '';
    await act(async () => {
      savedId = await result.current.saveAsTheme(minimalSettings(), 'ToClear');
      await result.current.selectTheme(savedId);
    });
    expect(result.current.selectedThemeId).toBe(savedId);

    act(() => result.current.clearSelection());
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.themeAssets).toBeNull();
  });
});

describe('useTheme', () => {
  it('resolves a theme by id', async () => {
    // Seed a theme via the service the hook reads from.
    const svc = getThemeService();
    await svc.initialize();
    const id = await svc.createTheme(
      { meta: { id: 'seed', name: 'Seed' }, colors: {}, fonts: {}, textBox: {}, button: {}, hotspot: {}, effects: {} } as any,
      'custom',
    );

    const { result } = renderHook(() => useTheme(id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.theme?.meta.id).toBe('seed');
    expect(result.current.error).toBeNull();
  });

  it('stays null with no id', async () => {
    const { result } = renderHook(() => useTheme(undefined));
    expect(result.current.loading).toBe(false);
    expect(result.current.theme).toBeNull();
  });
});
