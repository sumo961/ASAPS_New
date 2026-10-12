/**
 * Pinned choice buttons (slotIntent[action].buttonAnchors keyed by choice id):
 * a multiChoice choice can leave the shared button row and sit on its own
 * anchor. Choices pinned to the same spot share one column; a pinned choice
 * still routes by id, dims when visited, and stays hidden (but laid out, so
 * the flow can make room) until the read-gate is earned.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { SlotFlowView, stackPinnedGroups, computeFlowReserve } from '../../src/components/SlotFlowView';
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

  it('stacks a pin below host chrome in its corner (the exported player\'s Menu button)', async () => {
    const { container } = mount({
      previewWidth: 1300,
      previewHeight: 613,
      // Menu button, top-right, as WebPlayer reserves it.
      reservedHudRects: [{ x: 1232, y: 8, width: 60, height: 37 }],
    });
    await waitFor(() => expect(pinnedGroups(container)).toHaveLength(1));
    const top = pinnedGroups(container)[0].style.top;
    // 8 + 37 + 8 = 53px clear of the stage top, instead of the 16px gap.
    expect(top).toContain('53px');
  });

  it('leaves a pin alone when the host chrome is in another corner', async () => {
    const { container } = mount({
      previewWidth: 1300,
      previewHeight: 613,
      reservedHudRects: [{ x: 8, y: 8, width: 60, height: 37 }],
    });
    await waitFor(() => expect(pinnedGroups(container)).toHaveLength(1));
    expect(pinnedGroups(container)[0].style.top).toContain('16px');
  });

  it('stacks groups in different corners of one edge when they meet sideways (narrow phone)', () => {
    // 390px stage: bottom-left 16..208, bottom-right 51..374 — same row.
    expect(stackPinnedGroups([
      { key: 'bottom|left|16', edge: 'bottom', base: 16, x: 16, width: 192, height: 44 },
      { key: 'bottom|right|16', edge: 'bottom', base: 16, x: 51, width: 323, height: 44 },
      { key: 'top|right|16', edge: 'top', base: 53, x: 232, width: 142, height: 44 },
    ])).toEqual({ 'bottom|right|16': 52 }); // 16 + 44 + 8 = 68 from the edge
  });

  it('leaves corners alone when there is room between them', () => {
    expect(stackPinnedGroups([
      { key: 'bottom|left|16', edge: 'bottom', base: 16, x: 16, width: 240, height: 44 },
      { key: 'bottom|right|16', edge: 'bottom', base: 16, x: 896, width: 388, height: 44 },
    ])).toEqual({});
  });

  it('steps around one narrow corner box sideways on a wide stage', () => {
    expect(computeFlowReserve([{ x: 16, y: 708, width: 229, height: 44 }], 1024, 768))
      .toEqual({ top: 0, bottom: 0, left: 253, right: 0 });
  });

  it('falls back to bands when left and right indents together would starve the column', () => {
    // Each box alone could be stepped around (1024 - 245 >= 520); both
    // together leave 1024 - 253 - 399 < 520, so both become a bottom band.
    expect(computeFlowReserve([
      { x: 16, y: 708, width: 229, height: 44 },
      { x: 633, y: 708, width: 375, height: 44 },
    ], 1024, 768)).toEqual({ top: 0, bottom: 68, left: 0, right: 0 });
  });
});
