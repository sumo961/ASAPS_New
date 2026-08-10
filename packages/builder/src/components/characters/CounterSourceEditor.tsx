/**
 * Counter source binding editor — "counter as display, not mechanic".
 *
 * Lets an author turn a counter from something they move by hand into a
 * read-only window onto affect state, and — just as importantly — shows
 * them what the resulting meter will actually do. See
 * `docs/Counter-Binding-Design.md`.
 *
 * The projection preview is interactive rather than live: at authoring time
 * there is no runtime sentiment to read, so pretending to show one would be
 * a fiction. Dragging the strength slider is the honest equivalent, and it
 * answers the question the author actually has — "what will this bar do?"
 */
import React, { useMemo, useState } from 'react';
import { Link2, Unlink, Info } from 'lucide-react';
import {
  counterRange,
  projectStrength,
  barFill,
  resolveBand,
  DEFAULT_EMOTION_PALETTE,
  type CounterSource,
  type CounterBand,
} from '@asaps/core';
import type { Character, CharacterCounter } from '../../types/character';

interface CounterSourceEditorProps {
  counter: CharacterCounter;
  /** The character this counter belongs to — the default sentiment holder. */
  owner: Character;
  /** Cast list, for choosing sentiment targets and cross-character holders. */
  characters: Character[];
  onChange: (next: CharacterCounter) => void;
}

type SourceKind = 'authored' | 'sentiment' | 'emotion' | 'mood';

const KIND_LABELS: Record<SourceKind, { label: string; hint: string }> = {
  authored: {
    label: 'You set it at specific moments',
    hint: 'You decide exactly when it changes and by how much, using effects.',
  },
  sentiment: {
    label: 'It responds — a feeling toward someone',
    hint: 'Directed and two-sided: negative trust is distrust.',
  },
  emotion: {
    label: 'It responds — an emotion they feel',
    hint: 'An intensity from none to overwhelming. Fear has no opposite.',
  },
  mood: {
    label: 'It responds — their overall mood',
    hint: 'One axis of the mood circumplex.',
  },
};

/**
 * Ladders proposed per source kind. Bipolar ones carry a neutral band
 * because sentiments currently start at zero for everyone — without it the
 * first thing an interactor ever reads is a negative word about someone
 * nobody has met. An author who seeds an opening stance should delete it.
 */
function suggestBands(kind: SourceKind, min: number, max: number): CounterBand[] {
  const lo = min;
  const hi = max;
  if (kind === 'emotion' || min >= 0) {
    return [
      { from: lo, label: 'none' },
      { from: lo + (hi - lo) * 0.25, label: 'slight' },
      { from: lo + (hi - lo) * 0.5, label: 'moderate' },
      { from: lo + (hi - lo) * 0.75, label: 'strong' },
    ];
  }
  if (kind === 'mood') {
    return [
      { from: lo, label: 'unpleasant' },
      { from: lo * 0.2, label: 'flat' },
      { from: hi * 0.2, label: 'pleasant' },
    ];
  }
  return [
    { from: lo, label: 'strong distrust' },
    { from: lo * 0.6, label: 'wary' },
    { from: lo * 0.2, label: 'neutral' },
    { from: hi * 0.2, label: 'trusting' },
    { from: hi * 0.6, label: 'deep trust' },
  ];
}

// Two decimals, so the displayed strength and the displayed result agree.
// Rounding to one would render "0.6 → 62", which reads as broken arithmetic
// in the one place whose whole job is making the projection predictable.
const round = (n: number) => Math.round(n * 100) / 100;

export const CounterSourceEditor: React.FC<CounterSourceEditorProps> = ({
  counter,
  owner,
  characters,
  onChange,
}) => {
  const kind: SourceKind = counter.source?.kind ?? 'authored';
  const [previewStrength, setPreviewStrength] = useState(0.62);

  const range = useMemo(() => counterRange(counter), [counter]);

  // Emotion levels are stored [0,1] — a negative preview would show a state
  // the runtime cannot reach.
  const effectivePreview = kind === 'emotion' ? Math.abs(previewStrength) : previewStrength;
  const previewValue = projectStrength(effectivePreview, range);
  const previewFill = barFill(previewValue, range);
  const previewBand = resolveBand(previewValue, counter.bands);

  const setSource = (next: CounterSource | undefined) =>
    onChange({ ...counter, source: next });

  const changeKind = (nextKind: SourceKind) => {
    if (nextKind === kind) return;
    if (nextKind === 'authored') return setSource(undefined);
    if (nextKind === 'sentiment') {
      return setSource({ kind: 'sentiment', toEntityRef: '', emotion: 'trust' });
    }
    if (nextKind === 'emotion') return setSource({ kind: 'emotion', emotion: 'fear' });
    return setSource({ kind: 'mood', axis: 'valence' });
  };

  const source = counter.source;

  // Assist, don't impose: a sentiment named after a palette emotion is very
  // likely unipolar ("fear of the wolf"), where a negative value is as
  // meaningless as negative wariness. Suggest, never enforce.
  const unipolarHint =
    source?.kind === 'sentiment' &&
    !!DEFAULT_EMOTION_PALETTE.find((e) => e.name === source.emotion?.toLowerCase()) &&
    range.min < 0;

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      <div className="flex items-center gap-2">
        {kind === 'authored'
          ? <Unlink className="w-3.5 h-3.5 text-gray-400" />
          : <Link2 className="w-3.5 h-3.5 text-blue-500" />}
        <span className="text-xs font-medium text-gray-600">How does this change?</span>
      </div>

      <select
        value={kind}
        onChange={(e) => changeKind(e.target.value as SourceKind)}
        className="w-full px-2 py-1 border rounded text-xs"
        aria-label="Counter source"
      >
        {(Object.keys(KIND_LABELS) as SourceKind[]).map((k) => (
          <option key={k} value={k}>{KIND_LABELS[k].label}</option>
        ))}
      </select>
      <p className="text-[11px] text-gray-400">{KIND_LABELS[kind].hint}</p>

      {source?.kind === 'sentiment' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-gray-500">
            Feeling
            <input
              type="text"
              value={source.emotion}
              onChange={(e) => setSource({ ...source, emotion: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs mt-0.5"
              placeholder="trust"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            Toward
            <select
              value={source.toEntityRef}
              onChange={(e) => setSource({ ...source, toEntityRef: e.target.value })}
              className="w-full px-2 py-1 border rounded text-xs mt-0.5"
            >
              <option value="">— choose —</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-gray-500 col-span-2">
            Held by
            <select
              value={source.fromCharacterRef || ''}
              onChange={(e) =>
                setSource({ ...source, fromCharacterRef: e.target.value || undefined })
              }
              className="w-full px-2 py-1 border rounded text-xs mt-0.5"
            >
              <option value="">{owner.displayName || owner.name} (this character)</option>
              {characters
                .filter((c) => c.id !== owner.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                ))}
            </select>
            <span className="block text-[10px] text-gray-400 mt-0.5">
              Point this at someone else to show how they feel — a
              &ldquo;do they trust me?&rdquo; bar on the player.
            </span>
          </label>
        </div>
      )}

      {source?.kind === 'emotion' && (
        <label className="text-[11px] text-gray-500 block">
          Emotion
          <input
            type="text"
            list="counter-emotion-palette"
            value={source.emotion}
            onChange={(e) => setSource({ ...source, emotion: e.target.value })}
            className="w-full px-2 py-1 border rounded text-xs mt-0.5"
            placeholder="fear"
          />
          <datalist id="counter-emotion-palette">
            {DEFAULT_EMOTION_PALETTE.map((e) => <option key={e.name} value={e.name} />)}
          </datalist>
        </label>
      )}

      {source?.kind === 'mood' && (
        <label className="text-[11px] text-gray-500 block">
          Axis
          <select
            value={source.axis}
            onChange={(e) => setSource({ ...source, axis: e.target.value as 'valence' | 'arousal' })}
            className="w-full px-2 py-1 border rounded text-xs mt-0.5"
          >
            <option value="valence">Valence — unpleasant … pleasant</option>
            <option value="arousal">Arousal — calm … excited</option>
          </select>
        </label>
      )}

      {unipolarHint && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <strong>{source?.kind === 'sentiment' ? source.emotion : ''}</strong> usually has no
            opposite — &ldquo;negative fear&rdquo; isn&rsquo;t a state. Set <strong>Min</strong> to 0
            unless you really do mean the reverse feeling.
          </span>
        </div>
      )}

      {kind !== 'authored' && (
        <>
          {/* What will this bar actually do? Interactive because there is no
              runtime value to read at authoring time. */}
          <div className="bg-gray-50 border rounded p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>Preview</span>
              <span className="tabular-nums">
                {kind === 'emotion' ? 'level' : 'strength'} {round(effectivePreview)}
                {' → '}
                <strong className="text-gray-700">{Math.round(previewValue)}</strong>
                {' / '}{range.max}
                {previewBand && <> → <strong className="text-gray-700">{previewBand}</strong></>}
              </span>
            </div>
            {/* Zero-origin bar: the fill grows outward from wherever zero
                falls, so this preview is the renderer's rule, not a mock. */}
            <div className="relative h-3 bg-gray-200 rounded overflow-hidden">
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: `${previewFill.start * 100}%`,
                  width: `${(previewFill.end - previewFill.start) * 100}%`,
                  background: previewFill.negative ? '#dc2626' : (counter.color || '#3B82F6'),
                }}
              />
              {range.min < 0 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-gray-400"
                  style={{ left: `${(0 - range.min) / (range.max - range.min) * 100}%` }}
                />
              )}
            </div>
            <input
              type="range"
              min={kind === 'emotion' ? 0 : -1}
              max={1}
              step={0.01}
              value={effectivePreview}
              onChange={(e) => setPreviewStrength(Number(e.target.value))}
              className="w-full"
              aria-label="Preview strength"
            />
            <p className="text-[10px] text-gray-400">
              Range {range.min} … {range.max}. The bar grows from zero
              {range.min < 0 ? ' at the centre' : ' at the left edge'} — set Min below 0 to show the
              opposite feeling.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">
              Words instead of numbers ({counter.bands?.length || 0})
            </span>
            <button
              onClick={() =>
                onChange({
                  ...counter,
                  bands: suggestBands(kind, range.min, range.max),
                  numericFormat: 'band',
                })
              }
              className="text-[11px] px-2 py-0.5 border rounded hover:bg-gray-50"
            >
              Suggest wording
            </button>
          </div>
        </>
      )}

      {!!counter.bands?.length && (
        <div className="space-y-1">
          {counter.bands.map((band, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="number"
                value={band.from}
                onChange={(e) => {
                  const bands = [...(counter.bands || [])];
                  bands[i] = { ...band, from: Number(e.target.value) };
                  onChange({ ...counter, bands });
                }}
                className="w-16 px-1.5 py-0.5 border rounded text-[11px] tabular-nums"
                aria-label="Band threshold"
              />
              <span className="text-[11px] text-gray-400">and up:</span>
              <input
                type="text"
                value={band.label}
                onChange={(e) => {
                  const bands = [...(counter.bands || [])];
                  bands[i] = { ...band, label: e.target.value };
                  onChange({ ...counter, bands });
                }}
                className="flex-1 px-1.5 py-0.5 border rounded text-[11px]"
                aria-label="Band label"
              />
              <button
                onClick={() =>
                  onChange({ ...counter, bands: counter.bands?.filter((_, j) => j !== i) })
                }
                className="text-[11px] text-red-500 px-1"
                aria-label="Remove band"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CounterSourceEditor;
