/**
 * Mount + content-render tests for SlotFlowView (2174-line responsive slot
 * layout). Slots come from the real getSlotSpec(beatType); we assert the beat
 * content lands in the composed slots and that an action button (when present)
 * fires onAction. Browser-API gaps stubbed via installRendererDomStubs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { SlotFlowView } from '../../src/components/SlotFlowView';
import { getSlotSpec } from '../../src/utils/slotLayout';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';

beforeEach(() => installRendererDomStubs());

const slots = (beatType: string) => getSlotSpec(beatType)!;

describe('SlotFlowView', () => {
  it('composes infoText body content into the slot layout', async () => {
    const { container } = render(
      <SlotFlowView
        beatType="infoText"
        slots={slots('infoText')}
        content={{ text: 'A quiet morning in the harbor.', buttonText: 'Continue' }}
        backgroundColor="#101010"
        onAction={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain('A quiet morning in the harbor.'));
  });

  it('renders the action button label (read-gate off)', async () => {
    const { container } = render(
      <SlotFlowView
        beatType="infoText"
        slots={slots('infoText')}
        content={{ text: 'Short.', buttonText: 'Proceed' }}
        backgroundColor="#101010"
        requireFullRead={false as any}
        onAction={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain('Proceed'));
  });

  it('fires onAction when the continue button is clicked', async () => {
    const onAction = vi.fn();
    const { container } = render(
      <SlotFlowView
        beatType="infoText"
        slots={slots('infoText')}
        content={{ text: 'Short.', buttonText: 'Proceed' }}
        backgroundColor="#101010"
        requireFullRead={false as any}
        onAction={onAction}
      />,
    );
    const btn = await waitFor(() => {
      const b = Array.from(container.querySelectorAll('button')).find((el) => /proceed/i.test(el.textContent || ''));
      if (!b) throw new Error('button not yet mounted');
      return b as HTMLButtonElement;
    });
    fireEvent.click(btn);
    await waitFor(() => expect(onAction).toHaveBeenCalled());
  });

  it('paints the backdrop color when there is no background image', async () => {
    const { container } = render(
      <SlotFlowView
        beatType="infoText"
        slots={slots('infoText')}
        content={{ text: 'x', buttonText: 'Go' }}
        backgroundColor="rgb(8, 8, 8)"
        onAction={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('*')).toBeTruthy());
    expect(container.innerHTML).toContain('rgb(8, 8, 8)');
  });
});

describe('SlotFlowView — free-positioned sprite layer', () => {
  const propLoc = {
    id: 'element_1', kind: 'prop', name: 'statue.png',
    x: 201, y: 380, width: 622, height: 401, zIndex: 0,
    assetId: 'asset-statue', imageUrl: 'blob:stale',
  } as any;
  const charLoc = {
    id: 'element_2', kind: 'character', name: 'guide',
    x: 10, y: 10, width: 100, height: 200, zIndex: 3,
    characterId: 'char-guide',
  } as any;

  it('mounts the sprite layer and resolves a prop through assetResolver (not the stale imageUrl)', async () => {
    const { container } = render(
      <SlotFlowView
        beatType="inputText"
        slots={slots('inputText')}
        content={{ prompt: 'Why did you choose this object?', buttonText: 'Continue' }}
        backgroundColor="#101010"
        requireFullRead={false as any}
        onAction={vi.fn()}
        characterLocations={[propLoc]}
        assetResolver={(id) => (id === 'asset-statue' ? 'https://cdn.test/statue.png' : undefined)}
      />,
    );
    const img = await waitFor(() => {
      const el = container.querySelector('[data-layer="characters"] img[data-character-name="statue.png"]') as HTMLImageElement | null;
      if (!el) throw new Error('sprite not mounted');
      return el;
    });
    expect(img.getAttribute('src')).toBe('https://cdn.test/statue.png');
  });

  it('stacks content rows above the sprite layer (prompt and input field in front of a prop)', async () => {
    const { container } = render(
      <SlotFlowView
        beatType="inputText"
        slots={slots('inputText')}
        content={{ prompt: 'Why did you choose this object?', buttonText: 'Continue' }}
        backgroundColor="#101010"
        requireFullRead={false as any}
        onAction={vi.fn()}
        characterLocations={[propLoc]}
        assetResolver={() => 'https://cdn.test/statue.png'}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-layer="characters"]')).toBeTruthy());
    const layer = container.querySelector('[data-layer="characters"]') as HTMLElement;
    expect(Number(layer.style.zIndex)).toBe(1);
    const rows = Array.from(container.querySelectorAll('[data-slotflow-slot]')) as HTMLElement[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.style.position).toBe('relative');
      expect(Number(row.style.zIndex)).toBeGreaterThan(1);
    }
  });

  it('orders sprites by location.zIndex inside the layer', async () => {
    const { container } = render(
      <SlotFlowView
        beatType="infoText"
        slots={slots('infoText')}
        content={{ text: 'x', buttonText: 'Go' }}
        backgroundColor="#101010"
        onAction={vi.fn()}
        characterLocations={[charLoc, propLoc]}
        assetResolver={() => 'https://cdn.test/statue.png'}
        characterResolver={() => 'https://cdn.test/guide.png'}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll('[data-layer="characters"] img').length).toBe(2));
    const imgs = Array.from(container.querySelectorAll('[data-layer="characters"] img')) as HTMLImageElement[];
    // paint order low → high z: the prop (z0) first, the character (z3) last
    expect(imgs.map(i => i.getAttribute('data-character-name'))).toEqual(['statue.png', 'guide']);
    expect(imgs.map(i => Number(i.style.zIndex))).toEqual([0, 3]);
  });

  it('editor mode: highlights the selected sprite and reports clicks through onElementSelect', async () => {
    const onElementSelect = vi.fn();
    const { container } = render(
      <SlotFlowView
        beatType="infoText"
        slots={slots('infoText')}
        content={{ text: 'x', buttonText: 'Go' }}
        backgroundColor="#101010"
        onAction={vi.fn()}
        editorMode
        selectedElementName="statue.png"
        onElementSelect={onElementSelect}
        characterLocations={[propLoc]}
        assetResolver={() => 'https://cdn.test/statue.png'}
      />,
    );
    const img = await waitFor(() => {
      const el = container.querySelector('[data-layer="characters"] img') as HTMLImageElement | null;
      if (!el) throw new Error('sprite not mounted');
      return el;
    });
    expect(img.style.outline).toContain('2px solid');
    fireEvent.click(img);
    expect(onElementSelect).toHaveBeenCalledWith('statue.png');
  });
});
