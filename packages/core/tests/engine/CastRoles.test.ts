/**
 * Cast roles (docs/Character-Roles-Design.md): roles in Project Settings,
 * castRole / roleHolder, '@role' resolution for character state, text
 * placeholders and pronouns, the player role's shared bag, and the
 * Choose your character beat.
 */

import { describe, it, expect, vi } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import { ChooseCharacterBeat } from '../../src/beats/ChooseCharacterBeat';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import { ConditionBeat } from '../../src/beats/ConditionBeat';
import { Beat } from '../../src/beats/Beat';
import { pronounSetFor, rolePlaceholderText, normalizeRoles } from '../../src/engine/roles';
import type { IRenderer } from '../../src/types';

const MARA = { id: 'char_mara', name: 'mara', displayName: 'Mara', pronouns: 'she', description: 'A night-shift doctor.' };
const JONAS = { id: 'char_jonas', name: 'jonas', displayName: 'Jonas', pronouns: 'he' };
const ALEX = { id: 'char_alex', name: 'alex', displayName: 'Alex' };

function storyWith(roles: any[], characters: any[] = [MARA, JONAS, ALEX]): Story {
  const story = new Story({ title: 't' });
  story.setCharacters(characters);
  story.setSettings({ roles });
  return story;
}

function renderer(pick = ''): IRenderer {
  return {
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(pick),
  } as unknown as IRenderer;
}

const confidant = { id: 'confidant', name: 'The confidant', candidates: ['char_mara', 'char_jonas'] };

describe('roles in the runtime', () => {
  it('an uncast role reads as its default, else its first candidate', () => {
    const ctx = new StoryContext(undefined, storyWith([confidant, { ...confidant, id: 'helper', defaultCharacterId: 'char_jonas' }]));
    expect(ctx.getRoleHolder('@confidant')).toBe('char_mara');
    expect(ctx.getRoleHolder('helper')).toBe('char_jonas');
    expect(ctx.isRoleCast('confidant')).toBe(false);
    expect(ctx.getRoleHolder('@nobody')).toBeNull();
  });

  it('castRole effect fills the role and roleHolder conditions follow it', () => {
    const ctx = new StoryContext(undefined, storyWith([confidant]));
    ctx.applyEffect({ type: 'castRole', target: 'confidant', character: 'Jonas' } as any);
    expect(ctx.getRoleHolder('confidant')).toBe('char_jonas');
    expect(ctx.checkCondition({ type: 'roleHolder', role: 'confidant', character: 'char_jonas', operator: '==' } as any)).toBe(true);
    expect(ctx.checkCondition({ type: 'roleHolder', role: '@confidant', character: 'char_mara', operator: '==' } as any)).toBe(false);
    expect(ctx.checkCondition({ type: 'roleHolder', role: 'confidant', character: 'char_mara', operator: '!=' } as any)).toBe(true);
  });

  it("state written through '@role' lands on the holder and stays there after a recast", () => {
    const ctx = new StoryContext(undefined, storyWith([{ ...confidant, recastable: true }]));
    ctx.castRole('confidant', 'char_mara');
    ctx.setCharacterCounter('@confidant', 'trust', 3);
    ctx.castRole('confidant', 'char_jonas');
    expect(ctx.getCharacterCounter('@confidant', 'trust')).toBe(0);
    expect(ctx.getCharacterCounter('char_mara', 'trust')).toBe(3);
  });

  it("the implicit 'player' key follows a 'player' role, but the bag stays the player's", () => {
    const ctx = new StoryContext(undefined, storyWith([{ id: 'player', candidates: ['char_mara', 'char_jonas'] }]));
    ctx.castRole('player', 'char_jonas');
    ctx.setCharacterCounter('player', 'courage', 2);
    expect(ctx.getCharacterCounter('char_jonas', 'courage')).toBe(2);
    ctx.addInventoryItem('@player', 'key');
    ctx.castRole('player', 'char_mara');
    expect(ctx.hasInventoryItem('player', 'key')).toBe(true);
    expect(ctx.hasInventoryItem('@player', 'key')).toBe(true);
  });

  it("without a 'player' role, the 'player' key is unchanged", () => {
    const ctx = new StoryContext(undefined, storyWith([confidant]));
    expect(ctx.resolveRoleRef('player')).toBe('player');
  });

  it('random roles are drawn at start, fixed ones set; reset draws again', () => {
    const ctx = new StoryContext(undefined, storyWith([
      { ...confidant, selection: 'random' },
      { id: 'host', candidates: ['char_alex'], selection: 'fixed' },
    ]));
    expect(['char_mara', 'char_jonas']).toContain(ctx.getRoleHolders().confidant);
    expect(ctx.getRoleHolders().host).toBe('char_alex');
    ctx.reset();
    expect(ctx.isRoleCast('confidant')).toBe(true);
  });

  it('keepOnRestart keeps the holder across an in-story restart; a plain one is cleared', () => {
    const ctx = new StoryContext(undefined, storyWith([
      { ...confidant, keepOnRestart: true },
      { ...confidant, id: 'other' },
    ]));
    ctx.castRole('confidant', 'char_jonas');
    ctx.castRole('other', 'char_jonas');
    ctx.restartPlaythrough('all');
    expect(ctx.getRoleHolders()).toEqual({ confidant: 'char_jonas' });
  });

  it('holders survive save and load', () => {
    const story = storyWith([confidant]);
    const ctx = new StoryContext(undefined, story);
    ctx.castRole('confidant', 'char_jonas');
    const saved = ctx.serialize();
    const fresh = new StoryContext(undefined, story);
    fresh.loadFromSerialized(saved);
    expect(fresh.getRoleHolder('confidant')).toBe('char_jonas');
  });

  it('normalizeRoles drops roles without an id and strips a leading @', () => {
    expect(normalizeRoles([{ id: '@x', candidates: ['a', 3] }, { name: 'no id' }, null]))
      .toEqual([{ id: 'x', candidates: ['a'], selection: 'cast' }]);
  });
});

describe('role text', () => {
  it('pronoun presets and agreement helpers', () => {
    expect(pronounSetFor(MARA)).toMatchObject({ they: 'she', their: 'her', is: 'is' });
    expect(pronounSetFor(ALEX)).toMatchObject({ they: 'they', is: 'are', has: 'have', was: 'were' });
    expect(pronounSetFor({ pronouns: { they: 'xe', them: 'xem' } })).toMatchObject({ they: 'xe', them: 'xem', their: 'their', is: 'is' });
  });

  it('a capitalised key capitalises; an unknown key is left alone', () => {
    expect(rolePlaceholderText(JONAS, 'They')).toBe('He');
    expect(rolePlaceholderText(JONAS, undefined)).toBe('Jonas');
    expect(rolePlaceholderText(JONAS, 'age')).toBeUndefined();
  });

  it('${@role…} placeholders and @role speakers resolve in beats', async () => {
    const story = storyWith([confidant]);
    const ctx = new StoryContext(undefined, story);
    ctx.castRole('confidant', 'char_mara');
    const beat = new InfoTextBeat({ id: 'b', type: 'infoText', text: '' } as any);
    const process = (t: string) => (beat as any).processText(t, ctx);
    expect(process('${@confidant} waits. ${@confidant.They} ${@confidant.is} tired; ${@confidant.their} coat is wet.'))
      .toBe('Mara waits. She is tired; her coat is wet.');
    expect(process('${@ghost.name} stays visible')).toBe('${@ghost.name} stays visible');
    expect(process('@confidant')).toBe('Mara');
    expect(Beat.linkedSpeakerName(undefined, '@confidant', ctx)).toBe('Mara');
    expect(Beat.linkedSpeakerName('@confidant', 'stale', ctx)).toBe('Mara');
  });

  it('meeting a role holder marks that character as appeared', () => {
    const ctx = new StoryContext(undefined, storyWith([confidant]));
    ctx.castRole('confidant', 'char_jonas');
    ctx.markCharacterAppeared('@confidant');
    expect(ctx.hasCharacterAppeared('char_jonas')).toBe(true);
    expect(ctx.hasCharacterAppeared('char_mara')).toBe(false);
  });
});

describe('Choose your character beat', () => {
  const roles = [{ id: 'player', candidates: ['char_mara', 'char_jonas'] }];

  it('offers the role candidates by name when no options are authored, and casts the pick', async () => {
    const ctx = new StoryContext(undefined, storyWith(roles));
    const r = renderer('cast_char_jonas');
    const beat = new ChooseCharacterBeat({ id: 'pick', type: 'chooseCharacter', parameters: { role: 'player' } } as any);
    beat.addConnection({ targetId: 'next' });
    const next = await (beat as any).performAction(ctx, r);
    const offered = (r.renderChoices as any).mock.calls[0][0];
    expect(offered.map((c: any) => c.text)).toEqual(['Mara', 'Jonas']);
    expect(ctx.getRoleHolder('player')).toBe('char_jonas');
    expect(next).toBe('next');
    expect(beat.question).toBe('Who will you be?');
  });

  it('authored options keep their labels and descriptions; effects see the new holder', async () => {
    const ctx = new StoryContext(undefined, storyWith(roles));
    const r = renderer('o2');
    const beat = new ChooseCharacterBeat({
      id: 'pick', type: 'chooseCharacter',
      parameters: {
        role: '@player',
        choices: [
          { id: 'o1', character: 'char_mara', description: 'A night-shift doctor.', target: 'start' },
          { id: 'o2', character: 'char_jonas', text: 'Jonas, the mechanic', description: 'Fixes ferries.',
            effects: [{ type: 'incrementCounter', target: 'grit', value: 1, character: '@player' }] },
        ],
      },
    } as any);
    const next = await (beat as any).performAction(ctx, r);
    const offered = (r.renderChoices as any).mock.calls[0][0];
    expect(offered).toEqual([
      { id: 'o1', text: 'Mara', description: 'A night-shift doctor.' },
      { id: 'o2', text: 'Jonas, the mechanic', description: 'Fixes ferries.' },
    ]);
    expect(ctx.getCharacterCounter('char_jonas', 'grit')).toBe(1);
    // An option without a target goes where the others go.
    expect(next).toBe('start');
    expect(beat.getParameters().role).toBe('player');
  });

  it('tells the renderer it is a chooseCharacter beat (Multi Choice screen, own type)', async () => {
    const ctx = new StoryContext(undefined, storyWith(roles));
    const r = renderer('cast_char_mara');
    await (new ChooseCharacterBeat({ id: 'pick', type: 'chooseCharacter', parameters: { role: 'player' } } as any) as any).performAction(ctx, r);
    expect(r.setState).toHaveBeenCalledWith('currentBeatType', 'chooseCharacter');
  });
});

describe('HUDs of player-role candidates', () => {
  it('show only for the one who was picked, and not before the pick', () => {
    const ctx = new StoryContext(undefined, storyWith([{ id: 'player', candidates: ['char_mara', 'char_jonas'] }],
      [{ ...MARA, role: 'player' }, { ...JONAS, role: 'player' }, ALEX]));
    expect(ctx.isCharacterHudRevealed('char_mara')).toBe(false);
    expect(ctx.isCharacterHudRevealed('char_jonas')).toBe(false);
    ctx.castRole('player', 'char_jonas');
    expect(ctx.isCharacterHudRevealed('char_jonas')).toBe(true);
    expect(ctx.isCharacterHudRevealed('char_mara')).toBe(false);
  });
});

describe('Condition Check beat with character conditions', () => {
  // These types used to lose their fields in the beat and always took the false branch.
  const run = async (condition: any, ctx: StoryContext) => {
    const beat = new ConditionBeat({ id: 'c', type: 'conditionBeat', parameters: { condition, trueTarget: 'yes', falseTarget: 'no' } } as any);
    return (beat as any).performAction(ctx, renderer());
  };

  it('roleHolder', async () => {
    const ctx = new StoryContext(undefined, storyWith([confidant]));
    ctx.castRole('confidant', 'char_jonas');
    expect(await run({ type: 'roleHolder', role: 'confidant', character: 'char_jonas', operator: '==' }, ctx)).toBe('yes');
    expect(await run({ type: 'roleHolder', role: 'confidant', character: 'char_mara', operator: '==' }, ctx)).toBe('no');
  });

  it('characterVariant and goal', async () => {
    const story = storyWith([], [{ ...MARA, variants: [{ id: 'calm' }, { id: 'angry' }], goals: [{ id: 'g1', description: 'x' }] }]);
    const ctx = new StoryContext(undefined, story);
    ctx.setActiveCharacterVariant('char_mara', 'angry');
    expect(await run({ type: 'characterVariant', character: 'char_mara', variantId: 'angry', operator: '==' }, ctx)).toBe('yes');
    ctx.setGoalStatus('char_mara', 'g1', 'met', { suppressEmotion: true });
    expect(await run({ type: 'goal', character: 'char_mara', goalId: 'g1', goalStatus: 'met', operator: '==' }, ctx)).toBe('yes');
  });
});

describe('renaming a role', () => {
  it('rewrites every kind of reference and nothing else', async () => {
    const { renameRoleReferences } = await import('../../src/engine/roles');
    const beat = {
      speaker: '@confidant',
      parameters: {
        role: 'confidant',
        text: '${@confidant} and ${@confidant.They}; ${@confidante} stays; @confidant inline stays',
        npcName: '@confidant',
        choices: [{ id: 'a', effects: [{ type: 'castRole', target: 'confidant', character: 'x' }], conditions: [{ type: 'roleHolder', role: '@confidant', character: 'x', operator: '==' }] }],
        condition: { type: 'roleHolder', role: 'confidant' },
      },
      connections: [{ targetId: 'b', effects: [{ type: 'castRole', target: '@confidant', character: 'y' }] }],
    };
    const out: any = renameRoleReferences(beat, 'confidant', 'friend');
    expect(out.speaker).toBe('@friend');
    expect(out.parameters.role).toBe('friend');
    expect(out.parameters.text).toBe('${@friend} and ${@friend.They}; ${@confidante} stays; @confidant inline stays');
    expect(out.parameters.npcName).toBe('@friend');
    expect(out.parameters.choices[0].effects[0].target).toBe('friend');
    expect(out.parameters.choices[0].conditions[0].role).toBe('friend');
    expect(out.parameters.condition.role).toBe('friend');
    expect(out.connections[0].effects[0].target).toBe('friend');
    expect(beat.speaker).toBe('@confidant'); // input untouched
    const plain = { speaker: 'Mara', parameters: { text: 'hi' } };
    expect(renameRoleReferences(plain, 'confidant', 'friend')).toBe(plain);
  });
});

describe('renaming a role reaches beat requirements', () => {
  it('rewrites a Who plays a role requirement', async () => {
    const { renameRoleReferences } = await import('../../src/engine/roles');
    const beat = { requires: [{ condition: { type: 'roleHolder', role: 'confidant', character: 'x', operator: '==' }, explanation: 'e' }] };
    expect((renameRoleReferences(beat, 'confidant', 'friend') as any).requires[0].condition.role).toBe('friend');
  });
});
