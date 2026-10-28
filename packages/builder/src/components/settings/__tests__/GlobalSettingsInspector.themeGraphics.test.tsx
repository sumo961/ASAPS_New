/**
 * Project Settings ▸ Text Box ▸ Pictures: the frame and button pictures a
 * Ren'Py theme brought (or chosen by hand), kept in the project.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

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

const frame = { id: 'asset_frame', name: 'textbox.png', type: 'image', url: 'blob:frame', size: 1, uploadedAt: new Date() } as any;

function open(themeGraphics?: any) {
  const onUpdate = vi.fn();
  const settings = { ...normalizeGlobalSettings(undefined), ...(themeGraphics ? { themeGraphics } : {}) };
  render(
    <ProjectAssetsProvider assets={[frame]} onAssetAdd={async () => true}>
      <GlobalSettingsInspector settings={settings} onUpdate={onUpdate} onClose={() => {}} assets={[frame]} themeId="builtin-ink-and-brass" />
    </ProjectAssetsProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Text Box/ }));
  return onUpdate;
}

describe('Text Box ▸ Pictures', () => {
  it('shows the frame the project keeps and draws the preview with it', () => {
    open({ fromThemeId: 'kit', textboxFrameAssetId: 'asset_frame', buttonSpacing: 23 });
    const field = screen.getByTestId('theme-frame-field');
    expect(within(field).getByText('textbox.png')).toBeTruthy();
    expect(screen.getByText('(with the frame picture)')).toBeTruthy();
  });

  it('removing the frame is saved as the author’s choice for the current theme', () => {
    const onUpdate = open({ fromThemeId: 'kit', textboxFrameAssetId: 'asset_frame' });
    fireEvent.click(within(screen.getByTestId('theme-frame-field')).getByLabelText('Remove the picture'));
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/ }));
    expect(onUpdate).toHaveBeenCalled();
    expect(onUpdate.mock.calls[0][0].themeGraphics).toEqual({ fromThemeId: 'builtin-ink-and-brass' });
  });
});
