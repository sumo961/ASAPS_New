import { describe, it, expect } from 'vitest';
import { fieldHelp } from '../SchemaFormGenerator';

describe('fieldHelp', () => {
  it('prefers the author help over the description written for AI generation', () => {
    expect(fieldHelp({ description: "type='counter' only. OMIT for a story-global counter", ui: { help: 'Whose counter this is.' } }, 'Counter', 'character')).toBe('Whose counter this is.');
  });
  it('leaves out a hint that only repeats the label', () => {
    expect(fieldHelp({ description: 'Author name' }, 'Author', 'author')).toBeUndefined();
    expect(fieldHelp({ description: 'Clear button text' }, 'Clear Button Text', 'clearButtonText')).toBeUndefined();
  });
  it('keeps a hint that adds something', () => {
    expect(fieldHelp({ description: 'How long the screen stays up, in seconds.' }, 'Duration', 'duration')).toContain('seconds');
  });
});
