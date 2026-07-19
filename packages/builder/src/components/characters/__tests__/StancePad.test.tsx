/**
 * StancePad unit tests — Leary's rose sibling of MoodPad. Same interaction
 * contract (click/drag emits clamped axes), plus the stance-specific bits:
 * octant labels, derived-vs-authored dot, and the trait-drift ghost marker.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StancePad } from '../StancePad';

const mockRect = (svg: SVGElement) => {
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }),
  });
};

describe('StancePad', () => {
  afterEach(() => cleanup());

  it('renders axis words and Leary octant labels by default', () => {
    render(<StancePad warmth={0} dominance={0} testId="pad" />);
    const pad = screen.getByTestId('pad');
    for (const label of ['dominant', 'submissive', 'cold', 'warm', 'hostile', 'leading', 'withdrawn', 'cooperative']) {
      expect(pad.textContent).toContain(label);
    }
  });

  it('omits labels when showLabels is false', () => {
    render(<StancePad warmth={0} dominance={0} showLabels={false} testId="pad" />);
    expect(screen.getByTestId('pad').textContent).not.toContain('hostile');
  });

  it('renders the numeric readout with signs', () => {
    render(<StancePad warmth={-0.7} dominance={0.5} testId="pad" />);
    const pad = screen.getByTestId('pad');
    expect(pad.textContent).toContain('-0.70');
    expect(pad.textContent).toContain('+0.50');
  });

  it('emits clamped onChange on pointer-down (top-right = warm-dominant)', () => {
    const onChange = vi.fn();
    render(<StancePad warmth={0} dominance={0} onChange={onChange} testId="pad" />);
    const svg = screen.getByTestId('pad').querySelector('svg')!;
    mockRect(svg);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith({ warmth: 1, dominance: 1 });
  });

  it('is inert without onChange', () => {
    render(<StancePad warmth={0} dominance={0} testId="pad" />);
    const svg = screen.getByTestId('pad').querySelector('svg')!;
    mockRect(svg);
    expect(() => fireEvent.pointerDown(svg, { clientX: 50, clientY: 50, pointerId: 1 })).not.toThrow();
  });

  it('shows the trait-drift ghost marker only when it sits away from the stance dot', () => {
    const { rerender } = render(
      <StancePad warmth={-0.7} dominance={0.5} traitsPosition={{ warmth: 0.6, dominance: -0.4 }} testId="pad" />,
    );
    expect(screen.getByTestId('pad').textContent).toContain('traits');

    // Coincident positions → ghost hidden (would just pile under the dot).
    rerender(
      <StancePad warmth={0.6} dominance={-0.4} traitsPosition={{ warmth: 0.6, dominance: -0.4 }} testId="pad" />,
    );
    expect(screen.getByTestId('pad').textContent).not.toContain('traits');
  });

  it('renders a dashed hollow dot in derived mode', () => {
    render(<StancePad warmth={0.3} dominance={0.3} derived testId="pad" />);
    const svg = screen.getByTestId('pad').querySelector('svg')!;
    const dashed = [...svg.querySelectorAll('circle')].some(
      (c) => c.getAttribute('stroke-dasharray') && c.getAttribute('fill') === '#ffffff',
    );
    expect(dashed).toBe(true);
  });
});
