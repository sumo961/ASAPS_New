/**
 * The theme's button pictures (a Ren'Py theme's choice buttons) in
 * responsive layouts — before, only the fixed layout drew them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SlotFlowView, buttonPictureStyle } from '../../src/components/SlotFlowView';
import type { SlotSpec } from '../../src/utils/slotLayout';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';
import { DEFAULT_THEME } from '../../src/components/PositionedBeatView';

beforeEach(() => installRendererDomStubs());

const slots = [
  { name: 'text', role: 'body', source: 'text', grow: true, scroll: true },
  { name: 'actions', role: 'action' },
] as SlotSpec[];

const pictured = { ...DEFAULT_THEME, buttonNormalUrl: 'blob:idle', buttonHoverUrl: 'blob:hover' } as any;

function choices(theme: any, extra: Record<string, unknown> = {}) {
  render(
    <SlotFlowView
      beatType="multiChoice"
      slots={slots}
      content={{ text: 'Where now?' }}
      theme={theme}
      dynamicChoices={[{ id: 'a', text: 'Sail at dawn.' }]}
      requireFullRead={false}
      onAction={() => {}}
      {...extra}
    />,
  );
  return screen.getByText('Sail at dawn.').closest('button') as HTMLButtonElement;
}

describe('button pictures in responsive layouts', () => {
  it('a choice button wears the picture, with the hover picture ready', () => {
    const button = choices(pictured);
    expect(button.style.getPropertyValue('--asaps-btn-pic-idle')).toBe('url("blob:idle")');
    expect(button.style.getPropertyValue('--asaps-btn-pic-hover')).toBe('url("blob:hover")');
    expect(button.style.backgroundImage).toContain('--asaps-btn-pic');
    expect(button.style.borderStyle === 'none' || button.style.border === 'none').toBe(true);
  });

  it('without pictures, or with all boxes hidden, buttons keep their colours', () => {
    expect(choices(DEFAULT_THEME as any).style.getPropertyValue('--asaps-btn-pic-idle')).toBe('');
    expect(buttonPictureStyle({ ...pictured, textBox: { ...pictured.textBox, boxVisibility: 'hideAll' } })).toBeNull();
  });

  it('picture cards (Choose your character) keep their card', () => {
    const button = choices(pictured, { choiceStyle: 'pictures' });
    expect(button.style.getPropertyValue('--asaps-btn-pic-idle')).toBe('');
  });
});
