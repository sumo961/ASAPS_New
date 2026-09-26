/**
 * Which dialog choices a given player sees — for the Visual Editor's
 * "Show as" picker. The runtime rule (DialogTreeBeat.filterVisibleChoices):
 * a choice is shown unless `visible === false` or one of its conditions
 * fails. Player states come from the same path analysis as the Preview's
 * "Start as if…" presets, so the editor and the preview agree.
 */

import { Story, StoryContext, type Beat, type StatePreset } from '@asaps/core';
import { generatePathPresets } from '../services/PathBasedPresetGenerator';
import { describeCondition } from './wiringVocabulary';

type Json = Record<string, any>;

export interface ChoiceStateOption {
  key: string;
  label: string;
  state: StatePreset['state'] | null;
  /** The story the state belongs to — feelings conditions need its cast. */
  story?: Story;
}

/** "All choices" first, then "Start fresh", then one option per distinct arrival state. */
export function choiceStateOptions(beats: Beat[], characters: unknown[] | undefined, beatId: string): ChoiceStateOption[] {
  const options: ChoiceStateOption[] = [
    { key: 'all', label: 'All choices', state: null },
    { key: 'fresh', label: 'Start fresh (no prior state)', state: { variables: {}, counters: {}, inventory: [], visitedBeats: [] } },
  ];
  try {
    const story = new Story({ title: 'Visual Editor', firstBeatId: beats[0]?.id });
    if (Array.isArray(characters) && characters.length) story.setCharacters(characters as any[]);
    for (const b of beats) story.addBeat(b);
    const result = generatePathPresets(story, beatId);
    result.presets.forEach((p, i) => {
      options.push({ key: `path_${i}`, label: p.pathDescription || p.preset.name || `State ${i + 1}`, state: p.preset.state, story });
    });
  } catch (err) {
    console.warn('[dialogChoiceVisibility] path presets failed:', err);
  }
  return options;
}

/** Ids of the choices visible in `state`; null = show all (the "All choices" option). */
export function visibleChoiceIds(choices: Json[], state: StatePreset['state'] | null, story?: Story): Set<string> | null {
  if (!state) return null;
  let ctx: StoryContext;
  try { ctx = story ? new StoryContext(undefined, story) : new StoryContext(); } catch { ctx = new StoryContext(); }
  (state.visitedBeats ?? []).forEach((id) => ctx.markBeatVisited(id));
  // Feelings guards need the arrival feelings (and the story's cast).
  ctx.loadSimulationState((state.affect ?? {}) as any, state.variables ?? {}, state.counters ?? {}, state.inventory ?? []);
  const ids = new Set<string>();
  for (const c of choices) {
    if (!c || c.visible === false) continue;
    const conds: Json[] = Array.isArray(c.conditions) ? c.conditions : [];
    let ok = true;
    for (const cond of conds) {
      try { if (!ctx.checkCondition(cond as any)) { ok = false; break; } } catch { ok = false; break; }
    }
    if (ok) ids.add(String(c.id));
  }
  return ids;
}

/** Human summary of when a choice shows, or null when it always does. */
export function choiceConditionSummary(choice: Json): string | null {
  if (choice?.visible === false) return 'never shown (hidden)';
  const conds: Json[] = Array.isArray(choice?.conditions) ? choice.conditions : [];
  if (!conds.length) return null;
  return conds.map((c) => describeCondition(c)).join(' and ');
}
