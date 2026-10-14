/**
 * Tripwire (docs/Character-Roles-Design.md, Risks): a beat whose speaker is
 * '@confidant' and whose text says ${@confidant…} must never put an '@' on
 * the screen. Anything still matching characters by the raw speaker string
 * would show the role id instead of the person.
 */
import { describe, it, expect, vi } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { findSpeakerCharacter } from '../../src/utils/characterRef';
import type { IRenderer } from '../../src/types';

const SPEAKER = '@confidant';
const TEXT = '${@confidant} nods. ${@confidant.They} ${@confidant.is} ready.';

// Visible beats that show a speaker and text without AI, sensors or media.
const CASES: Array<[string, Record<string, any>]> = [
  ['titleScreen', { title: TEXT, author: TEXT, buttonText: 'Go' }],
  ['infoText', { text: TEXT, buttonText: 'Next' }],
  ['durScreen', { text: TEXT, duration: 1 }],
  ['multiChoice', { question: TEXT, choices: [{ id: 'a', text: TEXT, target: 'next' }] }],
  ['chooseCharacter', { role: 'player', question: TEXT, choices: [{ id: 'a', character: 'char_tomas', description: TEXT, target: 'next' }] }],
  ['dialogTree', { dialogTree: { id: 'root', speaker: SPEAKER, text: TEXT, choices: [{ id: 'a', text: TEXT, target: 'next' }] } }],
  ['movementChoice', { question: TEXT, choices: [{ id: 'a', text: TEXT, location: 'x', target: 'next' }] }],
  ['endScreen', { message: TEXT, showRestart: false }],
];

function recordingRenderer(seen: string[]): IRenderer {
  const grab = (...args: any[]) => { seen.push(JSON.stringify(args)); };
  const firstChoice = (choices: any[]) => choices?.[0]?.id ?? '';
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'getState') return () => undefined;
      if (prop === 'setState') return (key: string, value: unknown) => { if (key === 'beatSpeaker' || key === 'dialogContext') grab(value); };
      if (prop === 'renderChoices') return async (choices: any[]) => { grab(choices); return firstChoice(choices); };
      if (prop === 'renderMovement') return async (q: string, choices: any[]) => { grab(q, choices); return firstChoice(choices); };
      if (prop === 'renderEndScreen') return async (...a: any[]) => { grab(...a); return ''; };
      if (prop.startsWith('render')) return async (...a: any[]) => { grab(...a); return ''; };
      return vi.fn();
    },
  }) as unknown as IRenderer;
}

describe('no @role reaches the screen', () => {
  const story = new Story({ title: 't' });
  story.setCharacters([{ id: 'char_tomas', name: 'tomas', displayName: 'Tomas', pronouns: 'they' }]);
  story.setSettings({ roles: [{ id: 'confidant', candidates: ['char_tomas'] }, { id: 'player', candidates: ['char_tomas'] }] });

  for (const [type, parameters] of CASES) {
    it(type, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const ctx = new StoryContext(undefined, story);
      const beat = BeatTypeRegistry.getInstance().createBeat(type, { id: 'b', name: 'b', type, speaker: SPEAKER, parameters: { ...parameters, speaker: SPEAKER } } as any);
      const seen: string[] = [];
      const run = (beat as any).performAction(ctx, recordingRenderer(seen));
      await vi.runAllTimersAsync();
      await run;
      vi.useRealTimers();
      const shown = seen.join(' ');
      expect(shown).toContain('Tomas');
      expect(shown).not.toMatch(/@confidant|\$\{@/);
    });
  }
});

describe('speaker portraits find the character as it looks now', () => {
  it('by base or variant name, returning the merged record', () => {
    const base = [{ id: 'w', name: 'wolf', displayName: 'Wolf' }];
    const merged = (id: string) => (id === 'w' ? { id: 'w', name: 'wolf', displayName: 'Wolf (the gentleman)', portrait: 'gentle' } : undefined) as any;
    expect((findSpeakerCharacter('Wolf (the gentleman)', base, merged) as any)?.portrait).toBe('gentle');
    expect((findSpeakerCharacter('wolf', base, merged) as any)?.portrait).toBe('gentle');
    expect(findSpeakerCharacter('Nobody', base, merged)).toBeNull();
  });
});
