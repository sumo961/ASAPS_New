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
