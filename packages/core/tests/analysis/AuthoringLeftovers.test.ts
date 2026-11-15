/**
 * What a student audit found the Story Warnings missed: stand-in text a new
 * beat starts with, meters nothing moves, and beats using a sound or
 * picture the project no longer has.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectStoryWarnings } from '../../src/analysis/StoryWarnings';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

function build(beats: any[], characters: any[] = []) {
  const story = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
  for (const b of beats) story.addBeat(createTestBeat(b));
  if (characters.length) story.setCharacters(characters);
  return story;
}
const end = { id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'x' } };
const of = (story: Story, code: string, extra: any = {}) =>
  detectStoryWarnings({ paths: [], story, ...extra }).filter((w) => w.code === code);

describe('stand-in text left in', () => {
  const tree = (speaker: string, reply: string, extra: any = {}) => ({
    id: 'd', name: 'Meeting', type: 'dialogTree', parameters: { dialogTree: {
      id: 'root', speaker, text: 'Hi.', ...extra,
      choices: [{ id: 'c1', text: reply, dialogNode: { id: 'n2', speaker, text: 'Bye.', choices: [] }, target: 'end' }],
    } },
  });

  it('names the "Character" speaker and a "Player response..." reply', () => {
    const w = of(build([tree('Character', 'Player response...'), end]), 'placeholder-text');
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('the speaker "Character" (on 2 lines)');
    expect(w[0].message).toContain('"Player response..."');
  });

  it('leaves a character really called Character, and a linked line, alone', () => {
    expect(of(build([tree('Character', 'Sure.'), end], [{ id: 'c', name: 'Character', counters: [] }]), 'placeholder-text')).toEqual([]);
    expect(of(build([tree('Character', 'Sure.', { characterRef: 'karin' }), end]), 'placeholder-text')[0]?.detail?.speakerLines).toBe(1);
  });

  it('names "New Choice 2" and "New Prop 1"', () => {
    const story = build([
      { id: 'm', name: 'M', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'a', text: 'Go left', target: 'p' }, { id: 'b', text: 'New Choice 2', target: 'p' },
      ] } },
      { id: 'p', name: 'P', type: 'pickProp', parameters: { question: 'q', props: [{ id: 'x', name: 'New Prop 1', target: 'end' }] } },
      end,
    ]);
    const w = of(story, 'placeholder-text');
    expect(w.map((x) => x.beatId).sort()).toEqual(['m', 'p']);
    expect(w.find((x) => x.beatId === 'm')!.message).toContain('"New Choice 2"');
  });

  it('stays quiet about words an author chose', () => {
    expect(of(build([tree('Karin', 'New Choice of words'), end]), 'placeholder-text')).toEqual([]);
  });
});

describe('meters that never change', () => {
  const hero = (counters: any[], extra: any = {}) => ({ id: 'hero', name: 'Hero', role: 'player', counters, ...extra });
  const meter = (name: string, extra: any = {}) => ({ name, displayName: name, value: 100, visible: true, ...extra });
  const choice = (effects: any[]) => ({ id: 'm', name: 'M', type: 'multiChoice', parameters: { question: 'q', choices: [
    { id: 'a', text: 'A', target: 'end', effects },
  ] } });

  it('names visible counters nothing changes', () => {
    const story = build([choice([{ type: 'incrementCounter', target: 'Health', value: -10 }]), end], [hero([meter('Health'), meter('Energy')])]);
    const w = of(story, 'meter-never-changes');
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('"Energy"');
    expect(w[0].message).not.toContain('"Health"');
  });

  it('leaves hidden counters, counters read from feelings and Set Variable counters alone', () => {
    const story = build([
      choice([]),
      { id: 's', name: 'S', type: 'setVariable', parameters: { name: 'Gold', type: 'counter', value: 5 } },
      end,
    ], [hero([meter('Energy', { visible: false }), meter('Trust', { source: { kind: 'sentiment' } }), meter('Gold')])]);
    expect(of(story, 'meter-never-changes')).toEqual([]);
  });

  it('says nothing about someone who never appears, and speaks where they first do', () => {
    const npc = { id: 'mark', name: 'Mark', counters: [meter('Accountability')] };
    expect(of(build([choice([]), end], [npc]), 'meter-never-changes')).toEqual([]);
    const meets = { id: 'd', name: 'Talk', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'Mark', text: 'Hey', choices: [] } } };
    const w = of(build([choice([]), meets, end], [npc]), 'meter-never-changes');
    expect(w.map((x) => x.beatId)).toEqual(['d']);
  });
});

describe('sounds and pictures no longer in the project', () => {
  const lost = 'asset_1792155258311_uxc6ryr4u';
  const kept = 'asset_1792169684623_syqlxancs';
  const screen = (id: string, sound: string) => ({ id, name: id, type: 'infoText', parameters: { text: 'x', backgroundSound: sound }, connections: [{ targetId: 'end' }] });

  it('names each missing asset once, with how many beats use it', () => {
    const story = build([screen('a', lost), screen('b', lost), screen('c', kept), end]);
    const w = of(story, 'missing-asset', { assetIds: new Set([kept]) });
    expect(w).toHaveLength(1);
    expect(w[0].beatId).toBe('a');
    expect(w[0].message).toContain('This beat and 1 other use a sound');
    expect(w[0].detail?.beats).toEqual(['a', 'b']);
  });

  it('names sounds kept only as a temporary link, and leaves a link beside its id alone', () => {
    const button = (extra: any) => ({ id: 'b1', kind: 'button', name: 'button1', x: 0, y: 0, width: 100, height: 40, sound: 'blob:http://localhost:5173/b127', ...extra });
    const beat = (extra: any) => ({ ...screen('a', ''), locations: [button(extra)] });
    const w = of(build([beat({}), end]), 'temporary-asset-link');
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('Has a sound saved only as a temporary link');
    expect(w[0].message).toContain('(button "button1")');
    expect(of(build([beat({ soundAssetId: kept }), end]), 'temporary-asset-link')).toEqual([]);
  });

  it('runs only when the project list is given', () => {
    expect(of(build([screen('a', lost), end]), 'missing-asset')).toEqual([]);
  });
});

describe('lines with no words', () => {
  const scene = (line: any) => ({ id: 'd', name: 'Wolf', type: 'dialogTree', parameters: { dialogTree: {
    id: 'r', speaker: 'Wolf', text: 'Seymour.', choices: [{ id: 'c', text: '', continue: true, dialogNode: { id: 'g', choices: [], target: 'end', ...line } }],
  } } });

  it('names the speaker and the line before it', () => {
    const w = of(build([scene({ speaker: 'Gran', text: '  ' }), end]), 'wordless-line');
    expect(w).toHaveLength(1);
    expect(w[0].message).toBe('A line by Gran after "Seymour." has no words, so players see an empty box. Write what Gran says, or delete the line.');
  });

  it('leaves a line said by a sound alone', () => {
    expect(of(build([scene({ speaker: 'Wolf', text: '', voiceAssetId: 'asset_1792155258311_growl' }), end]), 'wordless-line')).toEqual([]);
  });
});
