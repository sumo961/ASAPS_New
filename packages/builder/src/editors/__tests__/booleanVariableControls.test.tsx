/**
 * A variable declared boolean in Project Settings gets a True/False control
 * in choice conditions and in the "Set variable" effect, and the value is
 * stored as a real boolean. Typed text ("false") never equalled the
 * variable's boolean default at runtime.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { Condition, Effect } from '@asaps/core';
import { ChoiceConditionsEditor } from '../ChoiceConditionsEditor';
import { ChoiceEffectsEditor } from '../ChoiceEffectsEditor';

const variables = [
  { name: 'wokeHim', type: 'boolean' as const, defaultValue: false },
  { name: 'note', type: 'string' as const, defaultValue: '' },
];

const trueFalseSelect = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('select')).find(s =>
    Array.from(s.options).map(o => o.value).join() === 'true,false');

describe('ChoiceConditionsEditor — boolean variable', () => {
  const mount = (cond: Partial<Condition>) => {
    const onChange = vi.fn();
    const utils = render(
      <ChoiceConditionsEditor
        value={[{ type: 'variable', operator: '==', variableName: 'wokeHim', value: false, ...cond } as Condition]}
        onChange={onChange}
        allBeats={[]}
        availableCounters={[]}
        availableVariables={variables}
        availableInventoryItems={[]}
      />,
    );
    return { ...utils, onChange };
  };

  it('offers true/false and stores a boolean', () => {
    const { container, onChange } = mount({});
    const select = trueFalseSelect(container)!;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: 'true' } });
    expect(onChange.mock.calls.at(-1)![0][0].value).toBe(true);
  });

  it('keeps a text field for a string variable', () => {
    const { container } = mount({ variableName: 'note', value: '' });
    expect(trueFalseSelect(container)).toBeUndefined();
    expect(container.querySelector('input[placeholder="value"]')).toBeTruthy();
  });
});

describe('ChoiceEffectsEditor — Set variable on a boolean', () => {
  it('offers true/false and stores a boolean', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChoiceEffectsEditor
        effects={[{ type: 'setVariable', target: 'wokeHim', value: 'true' } as Effect]}
        onChange={onChange}
        availableCounters={[]}
        availableVariables={variables}
      />,
    );
    const select = trueFalseSelect(container)!;
    expect(select).toBeTruthy();
    expect(select.value).toBe('true');
    fireEvent.change(select, { target: { value: 'false' } });
    expect(onChange.mock.calls.at(-1)![0][0].value).toBe(false);
  });
});

describe('RequirementsEditor (preconditions) — boolean variable', () => {
  it('offers true/false and stores a boolean', async () => {
    const { RequirementsEditor } = await import('../RequirementsEditor');
    const onChange = vi.fn();
    const { container } = render(
      <RequirementsEditor
        value={[{ condition: { type: 'variable', operator: '==', variableName: 'wokeHim', value: 'false' } as any }]}
        onChange={onChange}
        allBeats={[]}
        availableCounters={[]}
        availableVariables={variables.map(v => ({ ...v, displayName: v.name }))}
        availableInventoryItems={[]}
      />,
    );
    const select = trueFalseSelect(container)!;
    expect(select).toBeTruthy();
    expect(select.value).toBe('false');
    fireEvent.change(select, { target: { value: 'true' } });
    expect(onChange.mock.calls.at(-1)![0][0].condition.value).toBe(true);
  });
});

describe('VariableValueInput', () => {
  it('shows a text field for a text variable and passes the text through', async () => {
    const { VariableValueInput } = await import('../VariableValueInput');
    const onChange = vi.fn();
    const { container } = render(<VariableValueInput variableType="string" value="hi" onChange={onChange} />);
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'true' } });
    expect(onChange).toHaveBeenCalledWith('true');
  });
});
