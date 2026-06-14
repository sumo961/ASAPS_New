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
