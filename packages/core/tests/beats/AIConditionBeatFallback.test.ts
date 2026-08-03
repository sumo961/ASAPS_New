/**
 * AIConditionBeat fallback routing — field bug 2026-08-02 (Netlify relay
 * deployment): aiCondition is parameter-derived so exports carry
 * connections: []. When the relay call failed, the beat returned null,
 * the engine declared the story ended, and the exported player restarted
 * from the title. The beat must never end the story while it has a
 * category to route to.
 */
import { describe, it, expect, vi } from 'vitest';
import { AIConditionBeat } from '../../src/beats/AIConditionBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

const beatConfig = () => ({
  id: 'b16',
  type: 'aiCondition',
  connections: [], // what exports actually carry for parameter-derived beats
  parameters: {
    prompt: 'Classify the player',
    categories: [
      { id: 'a', label: 'man and global north', targetId: 'beat_17' },
      { id: 'b', label: 'other', targetId: 'beat_18' },
    ],
  },
} as any);

describe('AIConditionBeat fallback routing (exported connections: [])', () => {
  it('routes to the FIRST category target when the AI call throws', async () => {
    const { renderer } = makeRenderer({}, {
      aiService: { classifyContent: vi.fn().mockRejectedValue(new Error('Relay request failed (404)')) },
    });
    const next = await new AIConditionBeat(beatConfig()).execute(makeContext(), renderer);
    expect(next).toBe('beat_17'); // not null — a dead story restarted the player
  });

  it('routes to the first category target when no AI service is configured', async () => {
    const { renderer } = makeRenderer({}, {});
    const next = await new AIConditionBeat(beatConfig()).execute(makeContext(), renderer);
    expect(next).toBe('beat_17');
  });

  it('still prefers aiDefaultTarget over the category fallback', async () => {
    const cfg = beatConfig();
    cfg.parameters.fallbackTarget = 'safe_exit'; // the param name the beat reads
    const { renderer } = makeRenderer({}, {
      aiService: { classifyContent: vi.fn().mockRejectedValue(new Error('boom')) },
    });
    const next = await new AIConditionBeat(cfg).execute(makeContext(), renderer);
    expect(next).toBe('safe_exit');
  });
});
