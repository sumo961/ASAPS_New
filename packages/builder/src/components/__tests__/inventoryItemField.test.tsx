/**
 * Add/Remove Inventory's item is picked from the items the project knows
 * (2026-10-29, class feedback: groups guessed whether a character got
 * "Sword" or "sword"). A typed name that differs from a known one only in
 * case or spacing gets a hint with a one-click fix.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import beatDefinitions from '../../../../../beat-definitions/core-beats.json';
import { SchemaFormGenerator } from '../SchemaFormGenerator';

const def = (beatDefinitions.beatTypes as any).addRemoveInventory;
const items = [
  { name: 'Sword', displayName: 'Sword', characterName: 'Knight' },
  { name: 'Rusty Key', displayName: 'Rusty Key (used in story)', characterName: '' },
];

function renderField(item: string, onParameterChange = vi.fn()) {
  render(
    <SchemaFormGenerator
      beatType="addRemoveInventory"
      beatDefinition={def}
      parameters={{ action: 'add', item }}
      onParameterChange={onParameterChange}
      availableInventoryItems={items}
    />,
  );
  return onParameterChange;
}

describe('Add/Remove Inventory item field', () => {
  it('offers the known items', () => {
    renderField('');
    const select = screen.getAllByRole('combobox').find((s) => [...(s as HTMLSelectElement).options].some((o) => o.value === 'Sword'));
    expect(select).toBeTruthy();
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(expect.arrayContaining(['Sword', 'Rusty Key']));
  });

  it('points out a name that is a known item in another spelling, and fixes it in one click', () => {
    const onChange = renderField('sword');
    expect(screen.getByText(/calls it “Sword”/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use “Sword”' }));
    expect(onChange).toHaveBeenCalledWith('item', 'Sword');
  });

  it('says nothing for a known name', () => {
    renderField('Sword');
    expect(screen.queryByText(/calls it/)).toBeNull();
  });
});
