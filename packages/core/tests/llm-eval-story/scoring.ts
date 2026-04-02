/**
 * Structural scoring for generated stories
 *
 * Validates that AI-generated stories conform to ASAPS structural rules.
 * Each check is weighted by importance.
 */

import type { StoryScenario, StoryResult } from './scenarios.js';

export interface ScoreDetail {
  check: string;
  passed: boolean;
  message: string;
  weight: number;
}

export interface StoryScoreReport {
  scenario: string;
  model: string;
  passed: boolean;
  totalScore: number;
  maxScore: number;
  details: ScoreDetail[];
  latencyMs: number;
  beatCount: number;
  beatTypes: string[];
}

// Beat types that use connections array (single target)
const SINGLE_CONNECTION_TYPES = new Set([
  'titleScreen', 'infoText', 'durScreen', 'videoBeat', 'endScreen',
  'setVariable', 'addRemoveInventory', 'setTimer', 'inputText', 'keypad',
]);

// Beat types where targets go in parameters, NOT connections
const PARAMETER_TARGET_TYPES = new Set([
  'dialogTree', 'movementChoice', 'pickProp', 'hyperText', 'randomTarget',
]);

const ALL_VALID_TYPES = new Set([
  'titleScreen', 'infoText', 'durScreen', 'dialogTree', 'movementChoice',
  'pickProp', 'hyperText', 'inputText', 'keypad', 'videoBeat', 'endScreen',
  'setVariable', 'conditionBeat', 'addRemoveInventory', 'randomTarget', 'setTimer',
  'aiInfoText', 'aiDurScreen', 'aiDialogTree', 'aiSummary', 'aiCondition',
  'aiConversation', 'onlineContent',
]);

/** Extract JSON from response (handles markdown fences) */
function extractJSON(text: string): string {
  // Remove markdown code fences
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
  // Find the outermost JSON object
  const start = cleaned.indexOf('{');
  if (start === -1) return cleaned.trim();
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return cleaned.slice(start);
}

/** Collect all target IDs referenced in a story */
function collectTargetIds(beats: any[]): Set<string> {
  const targets = new Set<string>();

  for (const beat of beats) {
    // connections array
    if (beat.connections) {
      for (const conn of beat.connections) {
        if (conn.targetId) targets.add(conn.targetId);
        if (conn.target) targets.add(conn.target);
      }
    }

    const params = beat.parameters || {};

    // dialogTree choices (recursive)
    const collectFromDialogNode = (node: any) => {
      if (!node) return;
      for (const choice of (node.choices || [])) {
        if (choice.target && choice.target !== '__self__') targets.add(choice.target);
        if (choice.dialogNode) collectFromDialogNode(choice.dialogNode);
      }
      if (node.target && node.target !== '__self__') targets.add(node.target);
    };
    if (params.dialogTree) collectFromDialogNode(params.dialogTree);

    // movementChoice / randomTarget choices
    if (params.choices) {
      for (const c of params.choices) {
        if (c.target) targets.add(c.target);
      }
    }

    // pickProp props
    if (params.props) {
      for (const p of params.props) {
        if (p.target) targets.add(p.target);
      }
    }

    // hyperText hyperlinks
    if (params.hyperlinks) {
      for (const h of params.hyperlinks) {
        if (h.targetBeatId) targets.add(h.targetBeatId);
      }
    }

    // conditionBeat
    if (params.trueConnection?.target) targets.add(params.trueConnection.target);
    if (params.trueConnection?.targetId) targets.add(params.trueConnection.targetId);
    if (params.falseConnection?.target) targets.add(params.falseConnection.target);
    if (params.falseConnection?.targetId) targets.add(params.falseConnection.targetId);

    // defaultTarget
    if (beat.defaultTarget) targets.add(beat.defaultTarget);
    if (params.defaultTarget) targets.add(params.defaultTarget);
  }

  return targets;
}

/** BFS reachability from beat_0 */
function findReachableBeats(beats: any[]): Set<string> {
  const beatMap = new Map<string, any>();
  for (const b of beats) beatMap.set(b.id, b);

  const reachable = new Set<string>();
  const queue = ['beat_0'];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);

    const beat = beatMap.get(id);
    if (!beat) continue;

    // Collect all outgoing targets from this beat
    const outTargets: string[] = [];

    if (beat.connections) {
      for (const c of beat.connections) {
        if (c.targetId) outTargets.push(c.targetId);
        if (c.target) outTargets.push(c.target);
      }
    }

    const params = beat.parameters || {};
    const collectDialogTargets = (node: any) => {
      if (!node) return;
      if (node.target && node.target !== '__self__') outTargets.push(node.target);
      for (const choice of (node.choices || [])) {
        if (choice.target && choice.target !== '__self__') outTargets.push(choice.target);
        if (choice.dialogNode) collectDialogTargets(choice.dialogNode);
      }
    };
    if (params.dialogTree) collectDialogTargets(params.dialogTree);
    if (params.choices) for (const c of params.choices) { if (c.target) outTargets.push(c.target); }
    if (params.props) for (const p of params.props) { if (p.target) outTargets.push(p.target); }
    if (params.hyperlinks) for (const h of params.hyperlinks) { if (h.targetBeatId) outTargets.push(h.targetBeatId); }
    if (params.trueConnection?.target) outTargets.push(params.trueConnection.target);
    if (params.trueConnection?.targetId) outTargets.push(params.trueConnection.targetId);
    if (params.falseConnection?.target) outTargets.push(params.falseConnection.target);
    if (params.falseConnection?.targetId) outTargets.push(params.falseConnection.targetId);
    if (beat.defaultTarget) outTargets.push(beat.defaultTarget);

    for (const t of outTargets) {
      if (!reachable.has(t)) queue.push(t);
    }
  }

  return reachable;
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

export function scoreStory(scenario: StoryScenario, result: StoryResult): StoryScoreReport {
  const details: ScoreDetail[] = [];
  let beatCount = 0;
  let beatTypes: string[] = [];

  const text = result.cleanResponse;

  // 1. JSON validity (weight: 5 — everything depends on this)
  const jsonStr = extractJSON(text);
  let story: any;
  try {
    story = JSON.parse(jsonStr);
    details.push({ check: 'json-valid', passed: true, message: 'Valid JSON', weight: 5 });
  } catch (e) {
    details.push({ check: 'json-valid', passed: false, message: `Invalid JSON: ${(e as Error).message}`, weight: 5 });
    return buildReport(scenario, result, details, 0, []);
  }

  // 2. Has metadata (weight: 1)
  const hasMeta = story.metadata && story.metadata.title;
  details.push({
    check: 'metadata',
    passed: !!hasMeta,
    message: hasMeta ? `Title: "${story.metadata.title}"` : 'Missing metadata.title',
    weight: 1,
  });

  // 3. Has beats array (weight: 3)
  const beats: any[] = story.beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    details.push({ check: 'beats-array', passed: false, message: 'Missing or empty beats array', weight: 3 });
    return buildReport(scenario, result, details, 0, []);
  }
  beatCount = beats.length;
  beatTypes = beats.map(b => b.type).filter(Boolean);
  details.push({ check: 'beats-array', passed: true, message: `${beats.length} beats`, weight: 3 });

  // 4. beat_0 is titleScreen (weight: 3)
  const beat0 = beats[0];
  const beat0IsTitleScreen = beat0?.id === 'beat_0' && beat0?.type === 'titleScreen';
  details.push({
    check: 'beat0-titlescreen',
    passed: beat0IsTitleScreen,
    message: beat0IsTitleScreen
      ? 'beat_0 is titleScreen'
      : `beat_0: id="${beat0?.id}", type="${beat0?.type}"`,
    weight: 3,
  });

  // 5. All beat types are valid (weight: 2)
  const invalidTypes = beatTypes.filter(t => !ALL_VALID_TYPES.has(t));
  details.push({
    check: 'valid-types',
    passed: invalidTypes.length === 0,
    message: invalidTypes.length === 0
      ? `All types valid: ${[...new Set(beatTypes)].join(', ')}`
      : `Invalid types: ${invalidTypes.join(', ')}`,
    weight: 2,
  });

  // 6. Has endScreen with showRestart (weight: 2)
  const endScreens = beats.filter(b => b.type === 'endScreen');
  const hasEndScreen = endScreens.length > 0;
  const allShowRestart = endScreens.every(b => b.parameters?.showRestart === true);
  details.push({
    check: 'endscreen',
    passed: hasEndScreen,
    message: hasEndScreen
      ? `${endScreens.length} endScreen(s)${allShowRestart ? ', all with showRestart' : ' ⚠️ missing showRestart'}`
      : 'No endScreen beat',
    weight: 2,
  });

  // 7. Required beat types present (weight: 2)
  const presentTypes = new Set(beatTypes);
  const missingRequired = scenario.requiredBeatTypes.filter(t => !presentTypes.has(t));
  details.push({
    check: 'required-types',
    passed: missingRequired.length === 0,
    message: missingRequired.length === 0
      ? `All required types present`
      : `Missing: ${missingRequired.join(', ')}`,
    weight: 2,
  });

  // 8. Beat count in expected range (weight: 1)
  const countOk = beatCount >= scenario.minBeats && beatCount <= scenario.maxBeats;
  details.push({
    check: 'beat-count',
    passed: countOk,
    message: `${beatCount} beats (expected ${scenario.minBeats}-${scenario.maxBeats})`,
    weight: 1,
  });

  // 9. All referenced targets exist (weight: 3)
  const beatIds = new Set(beats.map(b => b.id));
  const allTargets = collectTargetIds(beats);
  const danglingTargets = [...allTargets].filter(t => !beatIds.has(t));
  details.push({
    check: 'no-dangling-targets',
    passed: danglingTargets.length === 0,
    message: danglingTargets.length === 0
      ? `All ${allTargets.size} target references resolve`
      : `Dangling targets: ${danglingTargets.slice(0, 5).join(', ')}${danglingTargets.length > 5 ? ` (+${danglingTargets.length - 5} more)` : ''}`,
    weight: 3,
  });

  // 10. All beats reachable from beat_0 (weight: 2)
  const reachable = findReachableBeats(beats);
  const unreachable = beats.filter(b => !reachable.has(b.id));
  details.push({
    check: 'all-reachable',
    passed: unreachable.length === 0,
    message: unreachable.length === 0
      ? `All ${beats.length} beats reachable`
      : `${unreachable.length} unreachable: ${unreachable.map(b => b.id).slice(0, 5).join(', ')}`,
    weight: 2,
  });

  // 11. Single-connection beats don't have multiple connections (weight: 2)
  const overConnected = beats.filter(b =>
    SINGLE_CONNECTION_TYPES.has(b.type) &&
    b.connections && b.connections.length > 1
  );
  details.push({
    check: 'single-connection',
    passed: overConnected.length === 0,
    message: overConnected.length === 0
      ? 'Single-connection beats OK'
      : `Over-connected: ${overConnected.map(b => `${b.id}(${b.type}):${b.connections.length}`).join(', ')}`,
    weight: 2,
  });

  // 12. Multi-connection beats use parameter targets, not connections array (weight: 2)
  const badMultiConn = beats.filter(b =>
    PARAMETER_TARGET_TYPES.has(b.type) &&
    b.connections && b.connections.length > 0
  );
  details.push({
    check: 'param-targets',
    passed: badMultiConn.length === 0,
    message: badMultiConn.length === 0
      ? 'Multi-connection beats use parameter targets'
      : `Should use param targets: ${badMultiConn.map(b => `${b.id}(${b.type})`).join(', ')}`,
    weight: 2,
  });

  // 13. Every beat has an id and type (weight: 2)
  const missingIdType = beats.filter(b => !b.id || !b.type);
  details.push({
    check: 'id-type',
    passed: missingIdType.length === 0,
    message: missingIdType.length === 0
      ? 'All beats have id and type'
      : `${missingIdType.length} beats missing id or type`,
    weight: 2,
  });

  // 14. Multiple endings if expected (weight: 1)
  if (scenario.multipleEndings) {
    const multiEnd = endScreens.length >= 2;
    details.push({
      check: 'multiple-endings',
      passed: multiEnd,
      message: multiEnd ? `${endScreens.length} endings` : `Only ${endScreens.length} ending (expected 2+)`,
      weight: 1,
    });
  }

  // 15. Has characters array (weight: 1)
  const hasChars = Array.isArray(story.characters) && story.characters.length > 0;
  details.push({
    check: 'characters',
    passed: hasChars,
    message: hasChars ? `${story.characters.length} character(s)` : 'Missing characters array',
    weight: 1,
  });

  // 16. DialogTree structural check (weight: 2)
  const dtBeats = beats.filter(b => b.type === 'dialogTree');
  if (dtBeats.length > 0) {
    const dtOk = dtBeats.every(b => {
      const dt = b.parameters?.dialogTree;
      return dt && dt.id && dt.speaker && dt.text && Array.isArray(dt.choices);
    });
    details.push({
      check: 'dialogtree-structure',
      passed: dtOk,
      message: dtOk
        ? `${dtBeats.length} dialogTree(s) properly structured`
        : 'Some dialogTree beats missing required fields (id, speaker, text, choices)',
      weight: 2,
    });
  }

  return buildReport(scenario, result, details, beatCount, beatTypes);
}

function buildReport(
  scenario: StoryScenario,
  result: StoryResult,
  details: ScoreDetail[],
  beatCount: number,
  beatTypes: string[],
): StoryScoreReport {
  let totalScore = 0;
  let maxScore = 0;
  for (const d of details) {
    maxScore += d.weight;
    if (d.passed) totalScore += d.weight;
  }

  return {
    scenario: scenario.id,
    model: result.model,
    passed: maxScore > 0 ? (totalScore / maxScore) >= 0.7 : false,
    totalScore,
    maxScore,
    details,
    latencyMs: result.latencyMs,
    beatCount,
    beatTypes: [...new Set(beatTypes)],
  };
}
