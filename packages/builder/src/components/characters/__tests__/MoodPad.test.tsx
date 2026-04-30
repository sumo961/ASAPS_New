import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MoodPad } from '../MoodPad';
import type { EmotionDefinition } from '@asaps/core';

const palette: EmotionDefinition[] = [
  { name: 'joy',      weightToValence:  0.7, weightToArousal:  0.4, decayRate: 0.2 },
  { name: 'sadness',  weightToValence: -0.7, weightToArousal: -0.4, decayRate: 0.1 },
  { name: 'surprise', weightToValence:  0.0, weightToArousal:  0.0, decayRate: 0.4 }, // (0,0) — should be skipped
];

describe('MoodPad', () => {
  afterEach(() => cleanup());

  it('renders an SVG with axis labels by default', () => {
    render(<MoodPad valence={0} arousal={0} testId="pad" />);
    const pad = screen.getByTestId('pad');
    expect(pad.querySelector('svg')).toBeTruthy();
    expect(pad.textContent).toContain('happy');
    expect(pad.textContent).toContain('sad');
    expect(pad.textContent).toContain('calm');
    expect(pad.textContent).toContain('excited');
  });

  it('omits axis labels when showLabels is false', () => {
    render(<MoodPad valence={0} arousal={0} showLabels={false} testId="pad" />);
    const pad = screen.getByTestId('pad');
    expect(pad.textContent).not.toContain('happy');
  });

  it('renders palette markers for non-(0,0) emotions and skips (0,0)', () => {
    render(<MoodPad valence={0} arousal={0} palette={palette} testId="pad" />);
    const pad = screen.getByTestId('pad');
    expect(pad.textContent).toContain('joy');
    expect(pad.textContent).toContain('sadness');
    expect(pad.textContent).not.toContain('surprise');
  });

  it('renders the numeric readout', () => {
    render(<MoodPad valence={0.5} arousal={-0.25} testId="pad" />);
    const pad = screen.getByTestId('pad');
    expect(pad.textContent).toContain('+0.50');
    expect(pad.textContent).toContain('-0.25');
  });

  it('renders subtitle when provided', () => {
    render(<MoodPad valence={0.7} arousal={0.4} subtitle="happy, alert" testId="pad" />);
    expect(screen.getByText(/happy, alert/i)).toBeTruthy();
  });

  it('emits clamped onChange when interactive and pointer-down within the pad', () => {
    const onChange = vi.fn();
    render(<MoodPad valence={0} arousal={0} onChange={onChange} testId="pad" />);
    const svg = screen.getByTestId('pad').querySelector('svg')!;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith({ valence: 1, arousal: 1 });

    fireEvent.pointerDown(svg, { clientX: 0, clientY: 100, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith({ valence: -1, arousal: -1 });

    fireEvent.pointerDown(svg, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith({ valence: 0, arousal: 0 });
  });

  it('does not emit onChange when not interactive', () => {
    const onChange = vi.fn();
    // Don't pass onChange — pad is read-only.
    render(<MoodPad valence={0} arousal={0} testId="pad" />);
    const svg = screen.getByTestId('pad').querySelector('svg')!;
    fireEvent.pointerDown(svg, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('continues firing during drag (pointermove with button held)', () => {
    const onChange = vi.fn();
    render(<MoodPad valence={0} arousal={0} onChange={onChange} testId="pad" />);
    const svg = screen.getByTestId('pad').querySelector('svg')!;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(svg, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 75, clientY: 25, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ valence: 0.5, arousal: 0.5 });
  });
});
