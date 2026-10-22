/**
 * Inner voices in the Dialog Tree's slot layouts: earlier lines of the
 * exchange stack above the current one (out-loud lines dimmed, inner voices
 * as thoughts), the current inner line is tagged and drawn as a thought, and
 * the replies say whom they answer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SlotFlowView } from '../../src/components/SlotFlowView';
import type { SlotSpec } from '../../src/utils/slotLayout';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';
import { DEFAULT_THEME } from '../../src/components/PositionedBeatView';

beforeEach(() => installRendererDomStubs());

const slots: SlotSpec[] = [
  { name: 'speaker', role: 'speaker', source: 'speaker' },
  { name: 'text', role: 'body', source: 'text', grow: true, scroll: true },
  { name: 'actions', role: 'action' },
] as SlotSpec[];

const mount = (props: Record<string, unknown> = {}) =>
  render(
    <SlotFlowView
      beatType="dialogTree"
      slots={slots}
      layoutTemplate="conversation"
      content={{ speaker: 'The Quiet Voice', text: 'You could stay home and still care.' }}
      backgroundColor="#101010"
      theme={{ ...DEFAULT_THEME, speakerDisplay: { ...(DEFAULT_THEME as any).speakerDisplay, showNames: true } } as any}
      dynamicChoices={[{ id: 'stay', text: "I can't come over tonight." }]}
      requireFullRead={false}
      onAction={vi.fn()}
      {...props}
    />,
  );

const exchange = {
  earlier: [
    { speaker: 'Danny', text: 'Can you come over?' },
    { speaker: 'The Old Story', text: "What if tonight's the night?", inner: true, color: '#e0795b' },
  ],
  inner: true,
  color: '#7fb6e8',
  replyTo: 'Danny',
};

describe('SlotFlowView — inner voices', () => {
  it('stacks the exchange, tags inner voices and says whom the replies answer', async () => {
    const { container } = mount({ exchange });
    const lines = Array.from(container.querySelectorAll<HTMLElement>('[data-exchange-line]'));
    expect(lines.map((l) => l.getAttribute('data-exchange-line'))).toEqual(['spoken', 'inner']);
    expect(lines[0].textContent).toContain('Can you come over?');
    expect(lines[1].textContent).toContain('The Old Story · inner voice');

    const speaker = container.querySelector<HTMLElement>('[data-slotflow-slot="speaker"]')!;
    expect(speaker.textContent).toBe('The Quiet Voice · inner voice');
    const body = container.querySelector<HTMLElement>('[data-slotflow-slot="text"]')!;
    expect(body.style.fontStyle).toBe('italic');
    expect(body.style.border).toContain('dashed');

    await waitFor(() => expect(container.querySelector('[data-slotflow-reply-to]')?.textContent).toBe('Reply to Danny'));
  });

  it('draws an out-loud line as before', () => {
    const { container } = mount({ content: { speaker: 'Danny', text: 'Please.' } });
    expect(container.querySelector('[data-slotflow-exchange]')).toBeNull();
    expect(container.querySelector('[data-slotflow-reply-to]')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-slotflow-slot="speaker"]')!.textContent).toBe('Danny');
    expect(container.querySelector<HTMLElement>('[data-slotflow-slot="text"]')!.style.fontStyle).not.toBe('italic');
  });
});
