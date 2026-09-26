/**
 * When a character's HUD shows (2026-09-25): once the player MEETS them —
 * a beat or dialog line featuring them has run — unless hudReveal is
 * 'fromStart' (the default for the player's own character). A random
 * variant draw at story start no longer announces them early.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import { AIConversationBeat } from '../../src/beats/AIConversationBeat';
import { Beat } from '../../src/beats/Beat';
import { makeRenderer } from '../helpers/beatHarness';

const karin = {
  id: 'char_karin', name: 'karin', displayName: 'Karin', role: 'npc',
  variantSelectionPolicy: 'random',
  variants: [{ id: 'defensive', name: 'Defensive' }, { id: 'frightened', name: 'Frightened' }],
  counters: [{ name: 'trust', visible: true, showLevelMeter: true }],
};

function setup(chars: any[]) {
  const story = new Story();
  story.setCharacters(chars);
  const ctx = new StoryContext(undefined, story);
  return { story, ctx };
}

async function run(story: Story, ctx: StoryContext, config: any) {
  const beat = new InfoTextBeat({ type: 'infoText', parameters: { text: 'x' }, connections: [{ targetId: 'next' }], ...config } as any);
  story.addBeat(beat);
  await beat.execute(ctx, makeRenderer().renderer);
}

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('character HUD reveal', () => {
  it('a randomly drawn NPC stays hidden until a beat names her as speaker', async () => {
    const { story, ctx } = setup([karin]);
    expect(ctx.getActiveCharacterVariant('char_karin')).toBeDefined(); // drawn at start…
    expect(ctx.isCharacterHudRevealed('char_karin')).toBe(false);     // …but not met yet
    await run(story, ctx, { id: 'b1', speaker: 'Narrator' });
    await run(story, ctx, { id: 'b2', speaker: 'Character' });        // a generic label is nobody
    expect(ctx.isCharacterHudRevealed('char_karin')).toBe(false);
    const appeared = vi.fn();
    ctx.on('characterAppeared', appeared);
    await run(story, ctx, { id: 'b3', speaker: 'Karin' });
    await run(story, ctx, { id: 'b4', speaker: 'Karin' });
    expect(ctx.isCharacterHudRevealed('char_karin')).toBe(true);
    expect(appeared).toHaveBeenCalledTimes(1); // first meeting only
  });

  it('an AI conversation partner, a placeholder speaker and a placed character all count', async () => {
    const call = new AIConversationBeat({ id: 'ai', type: 'aiConversation', parameters: { npcName: 'Karin' } } as any);
    expect(Beat.featuredCharacterRefs(call)).toContain('Karin');
    for (const config of [
      { id: 'b', speaker: '${Caregiver}' },
      { id: 'c', locations: [{ kind: 'character', name: 'k', characterId: 'char_karin', x: 0, y: 0, width: 10, height: 10 }] },
    ]) {
      const { story, ctx } = setup([karin]);
      ctx.setVariable('Caregiver', 'Karin');
      await run(story, ctx, config);
      expect([config.id, ctx.hasCharacterAppeared('char_karin')]).toEqual([config.id, true]);
    }
  });

  it("'fromStart' shows at once; the player's own character defaults to it", () => {
    const { ctx } = setup([
      { ...karin, hudReveal: 'fromStart' },
      { id: 'char_me', name: 'me', role: 'player' },
      { id: 'char_npc', name: 'npc', role: 'npc' },
    ]);
    expect(ctx.isCharacterHudRevealed('char_karin')).toBe(true);
    expect(ctx.isCharacterHudRevealed('char_me')).toBe(true);
    expect(ctx.isCharacterHudRevealed('char_npc')).toBe(false);
  });

  it('survives save/load, and a mid-story start counts visited beats that feature her', async () => {
    const { story, ctx } = setup([karin]);
    await run(story, ctx, { id: 'call', speaker: 'Karin' });
    const saved = ctx.serialize();
    const fresh = setup([karin]);
    fresh.story.addBeat(story.getBeat('call')!);
    fresh.ctx.loadFromSerialized(saved);
    expect(fresh.ctx.isCharacterHudRevealed('char_karin')).toBe(true);

    const preset = setup([karin]);
    preset.story.addBeat(story.getBeat('call')!);
    preset.ctx.markBeatVisited('call');
    expect(preset.ctx.hasCharacterAppeared('char_karin')).toBe(true);
  });
});

describe('variants do not hide a HUD (2026-09-26)', () => {
  const clare = { id: 'char_clare', name: 'clare', displayName: 'Clare', role: 'player', variants: [{ id: 'clare_unguarded', name: 'Unguarded' }] };
  const nathan = { id: 'char_nathan', name: 'nathan', displayName: 'Nathan', role: 'npc', variants: [{ id: 'nathan_resurfaced', name: 'Resurfaced' }] };

  it('a transition variant (no default, not random): the base persona is in play from the start', async () => {
    const { story, ctx } = setup([clare, nathan]);
    expect(ctx.isCharacterHudRevealed('char_clare')).toBe(true);    // player: from the start
    expect(ctx.isCharacterHudRevealed('char_nathan')).toBe(false);  // npc: not met yet
    await run(story, ctx, { id: 'n1', speaker: 'Nathan' });
    expect(ctx.isCharacterHudRevealed('char_nathan')).toBe(true);   // met — no variant switch needed
  });

  it("'onVariantChosen' waits for the choice (player-picks-a-persona stories)", () => {
    const { ctx } = setup([{ ...nathan, hudReveal: 'onVariantChosen' }]);
    expect(ctx.isCharacterHudRevealed('char_nathan')).toBe(false);
    ctx.applyEffect({ type: 'setCharacterVariant', target: 'char_nathan', variantId: 'nathan_resurfaced' } as any);
    expect(ctx.isCharacterHudRevealed('char_nathan')).toBe(true);
  });
});
