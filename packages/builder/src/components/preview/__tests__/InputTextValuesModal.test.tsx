/**
 * Tests for InputTextValuesModal — the preview pre-fill modal for inputText
 * beats on a chosen path. Covers prefill from simulatedValue, the validation
 * gate on Continue (required / email / numeric, blocking onConfirm + showing an
 * error), numeric/counter type coercion, error-clears-on-typing, and the
 * Use-Placeholders / Cancel exits.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { InputTextValuesModal } from '../InputTextValuesModal';

const beat = (over: any = {}) => ({
  beatId: 'b1',
  beatName: 'Ask Name',
  variableName: 'playerName',
  prompt: 'Your name?',
  validation: 'text',
  simulatedValue: 'Hero',
  saveToType: 'variable',
  ...over,
});

const handlers = () => ({ onConfirm: vi.fn(), onUsePlaceholders: vi.fn(), onCancel: vi.fn() });

describe('InputTextValuesModal', () => {
  it('prefills inputs from each beat simulatedValue', () => {
    const { getByDisplayValue } = render(<InputTextValuesModal inputTextBeats={[beat()]} {...handlers()} />);
    expect(getByDisplayValue('Hero')).toBeTruthy();
  });

  it('Continue confirms the typed values', () => {
    const h = handlers();
    const { getByText } = render(<InputTextValuesModal inputTextBeats={[beat()]} {...h} />);
    fireEvent.click(getByText('Continue'));
    expect(h.onConfirm).toHaveBeenCalledWith({ playerName: 'Hero' });
  });

  it('coerces numeric / counter values to numbers', () => {
    const h = handlers();
    const beats = [
      beat({ beatId: 'n', variableName: 'score', validation: 'numeric', simulatedValue: '42' }),
      beat({ beatId: 'c', variableName: 'coins', validation: 'text', saveToType: 'counter', simulatedValue: '7' }),
    ];
    const { getByText } = render(<InputTextValuesModal inputTextBeats={beats} {...h} />);
    fireEvent.click(getByText('Continue'));
    expect(h.onConfirm).toHaveBeenCalledWith({ score: 42, coins: 7 });
  });

  it('blocks Continue and shows an error for an invalid email', () => {
    const h = handlers();
    const { getByText } = render(
      <InputTextValuesModal inputTextBeats={[beat({ validation: 'email', simulatedValue: 'not-an-email' })]} {...h} />,
    );
    fireEvent.click(getByText('Continue'));
    expect(h.onConfirm).not.toHaveBeenCalled();
    expect(getByText(/valid email/i)).toBeTruthy();
  });

  it('shows a required error for an empty value', () => {
    const h = handlers();
    const { getByDisplayValue, getByText } = render(
      <InputTextValuesModal inputTextBeats={[beat()]} {...h} />,
    );
    fireEvent.change(getByDisplayValue('Hero'), { target: { value: '' } });
    fireEvent.click(getByText('Continue'));
    expect(h.onConfirm).not.toHaveBeenCalled();
    expect(getByText(/required/i)).toBeTruthy();
  });

  it('clears the error once the user types again', () => {
    const h = handlers();
    const { getByDisplayValue, getByText, queryByText } = render(
      <InputTextValuesModal inputTextBeats={[beat()]} {...h} />,
    );
    fireEvent.change(getByDisplayValue('Hero'), { target: { value: '' } });
    fireEvent.click(getByText('Continue'));
    expect(queryByText(/required/i)).not.toBeNull();
    fireEvent.change(getByDisplayValue(''), { target: { value: 'Ada' } });
    expect(queryByText(/required/i)).toBeNull();
  });

  it('enforces minLength', () => {
    const h = handlers();
    const { getByText } = render(
      <InputTextValuesModal inputTextBeats={[beat({ simulatedValue: 'ab', minLength: 5 })]} {...h} />,
    );
    fireEvent.click(getByText('Continue'));
    expect(h.onConfirm).not.toHaveBeenCalled();
    expect(getByText(/Minimum 5 characters/i)).toBeTruthy();
  });

  it('Use Placeholders and Cancel call their handlers', () => {
    const h = handlers();
    const { getByText } = render(<InputTextValuesModal inputTextBeats={[beat()]} {...h} />);
    fireEvent.click(getByText('Use Placeholders'));
    expect(h.onUsePlaceholders).toHaveBeenCalled();
    fireEvent.click(getByText('Cancel'));
    expect(h.onCancel).toHaveBeenCalled();
  });
});
