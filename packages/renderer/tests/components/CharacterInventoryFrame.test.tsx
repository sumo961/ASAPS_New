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

describe('folding on any screen', () => {
  it('folds when its title is clicked and stays folded on the next beat', () => {
    const first = renderInv({ title: 'Satchel', config: config({ screenPosition: 'screen-top-right' } as any) });
    fireEvent.click(screen.getByText('Satchel'));
    expect(first.container.querySelector('[data-hud-frame]')?.getAttribute('title')).toContain('Satchel');
    first.unmount();
    // The next beat draws the frame again: still folded until opened.
    const next = renderInv({ title: 'Satchel', config: config({ screenPosition: 'screen-top-right' } as any) });
    const badge = next.container.querySelector('[data-hud-frame]') as HTMLElement;
    expect(screen.queryByText('Satchel')).toBeNull();
    fireEvent.click(badge);
    expect(screen.getByText('Satchel')).toBeTruthy();
  });

  it('folds into the open frame\'s top-right corner', () => {
    const view = renderInv({ title: 'Pouch', config: config({ screenPosition: 'screen-top-left', offset: { x: 20, y: 30 } } as any) });
    const open = view.container.querySelector('[data-hud-frame]') as HTMLElement;
    const right = parseFloat(open.style.left) + parseFloat(open.style.width);
    const top = open.style.top;
    fireEvent.click(screen.getByText('Pouch'));
    const badge = view.container.querySelector('[data-hud-frame]') as HTMLElement;
    expect(parseFloat(badge.style.left) + parseFloat(badge.style.width)).toBe(right);
    expect(badge.style.top).toBe(top);
  });
});

describe('staying on the stage', () => {
  it('leaves room for the whole frame above the stage\'s bottom edge', () => {
    // A character standing on the bottom edge, the frame beside them.
    const view = renderInv({
      config: config({ dockMode: 'character', anchor: 'bottom-right', showLabels: false }),
      characterPosition: { x: 300, y: 768 },
      characterDimensions: { width: 200, height: 400 },
      containerDimensions: { width: 1024, height: 768 },
    });
    const frame = view.container.querySelector('[data-hud-frame="inventory"]') as HTMLElement;
    // As drawn: title line 18 + 4 + rule 1 + 6, one row of 48, padding 8 twice, border 1 twice.
    const drawn = 18 + 4 + 1 + 6 + 48 + 16 + 2;
    expect(frame.style.lineHeight || (frame.firstElementChild as HTMLElement).style.lineHeight).toBe('18px');
    expect(parseFloat(frame.style.top) + drawn).toBeLessThanOrEqual(768);
  });
});

describe('a stage that turns out to be phone-sized', () => {
  it('folds once that is known', () => {
    const view = renderInv({ config: config({ dockMode: 'character' }) });
    expect(view.container.querySelector('[data-hud-frame="inventory"]')!.textContent).toContain('Brass Key');
    view.rerender(
      <CharacterInventoryFrame items={[item()]} config={config({ dockMode: 'character' })} characterPosition={{ x: 100, y: 100 }}
        characterDimensions={{ width: 80, height: 120 }} containerDimensions={{ width: 390, height: 740 }} autoMinimize />,
    );
    expect(view.container.querySelector('[data-hud-frame="inventory"]')!.textContent).not.toContain('Brass Key');
  });

  it('stays open when the player opened it', () => {
    const props = { items: [item()], config: config({ dockMode: 'character', anchor: 'top' }), characterPosition: { x: 100, y: 300 }, characterDimensions: { width: 80, height: 120 }, containerDimensions: { width: 390, height: 740 } };
    const view = render(<CharacterInventoryFrame {...props} autoMinimize />);
    fireEvent.click(view.container.querySelector('[data-hud-frame="inventory"]')!);
    expect(view.container.textContent).toContain('Brass Key');
    view.rerender(<CharacterInventoryFrame {...props} autoMinimize={false} />);
    view.rerender(<CharacterInventoryFrame {...props} autoMinimize />);
    expect(view.container.textContent).toContain('Brass Key');
  });
});
