import { describe, it, expect } from 'vitest';
import { previewRoles, rolesReferencedIn, rolesToSeedAtStart } from '../rolePreview';

const roles = [
  { id: 'player', candidates: ['m', 'j'], selection: 'cast' },
  { id: 'confidant', candidates: ['i', 't'], selection: 'cast' },
  { id: 'stranger', candidates: ['a', 'b'], selection: 'random' },
  { id: 'host', candidates: ['h1', 'h2'], selection: 'fixed' },
];
const casting = { player: 'j', confidant: 't', stranger: 'b', host: 'h2' };
const seed = (fromBeginning: boolean, cast: string[] = []) => rolesToSeedAtStart({
  roles, previewCasting: casting, fromBeginning, castByStory: new Set(['player']),
  alreadyCast: (id) => cast.includes(id),
});

describe('Preview as → Preview start', () => {
  it('from the beginning: only roles the story never decides', () => {
    expect(seed(true, ['stranger', 'host'])).toEqual({ confidant: 't', host: 'h2' });
  });
  it('from a beat: every undecided role, random and fixed included', () => {
    expect(seed(false, ['stranger', 'host'])).toEqual({ player: 'j', confidant: 't', stranger: 'b', host: 'h2' });
  });
  it('leaves roles a preset already set, and ignores picks that are not candidates', () => {
    expect(seed(false, ['player', 'stranger', 'host'])).not.toHaveProperty('player');
    expect(rolesToSeedAtStart({ roles, previewCasting: { player: 'x' }, fromBeginning: false, castByStory: new Set(), alreadyCast: () => false })).toEqual({});
  });
});

describe('editor preview of role text', () => {
  const who = (id: string) => (id === 'confidant' ? { displayName: 'Tomas', pronouns: 'they' } : undefined);
  it('substitutes placeholders and @role speakers, leaves unknown roles', () => {
    expect(previewRoles({ speaker: '@confidant', text: '${@confidant.They} ${@confidant.was} late. ${@ghost}' }, who))
      .toEqual({ speaker: 'Tomas', text: 'They were late. ${@ghost}' });
  });
  it('finds the roles a beat uses', () => {
    expect([...rolesReferencedIn({ speaker: '@a', parameters: { text: 'x ${@b.name}', choices: [{ text: '${@c}' }] } })]).toEqual(['a', 'b', 'c']);
  });
});
