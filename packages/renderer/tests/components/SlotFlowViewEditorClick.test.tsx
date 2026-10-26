/**
 * In the Visual Editor a click on a choice both selects the button (for
 * styling) and reports it, so the editor can step into a dialog choice —
 * the selection used to swallow the click and stepping in did nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { SlotFlowView } from '../../src/components/SlotFlowView';
import type { SlotSpec } from '../../src/utils/slotLayout';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';
import { DEFAULT_THEME } from '../../src/components/PositionedBeatView';

beforeEach(() => installRendererDomStubs());

const slots = [
  { name: 'speaker', role: 'speaker', source: 'speaker' },
  { name: 'text', role: 'body', source: 'text', grow: true, scroll: true },
  { name: 'actions', role: 'action' },
] as SlotSpec[];

describe('SlotFlowView in the editor', () => {
  it('selects the clicked choice and reports it', () => {
    const onAction = vi.fn();
    const onSlotSelect = vi.fn();
    render(
      <SlotFlowView
        beatType="dialogTree"
        slots={slots}
        content={{ speaker: 'Wolf', text: 'Hi.' }}
        theme={DEFAULT_THEME as any}
        dynamicChoices={[{ id: 'c_then', text: 'Continue → Wolf' }]}
        requireFullRead={false}
        editorMode
        onSlotSelect={onSlotSelect}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByText('Continue → Wolf'));
    expect(onSlotSelect).toHaveBeenCalledWith('actions', 'c_then');
    expect(onAction).toHaveBeenCalledWith('c_then');
  });
});
