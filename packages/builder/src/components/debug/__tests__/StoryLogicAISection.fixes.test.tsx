import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { StoryLogicAISection } from '../StoryLogicAISection';
import type { AIFixSuggestion } from '../../../types/generationReview';

const pending = new Map<string, (r: unknown) => void>();

vi.mock('../../../utils/aiFeatures', () => ({ useAIFeatures: () => true }));
vi.mock('../../../hooks/useAI', () => ({ useAI: () => ({ isConfigured: true }) }));
vi.mock('../../../services', () => ({ getAIService: () => ({ completeTurn: vi.fn(), getCurrentModel: () => 'claude-opus-5-5' }) }));
vi.mock('../../../services/AIValidator', () => ({ getAIValidator: () => ({ ensureSchemaLoaded: async () => {}, getSchema: () => ({}) }) }));
vi.mock('../../../utils/storyDigest', () => ({ buildStoryDigest: () => '' }));
vi.mock('../../../services/findingFixService', () => ({
  requestAIFix: (finding: { id: string }) => new Promise((resolve) => pending.set(finding.id, resolve)),
}));
vi.mock('../../../services/storyLogicReview', async (original) => ({
  ...(await original<object>()),
  selectCandidates: () => [
    { beatId: 'a', name: 'First', arrivingStates: ['s'], incoming: [] },
    { beatId: 'b', name: 'Second', arrivingStates: ['s'], incoming: [] },
  ],
  pendingCandidates: (candidates: unknown[], store: { showPending?: boolean } | null) => (store?.showPending ? candidates : []),
  estimateRun: () => ({ batches: 2, inputTokens: 100_000, sharedTokens: 40_000, maxOutputTokens: 8000 }),
  visibleFindings: () => ['a', 'b'].map((beatId) => ({
    key: beatId, beatId, kind: 'dangling-reference', quote: `quote ${beatId}`, state: 0, why: 'why', severity: 'worth a look', suggestion: 'hint',
  })),
}));

const suggestion = (findingId: string, beatId: string, after: string): AIFixSuggestion => ({
  findingId, rationale: `because ${findingId}`, edits: [],
  preview: [{ beatId, beatName: beatId, path: 'question', before: 'old', after }],
} as unknown as AIFixSuggestion);

const props = (over: object = {}) => ({
  story: { getAllBeats: () => [], getMetadata: () => ({ title: 't' }), getSettings: () => ({}) } as any,
  analyzer: {} as any, arrivals: new Map(), hubBeats: [], flaggedBeats: [], incoming: new Map(),
  store: { version: 1 as const, dismissed: [], checked: {} }, onStoreChange: () => {}, fixResult: null, ...over,
});

const cardOf = (quote: string) => screen.getByText(new RegExp(quote)).parentElement as HTMLElement;
const propose = (quote: string) => fireEvent.click(within(cardOf(quote)).getByText('Propose a fix'));
const settle = (id: string, s: AIFixSuggestion) => act(async () => { pending.get(id)!({ ok: true, suggestion: s }); });

describe('Story Logic: fixes run per finding', () => {
  beforeEach(() => pending.clear());

  it('a second Propose a fix leaves the first running, and each answer lands on its own finding', async () => {
    render(<StoryLogicAISection {...props()} />);
    propose('quote a');
    await waitFor(() => expect(pending.has('a')).toBe(true));
    propose('quote b');
    await waitFor(() => expect(pending.has('b')).toBe(true));
    expect(screen.getAllByText(/Asking the AI/)).toHaveLength(2);

    await settle('a', suggestion('a', 'a', 'answer for a'));
    expect(within(cardOf('quote a')).getByText('answer for a')).toBeTruthy();
    expect(within(cardOf('quote b')).getByText(/Asking the AI/)).toBeTruthy();

    await settle('b', suggestion('b', 'b', 'answer for b'));
    expect(within(cardOf('quote b')).getByText('answer for b')).toBeTruthy();
    expect(within(cardOf('quote a')).getByText('answer for a')).toBeTruthy();
  });

  it('says when an edit lands in a different beat from the finding', async () => {
    render(<StoryLogicAISection {...props()} />);
    propose('quote b');
    await waitFor(() => expect(pending.has('b')).toBe(true));
    await settle('b', suggestion('b', 'a', 'edit elsewhere'));
    expect(within(cardOf('quote b')).getByText(/In another beat: a · question/)).toBeTruthy();
  });

  it('applying one fix retires another written against the same text', async () => {
    const { rerender } = render(<StoryLogicAISection {...props()} />);
    propose('quote a');
    propose('quote b');
    await waitFor(() => expect(pending.size).toBe(2));
    await settle('a', suggestion('a', 'a', 'answer for a'));
    await settle('b', suggestion('b', 'a', 'answer for b'));

    fireEvent.click(within(cardOf('quote a')).getByText('Apply'));
    rerender(<StoryLogicAISection {...props({ fixResult: { findingId: 'a', ok: true } })} />);

    await waitFor(() => expect(within(cardOf('quote b')).getByText(/Another fix changed this text/)).toBeTruthy());
    expect(within(cardOf('quote b')).queryByText('Apply')).toBeNull();
    expect(within(cardOf('quote a')).queryByText('answer for a')).toBeNull();
  });
});

describe('Story Logic: what it costs', () => {
  const spend = { calls: 2, inputTokens: 100_000, cacheReadTokens: 50_000, cacheWriteTokens: 0, outputTokens: 2000, costUsd: 0.45, unpricedCalls: 0 };

  it('shows dollars before a first check, without guessing a likely figure', () => {
    render(<StoryLogicAISection {...props({ store: { version: 1, dismissed: [], checked: {}, showPending: true } })} />);
    expect(screen.getByText(/^at most \$\d+\.\d\d, 2 requests$/)).toBeTruthy();
    expect(screen.queryByTestId('story-logic-spend')).toBeNull();
  });

  it('after a check, shows what it really used and goes by that for the next estimate', () => {
    render(<StoryLogicAISection {...props({ store: { version: 1, dismissed: [], checked: {}, showPending: true, lastRun: spend, spent: { ...spend, calls: 3, costUsd: 0.6 } } })} />);
    const line = screen.getByTestId('story-logic-spend').textContent;
    expect(line).toContain('Last check: $0.45 (100k tokens in, 50k from cache, 2k out, 2 requests)');
    expect(line).toContain('All checks and fixes on this story: $0.60');
    expect(screen.getByText(/going by the last check, at most/)).toBeTruthy();
  });
});
