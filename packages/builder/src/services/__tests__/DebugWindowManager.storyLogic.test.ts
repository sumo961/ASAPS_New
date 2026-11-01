/** The Debug window's channel back to the builder for AI Story Logic. */
import { describe, it, expect, vi } from 'vitest';
import { DebugWindowManager } from '../DebugWindowManager';
import { storyLogicFixEntries } from '../../utils/aiEditsLedger';

const deliver = (m: DebugWindowManager, data: any) => (m as any).handleMessage({ origin: window.location.origin, data });
const suggestion: any = { findingId: 'f', rationale: 'r', preview: [], edits: [{ id: 'e', findingId: 'f', kind: 'ai-edit', beatId: 'b', path: 'text', value: 'v', description: 'Reworded', confidence: 'review', source: 'ai' }] };

describe('Story Logic messages', () => {
  it('hands saves and fix decisions to the builder, and ignores other origins', () => {
    const m = new DebugWindowManager();
    const cb = vi.fn();
    m.subscribeToStoryLogic(cb);
    const store = { version: 1 as const, dismissed: [], checked: {} };
    deliver(m, { type: 'SAVE_STORY_LOGIC', payload: { storyLogic: store } });
    expect(cb).toHaveBeenLastCalledWith({ kind: 'save', store });
    deliver(m, { type: 'STORY_LOGIC_FIX', payload: { suggestion, decision: 'accepted' } });
    expect(cb).toHaveBeenLastCalledWith({ kind: 'fix', suggestion, decision: 'accepted' });
    cb.mockClear();
    (m as any).handleMessage({ origin: 'https://elsewhere.example', data: { type: 'SAVE_STORY_LOGIC', payload: { storyLogic: store } } });
    expect(cb).not.toHaveBeenCalled();
    m.destroy();
  });

  it('sends the stored results with each story update', () => {
    const m = new DebugWindowManager();
    const postMessage = vi.fn();
    (m as any).debugWindow = { closed: false, postMessage, close: vi.fn() };
    const store = { version: 1 as const, dismissed: ['k'], checked: {} };
    m.setStoryLogic(store);
    m.sendStoryUpdate({ beats: [] } as any);
    expect(postMessage.mock.calls[0][0].payload.storyLogic).toBe(store);
    m.sendFixResult('f', true);
    expect(postMessage.mock.calls[1][0]).toMatchObject({ type: 'FIX_RESULT', payload: { findingId: 'f', ok: true } });
    m.destroy();
  });

  it('a fix decision goes in the ledger as story-logic', () => {
    expect(storyLogicFixEntries(suggestion, 'accepted')[0]).toMatchObject({ source: 'story-logic', decision: 'accepted', batch: 'f', beatIds: ['b'] });
    expect(storyLogicFixEntries(suggestion, 'rejected')[0].detail).toMatch(/Rejected/);
  });
});
