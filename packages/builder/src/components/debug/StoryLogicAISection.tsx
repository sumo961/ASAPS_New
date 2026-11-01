/**
 * "Check with AI" in the Story Logic tab: the author starts it, sees its size
 * first and can cancel. Findings are checked before they show and carry their
 * evidence. Nothing changes without the author: a fix is proposed, checked on
 * a copy of the story, and applied by the builder as one undo step.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Loader2, Route, Sparkles, X } from 'lucide-react';
import type { BeatArrival, StateSimulationAnalyzer, Story } from '@asaps/core';
import { useAI } from '../../hooks/useAI';
import { useAIFeatures } from '../../utils/aiFeatures';
import { getAIService } from '../../services';
import { getAIValidator } from '../../services/AIValidator';
import { requestAIFix } from '../../services/findingFixService';
import { buildStoryDigest } from '../../utils/storyDigest';
import { NO_SPEND, addSpend, createSpendMeter, describeSpend, formatTokens, formatUsd, priceOf, type AISpend } from '../../services/aiPricing';
import {
  FIRST_PASS_MIN_CANDIDATES, STORY_LOGIC_FIX_ROUTE, STORY_LOGIC_ROUTE, dismissFinding, estimateRun, estimateRunCost, firstPass, mergeChecked, pendingCandidates,
  runStoryLogicCheck, selectCandidates, visibleFindings, type RunProgress, type StoryLogicCandidate,
} from '../../services/storyLogicReview';
import type { StoryLogicFinding, StoryLogicKind, StoryLogicStore } from '../../types/storyLogic';
import type { AIFixSuggestion, StoryLogicProblemFinding } from '../../types/generationReview';

const KIND_LABEL: Record<StoryLogicKind, string> = {
  'assumes-missing-state': 'Assumes something missing',
  'contradicts-earlier-text': 'Contradicts earlier text',
  'character-knows-too-much': 'Knows too much',
  'feeling-mismatch': 'Feeling mismatch',
  'choice-promise-broken': 'Broken promise',
  'dangling-reference': 'Dangling reference',
};

type FixState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready' | 'applying'; suggestion: AIFixSuggestion };

/** Findings run their fixes side by side, so two can target the same text: once one is applied, the other was written against words that are gone. */
const editTargets = (s: AIFixSuggestion) => s.preview.map(p => `${p.beatId}|${p.path}`);
const STALE_FIX = 'Another fix changed this text. Propose a fix again to work from the new words.';

interface Props {
  story: Story;
  analyzer: StateSimulationAnalyzer;
  arrivals: Map<string, BeatArrival[]>;
  hubBeats: string[];
  flaggedBeats: string[];
  incoming: Map<string, string[]>;
  store: StoryLogicStore | null;
  onStoreChange: (store: StoryLogicStore) => void;
  onHighlightBeat?: (beatId: string) => void;
  onHighlightPath?: (beatIds: string[]) => void;
  onFixDecision?: (suggestion: AIFixSuggestion, decision: 'accepted' | 'rejected') => void;
  fixResult: { findingId: string; ok: boolean; error?: string } | null;
}

export const StoryLogicAISection: React.FC<Props> = (props) => {
  const aiOn = useAIFeatures();
  const { isConfigured } = useAI();
  if (!aiOn) return null;
  if (!isConfigured) {
    return (
      <div className="p-3 border border-gray-200 rounded-lg text-sm text-gray-600 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
        Set up an AI provider (AI ▸ Configure AI) to have an AI read these beats against the states players arrive in.
      </div>
    );
  }
  return <Section {...props} />;
};

const Section: React.FC<Props> = ({ story, analyzer, arrivals, hubBeats, flaggedBeats, incoming, store, onStoreChange, onHighlightBeat, onHighlightPath, onFixDecision, fixResult }) => {
  const beats = useMemo(() => story.getAllBeats().map((b: any) => ({
    id: b.id, name: b.name, type: b.type, speaker: b.speaker, parameters: b.getParameters(),
  })), [story]);
  const characters = useMemo(() => ((story as any).getCharacters?.() ?? []) as any[], [story]);
  const speakerNames = useMemo(() => {
    const settings: any = (story as any).getSettings?.() ?? {};
    const display = settings.speakerDisplay ?? settings.globalSettings?.speakerDisplay;
    return display?.nameStyle !== 'off' && display?.namePosition !== 'off';
  }, [story]);
  const candidates = useMemo(() => {
    const names = new Map<string, string>(characters.filter((c) => c?.id).flatMap((c) => [[c.id, c.displayName || c.name || c.id], [c.name, c.displayName || c.name]] as [string, string][]));
    return selectCandidates({
      beats, arrivals, hubBeats, flaggedBeats, incoming,
      speakerNames,
      affectOf: (st) => analyzer.affectAt(st) as Record<string, any> | undefined,
      nameOf: (r) => names.get(r) ?? r,
    });
  }, [beats, characters, arrivals, hubBeats, flaggedBeats, incoming, analyzer, speakerNames]);
  const digest = useMemo(() => buildStoryDigest({
    title: story.getMetadata().title, beats: story.getAllBeats() as any, characters: characters as any,
  }, { maxChars: 60000 }), [story, characters]);

  const pending = useMemo(() => pendingCandidates(candidates, store), [candidates, store]);
  const first = useMemo(() => (pending.length > FIRST_PASS_MIN_CANDIDATES ? firstPass(pending) : null), [pending]);
  const findings = useMemo(() => visibleFindings(candidates, store), [candidates, store]);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.beatId, c])), [candidates]);

  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [droppedCount, setDroppedCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  useEffect(() => () => abortRef.current?.abort(), []);

  // What the provider reports having used. Saved with the findings, so the
  // figures are still there when the project is opened again.
  const runMeter = useRef(createSpendMeter(STORY_LOGIC_ROUTE));
  const fixMeter = useRef(createSpendMeter(STORY_LOGIC_FIX_ROUTE));
  const recordSpend = (spend: AISpend, thisRun?: AISpend) => {
    if (spend.calls === 0 && !thisRun?.calls) return;
    const next: StoryLogicStore = {
      ...(storeRef.current ?? { version: 1, dismissed: [], checked: {} }),
      spent: addSpend(storeRef.current?.spent, spend),
      ...(thisRun ? { lastRun: thisRun } : {}),
    };
    storeRef.current = next;
    onStoreChange(next);
  };

  const run = async (list: StoryLogicCandidate[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunError(null);
    setDroppedCount(0);
    setProgress({ done: 0, total: 1, found: 0 });
    let thisRun = NO_SPEND;
    const noteRun = () => {
      const spend = runMeter.current();
      thisRun = addSpend(thisRun, spend);
      recordSpend(spend, thisRun);
    };
    try {
      await runStoryLogicCheck(
        list, digest,
        (sys, user, opts) => getAIService().completeTurn(sys, user, opts),
        {
          signal: controller.signal,
          onProgress: setProgress,
          onBatch: (checked, dropped) => {
            if (dropped.length) {
              console.warn('[StoryLogic] Findings dropped by the check:', dropped);
              setDroppedCount((n) => n + dropped.length);
            }
            const next = mergeChecked(storeRef.current, checked);
            storeRef.current = next;
            onStoreChange(next);
            noteRun();
          },
        },
      );
    } catch (err) {
      if (!controller.signal.aborted) setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      noteRun();
      abortRef.current = null;
      setProgress(null);
    }
  };

  // One entry per finding: asking about a second finding leaves the first running.
  const [fixes, setFixes] = useState<Record<string, FixState>>({});
  const fixAbortRef = useRef(new Map<string, AbortController>());
  const appliedTargetsRef = useRef(new Set<string>());
  useEffect(() => {
    const running = fixAbortRef.current;
    return () => running.forEach(c => c.abort());
  }, []);
  const setFix = (key: string, state: FixState | null) => setFixes(prev => {
    const next = { ...prev };
    if (state) next[key] = state; else delete next[key];
    return next;
  });

  const proposeFix = async (f: StoryLogicFinding) => {
    fixAbortRef.current.get(f.key)?.abort();
    const controller = new AbortController();
    fixAbortRef.current.set(f.key, controller);
    setFix(f.key, { status: 'loading' });
    const c = byId.get(f.beatId);
    const finding: StoryLogicProblemFinding = {
      id: f.key, kind: 'story-logic', beatId: f.beatId, beatName: c?.name, quote: f.quote,
      arrivingState: c?.arrivingStates[f.state] ?? '', message: f.why, suggestion: f.suggestion,
    };
    try {
      const validator = getAIValidator();
      await validator.ensureSchemaLoaded();
      const settings: any = (story as any).getSettings?.() ?? {};
      const result = await requestAIFix(
        finding,
        { story: { beats: story.getAllBeats().map((b: any) => b.toJSON()), variables: settings.variables, roles: settings.roles, characters } as any, schema: validator.getSchema() },
        (sys, user, signal) => getAIService().completeTurn(sys, user, { maxTokens: 4000, signal, route: STORY_LOGIC_FIX_ROUTE }),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!result.ok) setFix(f.key, { status: 'error', error: result.rationale ? `${result.reason} (AI: ${result.rationale})` : result.reason });
      else if (editTargets(result.suggestion).some(t => appliedTargetsRef.current.has(t))) setFix(f.key, { status: 'error', error: STALE_FIX });
      else setFix(f.key, { status: 'ready', suggestion: result.suggestion });
    } catch (err) {
      if (!controller.signal.aborted) setFix(f.key, { status: 'error', error: err instanceof Error ? err.message : String(err) });
    } finally {
      recordSpend(fixMeter.current());
    }
  };

  // The builder answers once it has applied the fix.
  useEffect(() => {
    if (!fixResult) return;
    const applying = fixes[fixResult.findingId];
    if (applying?.status !== 'applying') return;
    if (!fixResult.ok) {
      setFix(fixResult.findingId, { status: 'error', error: fixResult.error || 'The fix could not be applied.' });
      return;
    }
    const targets = new Set(editTargets(applying.suggestion));
    targets.forEach(t => appliedTargetsRef.current.add(t));
    setFixes(prev => {
      const next: Record<string, FixState> = {};
      for (const [key, state] of Object.entries(prev)) {
        if (key === fixResult.findingId) continue;
        next[key] = state.status === 'ready' && editTargets(state.suggestion).some(t => targets.has(t))
          ? { status: 'error', error: STALE_FIX }
          : state;
      }
      return next;
    });
  }, [fixResult, fixes]);

  const sizeLabel = (list: StoryLogicCandidate[]) => {
    const e = estimateRun(list, digest.length);
    const requests = `${e.batches} ${e.batches === 1 ? 'request' : 'requests'}`;
    const price = priceOf(getAIService().getCurrentModel());
    if (!price) return `≈ ${formatTokens(e.inputTokens)} tokens in, up to ${formatTokens(e.maxOutputTokens)} out, ${requests}`;
    const last = store?.lastRun;
    const cost = estimateRunCost(e, price, last?.calls ? last.outputTokens / last.calls : undefined);
    return cost.likely === null
      ? `at most ${formatUsd(cost.atMost)}, ${requests}`
      : `≈ ${formatUsd(cost.likely)} going by the last check, at most ${formatUsd(cost.atMost)}, ${requests}`;
  };
  const totalBeats = beats.length;

  return (
    <div data-testid="story-logic-ai">
      <h4 className="font-semibold mb-2 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-500" />
        AI findings{findings.length > 0 ? ` (${findings.length})` : ''}
      </h4>

      {progress ? (
        <div className="p-3 border border-purple-200 bg-purple-50 rounded-lg text-sm flex items-center gap-2" data-testid="story-logic-progress">
          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
          Checking… request {Math.min(progress.done + 1, progress.total)} of {progress.total}{progress.found ? `, ${progress.found} found so far` : ''}
          <button type="button" onClick={() => abortRef.current?.abort()} className="ml-auto underline">Cancel</button>
        </div>
      ) : pending.length > 0 ? (
        <div className="p-3 border border-gray-200 rounded-lg text-sm space-y-2">
          <p className="text-gray-600">
            An AI reads each beat next to the states players arrive in and reports where the words don't hold.{' '}
            {pending.length} of the story's {totalBeats} beats {pending.length === 1 ? 'is' : 'are'} to check; beats unchanged since their last check are skipped. Nothing changes without you.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="story-logic-run" onClick={() => run(pending)} className="px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700">
              Check with AI: all {pending.length}
            </button>
            <span className="text-xs text-gray-500">{sizeLabel(pending)}</span>
          </div>
          {first && first.length < pending.length && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="story-logic-first-pass" onClick={() => run(first)} className="px-3 py-1.5 rounded border border-purple-300 text-purple-800 hover:bg-purple-50">
                First pass: the {first.length} most players pass
              </button>
              <span className="text-xs text-gray-500">{sizeLabel(first)}</span>
            </div>
          )}
        </div>
      ) : candidates.length > 0 ? (
        <p className="text-sm text-gray-600 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> All {candidates.length} beats that vary by route have been checked.</p>
      ) : (
        <p className="text-sm text-gray-600">No beat here is reached in different states, so there is nothing for an AI to compare.</p>
      )}

      {runError && <p className="mt-2 text-sm text-red-700" data-testid="story-logic-error">The check stopped: {runError}. What was checked so far is kept; run it again to go on.</p>}
      {droppedCount > 0 && <p className="mt-2 text-xs text-gray-500">{droppedCount} {droppedCount === 1 ? 'finding was' : 'findings were'} left out: not grounded in the beat's words or states.</p>}

      {store?.lastRun && store.lastRun.calls > 0 && (
        <p className="mt-2 text-xs text-gray-500" data-testid="story-logic-spend">
          Last check: {describeSpend(store.lastRun)}.
          {store.spent && store.spent.calls > store.lastRun.calls && <> All checks and fixes on this story: {describeSpend(store.spent)}.</>}
          {' '}At standard API prices; your provider's bill is the final word.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {findings.map((f) => {
          const c = byId.get(f.beatId);
          const thisFix = fixes[f.key] ?? null;
          return (
            <div key={f.key} className="p-3 border border-purple-200 rounded-lg text-sm" data-testid="story-logic-finding">
              <div className="flex items-center gap-2 mb-1">
                <button type="button" onClick={() => onHighlightBeat?.(f.beatId)} className="font-medium text-blue-700 hover:underline">{c?.name || f.beatId}</button>
                <span className="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">{KIND_LABEL[f.kind]}</span>
                {f.severity === 'problem' && <span className="text-xs bg-yellow-200 text-yellow-900 px-1.5 py-0.5 rounded">Problem</span>}
              </div>
              <p className="italic text-gray-800">"{f.quote}"</p>
              <p className="mt-1 text-gray-700">{f.why}</p>
              <p className="mt-1 text-xs text-gray-500"><strong>Arriving with:</strong> {c?.arrivingStates[f.state]}</p>
              {f.suggestion && <p className="mt-1 text-xs text-gray-600"><strong>Suggestion:</strong> {f.suggestion}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <button type="button" onClick={() => proposeFix(f)} disabled={thisFix?.status === 'loading' || thisFix?.status === 'applying'} className="underline text-purple-800 disabled:opacity-50">Propose a fix</button>
                <button type="button" onClick={() => onHighlightPath?.(c?.statePaths[f.state] ?? [])} className="underline text-gray-700 inline-flex items-center gap-1"><Route className="w-3 h-3" /> Show this path</button>
                <button type="button" onClick={() => onHighlightBeat?.(f.beatId)} className="underline text-gray-700">Go to beat</button>
                <button type="button" onClick={() => onStoreChange(dismissFinding(storeRef.current, f.key))} className="underline text-gray-700 inline-flex items-center gap-1"><X className="w-3 h-3" /> Not a problem</button>
              </div>
              {thisFix?.status === 'loading' && <p className="mt-2 text-xs flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Asking the AI for a fix…</p>}
              {thisFix?.status === 'error' && <p className="mt-2 text-xs text-red-700">{thisFix.error}</p>}
              {(thisFix?.status === 'ready' || thisFix?.status === 'applying') && (
                <div className="mt-2 p-2 rounded bg-purple-50 border border-purple-200 text-xs" data-testid="story-logic-fix">
                  <div className="font-medium">AI proposes {thisFix.suggestion.edits.length === 1 ? '1 edit' : `${thisFix.suggestion.edits.length} edits`} <span className="font-normal opacity-80">, checked on a copy: nothing new breaks</span></div>
                  {thisFix.suggestion.rationale && <p className="mt-1">{thisFix.suggestion.rationale}</p>}
                  {thisFix.suggestion.preview.map((p, i) => (
                    <div key={i} className="mt-1">
                      <div className="opacity-70">{p.beatId !== f.beatId ? 'In another beat: ' : ''}{p.beatName || p.beatId} · {p.path}</div>
                      <div className="line-through opacity-70 break-words">{typeof p.before === 'string' ? p.before : JSON.stringify(p.before)}</div>
                      <div className="break-words">{typeof p.after === 'string' ? p.after : JSON.stringify(p.after)}</div>
                    </div>
                  ))}
                  <div className="mt-2 flex gap-3">
                    <button type="button" disabled={thisFix.status === 'applying'} onClick={() => { onFixDecision?.(thisFix.suggestion, 'accepted'); setFix(f.key, { status: 'applying', suggestion: thisFix.suggestion }); }} className="px-2 py-0.5 rounded bg-purple-600 text-white disabled:opacity-50">Apply</button>
                    <button type="button" onClick={() => { onFixDecision?.(thisFix.suggestion, 'rejected'); setFix(f.key, null); }} className="underline">Decline</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
