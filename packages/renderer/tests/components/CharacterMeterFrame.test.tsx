/**
 * Tests for CharacterMeterFrame — the grouped counter-meter HUD that docks to
 * a character or a screen corner. Pure presentational. Asserts the rendered
 * labels/values, numeric formatting, percentage clamping, and frame docking
 * position via inline styles.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  CharacterMeterFrame,
  type CharacterMeterFrameProps,
  type MeterFrameConfig,
  type MeterCounterData,
} from '../../src/components/CharacterMeterFrame';

const style = {
  backgroundColor: '#000000',
  borderColor: '#ffffff',
  borderWidth: 1,
  borderRadius: 4,
  padding: 8,
  opacity: 100,
};

const config = (over: Partial<MeterFrameConfig> = {}): MeterFrameConfig => ({
  dockMode: 'character',
  anchor: 'bottom',
  screenPosition: 'screen-top-left',
  offset: { x: 0, y: 0 },
  style,
  meterHeight: 8,
  meterSpacing: 4,
  showLabels: true,
  meterWidth: 100,
  ...over,
});

const counter = (over: Partial<MeterCounterData> = {}): MeterCounterData => ({
  name: 'hp',
  displayName: 'Health',
  value: 50,
  min: 0,
  max: 100,
  color: '#ff0000',
  showNumericValue: true,
  numericFormat: 'value',
  orientation: 'horizontal',
  ...over,
});

function renderFrame(over: Partial<CharacterMeterFrameProps> = {}) {
  return render(
    <CharacterMeterFrame
      counters={[counter()]}
      config={config()}
      characterPosition={{ x: 100, y: 100 }}
      characterDimensions={{ width: 80, height: 120 }}
      containerDimensions={{ width: 1024, height: 768 }}
      {...over}
    />,
  );
}

describe('rendering', () => {
  it('renders nothing when there are no counters', () => {
    const { container } = renderFrame({ counters: [] });
    expect(container.firstChild).toBeNull();
  });

  it('shows the counter label when showLabels is on', () => {
    renderFrame({ counters: [counter({ displayName: 'Stamina' })] });
    expect(screen.getByText('Stamina')).toBeDefined();
  });

  it('omits the label when showLabels is off', () => {
    renderFrame({ counters: [counter({ displayName: 'Stamina' })], config: config({ showLabels: false }) });
    expect(screen.queryByText('Stamina')).toBeNull();
  });

  it('renders one meter per counter', () => {
    renderFrame({
      counters: [counter({ name: 'a', displayName: 'Health' }), counter({ name: 'b', displayName: 'Mana' })],
    });
    expect(screen.getByText('Health')).toBeDefined();
    expect(screen.getByText('Mana')).toBeDefined();
  });
});

describe('numeric value formatting', () => {
  it('"value" shows the raw number', () => {
    renderFrame({ counters: [counter({ value: 42, numericFormat: 'value' })] });
    expect(screen.getByText('42')).toBeDefined();
  });

  it('"fraction" shows value/max', () => {
    renderFrame({ counters: [counter({ value: 30, max: 80, numericFormat: 'fraction' })] });
    expect(screen.getByText('30/80')).toBeDefined();
  });

  it('"percentage" shows a rounded percent', () => {
    renderFrame({ counters: [counter({ value: 50, min: 0, max: 100, numericFormat: 'percentage' })] });
    expect(screen.getByText('50%')).toBeDefined();
  });

  it('clamps percentage to 100 above max and 0 below min', () => {
    const { rerender } = renderFrame({ counters: [counter({ value: 150, max: 100, numericFormat: 'percentage' })] });
    expect(screen.getByText('100%')).toBeDefined();
    rerender(
      <CharacterMeterFrame
        counters={[counter({ value: -10, min: 0, max: 100, numericFormat: 'percentage' })]}
        config={config()}
        characterPosition={{ x: 100, y: 100 }}
        characterDimensions={{ width: 80, height: 120 }}
        containerDimensions={{ width: 1024, height: 768 }}
      />,
    );
    expect(screen.getByText('0%')).toBeDefined();
  });

  it('hides the numeric value when showNumericValue is false', () => {
    renderFrame({ counters: [counter({ value: 77, showNumericValue: false })] });
    expect(screen.queryByText('77')).toBeNull();
  });
});

describe('screen docking position', () => {
  // frameWidth = meterWidth(100) + padding(8)*2 = 116; margin = 10
  it('docks to the top-left corner', () => {
    const { container } = renderFrame({ config: config({ dockMode: 'screen', screenPosition: 'screen-top-left' }) });
    const root = container.firstChild as HTMLElement;
    expect(root.style.left).toBe('10px');
    expect(root.style.top).toBe('10px');
  });

  it('docks to the top-right corner using container width', () => {
    const { container } = renderFrame({ config: config({ dockMode: 'screen', screenPosition: 'screen-top-right' }) });
    const root = container.firstChild as HTMLElement;
    // 1024 - 116 - 10 = 898
    expect(root.style.left).toBe('898px');
    expect(root.style.top).toBe('10px');
  });

  it('applies frame opacity from style (0-100 → 0-1)', () => {
    const { container } = renderFrame({ config: config({ style: { ...style, opacity: 50 } }) });
    const root = container.firstChild as HTMLElement;
    expect(root.style.opacity).toBe('0.5');
  });
});

describe('zero-origin bar and qualitative bands', () => {
  const fillOf = (c: HTMLElement) => c.querySelector('[data-meter-fill]') as HTMLElement;

  it('fills from the left edge when zero is the left edge (unchanged legacy behaviour)', () => {
    const { container } = renderFrame({ counters: [counter({ value: 62, min: 0, max: 100 })] });
    const fill = fillOf(container);
    expect(fill.style.left).toBe('0%');
    expect(parseFloat(fill.style.width)).toBeCloseTo(62);
    expect(container.querySelector('[data-meter-zero-tick]')).toBeNull();
  });

  it('grows outward from the centre on a bipolar range', () => {
    const { container } = renderFrame({ counters: [counter({ value: 62, min: -100, max: 100 })] });
    const fill = fillOf(container);
    expect(parseFloat(fill.style.left)).toBeCloseTo(50);
    expect(parseFloat(fill.style.width)).toBeCloseTo(31);
    // The origin is marked, so the centre reads as zero rather than as half-full.
    expect(container.querySelector('[data-meter-zero-tick]')).not.toBeNull();
  });

  it('grows leftward from the centre for a negative value', () => {
    const { container } = renderFrame({ counters: [counter({ value: -45, min: -100, max: 100 })] });
    const fill = fillOf(container);
    expect(parseFloat(fill.style.left)).toBeCloseTo(27.5);
    expect(parseFloat(fill.style.width)).toBeCloseTo(22.5);
  });

  it('renders zero as an empty bar, never as half-full', () => {
    // The rejected "remapped" reading would have shown 50% here.
    const { container } = renderFrame({ counters: [counter({ value: 0, min: -100, max: 100 })] });
    expect(parseFloat(fillOf(container).style.width)).toBeCloseTo(0);
  });

  it('shows the band phrase in place of the number', () => {
    renderFrame({
      counters: [counter({
        value: 62, min: -100, max: 100, numericFormat: 'band',
        bands: [{ from: -100, label: 'wary' }, { from: 20, label: 'trusting' }],
      })],
    });
    expect(screen.getByText('trusting')).toBeDefined();
    expect(screen.queryByText('62')).toBeNull();
  });

  it('falls back to the number when words are on but none are written', () => {
    // A blank readout would look like a broken meter.
    renderFrame({ counters: [counter({ value: 62, numericFormat: 'band', bands: [] })] });
    expect(screen.getByText('62')).toBeDefined();
  });
});

describe('character identification', () => {
  it('names whose meters these are', () => {
    // Two screen-docked frames stack in the same corner. Without a name they
    // are indistinguishable, and read as one set of duplicated counters.
    renderFrame({ counters: [counter()], characterName: 'Ada' });
    expect(screen.getByText('Ada')).toBeDefined();
  });

  it('shows the name even for a single character', () => {
    const { container } = renderFrame({ counters: [counter()], characterName: 'Ada' });
    expect(container.querySelector('[data-meter-frame-name]')).not.toBeNull();
  });

  it('renders the bare frame when no name is supplied', () => {
    const { container } = renderFrame({ counters: [counter()] });
    expect(container.querySelector('[data-meter-frame-name]')).toBeNull();
  });

  it('reserves height for the header so stacked frames do not overlap', () => {
    const withName = renderFrame({ counters: [counter()], characterName: 'Ada' });
    const withoutName = renderFrame({ counters: [counter()] });
    const h = (r: ReturnType<typeof renderFrame>) =>
      parseFloat((r.container.firstChild as HTMLElement).style.top);
    // Bottom-docked frames are positioned from their own height, so a taller
    // frame sits higher: the header must be in the height calculation.
    const a = renderFrame({ counters: [counter()], characterName: 'Ada', config: config({ dockMode: 'screen', screenPosition: 'screen-bottom-left' }) });
    const b = renderFrame({ counters: [counter()], config: config({ dockMode: 'screen', screenPosition: 'screen-bottom-left' }) });
    expect(h(a)).toBeLessThan(h(b));
    withName.unmount(); withoutName.unmount();
  });
});
