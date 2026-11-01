import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { StoryLogicAISection } from '../StoryLogicAISection';
import type { AIFixSuggestion } from '../../../types/generationReview';

const pending = new Map<string, (r: unknown) => void>();

vi.mock('../../../utils/aiFeatures', () => ({ useAIFeatures: () => true }));
vi.mock('../../../hooks/useAI', () => ({ useAI: () => ({ isConfigured: true }) }));
vi.mock('../../../services', () => ({ getAIService: () => ({ completeTurn: vi.fn() }) }));
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
  pendingCandidates: () => [],
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
