/**
 * Tests for CharacterInventoryFrame — the inventory HUD (grid of item slots,
 * optional labels/quantities, asset-resolved icons, and an auto-minimize
 * badge that expands on click). Pure presentational + a minimize toggle.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CharacterInventoryFrame,
  type CharacterInventoryFrameProps,
  type InventoryFrameConfig,
  type InventoryItemData,
} from '../../src/components/CharacterInventoryFrame';

const style = {
  backgroundColor: '#222222',
  borderColor: '#888888',
  borderWidth: 1,
  borderRadius: 8,
  padding: 8,
  opacity: 100,
};

const config = (over: Partial<InventoryFrameConfig> = {}): InventoryFrameConfig => ({
  dockMode: 'screen',
  anchor: 'bottom',
  screenPosition: 'screen-top-left',
  offset: { x: 0, y: 0 },
  style,
  itemSize: 48,
  columns: 4,
  itemSpacing: 6,
  showLabels: true,
  ...(over as any),
});

const item = (over: Partial<InventoryItemData> = {}): InventoryItemData => ({
  id: 'i1',
  name: 'key',
  displayName: 'Brass Key',
  description: 'opens something',
  icon: '',
  quantity: 1,
  category: 'misc',
  ...over,
});

function renderInv(over: Partial<CharacterInventoryFrameProps> = {}) {
  return render(
    <CharacterInventoryFrame
      items={[item()]}
      config={config()}
      characterPosition={{ x: 100, y: 100 }}
      characterDimensions={{ width: 80, height: 120 }}
      containerDimensions={{ width: 1024, height: 768 }}
      {...over}
    />,
  );
}

describe('visibility', () => {
  it('renders nothing when there are no items', () => {
    const { container } = renderInv({ items: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when isVisible is false', () => {
    const { container } = renderInv({ isVisible: false });
    expect(container.firstChild).toBeNull();
  });
});

describe('expanded view', () => {
  it('shows the default header title and item label', () => {
    renderInv();
    expect(screen.getByText('Inventory')).toBeDefined();
    expect(screen.getByText('Brass Key')).toBeDefined();
  });

  it('uses a custom title', () => {
    renderInv({ title: 'Satchel' });
    expect(screen.getByText('Satchel')).toBeDefined();
  });

  it('shows a quantity badge only when quantity > 1', () => {
    renderInv({ items: [item({ quantity: 7 })] });
    expect(screen.getByText('7')).toBeDefined();
  });

  it('renders an icon image (alt = displayName) when the item has an icon', () => {
    const { container } = renderInv({ items: [item({ icon: 'http://x/key.png' })] });
    expect(container.querySelector('img[alt="Brass Key"]')).not.toBeNull();
  });

  it('resolves a missing icon via assetResolver', () => {
    const assetResolver = vi.fn((name: string) => (name === 'key' ? 'http://r/key.png' : undefined));
    const { container } = renderInv({ items: [item({ icon: '' })], assetResolver });
    expect(assetResolver).toHaveBeenCalledWith('key');
    expect(container.querySelector('img[src="http://r/key.png"]')).not.toBeNull();
  });
});

describe('auto-minimize', () => {
  it('starts as a collapsed badge and expands on click', () => {
    renderInv({ autoMinimize: true });
    // collapsed: the grid (and its labels) are not rendered yet
    expect(screen.queryByText('Brass Key')).toBeNull();
    // the badge carries an expand title
    const badge = screen.getByTitle(/click to expand/i);
    fireEvent.click(badge);
    // now expanded
    expect(screen.getByText('Brass Key')).toBeDefined();
  });

  it('clicking the header re-minimizes when autoMinimize is on', () => {
    renderInv({ autoMinimize: true });
    fireEvent.click(screen.getByTitle(/click to expand/i)); // expand
    const header = screen.getByText(/Inventory/); // header shows "Inventory ▼"
    fireEvent.click(header);
    // back to the collapsed badge
    expect(screen.queryByText('Brass Key')).toBeNull();
    expect(screen.getByTitle(/click to expand/i)).toBeDefined();
  });
});
