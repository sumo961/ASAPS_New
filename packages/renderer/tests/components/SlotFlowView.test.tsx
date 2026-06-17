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
