/**
 * storyLinks — the one walk over "which beat points where".
 *
 * Six files each had their own walk, and their disagreements were bugs with a
 * delay on them: the validators blind to story-level connections (an injected
 * story reported VALID with dead links), the generation importer rejecting the
 * source/target spelling the inject importer accepted, everyone but layout
 * ignorant of hotspots and QR jumps. These tests pin the union.
 */
import { describe, it, expect } from 'vitest';
import { beatLinks, storyLinks, dedupeLinks, beatTargetIds } from '../storyLinks';

describe('beatLinks — one beat, every shape', () => {
  it('reads the builder-native connections array, both spellings', () => {
    const links = beatLinks({
      id: 'b', connections: [{ targetId: 'x', label: 'go' }, { target: 'y' }],
    });
    expect(links).toEqual([
      { source: 'b', target: 'x', via: 'beat-connections', label: 'go' },
      { source: 'b', target: 'y', via: 'beat-connections' },
    ]);
  });

  it('reads defaultTarget from the beat and from parameters', () => {
    // Serialized beats carry it at beat level; some AI output nests it.
    expect(beatTargetIds({ id: 'b', defaultTarget: 'x' })).toContain('x');
    expect(beatTargetIds({ id: 'b', parameters: { defaultTarget: 'y' } })).toContain('y');
  });

  it('reads both conditionBeat formats — direct and connection-object', () => {
    // The builder writes trueTarget/falseTarget; AI output writes
    // trueConnection/falseConnection. The validators only knew the second,
    // so builder-native condition edges were invisible to them.
    const direct = beatLinks({ id: 'b', parameters: { trueTarget: 't', falseTarget: 'f' } });
    expect(direct.map(l => `${l.via}:${l.target}`)).toEqual(['condition-true:t', 'condition-false:f']);

    const legacy = beatLinks({
      id: 'b', parameters: { trueConnection: { target: 't' }, falseConnection: { target: 'f' } },
    });
    expect(legacy.map(l => l.target)).toEqual(['t', 'f']);
  });

  it('labels choices with their text, and props with their name', () => {
    const links = beatLinks({
      id: 'b',
      parameters: {
        choices: [{ target: 'x', text: 'Go left' }],
        props: [{ target: 'y', name: 'Brass key' }],
      },
    });
    expect(links).toContainEqual({ source: 'b', target: 'x', via: 'choice', label: 'Go left' });
    expect(links).toContainEqual({ source: 'b', target: 'y', via: 'prop', label: 'Brass key' });
  });

  it('accepts randomTarget in both of its shapes', () => {
    // choices as bare strings, and targets[] with targetId.
    expect(beatTargetIds({ id: 'b', parameters: { choices: ['x', 'y'] } })).toEqual(['x', 'y']);
    expect(beatTargetIds({ id: 'b', parameters: { targets: [{ targetId: 'z' }] } })).toEqual(['z']);
  });

  it('walks a dialogTree through every wild shape at once', () => {
    const links = beatLinks({
      id: 'b',
      parameters: {
        dialogTree: {
          choices: [
            // exit as a plain string
            { text: 'Leave', target: 'exit_1' },
            // nested conversation, exit two levels down
            { text: 'Ask', dialogNode: { choices: [{ text: 'Press on', target: 'exit_2' }] } },
            // OLD format: target is an object whose .next is the exit
            { text: 'Old', target: { next: 'exit_3', choices: [{ target: 'exit_4' }] } },
          ],
          // entries[] container (alternative structure)
          entries: [{ choices: [{ target: 'exit_5' }] }],
          // node-level next as a string
          next: 'exit_6',
        },
      },
    });
    const targets = links.map(l => l.target);
    for (const t of ['exit_1', 'exit_2', 'exit_3', 'exit_4', 'exit_5', 'exit_6']) {
      expect(targets).toContain(t);
    }
    expect(links.find(l => l.target === 'exit_1')?.label).toBe('Leave');
  });

  it('knows the links only layout used to know', () => {
    const links = beatLinks({
      id: 'b',
      parameters: {
        failTarget: 'jail',
        hyperlinks: [{ targetBeatId: 'note', word: 'letter' }],
        hotspots: [{ target: 'door', name: 'North door' }],
        qrJumpTargets: ['secret'],
      },
    });
    expect(links).toContainEqual({ source: 'b', target: 'jail', via: 'fail', label: 'Fail' });
    expect(links).toContainEqual({ source: 'b', target: 'note', via: 'hyperlink', label: 'letter' });
    expect(links).toContainEqual({ source: 'b', target: 'door', via: 'hotspot', label: 'North door' });
    // QR jumps are real links — the beat is not orphaned — but only reachable
    // by scanning, and marked so.
    expect(links).toContainEqual({ source: 'b', target: 'secret', via: 'qr-jump', outOfBand: true });
  });

  it('reads timer, restart, single connection, and bare param target', () => {
    const targets = beatTargetIds({
      id: 'b',
      parameters: {
        timerTarget: 'late',
        restartConnection: { target: 'title' },
        connection: { target: 'next' },
        target: 'bare',
      },
    });
    for (const t of ['late', 'title', 'next', 'bare']) expect(targets).toContain(t);
  });

  it('never manufactures a link from junk', () => {
    expect(beatLinks(null)).toEqual([]);
    expect(beatLinks({ id: 'b' })).toEqual([]);
    expect(beatLinks({ id: 'b', parameters: { connection: {}, choices: [null, {}], dialogTree: null } })).toEqual([]);
    // A non-string target is not a link.
    expect(beatLinks({ id: 'b', parameters: { timerTarget: 42 } })).toEqual([]);
  });
});

describe('storyLinks — the story-level array the validators were blind to', () => {
  it('reads every spelling: source/target, sourceId/targetId, from/to', () => {
    // The inject importer accepted source/target; the generation importer only
    // from/to and sourceId/targetId. Stories exist in all three.
    const links = storyLinks({
      beats: [],
      connections: [
        { source: 'a', target: 'b' },
        { sourceId: 'c', targetId: 'd' },
        { from: 'e', to: 'f', label: 'onward' },
      ],
    });
    expect(links).toEqual([
      { source: 'a', target: 'b', via: 'story-connections' },
      { source: 'c', target: 'd', via: 'story-connections' },
      { source: 'e', target: 'f', via: 'story-connections', label: 'onward' },
    ]);
  });

  it('combines beat-level and story-level links', () => {
    // The Round-2 fault in miniature: the dead link lives at story level and
    // must be visible next to the beat-level ones.
    const links = storyLinks({
      beats: [{ id: 'r5_title', parameters: { connection: { target: 'r5_text' } } }],
      connections: [{ source: 'r5_text', target: 'beat_intake' }],
    });
    expect(links.map(l => `${l.source}->${l.target}`)).toEqual([
      'r5_title->r5_text',
      'r5_text->beat_intake',
    ]);
  });
});

describe('dedupeLinks', () => {
  it('keeps the first (richest) link per pair — the AI duplicates targets into connections', () => {
    const deduped = dedupeLinks([
      { source: 'a', target: 'b', via: 'choice', label: 'Go' },
      { source: 'a', target: 'b', via: 'beat-connections' },
      { source: 'a', target: 'c', via: 'beat-connections' },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].label).toBe('Go');
  });
});
