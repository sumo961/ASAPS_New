/**
 * Two authoring gaps found through the Co-Designer (2026-09-24):
 *  - "${Clock}" in text named a COUNTER, and placeholders only read
 *    variables, so it showed up literally.
 *  - an aiConversation that ran out of turns stopped mid-exchange; direction
 *    exits could say goodbye (exitMessage), the turn cap could not.
 */
import { describe, it, expect, vi } from 'vitest';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import { AIConversationBeat } from '../../src/beats/AIConversationBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('text placeholders', () => {
  it('resolve counters as well as variables, in all three spellings', async () => {
    const ctx = makeContext((c) => {
      c.setCounter('Clock', 180);
      c.setVariable('caseName', 'Karin');
    });
    const { renderer, methods } = makeRenderer();
    await new InfoTextBeat({ id: 'b', text: '${caseName}: ${Clock} / {Clock} / $Clock$ min' } as any).execute(ctx, renderer);
    expect(methods.renderText.mock.calls[0][0]).toBe('Karin: 180 / 180 / 180 min');
  });

  it('leave unknown names and unset counters alone; variables win on a clash', async () => {
    const ctx = makeContext((c) => {
      c.setCounter('score', 3);
      c.setVariable('score', 'high');
    });
    const { renderer, methods } = makeRenderer();
    await new InfoTextBeat({ id: 'b', text: '${score} ${Prep} {json}' } as any).execute(ctx, renderer);
    expect(methods.renderText.mock.calls[0][0]).toBe('high ${Prep} {json}');
  });
});

describe('aiConversation closing line when turns run out', () => {
  function service(npc: string[]) {
    let i = 0;
    return {
      generateConversationTurn: vi.fn().mockImplementation((req: any) =>
        Promise.resolve({ text: req.systemPrompt.includes('conversation analyzer') ? '[]' : npc[i++ % npc.length] })),
      generateDialog: vi.fn(),
    };
  }

  function renderer(ai: unknown) {
    const { renderer: r } = makeRenderer({ renderConversationInput: 'fine' } as any);
    (r.getState as any).mockImplementation((k: string) => (k === 'aiService' ? ai : null));
    return r;
  }

  const params = { scenario: 'intake meeting', npcName: 'Parent', maxTurns: 1, fallbackExitTarget: 'next' };

  it('says the closing line, then takes the fallback exit', async () => {
    const ai = service(['Hello.', 'Go on.', 'We have to stop here — same time next week?']);
    const r = renderer(ai);
    const beat = new AIConversationBeat({ id: 'c', type: 'aiConversation', parameters: { ...params, fallbackExitMessage: 'time is up; propose next week' } } as any);
    const next = await beat.execute(makeContext(), r);
    expect(next).toBe('next');
    const lines = (r.renderDialog as any).mock.calls.map((c: any[]) => c[1]);
    expect(lines[lines.length - 1]).toBe('We have to stop here — same time next week?');
    const closingReq = ai.generateConversationTurn.mock.calls.map((c: any[]) => c[0].systemPrompt).find((p: string) => p.includes('has to end now'));
    expect(closingReq).toContain('time is up; propose next week');
  });

  it('without one, ends as before', async () => {
    const ai = service(['Hello.', 'Go on.']);
    const r = renderer(ai);
    await new AIConversationBeat({ id: 'c', type: 'aiConversation', parameters: params } as any).execute(makeContext(), r);
    expect(ai.generateConversationTurn.mock.calls.some((c: any[]) => c[0].systemPrompt.includes('has to end now'))).toBe(false);
    expect(new AIConversationBeat({ id: 'c', type: 'aiConversation', parameters: params } as any).getParameters()).not.toHaveProperty('fallbackExitMessage');
  });
});
