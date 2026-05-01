/**
 * summarizeChoiceEffects — turn an Effect[] into a one-line natural-language
 * summary of what will happen when the choice fires.
 *
 * Authors compose with multi-row effect bundles (templates pre-fill them
 * with 5-9 rows) and need a sanity check that the numbers do what they
 * think. The summary aggregates every effect targeting a given character,
 * collapses mood deltas into qualitative descriptors, lists sentiment
 * shifts with signed direction, and reports the non-affect effects
 * (counters, variables, inventory) separately. No data goes through
 * unmentioned.
 *
 * The summary is read-only; the heavy semantic work lives here so the
 * editor render is a single string interpolation. When `characters` is
 * supplied, character ids resolve to display names ("Alex feels …"
 * instead of "char_alex feels …"). Fall-through is the raw ref.
 */
import type { Effect } from '@asaps/core';

interface CharacterRef {
  id: string;
  name?: string;
  displayName?: string;
}

/**
 * Summarise a choice's effects in plain prose. Returns an empty string
 * when there's nothing to say (no effects, or every numeric delta is
 * below the noise threshold).
 */
export function summarizeChoiceEffects(
  effects: ReadonlyArray<Effect>,
  characters?: ReadonlyArray<CharacterRef>,
): string {
  if (!effects || effects.length === 0) return '';

  const resolveName = (ref: string): string => {
    if (!ref) return '';
    if (ref === 'player') return 'the player';
    const c = characters?.find((x) => x.id === ref);
    return c?.displayName || c?.name || ref;
  };

  // Bucket affect effects by target character so each character's
  // arc gets its own clause. Non-affect effects (counters / vars /
  // inventory / variant / goal) go into a separate global bucket.
  type Bucket = {
    targetId: string;
    moodValence: number;
    moodArousal: number;
    fires: Array<{ name: string; delta: number }>;
    sentiments: Array<{ toward: string; emotion: string; delta: number }>;
    reflections: string[];
    goalChanges: Array<{ goalId: string; status: string }>;
    variantChanges: string[];  // variant ids
  };
  const byChar = new Map<string, Bucket>();
  const ensure = (target: string): Bucket => {
    let b = byChar.get(target);
    if (!b) {
      b = {
        targetId: target,
        moodValence: 0,
        moodArousal: 0,
        fires: [],
        sentiments: [],
        reflections: [],
        goalChanges: [],
        variantChanges: [],
      };
      byChar.set(target, b);
    }
    return b;
  };

  const counters: string[] = [];
  const variables: string[] = [];
  const inventory: string[] = [];
  const bookmarks: string[] = [];

  for (const e of effects) {
    switch (e.type) {
      case 'nudgeMood': {
        const b = ensure(e.target || '');
        b.moodValence += Number(e.valenceDelta ?? 0);
        b.moodArousal += Number(e.arousalDelta ?? 0);
        break;
      }
      case 'fireEmotion': {
        const b = ensure(e.target || '');
        const delta = Number(e.emotionDelta ?? 0);
        if (e.emotion && delta !== 0) {
          b.fires.push({ name: e.emotion, delta });
        }
        break;
      }
      case 'addSentiment': {
        const b = ensure(e.target || '');
        const delta = Number(e.strengthDelta ?? 0);
        if (e.sentimentTarget && e.sentimentEmotion && delta !== 0) {
          b.sentiments.push({
            toward: e.sentimentTarget,
            emotion: e.sentimentEmotion,
            delta,
          });
        }
        break;
      }
      case 'addReflection': {
        const b = ensure(e.target || '');
        if (e.reflectionText && e.reflectionText.trim()) {
          b.reflections.push(e.reflectionText.trim());
        }
        break;
      }
      case 'setGoalStatus': {
        const b = ensure(e.target || '');
        const status = (e as any).goalStatus;
        const goalId = (e as any).goalId;
        if (goalId && status) {
          b.goalChanges.push({ goalId, status });
        }
        break;
      }
      case 'setCharacterVariant': {
        const b = ensure(e.target || '');
        const v = (e as any).variantId;
        if (v) b.variantChanges.push(v);
        break;
      }
      case 'incrementCounter': {
        const v = Number(e.value ?? 0);
        if (v !== 0 && e.target) {
          counters.push(`${v >= 0 ? '+' : ''}${v} ${e.target}`);
        }
        break;
      }
      case 'setCounter': {
        if (e.target) counters.push(`${e.target} = ${e.value}`);
        break;
      }
      case 'setVariable': {
        if (e.target) variables.push(`${e.target} = ${JSON.stringify(e.value)}`);
        break;
      }
      case 'addInventory': {
        if (e.target) inventory.push(`+${e.target}`);
        break;
      }
      case 'removeInventory': {
        if (e.target) inventory.push(`−${e.target}`);
        break;
      }
      case 'bookmarkAffectState': {
        const name = (e as any).bookmarkName;
        if (name) {
          const scope = (e as any).scope === 'character' && e.target
            ? ` (${resolveName(e.target)} only)` : '';
          bookmarks.push(`bookmark "${name}"${scope}`);
        }
        break;
      }
    }
  }

  const clauses: string[] = [];

  // Per-character affect summary.
  for (const [, b] of byChar) {
    const phrases: string[] = [];
    const name = resolveName(b.targetId);

    // Mood — qualitative descriptor when net delta is meaningful.
    const v = b.moodValence;
    const a = b.moodArousal;
    const moodWords: string[] = [];
    if (Math.abs(v) >= 0.05) {
      moodWords.push(v > 0 ? 'feels happier' : 'feels sadder');
    }
    if (Math.abs(a) >= 0.05) {
      moodWords.push(a > 0 ? 'more activated' : 'calmer');
    }
    if (moodWords.length > 0) {
      phrases.push(moodWords.join(', '));
    }

    // Emotion fires — list each, qualifying intensity.
    for (const f of b.fires) {
      const dir = f.delta > 0 ? 'spikes' : 'softens';
      const mag = Math.abs(f.delta) >= 0.4 ? 'sharply' : Math.abs(f.delta) >= 0.2 ? '' : 'a little';
      phrases.push(mag ? `${f.name} ${dir} ${mag}` : `${f.name} ${dir}`);
    }

    // Sentiments — group by direction. Self-directed gets "self-X".
    for (const s of b.sentiments) {
      const isSelf = s.toward === b.targetId;
      const dir = s.delta > 0 ? 'grows' : 'eases';
      const polarity = s.delta < 0 ? '−' : '+';
      const value = `${polarity}${Math.abs(s.delta).toFixed(2)}`;
      if (isSelf) {
        phrases.push(`self-${s.emotion} ${dir} (${value})`);
      } else {
        const towardName = resolveName(s.toward);
        phrases.push(`${s.emotion} toward ${towardName} ${dir} (${value})`);
      }
    }

    // Goal status changes.
    for (const g of b.goalChanges) {
      phrases.push(`goal '${g.goalId}' marked ${g.status}`);
    }

    // Variant changes.
    for (const vId of b.variantChanges) {
      phrases.push(vId
        ? `switches to variant '${vId}'`
        : 'clears active variant');
    }

    // Reflections — truncate to keep summary terse.
    for (const r of b.reflections) {
      const short = r.length > 60 ? r.slice(0, 57).trim() + '…' : r;
      phrases.push(`reflects: "${short}"`);
    }

    if (phrases.length > 0) {
      clauses.push(`${name}: ${phrases.join('; ')}`);
    }
  }

  // Non-affect effects, joined as one short clause.
  const tally: string[] = [];
  if (counters.length > 0) tally.push(counters.join(', '));
  if (variables.length > 0) tally.push(variables.join(', '));
  if (inventory.length > 0) tally.push(`inventory ${inventory.join(', ')}`);
  if (bookmarks.length > 0) tally.push(bookmarks.join(', '));
  if (tally.length > 0) clauses.push(tally.join(' · '));

  if (clauses.length === 0) return '';
  return clauses.join(' • ');
}
