/**
 * Pinned choice buttons (slotIntent[action].buttonAnchors keyed by choice id):
 * a multiChoice choice can leave the shared button row and sit on its own
 * anchor. Choices pinned to the same spot share one column; a pinned choice
 * still routes by id, dims when visited, and stays hidden (but laid out, so
 * the flow can make room) until the read-gate is earned.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { SlotFlowView } from '../../src/components/SlotFlowView';
import { getSlotSpec } from '../../src/utils/slotLayout';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';

beforeEach(() => installRendererDomStubs());

const choices = [
  { id: 'c1', text: 'Ask about the letter' },
  { id: 'c2', text: 'Leave quietly' },
  { id: 'c3', text: 'Look at the map' },
];

const mount = (props: Record<string, unknown> = {}) =>
  render(
    <SlotFlowView
      beatType="multiChoice"
      slots={getSlotSpec('multiChoice')!}
      content={{ question: 'What do you say?' }}
      backgroundColor="#101010"
      dynamicChoices={choices}
      requireFullRead={false}
      slotIntent={{
        actions: {
          buttonAnchors: {
            c2: { h: 'right', v: 'top', relativeTo: 'stage', gap: 16 },
            c3: { h: 'right', v: 'top', relativeTo: 'stage', gap: 16 },
          },
        },
      }}
      onAction={vi.fn()}
      {...props}
    />,
  );

const pinnedGroups = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-slotflow-pinned]'));

describe('SlotFlowView — pinned choices', () => {
  it('lifts pinned choices out of the row and stacks same-spot pins in one column', async () => {
    const { container } = mount();
    await waitFor(() => expect(pinnedGroups(container)).toHaveLength(1));
    const group = pinnedGroups(container)[0];
    expect(group.getAttribute('data-slotflow-pinned')).toBe('top|right|16');
    expect(Array.from(group.querySelectorAll('button')).map(b => b.textContent))
      .toEqual(['Leave quietly', 'Look at the map']);
    const row = container.querySelector('[data-slotflow-slot="actions"]')!;
    expect(Array.from(row.querySelectorAll('button')).map(b => b.textContent))
      .toEqual(['Ask about the letter']);
  });

  it('gives a pin with an explicit offset its own box', async () => {
    const { container } = mount({
      slotIntent: {
        actions: {
          buttonAnchors: {
            c2: { h: 'right', v: 'top', relativeTo: 'stage' },
            c3: { h: 'right', v: 'top', relativeTo: 'stage', offset: { y: 80 } },
          },
        },
      },
    });
    await waitFor(() => expect(pinnedGroups(container)).toHaveLength(2));
  });

  it('routes a click on a pinned choice by its id', async () => {
    const onAction = vi.fn();
    const { container } = mount({ onAction });
    const btn = await waitFor(() => {
      const b = container.querySelector<HTMLButtonElement>('[data-slotflow-button="c3"]');
      if (!b) throw new Error('not mounted');
      return b;
    });
    fireEvent.click(btn);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('c3'));
  });

  it('dims and blocks a visited pinned choice like a row choice', async () => {
    const { container } = mount({ markVisited: true, visitedChoiceIds: ['c2'] });
    const btn = await waitFor(() => {
      const b = container.querySelector<HTMLButtonElement>('[data-slotflow-button="c2"]');
      if (!b) throw new Error('not mounted');
      return b;
    });
    expect(btn.disabled).toBe(true);
  });

  it('lays pinned choices out but keeps them hidden until the read-gate is earned', async () => {
    const { container } = mount({ requireFullRead: true });
    await waitFor(() => expect(pinnedGroups(container)).toHaveLength(1));
    const group = pinnedGroups(container)[0];
    // jsdom has no layout, so the gate stays unearned here: the row is not
    // there yet, the pinned column is present but invisible and inert.
    if (!container.querySelector('[data-slotflow-slot="actions"]')) {
      expect(group.style.visibility).toBe('hidden');
      expect(group.style.pointerEvents).toBe('none');
    } else {
      expect(group.style.visibility).not.toBe('hidden');
    }
  });
});
