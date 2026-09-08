/**
 * What the story validator found, said out loud.
 *
 * `aiStoryValidator` has always caught broken targets — a choice pointing at a
 * beat that does not exist — and the result went to `console.warn`, which is
 * not a place authors look. A generated story then imports looking complete and
 * stops dead mid-playthrough, with the diagnosis sitting in a closed devtools
 * panel. That is how a 16-beat story shipped through a verification round
 * without anyone noticing it was unplayable past its opening scene.
 *
 * The import still goes through. A story with three bad links out of fifteen is
 * mostly good work, and refusing it wholesale would cost more than it saves —
 * so this reports rather than blocks, and pairs with the ⚠ marks the graph puts
 * on the beats concerned so the banner's list has somewhere to point.
 */
import React, { useState } from 'react';
import { AlertTriangle, X, Check, Wrench, Sparkles, Loader2 } from 'lucide-react';
import type { FixProposal, GenerationFinding, AIFixSuggestion } from '../types/generationReview';

/** State of one in-flight / answered "Ask AI" request. */
export interface AIFixState {
  findingId: string;
  status: 'loading' | 'ready' | 'error';
  suggestion?: AIFixSuggestion;
  error?: string;
}

export interface BrokenTarget {
  /** Beat the broken link starts from. */
  sourceBeatId: string;
  /** Human-facing name of that beat, when it has one. */
  sourceBeatName?: string;
  /** The id it points at, which no beat carries. */
  target: string;
}

export interface ImportIssuesBannerProps {
  brokenTargets: BrokenTarget[];
  /** Other validation errors worth showing, already phrased for a person. */
  otherErrors?: string[];
  /** Where the breakage came from — the copy differs: an import "went
   *  through with warnings", an edit "broke links just now (undo fixes it)".
   *  Defaults to 'import' for the two original feeders. */
  context?: 'import' | 'edit';
  onDismiss: () => void;
  /** Focus a beat in the graph when its row is clicked. */
  onSelectBeat?: (beatId: string) => void;
  /**
   * Deterministic fix proposals for what the validator found (generation
   * review). Each is one local, undoable edit; nothing applies until the
   * author says so. 'safe' ones may be applied together.
   */
  proposals?: FixProposal[];
  onApplyProposal?: (proposal: FixProposal) => void;
  onSkipProposal?: (proposal: FixProposal) => void;
  onApplyAllSafe?: () => void;
  /**
   * Open findings that got NO deterministic proposal. Missing-target ones
   * decorate their broken-link row with "Ask AI"; the rest render as rows
   * of their own. The model's answer, once checked by code, arrives in
   * `aiFix` as a before/after card the author accepts or rejects.
   */
  findings?: GenerationFinding[];
  onAskAI?: (finding: GenerationFinding) => void;
  aiFix?: AIFixState | null;
  onAcceptAIFix?: () => void;
  onRejectAIFix?: () => void;
  onCancelAIFix?: () => void;
}

const fmt = (v: unknown): string => {
  if (v === undefined) return '(empty)';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};

function AIFixCard({ aiFix, onAccept, onReject, onCancel }: { aiFix: AIFixState; onAccept?: () => void; onReject?: () => void; onCancel?: () => void }) {
  return (
    <div className="mt-2 rounded border border-violet-300 bg-violet-50 text-violet-950 px-3 py-2 text-xs" data-testid="ai-fix-card">
      {aiFix.status === 'loading' && (
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Asking the AI for a fix…
          {onCancel && <button type="button" onClick={onCancel} className="ml-auto underline opacity-80 hover:opacity-100">Cancel</button>}
        </div>
      )}
      {aiFix.status === 'error' && (
        <div className="flex items-start gap-2">
          <span className="flex-1">{aiFix.error || 'The AI could not propose a fix.'}</span>
          {onReject && <button type="button" onClick={onReject} className="underline opacity-80 hover:opacity-100">Close</button>}
        </div>
      )}
      {aiFix.status === 'ready' && aiFix.suggestion && (
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="w-3.5 h-3.5" /> AI proposes {aiFix.suggestion.edits.length === 1 ? '1 edit' : `${aiFix.suggestion.edits.length} edits`}
            <span className="font-normal opacity-80">— checked: the problem goes away and nothing new breaks</span>
          </div>
          {aiFix.suggestion.rationale && <div className="mt-1 opacity-90">{aiFix.suggestion.rationale}</div>}
          <ul className="mt-1 space-y-1">
            {aiFix.suggestion.preview.map((p, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr] gap-x-2" data-testid="ai-fix-edit">
                <span className="font-mono opacity-80">{p.beatName || p.beatId} · {p.path}</span>
                <span>
                  <span className="line-through text-red-700/80 mr-2">{fmt(p.before)}</span>
                  <span className="text-emerald-800 font-medium">{fmt(p.after)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            {onAccept && (
              <button type="button" onClick={onAccept} className="px-2 py-0.5 rounded bg-violet-700 text-white hover:bg-violet-800 flex items-center gap-1" aria-label="Accept AI fix">
                <Check className="w-3 h-3" /> Accept (one undo step)
              </button>
            )}
            {onReject && <button type="button" onClick={onReject} className="px-2 py-0.5 rounded hover:bg-violet-100" aria-label="Reject AI fix">Reject</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ImportIssuesBanner({
  brokenTargets, otherErrors = [], context = 'import', onDismiss, onSelectBeat,
  proposals = [], onApplyProposal, onSkipProposal, onApplyAllSafe,
  findings = [], onAskAI, aiFix = null, onAcceptAIFix, onRejectAIFix, onCancelAIFix,
}: ImportIssuesBannerProps) {
  const [expanded, setExpanded] = useState(true);
  const findingRows = findings.filter((f) => f.kind !== 'missing-target');
  const askableFor = (b: BrokenTarget): GenerationFinding | undefined =>
    findings.find((f) => f.kind === 'missing-target' && f.beatId === b.sourceBeatId && f.targetId === b.target);
  const askButton = (f: GenerationFinding) => onAskAI ? (
    <button
      type="button"
      onClick={() => onAskAI(f)}
      disabled={aiFix?.status === 'loading'}
      className="ml-2 px-1.5 py-0.5 rounded border border-violet-300 bg-white text-violet-800 hover:bg-violet-50 inline-flex items-center gap-1 disabled:opacity-50"
      aria-label={`Ask AI: ${f.message}`}
      title="Ask the configured AI for a fix — you see the exact edits before anything is applied"
    >
      <Sparkles className="w-3 h-3" /> Ask AI
    </button>
  ) : null;
  if (brokenTargets.length === 0 && otherErrors.length === 0 && proposals.length === 0 && findingRows.length === 0) return null;

  const n = brokenTargets.length;
  const beatsAffected = new Set(brokenTargets.map((b) => b.sourceBeatId)).size;
  const safeCount = proposals.filter((p) => p.confidence === 'safe').length;

  return (
    <div className="mx-3 mt-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 shadow-sm">
      <div className="flex items-start gap-2 px-3 py-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {n > 0
              ? `${n} choice${n === 1 ? ' leads' : 's lead'} nowhere`
              : 'This story imported with warnings'}
          </div>
          {n > 0 && (
            <div className="text-xs opacity-90 mt-0.5">
              {/* Say what the interactor will experience, not what the data looks
                  like — "points at a missing beat" means nothing until you have
                  watched a story stop dead. */}
              {context === 'edit'
                ? 'They point at a beat that was just deleted, so the story stops there when someone plays it. Undo restores the beat; or retarget the choices'
                : 'They point at a beat that does not exist, so the story stops there when someone plays it. The rest of the story imported normally'}
              {beatsAffected > 0 && ` — ${beatsAffected} beat${beatsAffected === 1 ? ' is' : 's are'} marked ⚠ in the graph`}.
            </div>
          )}
          {expanded && (
            <ul className="mt-2 space-y-1">
              {brokenTargets.map((b, i) => (
                <li key={`${b.sourceBeatId}-${b.target}-${i}`} className="text-xs">
                  <button
                    type="button"
                    onClick={() => onSelectBeat?.(b.sourceBeatId)}
                    className="text-left hover:underline"
                    title={onSelectBeat ? 'Show this beat in the graph' : undefined}
                  >
                    <span className="font-medium">{b.sourceBeatName || b.sourceBeatId}</span>
                    <span className="opacity-70"> → </span>
                    <code className="px-1 rounded bg-amber-200/70">{b.target}</code>
                    <span className="opacity-70"> (no such beat)</span>
                  </button>
                  {(() => { const f = askableFor(b); return f ? askButton(f) : null; })()}
                  {aiFix && askableFor(b)?.id === aiFix.findingId && (
                    <AIFixCard aiFix={aiFix} onAccept={onAcceptAIFix} onReject={onRejectAIFix} onCancel={onCancelAIFix} />
                  )}
                </li>
              ))}
              {findingRows.map((f) => (
                <li key={f.id} className="text-xs" data-testid="finding-row">
                  <button type="button" onClick={() => onSelectBeat?.(f.beatId)} className="text-left hover:underline opacity-90">{f.message}</button>
                  {askButton(f)}
                  {aiFix && aiFix.findingId === f.id && (
                    <AIFixCard aiFix={aiFix} onAccept={onAcceptAIFix} onReject={onRejectAIFix} onCancel={onCancelAIFix} />
                  )}
                </li>
              ))}
              {otherErrors.map((e, i) => (
                <li key={`err-${i}`} className="text-xs opacity-90">{e}</li>
              ))}
            </ul>
          )}
          {expanded && proposals.length > 0 && (
            <div className="mt-2" data-testid="fix-proposals">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Wrench className="w-3.5 h-3.5" />
                {proposals.length === 1 ? '1 proposed fix' : `${proposals.length} proposed fixes`}
                <span className="font-normal opacity-80">— each is one edit you can undo</span>
                {safeCount > 0 && onApplyAllSafe && (
                  <button
                    type="button"
                    onClick={onApplyAllSafe}
                    className="ml-auto px-2 py-0.5 rounded bg-amber-700 text-white hover:bg-amber-800"
                    title="Apply every proposal marked safe, as one undo step"
                  >
                    Apply {safeCount} safe fix{safeCount === 1 ? '' : 'es'}
                  </button>
                )}
              </div>
              <ul className="mt-1 space-y-1">
                {proposals.map((p) => (
                  <li key={p.id} className="text-xs flex items-start gap-2" data-testid="fix-proposal">
                    <span
                      className={`mt-0.5 px-1 rounded text-[10px] uppercase tracking-wide ${p.confidence === 'safe' ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'}`}
                      title={p.confidence === 'safe' ? 'Unambiguous — safe to apply' : 'Have a look before applying'}
                    >
                      {p.confidence === 'safe' ? 'safe' : 'review'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectBeat?.(p.beatId)}
                      className="flex-1 text-left hover:underline"
                      title={onSelectBeat ? 'Show this beat in the graph' : undefined}
                    >
                      {p.description}
                    </button>
                    {onApplyProposal && (
                      <button
                        type="button"
                        onClick={() => onApplyProposal(p)}
                        className="px-2 py-0.5 rounded bg-white border border-amber-300 hover:bg-amber-100 flex items-center gap-1"
                        aria-label={`Apply: ${p.description}`}
                      >
                        <Check className="w-3 h-3" /> Apply
                      </button>
                    )}
                    {onSkipProposal && (
                      <button
                        type="button"
                        onClick={() => onSkipProposal(p)}
                        className="px-2 py-0.5 rounded hover:bg-amber-100 opacity-80"
                        aria-label={`Skip: ${p.description}`}
                      >
                        Skip
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(brokenTargets.length + otherErrors.length + proposals.length + findingRows.length) > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs underline opacity-80 hover:opacity-100"
            >
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded hover:bg-amber-200/60 flex-shrink-0"
          title="Dismiss"
          aria-label="Dismiss import warnings"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
