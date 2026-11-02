import {
  ReachabilityAnalyzer,
  analysisLinks,
  arrivalKey,
  arrivesDifferently,
  detectStoryWarnings,
  type Story,
} from '@asaps/core';
import type { StorySimulation } from '../../services/storySimulation';
import { validateStoryLogic, type LogicValidationResult } from '../../utils/storyLogicValidator';
import { storyWarningLabel } from './storyWarningLabels';

export type ProblemSeverity = 'error' | 'warning' | 'note';

export interface Problem {
  /** Stable across renders: what it is and where. */
  id: string;
  severity: ProblemSeverity;
  /** The short name, the same wherever this problem is talked about. */
  label: string;
  beatId: string;
  beatName: string;
  message: string;
  /** More of the same on this beat. */
  more: string[];
  /** Beats that can't be reached because of this one. */
  behindIt: number;
}

/** Story Logic's checks over the story's one simulation. */
export function storyLogicValidation(story: Story, simulation: StorySimulation | null): LogicValidationResult {
  const arrivals = simulation?.arrivals() ?? null;
  const storyData = {
    beats: story.getAllBeats().map((beat) => ({
      id: beat.id,
      name: beat.name,
      type: beat.type,
      parameters: beat.getParameters(),
      connections: beat.getConnections(), // Include connections for hub detection
    })),
  };
  const states = arrivals
    ? new Map([...arrivals].map(([id, list]) => {
        // Each state once (the same state can come from different starts).
        const unique = new Map(list.map((a) => [arrivalKey(a.state), a.state]));
        return [id, { states: [...unique.values()], differs: arrivesDifferently(list) }];
      }))
    : undefined;
  return validateStoryLogic(storyData, { arrivals: states });
}

const LOGIC_LABEL: Record<string, string> = {
  hub_state_assumption: 'Text assumes something',
  ungated_state_reference: 'Text assumes something',
  missing_condition_gate: 'Text assumes something',
  undescribed_item: 'Item not described',
  dialog_line_without_exit: 'Line without exit',
};

const RANK: Record<ProblemSeverity, number> = { error: 0, warning: 1, note: 2 };

/**
 * Everything the debug tools found wrong, in one list and one set of words:
 * Story Warnings, Story Logic's checks, broken links, where the story stops
 * and what can't be reached. Unreachable beats are told by their cause: the
 * first one on the way, with how many more are behind it.
 */
export function collectProblems(story: Story, simulation: StorySimulation): Problem[] {
  const out = new Map<string, Problem>();
  const beatName = (id: string) => story.getBeat(id)?.name?.trim() || id;
  const add = (severity: ProblemSeverity, label: string, beatId: string, message: string, behindIt = 0) => {
    const id = `${label}|${beatId}`;
    const known = out.get(id);
    if (known) { if (known.message !== message && !known.more.includes(message)) known.more.push(message); return; }
    out.set(id, { id, severity, label, beatId, beatName: beatName(beatId), message, more: [], behindIt });
  };

  const { analyzer, paths, playedBeats } = simulation;
  for (const w of detectStoryWarnings({ paths, story, shownReplies: analyzer.shownReplies, searchLimited: analyzer.searchLimited })) {
    add(w.severity === 'error' ? 'error' : 'warning', storyWarningLabel(w.code), w.beatId, w.message);
  }

  const logic = storyLogicValidation(story, simulation);
  for (const issue of logic.issues) {
    add(issue.type === 'error' ? 'error' : issue.type === 'warning' ? 'warning' : 'note',
      LOGIC_LABEL[issue.category] ?? 'Story logic', issue.beatId, issue.message);
  }

  const reach = new ReachabilityAnalyzer(story, { playedBeats }).analyze();
  for (const link of reach.brokenConnections) {
    add('error', 'Broken link', link.sourceBeatId, `Links to a beat that no longer exists (${link.targetId}). Players who take it get an error and the story stops.`);
  }

  // Where playthroughs stop. A warning above may already say why.
  const explainsStop = (label: string) =>
    label === storyWarningLabel('reply-nowhere') || label === LOGIC_LABEL.dialog_line_without_exit || label === 'Broken link';
  const explained = new Set([...out.values()].filter((p) => explainsStop(p.label)).map((p) => p.beatId));
  for (const outcome of simulation.result().outcomes) {
    const count = outcome.pathVariations?.length ?? 0;
    if (outcome.endType === 'stuck') {
      add('error', 'Stuck in a loop', outcome.endingBeatId, 'Players who get here keep coming back and no way on gets out.');
    } else if (outcome.endType === 'deadEnd' && explained.has(outcome.endingBeatId)) {
      // Players really do stop here: whatever explains it is an error.
      for (const p of out.values()) if (p.beatId === outcome.endingBeatId && explainsStop(p.label)) p.severity = 'error';
    } else if (outcome.endType === 'deadEnd') {
      add('error', 'Dead end', outcome.endingBeatId, `The story stops here without an end screen (${count.toLocaleString()} ${count === 1 ? 'path' : 'paths'}).`);
    }
  }

  // What can't be reached: only the first beat on the way says so.
  const unreachable = new Set<string>(reach.unreachableBeats.map((u) => u.beatId));
  const countBehind = (start: string): number => {
    const seen = new Set([start]);
    const todo = [start];
    while (todo.length > 0) {
      const beat = story.getBeat(todo.pop()!);
      if (!beat) continue;
      for (const c of analysisLinks(beat)) {
        if (unreachable.has(c.targetId) && !seen.has(c.targetId)) { seen.add(c.targetId); todo.push(c.targetId); }
      }
    }
    return seen.size - 1;
  };
  for (const u of reach.unreachableBeats) {
    if (u.reason === 'unreachableParent') continue;
    const behind = countBehind(u.beatId);
    const severity: ProblemSeverity = u.reason === 'orphaned' && behind === 0 && story.getBeat(u.beatId)?.type !== 'endScreen' ? 'note' : 'warning';
    add(severity, u.reason === 'orphaned' ? 'Nothing links here' : 'Never on offer', u.beatId, u.details, behind);
  }

  return [...out.values()].sort((a, b) =>
    RANK[a.severity] - RANK[b.severity] || b.behindIt - a.behindIt || a.label.localeCompare(b.label) || a.beatName.localeCompare(b.beatName));
}
