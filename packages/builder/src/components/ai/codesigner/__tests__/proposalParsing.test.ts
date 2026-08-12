/**
 * Tests for Co-Designer proposal extraction: the fenced-block protocol,
 * tolerant JSON parsing, validation of each proposal kind, and clean-text
 * stripping (the chat must never show the raw block).
 */
import { describe, it, expect } from 'vitest';
import { extractProposalsFromReply, describeProposal } from '../proposalParsing';

const block = (json: string) => `Here's the batch.\n\n\`\`\`asaps-proposals\n${json}\n\`\`\``;

describe('extractProposalsFromReply', () => {
  it('returns the text untouched when there is no block', () => {
    const r = extractProposalsFromReply('Just advice, no proposals.');
    expect(r.proposalSet).toBe(null);
    expect(r.cleanText).toBe('Just advice, no proposals.');
  });

  it('parses a valid set and strips the block from the visible text', () => {
    const r = extractProposalsFromReply(block(JSON.stringify({
      title: 'Darker Marcus',
      rationale: 'Escalate menace early.',
      proposals: [
        { kind: 'editText', beatId: 'beat_2', param: 'text', newValue: 'He smiled without warmth.', note: 'tone' },
        { kind: 'addNote', beatId: 'beat_5', note: 'Rework pacing here' },
      ],
    })));
    expect(r.cleanText).toBe("Here's the batch.");
    expect(r.proposalSet?.title).toBe('Darker Marcus');
    expect(r.proposalSet?.proposals).toHaveLength(2);
    expect(r.droppedCount).toBe(0);
  });

  it('drops malformed entries but keeps the valid ones', () => {
    const r = extractProposalsFromReply(block(JSON.stringify({
      title: 'Mixed',
      proposals: [
        { kind: 'editText', beatId: 'beat_1', param: 'text', newValue: 'ok' },
        { kind: 'editText', beatId: 'beat_2' },              // missing newValue
        { kind: 'deleteBeat', beatId: 'beat_3' },            // unknown kind
        { kind: 'addNote', beatId: 'beat_4', note: '   ' },  // empty note
      ],
    })));
    expect(r.proposalSet?.proposals).toHaveLength(1);
    expect(r.droppedCount).toBe(3);
  });

  it('survives truncated JSON via the repair chain', () => {
    const r = extractProposalsFromReply(block(
      '{"title": "Trunc", "proposals": [{"kind": "addNote", "beatId": "b1", "note": "hi"'
    ));
    expect(r.proposalSet?.proposals).toEqual([{ kind: 'addNote', beatId: 'b1', note: 'hi' }]);
  });

  it('returns null set (not a throw) for hopeless blocks', () => {
    const r = extractProposalsFromReply(block('not json at all'));
    expect(r.proposalSet).toBe(null);
    expect(r.cleanText).toBe("Here's the batch.");
  });
});

describe('updateCharacter kind', () => {
  it('parses valid updates and drops disallowed keys', () => {
    const r = extractProposalsFromReply(block(JSON.stringify({
      title: 'Char',
      proposals: [
        { kind: 'updateCharacter', characterId: 'elena', updates: { description: 'darker now', id: 'hax', role: 'nope' } },
      ],
    })));
    expect(r.proposalSet?.proposals).toEqual([
      { kind: 'updateCharacter', characterId: 'elena', updates: { description: 'darker now' }, note: undefined },
    ]);
  });

  it('drops updateCharacter with no allowed keys', () => {
    const r = extractProposalsFromReply(block(JSON.stringify({
      title: 'Char',
      proposals: [{ kind: 'updateCharacter', characterId: 'elena', updates: { role: 'villain' } }],
    })));
    expect(r.proposalSet).toBe(null);
    expect(r.droppedCount).toBe(1);
  });

  it('accepts + clamps affect fields: traits, selection policy, and stance-bearing variants', () => {
    const r = extractProposalsFromReply(block(JSON.stringify({
      title: 'Affect',
      proposals: [{
        kind: 'updateCharacter', characterId: 'karin',
        updates: {
          traits: { openness: 1.7, neuroticism: -0.3, bogus: 5 },
          variantSelectionPolicy: 'random',
          variants: [
            { id: 'Hostile!', name: 'Hostile', characterDescription: 'v', stance: { warmth: -3, dominance: 0.5 }, initialMood: { valence: -2, arousal: 0.6 } },
            { name: 'Cooperative', stance: { warmth: 0.7, dominance: -0.2 } },
          ],
        },
      }],
    })));
    const u = (r.proposalSet!.proposals[0] as any).updates;
    expect(u.traits.openness).toBe(1);           // clamped to [0,1]
    expect(u.traits.neuroticism).toBe(0);
    expect(u.traits).not.toHaveProperty('bogus'); // unknown trait dropped
    expect(u.variantSelectionPolicy).toBe('random');
    expect(u.variants).toHaveLength(2);
    expect(u.variants[0].id).toBe('hostile');    // slugified
    expect(u.variants[0].stance).toEqual({ warmth: -1, dominance: 0.5 }); // clamped
    expect(u.variants[0].initialMood.valence).toBe(-1);
    expect(u.variants[1].id).toBe('cooperative'); // id from name
  });

  it('ignores an invalid variantSelectionPolicy value', () => {
    const r = extractProposalsFromReply(block(JSON.stringify({
      title: 'X',
      proposals: [{ kind: 'updateCharacter', characterId: 'k', updates: { description: 'ok', variantSelectionPolicy: 'sometimes' } }],
    })));
    const u = (r.proposalSet!.proposals[0] as any).updates;
    expect(u).not.toHaveProperty('variantSelectionPolicy');
    expect(u.description).toBe('ok');
  });
});

describe('describeProposal', () => {
  it('produces one-line human summaries', () => {
    expect(describeProposal({ kind: 'editText', beatId: 'b1', param: 'text', newValue: 'x' }))
      .toBe('Edit text on b1');
    expect(describeProposal({ kind: 'addBeat', beatType: 'infoText', name: 'Twist', connectFrom: 'b2' }))
      .toBe('Add infoText "Twist" (from b2)');
  });
});

describe('updateCharacter — counters', () => {
  const propose = (counters: unknown) => extractProposalsFromReply(block(JSON.stringify({
    title: 'Char',
    proposals: [{ kind: 'updateCharacter', characterId: 'elena', updates: { counters } }],
  }))).proposalSet?.proposals[0] as any;

  it('accepts an ordinary counter', () => {
    const c = propose([{ name: 'gold', displayName: 'Gold', value: 12, min: 0, max: 100 }]);
    expect(c.updates.counters).toEqual([
      { name: 'gold', displayName: 'Gold', value: 12, visible: true, min: 0, max: 100 },
    ]);
  });

  it('accepts a complete sentiment binding and zeroes its stored value', () => {
    // A derived counter stores nothing of its own — a leftover value would
    // be a second, stale answer to what the meter reads.
    const c = propose([{
      name: 'trust', displayName: 'Trust', value: 99, min: -100, max: 100,
      source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'Trust' },
    }]);
    expect(c.updates.counters[0].source).toEqual({
      kind: 'sentiment', toEntityRef: 'player', emotion: 'trust',
    });
    expect(c.updates.counters[0].value).toBe(0);
  });

  it('drops a half-specified binding rather than rendering a dead meter', () => {
    // kind: sentiment with no target reads nothing; better an ordinary
    // counter than a meter wired to nowhere.
    const c = propose([{ name: 'trust', source: { kind: 'sentiment', emotion: 'trust' } }]);
    expect(c.updates.counters[0].source).toBeUndefined();
  });

  it('accepts emotion and mood bindings', () => {
    const c = propose([
      { name: 'fear', source: { kind: 'emotion', emotion: 'fear' } },
      { name: 'spirits', source: { kind: 'mood', axis: 'valence' } },
    ]);
    expect(c.updates.counters[0].source).toEqual({ kind: 'emotion', emotion: 'fear' });
    expect(c.updates.counters[1].source).toEqual({ kind: 'mood', axis: 'valence' });
  });

  it('rejects a mood binding on an axis that does not exist', () => {
    const c = propose([{ name: 'x', source: { kind: 'mood', axis: 'dominance' } }]);
    expect(c.updates.counters[0].source).toBeUndefined();
  });

  it('sorts bands and drops malformed rows', () => {
    const c = propose([{
      name: 'trust',
      bands: [
        { from: 20, label: 'trusting' },
        { from: -100, label: 'wary' },
        { from: 'x', label: 'bad' },
        { from: 0 },
      ],
    }]);
    expect(c.updates.counters[0].bands).toEqual([
      { from: -100, label: 'wary' }, { from: 20, label: 'trusting' },
    ]);
  });

  it('slugifies names and de-duplicates collisions', () => {
    const c = propose([{ name: 'Deep Trust' }, { name: 'deep trust' }]);
    expect(c.updates.counters.map((k: any) => k.name)).toEqual(['deep_trust', 'deep_trust_2']);
  });

  it('ignores counters that are not objects with a name', () => {
    const c = propose([{ displayName: 'nameless' }, 'nope', null, { name: '  ' }]);
    expect(c?.updates?.counters).toBeUndefined();
  });
});
