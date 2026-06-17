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
