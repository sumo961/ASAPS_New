import { describe, it, expect } from 'vitest';
import { closeItemName } from '../storyItems';

describe('closeItemName', () => {
  const known = ['Rusty Key', 'Sword'];
  it('finds a known item that differs only in case or spacing', () => {
    expect(closeItemName('sword', known)).toBe('Sword');
    expect(closeItemName(' rusty  key ', known)).toBe('Rusty Key');
  });
  it('says nothing for a known name or a new one', () => {
    expect(closeItemName('Sword', known)).toBeUndefined();
    expect(closeItemName('Shield', known)).toBeUndefined();
    expect(closeItemName('', known)).toBeUndefined();
  });
});
