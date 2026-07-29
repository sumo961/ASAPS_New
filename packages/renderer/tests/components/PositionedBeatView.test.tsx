/**
 * Mount + interaction tests for PositionedBeatView (5878-line fixed-mode
 * absolute-positioning view). Elements are supplied directly as
 * PositionedElementData (location + content + actionId). Covers text rendering,
 * button click → onAction, the interactive=false guard, and the backdrop color.
 * Browser-API gaps stubbed via installRendererDomStubs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { PositionedBeatView, type PositionedElementData } from '../../src/components/PositionedBeatView';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';

beforeEach(() => installRendererDomStubs());

const textEl = (over: any = {}): PositionedElementData =>
  ({ location: { kind: 'text', name: 'body', x: 100, y: 100, width: 400, height: 80, ...over.loc } as any, content: over.content ?? 'A quiet morning in the harbor.' }) as any;

const buttonEl = (over: any = {}): PositionedElementData =>
  ({
    location: { kind: 'button', name: over.name ?? 'go', x: 120, y: 300, width: 200, height: 50, ...over.loc } as any,
    content: over.content ?? 'Continue',
    actionId: over.actionId ?? 'go',
  }) as any;

describe('PositionedBeatView', () => {
  it('renders positioned text content', async () => {
    const { container } = render(
      <PositionedBeatView stageWidth={1024} stageHeight={768} elements={[textEl()]} />,
    );
    await waitFor(() => expect(container.textContent).toContain('A quiet morning in the harbor.'));
  });

  it('renders a button and fires onAction on click', async () => {
    const onAction = vi.fn();
    const { getByText } = render(
      <PositionedBeatView stageWidth={1024} stageHeight={768} interactive elements={[buttonEl()]} onAction={onAction} />,
    );
    const btn = await waitFor(() => getByText('Continue'));
    fireEvent.click(btn);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('go'));
  });

  it('does not fire onAction when interactive is false', async () => {
    const onAction = vi.fn();
    const { getByText } = render(
      <PositionedBeatView stageWidth={1024} stageHeight={768} interactive={false} elements={[buttonEl()]} onAction={onAction} />,
    );
    const btn = await waitFor(() => getByText('Continue'));
    fireEvent.click(btn);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders multiple elements together', async () => {
    const onAction = vi.fn();
    const { container, getByText } = render(
      <PositionedBeatView
        stageWidth={1024}
        stageHeight={768}
        interactive
        elements={[textEl({ content: 'The harbor at dusk.' }), buttonEl({ content: 'Onward', actionId: 'next', name: 'next' })]}
        onAction={onAction}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain('The harbor at dusk.'));
    fireEvent.click(getByText('Onward'));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('next'));
  });

  it('paints the backdrop color when no background image is set', async () => {
    const { container } = render(
      <PositionedBeatView stageWidth={1024} stageHeight={768} backgroundColor="rgb(7, 7, 7)" elements={[textEl()]} />,
    );
    await waitFor(() => expect(container.querySelector('*')).toBeTruthy());
    expect(container.innerHTML).toContain('rgb(7, 7, 7)');
  });
});

// ---------------------------------------------------------------------------
// Fixed-layout overflow containment (field case: "Getting Around Lima").
// An AI-baked onlineContent layout put the content box at titleY + a title
// height estimated with the BODY font size (titles render with the larger
// titleFontSize), let the runtime content grow without bound, and placed the
// action button at y + height past the stage bottom. Three guarantees:
//   1. text boxes never overlap — later boxes stack below earlier ones
//   2. a text box is capped (maxHeight) so overflow scrolls instead of
//      running over the button area / stage edge
//   3. the action button shrinks to its text and stays fully on stage
// ---------------------------------------------------------------------------
import { adjustElementsForCollisions, DEFAULT_THEME } from '../../src/components/PositionedBeatView';

describe('fixed-layout overflow containment', () => {
  const LONG = 'Lima transport facts. '.repeat(50); // ~1100 chars of runtime content

  const fieldElements = (): PositionedElementData[] => ([
    { location: { kind: 'text', name: 'Title', x: 112, y: 60, width: 800, height: 64 } as any, content: 'Getting Around Lima' },
    { location: { kind: 'text', name: 'Content Text', x: 112, y: 124.24, width: 800, height: 400 } as any, content: LONG },
    { location: { kind: 'button', name: 'continue', x: 444, y: 720, width: 200, height: 75 } as any, content: 'Learn More', actionId: 'continue' },
  ] as any);

  it('stacks a text box below the previous one instead of overlapping it', () => {
    const adjusted = adjustElementsForCollisions(fieldElements(), 1024, 768, DEFAULT_THEME, 0, 0, 'onlineContent');
    const title = adjusted.find(el => el.location.name === 'Title')!;
    const content = adjusted.find(el => el.location.name === 'Content Text')!;

    // Title keeps its authored position…
    expect(title.location.y).toBe(60);
    // …and the content box moves below the title's estimated bottom (the
    // baked 124.24 sat inside the rendered title). With titleFontSize
    // estimation the title bottom lands well past 140.
    expect(content.location.y).toBeGreaterThan(140);
  });

  it('does not shift manually resized text boxes (authorial intent)', () => {
    const els = fieldElements();
    (els[1].location as any).manuallyResized = true;
    const adjusted = adjustElementsForCollisions(els, 1024, 768, DEFAULT_THEME, 0, 0, 'onlineContent');
    expect(adjusted.find(el => el.location.name === 'Content Text')!.location.y).toBe(124.24);
  });

  it('caps an unbounded text box with maxHeight so it scrolls instead of overflowing', async () => {
    const { container } = render(
      <PositionedBeatView
        stageWidth={1024}
        stageHeight={768}
        beatType="onlineContent"
        elements={[{ location: { kind: 'text', name: 'Content Text', x: 112, y: 124, width: 800, height: 400 } as any, content: LONG } as any]}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain('Lima transport facts.'));
    const box = Array.from(container.querySelectorAll('div')).find(d => d.style.maxHeight);
    expect(box, 'text box should carry a maxHeight cap').toBeTruthy();
    const top = parseFloat(box!.style.top || '124');
    expect(top + parseFloat(box!.style.maxHeight)).toBeLessThanOrEqual(768);
    expect(box!.style.overflowY).toBe('auto');
  });

  it('shrinks a baked-oversize button to its text and keeps it fully on stage', async () => {
    const { getByText } = render(
      <PositionedBeatView
        stageWidth={1024}
        stageHeight={768}
        interactive
        beatType="onlineContent"
        elements={[{ location: { kind: 'button', name: 'continue', x: 444, y: 720, width: 200, height: 75 } as any, content: 'Learn More', actionId: 'continue' } as any]}
      />,
    );
    const btn = await waitFor(() => getByText('Learn More'));
    const wrapper = btn.closest('div[style]') as HTMLDivElement;
    const h = parseFloat(wrapper.style.height);
    const top = parseFloat(wrapper.style.top);
    expect(h).toBeLessThan(75);           // shrank to one line of text
    expect(top + h).toBeLessThanOrEqual(768); // fully visible
  });

  it('keeps the authored height of a manually resized button', async () => {
    const { getByText } = render(
      <PositionedBeatView
        stageWidth={1024}
        stageHeight={768}
        interactive
        elements={[{ location: { kind: 'button', name: 'continue', x: 444, y: 300, width: 200, height: 75, manuallyResized: true } as any, content: 'Learn More', actionId: 'continue' } as any]}
      />,
    );
    const btn = await waitFor(() => getByText('Learn More'));
    const wrapper = btn.closest('div[style]') as HTMLDivElement;
    expect(parseFloat(wrapper.style.height)).toBe(75);
  });
});
