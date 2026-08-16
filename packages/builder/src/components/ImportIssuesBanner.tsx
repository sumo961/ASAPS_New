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
import { AlertTriangle, X } from 'lucide-react';

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
  onDismiss: () => void;
  /** Focus a beat in the graph when its row is clicked. */
  onSelectBeat?: (beatId: string) => void;
}

export function ImportIssuesBanner({
  brokenTargets, otherErrors = [], onDismiss, onSelectBeat,
}: ImportIssuesBannerProps) {
  const [expanded, setExpanded] = useState(true);
  if (brokenTargets.length === 0 && otherErrors.length === 0) return null;

  const n = brokenTargets.length;
  const beatsAffected = new Set(brokenTargets.map((b) => b.sourceBeatId)).size;

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
              They point at a beat that does not exist, so the story stops there
              when someone plays it. The rest of the story imported normally
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
                </li>
              ))}
              {otherErrors.map((e, i) => (
                <li key={`err-${i}`} className="text-xs opacity-90">{e}</li>
              ))}
            </ul>
          )}
          {(brokenTargets.length + otherErrors.length) > 0 && (
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
