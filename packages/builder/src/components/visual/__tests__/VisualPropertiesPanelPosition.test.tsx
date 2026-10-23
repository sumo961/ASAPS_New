/**
 * Responsive projects place characters and props by % of stage. Like
 * dragging on the fixed canvas, the position may go partly off the stage (a
 * figure walking in from the left) as long as a strip stays on stage — the
 * fields used to stop at 0 and 100, and "-" could not be typed at all.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { VisualPropertiesPanel } from '../VisualPropertiesPanel';

vi.mock('../../../hooks/useFonts', () => ({ useFonts: () => ({ fonts: [], customFonts: [] }) }));

const prop = { id: 'p1', type: 'prop', name: 'Lamp', x: 100, y: 100, width: 200, height: 100, z: 1, visible: true, locked: false } as any;

function mount(onElementUpdate = vi.fn()) {
  render(
    <VisualPropertiesPanel
      layoutMode="slot"
      elements={[prop]}
      selectedElements={['p1']}
      onBackgroundSelect={vi.fn()}
      onElementSelect={vi.fn()}
      onElementUpdate={onElementUpdate}
      onElementDelete={vi.fn()}
      onElementAdd={vi.fn()}
      onElementReorder={vi.fn()}
      assets={[]}
      stageWidth={1000}
      stageHeight={800}
      beatType="infoText"
    />,
  );
  return onElementUpdate;
}

describe('Visual Editor position by % of stage', () => {
  it('goes left of the stage edge, keeping a 24px strip on stage', () => {
    const update = mount();
    const [xField] = screen.getAllByRole('textbox').filter((el) => (el as HTMLInputElement).value === '10');
    fireEvent.focus(xField);
    fireEvent.change(xField, { target: { value: '-' } });
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(xField, { target: { value: '-15' } });
    expect(update).toHaveBeenLastCalledWith('p1', expect.objectContaining({ xPercent: -15, x: -150 }));
    // Further than a 24px strip allows: 200px wide → at most 176px off → -17.6%.
    fireEvent.change(xField, { target: { value: '-50' } });
    expect(update).toHaveBeenLastCalledWith('p1', expect.objectContaining({ xPercent: expect.closeTo(-17.6, 5), x: -176 }));
  });

  it('the slider reaches past both edges too', () => {
    mount();
    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    const x = sliders.find((s) => Number(s.min) < 0)!;
    expect(Number(x.min)).toBe(-18);
    expect(Number(x.max)).toBe(98);
  });
});
