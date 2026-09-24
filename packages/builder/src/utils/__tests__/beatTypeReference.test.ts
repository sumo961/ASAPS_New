/**
 * get_beat_type_schema + the parameter check behind it: the Co-Designer
 * looks field names up instead of asking the author, and the app refuses
 * names a beat type does not have instead of silently ignoring them.
 */
import { describe, it, expect, vi } from 'vitest';
import { beatTypeReference, beatParameterProblem } from '../beatTypeReference';
import { applyChangeProposals } from '../applyChangeProposals';
import { beatLinks } from '../storyLinks';
import { redirectIncoming } from '../redirectIncoming';

describe('beatTypeReference', () => {
  it('lists aiConversation fields including the nested direction shape', () => {
    const ref = beatTypeReference('aiConversation');
    for (const f of ['scenario', 'npcName', 'openingLine', 'maxTurns', 'fallbackExitTarget', 'systemInstructions', 'directions']) {
      expect(ref).toContain(`- ${f} (`);
    }
    expect(ref).toMatch(/each item:[\s\S]*- triggerType \(string, required, default "topic-mention", one of topic-mention \| sentiment/);
    expect(ref).toMatch(/- actionExitTarget \(/);
    expect(ref).toMatch(/- fallbackExitTarget \(beat id string/);
    expect(ref).not.toMatch(/connection: target: string/);
  });

  it('resolves colloquial names and says when a type does not exist', () => {
    expect(beatTypeReference('conversation')).toMatch(/^BEAT TYPE aiConversation/);
    expect(beatTypeReference('spaceship')).toMatch(/No beat type "spaceship"/);
  });
});

describe('beatParameterProblem', () => {
  it('refuses unknown names and, for new beats, missing required fields', () => {
    expect(beatParameterProblem('aiConversation', { persona: 'x', scenario: 's' }, true)).toMatch(/no parameter "persona" \(it has: .*npcPersonality/);
    expect(beatParameterProblem('aiConversation', { npcName: 'Parent' }, true)).toMatch(/needs scenario/);
    expect(beatParameterProblem('aiConversation', { scenario: 's' }, true)).toBeNull();
    expect(beatParameterProblem('infoText', { text: 'x', locations: [] }, false)).toBeNull();
  });

  it('applier refuses a replaceBeat with guessed field names', () => {
    const b = (id: string, type: string) => ({ id, type, name: id, getParameters: () => ({}), toJSON: () => ({ id, parameters: {} }) });
    const ctx = { beats: [b('b0', 'titleScreen'), b('b1', 'dialogTree')], characters: [], updateBeat: vi.fn(), addBeat: vi.fn(() => ({ id: 'n' })), connectBeats: vi.fn() };
    const res = applyChangeProposals([{ kind: 'replaceBeat', beatId: 'b1', beatType: 'aiConversation', parameters: { scenario: 's', persona: 'angry parent' } }], ctx);
    expect(res[0]).toMatchObject({ ok: false, detail: expect.stringContaining('"persona"') });
    expect(ctx.addBeat).not.toHaveBeenCalled();
  });
});

describe('flat aiConversation exits (Inspector / schema form)', () => {
  it('are links, and move with a redirect', () => {
    const conv = { id: 'c', parameters: { directions: [{ id: 'd1', triggerType: 'turn-count', actionType: 'exit', actionExitTarget: 'old' }] } };
    expect(beatLinks(conv).map((l) => l.target)).toEqual(['old']);
    const moved = redirectIncoming([conv, { id: 'old', parameters: {} }], 'old', 'new');
    expect(moved.updates[0].updates.parameters.directions[0].actionExitTarget).toBe('new');
    expect(moved.leftovers).toEqual([]);
  });
});
