import { describe, it, expect } from 'vitest';
import { analyzeRoleFindings } from '../roleFindings';
import { analyzeStoryFindings } from '../generationReview';

const roles = [{ id: 'confidant', candidates: ['char_a', 'char_b'] }];
const chars = [{ id: 'char_a', displayName: 'Ana' }, { id: 'char_b', displayName: 'Ben' }, { id: 'char_c', displayName: 'Cleo' }];

describe('role findings', () => {
  it('flags @references and ${@…} placeholders to undeclared roles', () => {
    const beats = [
      { id: 'b1', name: 'Talk', type: 'infoText', speaker: '@ghost', parameters: { text: 'Hi ${@confidant.name}, ${@nobody.they} left.' } },
    ];
    const f = analyzeRoleFindings(beats, roles, chars);
    expect(f.map(x => x.problem + ':' + x.role).sort()).toEqual(['unknown-role:ghost', 'unknown-role:nobody']);
  });

  it('flags casting a character who is not a candidate', () => {
    const beats = [{ id: 'b1', name: 'Pick', type: 'multiChoice', parameters: { choices: [
      { id: 'c', text: 'x', target: 'b2', effects: [{ type: 'castRole', target: 'confidant', character: 'char_c' }] },
    ] } }];
    const f = analyzeRoleFindings(beats, roles, chars);
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('Cleo');
  });

  it('flags a non-recastable role cast in two beats, not alternatives within one beat', () => {
    const cast = (who: string) => ({ type: 'castRole', target: 'confidant', character: who });
    const one = { id: 'b1', name: 'One', type: 'multiChoice', parameters: { choices: [
      { id: 'x', text: 'A', target: 'b2', effects: [cast('char_a')] }, { id: 'y', text: 'B', target: 'b2', effects: [cast('char_b')] },
    ] } };
    expect(analyzeRoleFindings([one], roles, chars)).toEqual([]);
    const two = { id: 'b2', name: 'Two', type: 'chooseCharacter', parameters: { role: 'confidant', choices: [{ id: 'z', character: 'char_a', target: 'b3' }] } };
    expect(analyzeRoleFindings([one, two], roles, chars).map(f => f.problem)).toEqual(['recast']);
    expect(analyzeRoleFindings([one, two], [{ ...roles[0], recastable: true }], chars)).toEqual([]);
  });

  it('runs as part of the story review, reading roles from the story', () => {
    const story = { roles, characters: chars, beats: [{ id: 'b1', name: 'T', type: 'titleScreen', speaker: '@ghost', parameters: {} }] };
    expect(analyzeStoryFindings(story).some(f => f.kind === 'role')).toBe(true);
  });
});
