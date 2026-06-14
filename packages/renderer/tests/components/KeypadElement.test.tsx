/**
 * Tests for KeypadElement — a digit-grid input (phone / PIN / safe lock).
 * Interactive: clicks build a code, validate against an optional correctCode,
 * track attempts, and submit via onSubmit. Driven with fireEvent.
 *
 * Fake timers are on globally because a wrong submit schedules a 600ms shake-
 * reset; we never need it to fire, and faking it avoids "setState after
 * unmount" noise from RTL's auto-cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeypadElement, type KeypadElementProps } from '../../src/components/KeypadElement';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function props(over: Partial<KeypadElementProps> = {}): KeypadElementProps {
  return {
    layout: 'numeric',
    maxDigits: 4,
    minDigits: 4,
    maxAttempts: 0,
    maskInput: false,
    buttonText: 'Enter',
    clearButtonText: 'Clear',
    showDisplay: true,
    onSubmit: vi.fn(),
    ...over,
  };
}

const press = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
const type = (code: string) => code.split('').forEach(press);

describe('digit entry + display', () => {
  it('builds the display from pressed digits', () => {
    render(<KeypadElement {...props()} />);
    type('123');
    expect(screen.getByText('123')).toBeDefined();
  });

  it('masks the display when maskInput is set', () => {
    render(<KeypadElement {...props({ maskInput: true })} />);
    type('12');
    expect(screen.getByText('••')).toBeDefined();
  });

  it('backspace (←) removes the last digit', () => {
    render(<KeypadElement {...props()} />);
    type('123');
    press('←');
    expect(screen.getByText('12')).toBeDefined();
  });

  it('the bottom clear button empties the display', () => {
    render(<KeypadElement {...props({ clearButtonText: 'Clear' })} />);
    type('123');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    // placeholder underscores reappear (maxDigits = 4)
    expect(screen.getByText('____')).toBeDefined();
  });

  it('does not exceed maxDigits', () => {
    render(<KeypadElement {...props({ maxDigits: 2 })} />);
    type('123');
    expect(screen.getByText('12')).toBeDefined();
  });
});

describe('layouts', () => {
  it('phone layout exposes * and # and no backspace', () => {
    render(<KeypadElement {...props({ layout: 'phone' })} />);
    expect(screen.getByRole('button', { name: '*' })).toBeDefined();
    expect(screen.getByRole('button', { name: '#' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '←' })).toBeNull();
  });

  it('pin layout exposes a C action button', () => {
    render(<KeypadElement {...props({ layout: 'pin' })} />);
    expect(screen.getByRole('button', { name: 'C' })).toBeDefined();
  });
});

describe('submit', () => {
  it('submit button is disabled below minDigits and enabled at minDigits', () => {
    render(<KeypadElement {...props({ minDigits: 4 })} />);
    const submit = () => screen.getByRole('button', { name: 'Enter' }) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    type('1234');
    expect(submit().disabled).toBe(false);
  });

  it('accepts any code when no correctCode is configured', () => {
    const onSubmit = vi.fn();
    render(<KeypadElement {...props({ onSubmit })} />);
    type('1234');
    press('Enter');
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('submits when the code matches correctCode', () => {
    const onSubmit = vi.fn();
    render(<KeypadElement {...props({ correctCode: '4321', onSubmit })} />);
    type('4321');
    press('Enter');
    expect(onSubmit).toHaveBeenCalledWith('4321');
  });

  it('the ✓ grid key also submits', () => {
    const onSubmit = vi.fn();
    render(<KeypadElement {...props({ onSubmit })} />);
    type('1234');
    press('✓');
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });
});

describe('validation + attempts', () => {
  it('rejects a wrong code, counts the attempt, and does not submit', () => {
    const onSubmit = vi.fn();
    render(<KeypadElement {...props({ correctCode: '0000', maxAttempts: 3, onSubmit })} />);
    type('1234');
    press('Enter');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Attempt 1/3')).toBeDefined();
  });

  it('fires onFail and a sentinel submit when max attempts are exhausted', () => {
    const onSubmit = vi.fn();
    const onFail = vi.fn();
    render(<KeypadElement {...props({ correctCode: '0000', maxAttempts: 1, onSubmit, onFail })} />);
    type('1234');
    press('Enter');
    expect(onFail).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith('__keypad_fail__');
  });
});
