/**
 * Tests for MissingAssetsDialog — lists missing project assets and offers
 * per-file "Locate" / bulk "Remove Missing" repair. Props-only; file ops go
 * through window.electronAPI which we stub. Covers the closed/empty null
 * guards, the list + count, close (with onRepaired only when something was
 * resolved), the locate flow (copies file + drops the row), and remove-missing
 * (rewrites the manifest → clears + onRepaired/onClose).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MissingAssetsDialog } from '../MissingAssetsDialog';

const entry = (id: string, filename: string, folder = 'nodes') =>
  ({ id, filename, type: 'image', folder }) as any;

let api: any;
beforeEach(() => {
  api = {
    path: { sep: '/' },
    dialog: { open: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/src/found.png'] }) },
    fs: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  };
  (window as any).electronAPI = api;
});
afterEach(() => {
  delete (window as any).electronAPI;
});

const props = (over: any = {}) => ({
  isOpen: true,
  missing: [entry('a1', 'bg.png'), entry('a2', 'hero.png', 'characters')],
  assetsPath: '/proj',
  onClose: vi.fn(),
  onRepaired: vi.fn(),
  ...over,
});

describe('MissingAssetsDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<MissingAssetsDialog {...props({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there are no missing assets', () => {
    const { container } = render(<MissingAssetsDialog {...props({ missing: [] })} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists the missing assets with a count', () => {
    const { getByText } = render(<MissingAssetsDialog {...props()} />);
    expect(getByText('Missing Assets')).toBeTruthy();
    expect(getByText(/2 assets not found/)).toBeTruthy();
    expect(getByText('bg.png')).toBeTruthy();
    expect(getByText('hero.png')).toBeTruthy();
  });

  it('Close fires onClose, and not onRepaired when nothing was resolved', () => {
    const p = props();
    const { getByText } = render(<MissingAssetsDialog {...p} />);
    fireEvent.click(getByText('Close'));
    expect(p.onClose).toHaveBeenCalled();
    expect(p.onRepaired).not.toHaveBeenCalled();
  });

  it('locating a file copies it and drops the row', async () => {
    const { getAllByText, queryByText } = render(<MissingAssetsDialog {...props()} />);
    fireEvent.click(getAllByText('Locate')[0]); // a1 / bg.png
    await waitFor(() => expect(queryByText('bg.png')).toBeNull());
    expect(api.fs.writeFile).toHaveBeenCalled();
    expect(queryByText('hero.png')).not.toBeNull(); // the other remains
  });

  it('Close after resolving one signals onRepaired', async () => {
    const p = props();
    const { getAllByText, getByText, queryByText } = render(<MissingAssetsDialog {...p} />);
    fireEvent.click(getAllByText('Locate')[0]);
    await waitFor(() => expect(queryByText('bg.png')).toBeNull());
    fireEvent.click(getByText('Close'));
    expect(p.onRepaired).toHaveBeenCalled();
  });

  it('Remove Missing rewrites the manifest then clears + closes', async () => {
    api.fs.readFile.mockResolvedValue(JSON.stringify({ assets: { a1: {}, a2: {} } }));
    const p = props();
    const { getByText } = render(<MissingAssetsDialog {...p} />);
    fireEvent.click(getByText('Remove Missing'));
    await waitFor(() => expect(p.onRepaired).toHaveBeenCalled());
    expect(api.fs.writeFile).toHaveBeenCalled();
    const written = JSON.parse(api.fs.writeFile.mock.calls.at(-1)![1]);
    expect(written.assets).toEqual({}); // both removed
    expect(p.onClose).toHaveBeenCalled();
  });
});
