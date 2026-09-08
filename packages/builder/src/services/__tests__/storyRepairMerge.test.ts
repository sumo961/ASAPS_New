import { describe, it, expect } from 'vitest';
import { mergeRepairedStory } from '../storyRepairMerge';

describe('mergeRepairedStory', () => {
  const original = {
    metadata: { title: 'Ember' },
    suggestedTheme: { themeId: 'visual-novel' },
    characters: [{ id: 'ember', name: 'Ember' }],
    variables: [{ name: 'icapLevel' }],
    clusters: [{ id: 'Setup', name: 'Setup' }],
    beats: [{ id: 'b1' }, { id: 'b2' }],
  };

  it('keeps every top-level field the repair dropped or emptied', () => {
    const merged = mergeRepairedStory(original, { beats: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }], characters: [] });
    expect(merged.characters).toEqual(original.characters);
    expect(merged.variables).toEqual(original.variables);
    expect(merged.clusters).toEqual(original.clusters);
    expect(merged.suggestedTheme).toEqual(original.suggestedTheme);
    expect(merged.metadata).toEqual(original.metadata);
    expect(merged.beats).toHaveLength(3);
  });

  it('lets the repair win for fields it actually carries', () => {
    const merged = mergeRepairedStory(original, { beats: [{ id: 'b1' }], characters: [{ id: 'pip', name: 'Pip' }], metadata: { title: 'Ember 2' } });
    expect(merged.characters).toEqual([{ id: 'pip', name: 'Pip' }]);
    expect(merged.metadata.title).toBe('Ember 2');
    expect(merged.beats).toEqual([{ id: 'b1' }]); // never silently restores old beats
  });
});
