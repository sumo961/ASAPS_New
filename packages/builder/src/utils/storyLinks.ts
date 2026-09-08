/**
 * Every link in a story, from one place.
 *
 * "Which beat does this beat point at" was answered in six different files —
 * two validators, the layout algorithm, the AI response validator, and both
 * story-import handlers in App.tsx — each with its own hand-rolled walk over
 * the beat shapes it happened to know about. They disagreed, and every
 * disagreement was a bug with a delay on it:
 *
 *  - the validators read links hanging off beats but not the story-level
 *    `connections` array, so an MCP-injected story reported "Connections: 0,
 *    VALID" while three of its links pointed at a beat that did not exist —
 *    found by playing the story and watching it stop;
 *  - the generation importer's story-level reader accepted `from`/`to` but
 *    not `source`/`target`, the inject importer accepted both;
 *  - the validators did not know the direct `trueTarget`/`falseTarget` format
 *    the builder itself writes, only the legacy connection-object form;
 *  - only the layout algorithm knew about panorama hotspots, keypad
 *    `failTarget`, qrScan jump targets, and the `entries[]` dialog shape, so
 *    beats reachable only that way were "unreachable" to everything else.
 *
 * This module is the union. Consumers slice it — ids for validation, labelled
 * edges for import, deduped pairs for layout — but nobody re-walks the beat.
 *
 * When a new beat type gains a target field, it gets added HERE and every
 * consumer learns it at once. That is the entire point.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StoryLink {
  /** Beat the link starts from. */
  source: string;
  /** Beat id it points at (may not exist — that is for validators to say). */
  target: string;
  /** Where on the beat the link was found. */
  via:
    | 'beat-connections'
    | 'default-target'
    | 'connection'
    | 'condition-true'
    | 'condition-false'
    | 'choice'
    | 'prop'
    | 'dialog'
    | 'random'
    | 'timer'
    | 'restart'
    | 'fail'
    | 'hyperlink'
    | 'hotspot'
    | 'qr-jump'
    | 'param-target'
    | 'story-connections';
  /** Author-facing text for the link, when the shape carries one. */
  label?: string;
  /**
   * Parameter path of the target field relative to `parameters` (e.g.
   * `trueTarget`, `choices[2].target`, `connection.target`), for links a
   * retarget can write back to. Absent for dialog-internal and story-level
   * links, whose write location is not a single parameter field.
   */
  path?: string;
  /**
   * Reachable only through an out-of-band jump — a scanned QR code. Layout
   * and reachability count these as real links (the beat is not orphaned);
   * a play-flow analysis may want to treat them differently.
   */
  outOfBand?: boolean;
}

const push = (
  out: StoryLink[],
  source: string,
  target: unknown,
  via: StoryLink['via'],
  label?: unknown,
  outOfBand?: boolean,
  path?: string,
): void => {
  if (typeof target !== 'string' || !target) return;
  const link: StoryLink = { source, target, via };
  if (typeof label === 'string' && label) link.label = label;
  if (outOfBand) link.outOfBand = true;
  if (path) link.path = path;
  out.push(link);
};

/**
 * Walk a dialogTree node. The shapes in the wild, all still arriving:
 *  - choices[].target as a string beat id (the exit)
 *  - choices[].dialogNode — nested conversation, recurse
 *  - choices[].target as an OBJECT — the old nested format, recurse; its
 *    `.next` may be a string beat id
 *  - node.target / node.targetId directly on a node
 *  - node.next as a string or a nested node
 *  - entries[] — an alternative container of choice arrays
 */
function walkDialog(node: any, source: string, out: StoryLink[]): void {
  if (!node || typeof node !== 'object') return;

  push(out, source, node.target, 'dialog');
  push(out, source, node.targetId, 'dialog');

  if (Array.isArray(node.choices)) {
    for (const choice of node.choices) {
      if (!choice) continue;
      if (typeof choice.target === 'string') {
        push(out, source, choice.target, 'dialog', choice.text || 'Choice');
      } else if (choice.target && typeof choice.target === 'object') {
        // Old nested format: the object may carry `.next` as the exit and may
        // itself be a deeper node.
        push(out, source, choice.target.next, 'dialog', choice.text || 'Choice');
        walkDialog(choice.target, source, out);
      }
      push(out, source, choice.targetId, 'dialog', choice.text || 'Choice');
      if (choice.dialogNode) walkDialog(choice.dialogNode, source, out);
    }
  }

  if (Array.isArray(node.entries)) {
    for (const entry of node.entries) walkDialog(entry, source, out);
  }

  if (typeof node.next === 'string') push(out, source, node.next, 'dialog');
  else if (node.next && typeof node.next === 'object') walkDialog(node.next, source, out);
}

/** All links hanging off one beat, in any of the shapes the wild produces. */
export function beatLinks(beat: any): StoryLink[] {
  const out: StoryLink[] = [];
  if (!beat || typeof beat.id !== 'string') return out;
  const id = beat.id;

  // Top-level connections array — targetId (builder-native) or target.
  // EXCEPT for dialogTree beats that carry a real tree: there the tree is
  // the single authority (DialogTreeBeat.getConnections overrides and the
  // engine navigates the tree), and the top-level array is a serialized
  // cache that goes stale. Legacy ASML imports proved it: Red Story's
  // dialogTree files still carried pre-conversion targets (12/14/16) in
  // `connections` while the live tree pointed at 13/15/17 — deleting any
  // beat then surfaced 14 phantom "choices lead nowhere" rows.
  const treeIsAuthority = beat.type === 'dialogTree' && !!(beat.parameters || {}).dialogTree;
  if (!treeIsAuthority && Array.isArray(beat.connections)) {
    for (const conn of beat.connections) {
      if (!conn) continue;
      push(out, id, conn.targetId ?? conn.target, 'beat-connections', conn.label);
    }
  }

  // defaultTarget lives at beat level in serialized beats and in parameters
  // in some AI output.
  push(out, id, beat.defaultTarget, 'default-target');

  const p = beat.parameters || {};
  push(out, id, p.defaultTarget, 'default-target', undefined, false, 'defaultTarget');

  // Single connection (infoText, titleScreen, …).
  push(out, id, p.connection?.target, 'connection', p.connection?.label, false, 'connection.target');

  // aiConversation: the exit is the max-turns fallback plus any direction
  // whose action (or one of a multi-action's parts) exits the conversation
  // — mirrors AIConversationBeat.getConnections. Without these the walk
  // saw no exit at all and the beat after every AI conversation was
  // "unreachable" (2026-09-08 dragon story: 5 repair rounds for nothing).
  push(out, id, p.fallbackExitTarget, 'param-target', 'Max turns', false, 'fallbackExitTarget');
  if (Array.isArray(p.directions)) {
    p.directions.forEach((d: any, di: number) => {
      const action = d?.action;
      if (!action) return;
      push(out, id, action.exitTarget, 'param-target', d.name || d.id, false, `directions[${di}].action.exitTarget`);
      if (Array.isArray(action.actions)) {
        action.actions.forEach((a: any, ai: number) =>
          push(out, id, a?.exitTarget, 'param-target', d.name || d.id, false, `directions[${di}].action.actions[${ai}].exitTarget`));
      }
    });
  }

  // conditionBeat — the builder writes trueTarget/falseTarget directly; AI
  // output and legacy data use connection objects; and the normalize
  // pipeline's schema alias (trueTarget → trueConnection) leaves the id as a
  // BARE STRING under trueConnection. All three are real — the string form
  // was invisible here, so every gate's exits read as unreachable after
  // normalize (2026-09-08 review fixture).
  push(out, id, p.trueTarget, 'condition-true', 'true', false, 'trueTarget');
  push(out, id, p.falseTarget, 'condition-false', 'false', false, 'falseTarget');
  if (typeof p.trueConnection === 'string') push(out, id, p.trueConnection, 'condition-true', 'true', false, 'trueConnection');
  else push(out, id, p.trueConnection?.target, 'condition-true', 'true', false, 'trueConnection.target');
  if (typeof p.falseConnection === 'string') push(out, id, p.falseConnection, 'condition-false', 'false', false, 'falseConnection');
  else push(out, id, p.falseConnection?.target, 'condition-false', 'false', false, 'falseConnection.target');

  // Choice-based beats. randomTarget's choices may be bare strings.
  if (Array.isArray(p.choices)) {
    p.choices.forEach((choice: any, i: number) => {
      if (typeof choice === 'string') {
        push(out, id, choice, 'random', `Random ${i + 1}`, false, `choices[${i}]`);
      } else if (choice) {
        push(out, id, choice.target, 'choice',
          choice.text || choice.location || choice.name || `Choice ${i + 1}`, false, `choices[${i}].target`);
        push(out, id, choice.targetId, 'choice', choice.text, false, `choices[${i}].targetId`);
      }
    });
  }
  if (Array.isArray(p.props)) {
    p.props.forEach((prop: any, i: number) => {
      if (prop) push(out, id, prop.target, 'prop', prop.name || 'Prop', false, `props[${i}].target`);
    });
  }

  // randomTarget's other shape: targets[] with targetId.
  if (Array.isArray(p.targets)) {
    p.targets.forEach((t: any, i: number) => {
      if (t) push(out, id, t.targetId ?? t.target, 'random', undefined, false, `targets[${i}].${t.targetId !== undefined ? 'targetId' : 'target'}`);
    });
  }

  if (p.dialogTree) walkDialog(p.dialogTree, id, out);

  push(out, id, p.timerTarget, 'timer', undefined, false, 'timerTarget');
  push(out, id, p.restartConnection?.target, 'restart', 'Restart', false, 'restartConnection.target');
  push(out, id, p.failTarget, 'fail', 'Fail', false, 'failTarget');

  if (Array.isArray(p.hyperlinks)) {
    p.hyperlinks.forEach((link: any, i: number) => {
      if (link) push(out, id, link.targetBeatId, 'hyperlink', link.word || 'Link', false, `hyperlinks[${i}].targetBeatId`);
    });
  }
  if (Array.isArray(p.hotspots)) {
    p.hotspots.forEach((hs: any, i: number) => {
      if (hs) push(out, id, hs.target, 'hotspot', hs.name || hs.label, false, `hotspots[${i}].target`);
    });
  }

  // qrScan QR-jump targets — printed asaps://beat/<id> codes. Real links for
  // layout and reachability (the beat is not orphaned), but only reachable by
  // scanning, hence outOfBand.
  if (Array.isArray(p.qrJumpTargets)) {
    for (const t of p.qrJumpTargets) {
      push(out, id, t, 'qr-jump', undefined, true);
    }
  }

  // A bare params.target (some generated shapes).
  push(out, id, p.target, 'param-target', undefined, false, 'target');

  return out;
}

/**
 * Every link in a story: all beats' links plus the story-level `connections`
 * array — the shape external stories (MCP inject, Claude Desktop, legacy
 * exports) arrive in. All spellings accepted: source/sourceId/from and
 * target/targetId/to, because the importers disagreed about which to read and
 * each spelling exists in the wild.
 */
export function storyLinks(story: any): StoryLink[] {
  const out: StoryLink[] = [];
  if (!story) return out;

  if (Array.isArray(story.beats)) {
    for (const beat of story.beats) out.push(...beatLinks(beat));
  }

  if (Array.isArray(story.connections)) {
    for (const conn of story.connections) {
      if (!conn) continue;
      const source = conn.source ?? conn.sourceId ?? conn.from;
      const target = conn.target ?? conn.targetId ?? conn.to;
      if (typeof source !== 'string' || !source) continue;
      push(out, source, target, 'story-connections', conn.label);
    }
  }

  return out;
}

/**
 * One link per (source, target) pair, first occurrence kept.
 *
 * Extraction is ordered parameters-first, so the surviving link carries the
 * richest label — the AI habitually duplicates a parameter-embedded target
 * into the bare `connections` array, and keeping both would double every edge
 * in the graph.
 */
export function dedupeLinks(links: StoryLink[]): StoryLink[] {
  const seen = new Set<string>();
  const out: StoryLink[] = [];
  for (const l of links) {
    const key = `${l.source} ${l.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/** Convenience: just the target ids a single beat points at. */
export function beatTargetIds(beat: any): string[] {
  return beatLinks(beat).map((l) => l.target);
}
