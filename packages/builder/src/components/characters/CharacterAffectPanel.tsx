/**
 * CharacterAffectPanel — read-only runtime display of every character's
 * current mood + top sentiments. Designed to mount inside the Preview
 * Window (where StoryContext is in scope) so authors can watch emotional
 * state evolve as the story plays. Pure presentational component — the
 * caller passes the data in via simple lookup functions, not a live
 * StoryContext, which keeps it testable and reusable.
 *
 * Step 4 / Phase 2 of the rich-character roadmap. Uses the same
 * describeMoodAxis vocabulary the LLM dossier uses, so the panel and the
 * AI prompt show the same words for the same numbers.
 */

import React, { useMemo } from 'react';
import { describeMoodAxis, type EmotionDefinition } from '@asaps/core';
import type { Character } from '../../types/character';
import { MoodPad } from './MoodPad';

export interface AffectMood {
  valence: number;
  arousal: number;
}

export interface AffectSentiment {
  toEntityRef: string;
  emotion: string;
  strength: number;
}

export interface CharacterAffectLookup {
  getCharacterMood: (charId: string) => AffectMood;
  getCharacterSentiments: (charId: string) => ReadonlyArray<AffectSentiment>;
  /** Step 5 — current emotion intensities, keyed by emotion name. Optional;
   * the panel renders an emotions block only when this lookup is provided. */
  getCharacterEmotions?: (charId: string) => Record<string, number>;
}

export interface CharacterAffectPanelProps {
  characters: ReadonlyArray<Character>;
  /** Lookup functions sourced from the live StoryContext. */
  context: CharacterAffectLookup;
  /** How many top sentiments to show per character. Default 3. */
  topNSentiments?: number;
  /** Resolve a target ref (e.g. `char_1`) to a display name. Defaults to
   * matching against the characters list, falling back to the raw ref. */
  resolveTargetName?: (ref: string) => string;
  /** Optional close callback — when provided, a small ✕ shows in the header. */
  onClose?: () => void;
  /** Project emotion palette — when supplied, the inline mood pad shows
   *  emotion markers at their (weightToValence, weightToArousal). */
  emotionPalette?: ReadonlyArray<EmotionDefinition>;
  /** Test id for unit tests. */
  testId?: string;
}

export const CharacterAffectPanel: React.FC<CharacterAffectPanelProps> = ({
  characters,
  context,
  topNSentiments = 3,
  resolveTargetName,
  onClose,
  emotionPalette,
  testId,
}) => {
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);

  const resolveName = (ref: string) => {
    if (resolveTargetName) return resolveTargetName(ref);
    const c = charById.get(ref);
    if (c) return c.displayName || c.name || c.id;
    if (ref === 'player') return 'Player';
    return ref;
  };

  return (
    <div style={panelStyle} data-testid={testId}>
      <div style={headerStyle}>
        <span style={headerTitleStyle}>Character affect</span>
        {onClose && (
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">×</button>
        )}
      </div>
      {characters.length === 0 ? (
        <div style={emptyStyle}>No characters defined.</div>
      ) : (
        <div style={listStyle}>
          {characters.map((char) => {
            const mood = context.getCharacterMood(char.id);
            const sentiments = context.getCharacterSentiments(char.id);
            const top = [...sentiments]
              .filter((s) => Math.abs(s.strength) > 0.05)
              .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
              .slice(0, topNSentiments);
            const emotions = context.getCharacterEmotions?.(char.id) || {};
            const topEmotions = Object.entries(emotions)
              .filter(([, v]) => v > 0.05)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 4);
            const moodIsNeutral = Math.abs(mood.valence) < 0.05 && Math.abs(mood.arousal) < 0.05;

            return (
              <div key={char.id} style={rowStyle} data-character-id={char.id}>
                <div style={charHeaderStyle}>
                  <span style={{ ...colorDotStyle, backgroundColor: char.color || '#94a3b8' }} />
                  <span style={charNameStyle}>{char.displayName || char.name}</span>
                  {moodIsNeutral && top.length === 0 && topEmotions.length === 0 && (
                    <span style={neutralBadgeStyle}>neutral</span>
                  )}
                </div>

                {/* Mood — 2D pad on Russell's circumplex with emotion
                    markers when the project palette is wired in. The dual
                    bars stay below as a per-axis numeric readout. */}
                <div style={moodLayoutStyle}>
                  <MoodPad
                    valence={mood.valence}
                    arousal={mood.arousal}
                    palette={emotionPalette}
                    size={120}
                    showLabels={true}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <MoodBars mood={mood} />
                    {!moodIsNeutral && (
                      <div style={moodSummaryStyle}>
                        {describeMoodAxis(mood.valence, 'valence')}, {describeMoodAxis(mood.arousal, 'arousal')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Current emotions (Step 5) — small inline bars showing
                    intensity. Decay each beat-entry, so authors watch them
                    fade in real time. */}
                {topEmotions.length > 0 && (
                  <div style={emotionsBlockStyle}>
                    {topEmotions.map(([name, value]) => (
                      <div key={name} style={emotionRowStyle}>
                        <span style={emotionNameStyle}>{name}</span>
                        <div style={emotionTrackStyle}>
                          <div style={{ ...emotionFillStyle, width: `${Math.min(100, value * 100)}%` }} />
                        </div>
                        <span style={emotionValueStyle}>{value.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Top sentiments */}
                {top.length > 0 && (
                  <ul style={sentimentListStyle}>
                    {top.map((s, idx) => (
                      <li key={`${s.toEntityRef}-${s.emotion}-${idx}`} style={sentimentItemStyle}>
                        <span style={sentimentDotStyle(s.strength)} />
                        <span style={sentimentTextStyle}>
                          {describeStrength(s.strength)} <strong>{s.emotion}</strong> toward <em>{resolveName(s.toEntityRef)}</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================

const MoodBars: React.FC<{ mood: AffectMood }> = ({ mood }) => (
  <div style={moodGridStyle}>
    <BarLine label="valence" value={mood.valence} positiveLabel="happy" negativeLabel="sad" />
    <BarLine label="arousal" value={mood.arousal} positiveLabel="excited" negativeLabel="calm" />
  </div>
);

const BarLine: React.FC<{
  label: string; value: number; positiveLabel: string; negativeLabel: string;
}> = ({ label, value }) => {
  // Centre-pivot bar: a horizontal track with a small marker at the value
  // position. Negative values fill leftward, positive fill rightward.
  // The qualitative descriptor ("happy", "calm", …) is intentionally
  // omitted here — the panel's `moodSummaryStyle` line below renders the
  // same info, and crowding it back into a per-axis column makes narrow
  // panel layouts truncate either the value or the word. Single source.
  const pct = ((value + 1) / 2) * 100; // 0..100
  return (
    <div style={barRowStyle}>
      <span style={barAxisLabelStyle}>{label}</span>
      <div style={barTrackStyle}>
        <div style={barCenterTickStyle} />
        <div
          style={{
            ...barFillStyle,
            left: value < 0 ? `${pct}%` : '50%',
            width: `${Math.abs(value) * 50}%`,
            backgroundColor: value < 0 ? '#f87171' : '#34d399',
          }}
        />
      </div>
      <span style={barValueStyle}>{value >= 0 ? '+' : ''}{value.toFixed(2)}</span>
    </div>
  );
};

function describeStrength(strength: number): string {
  const abs = Math.abs(strength);
  const polarity = strength < 0 ? 'anti-' : '';
  if (abs >= 0.75) return `intense ${polarity}`.trim();
  if (abs >= 0.4) return `strong ${polarity}`.trim();
  if (abs >= 0.15) return `mild ${polarity}`.trim();
  return `slight ${polarity}`.trim();
}

// ============================================================================
// Styles
// ============================================================================

const panelStyle: React.CSSProperties = {
  background: '#ffffff',
  color: '#1f2937',
  borderRadius: 6,
  border: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontSize: 13,
};
const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '6px 10px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb',
};
const headerTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#4b5563' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 };
const emptyStyle: React.CSSProperties = { padding: 12, fontSize: 12, color: '#6b7280', fontStyle: 'italic' };
const listStyle: React.CSSProperties = { padding: '4px 0' };
const rowStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6' };
const charHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 };
const colorDotStyle: React.CSSProperties = { width: 9, height: 9, borderRadius: '50%' };
const charNameStyle: React.CSSProperties = { fontWeight: 500, color: '#111827', fontSize: 12 };
const neutralBadgeStyle: React.CSSProperties = { fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginLeft: 'auto' };
const moodLayoutStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 2 };
const moodGridStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const barRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '46px 1fr 42px', alignItems: 'center', gap: 6, fontSize: 10 };
const barAxisLabelStyle: React.CSSProperties = { color: '#6b7280' };
const barTrackStyle: React.CSSProperties = { position: 'relative', height: 6, background: '#f3f4f6', borderRadius: 3 };
const barCenterTickStyle: React.CSSProperties = { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#d1d5db' };
const barFillStyle: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 };
const barValueStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 10, color: '#374151', textAlign: 'right' };
const moodSummaryStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic' };
const sentimentListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 3 };
const sentimentItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 };
const sentimentTextStyle: React.CSSProperties = { color: '#374151' };
const sentimentDotStyle = (strength: number): React.CSSProperties => ({
  width: 7, height: 7, borderRadius: '50%',
  backgroundColor: strength < 0 ? '#ef4444' : '#10b981',
  flexShrink: 0,
});

// Emotion-row mini-bars for Step 5. Compact horizontal fills so multiple
// emotions can sit in a small panel without dominating the layout.
const emotionsBlockStyle: React.CSSProperties = { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 };
const emotionRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '60px 1fr 32px', alignItems: 'center', gap: 6, fontSize: 10 };
const emotionNameStyle: React.CSSProperties = { color: '#4b5563' };
const emotionTrackStyle: React.CSSProperties = { position: 'relative', height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' };
const emotionFillStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, background: '#a78bfa', borderRadius: 3 };
const emotionValueStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 10, color: '#374151', textAlign: 'right' };
