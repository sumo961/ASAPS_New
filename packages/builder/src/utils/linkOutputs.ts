/**
 * A beat's outputs: the places one of its links can start from (2026-10-29,
 * class feedback: "make simple connections by dragging from one beat to the
 * next"). Dragging a link in the flowchart asks this which outputs the beat
 * has; with more than one, the author picks which one the new link is.
 *
 * Unlike the core link walk (storyLinks.ts), which reads every shape a story
 * arrives in, this lists the shapes the builder itself writes — the same
 * fields the Inspector's beat pickers edit — and includes outputs that aren't
 * linked yet. Each output says how to point it at a beat: an update for
 * App's undoable handleBeatUpdate, the path an Inspector edit takes.
 */
import type { Beat } from '@asaps/core';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';
import { PARAMETER_DERIVED_TYPES } from './beatConnectionModel';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LinkOutput {
  /** Where the link is kept, e.g. `choices[1].target`; unique per beat. */
  key: string;
  /** What the author calls it: the choice's text, "If true", "Next"… */
  label: string;
  /** The beat it points at now; '' when it isn't linked. '__self__' = back to the choices. */
  target: string;
  /** The beat update that points this output at `targetId`. */
  updatesFor(targetId: string): Record<string, any>;
}

const CHOICE_TYPES = new Set(['multiChoice', 'movementChoice', 'chooseCharacter']);

const short = (s: unknown, n = 48): string => {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Set `value` at a path like `choices[2].target` or `dialogTree.choices[0].dialogNode.target`. */
export function setAtPath(root: any, path: string, value: unknown): void {
  const parts = path.match(/[^.[\]]+/g) || [];
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  const last = parts[parts.length - 1];
  node[/^\d+$/.test(last) ? Number(last) : last] = value;
}

/**
 * The outputs of `beat`, in the order the Inspector shows them. `null` when
 * this beat type's links can't be drawn (AI beats with categories, AR
 * anchors…): set those in the Properties panel.
 */
export function linkOutputs(beat: Beat): LinkOutput[] | null {
  const b = beat as any;
  const type: string = b.type;
  const params: Record<string, any> = typeof b.getParameters === 'function' ? b.getParameters() : (b.parameters || {});

  /** An output kept in the parameters at `path`. */
  const paramOutput = (key: string, label: string, target: unknown, also?: (targetId: string) => Record<string, any>): LinkOutput => ({
    key,
    label,
    target: typeof target === 'string' ? target : '',
    updatesFor: (targetId) => {
      const next = structuredClone(params);
      setAtPath(next, key, targetId);
      return { parameters: next, ...(also ? also(targetId) : {}) };
    },
  });
  /** A list of items (choices, props, hotspots…) each with its own target field. */
  const listOutputs = (field: string, targetField: string, labelOf: (item: any, i: number) => string): LinkOutput[] =>
    (Array.isArray(params[field]) ? params[field] : []).map((item: any, i: number) =>
      paramOutput(`${field}[${i}].${targetField}`, labelOf(item, i), item?.[targetField]));
  /** The beat's own stored link (beat.connections[0]), keeping its other fields (effects). */
  const storedLink = (label: string): LinkOutput => {
    const stored = (Array.isArray(b.connections) ? b.connections : []).filter((c: any) => !c?.derivedFrom);
    const prior = stored[0] || {};
    return {
      key: 'connections[0]',
      label,
      target: prior.targetId || '',
      updatesFor: (targetId) => ({ connections: [{ ...prior, targetId, label: prior.label || '' }, ...stored.slice(1)] }),
    };
  };
  const numbered = (i: number, text: unknown, fallback: string) => `${i + 1} · ${short(text) || fallback}`;

  if (CHOICE_TYPES.has(type)) {
    return listOutputs('choices', 'target', (c, i) => numbered(i, c?.displayText || c?.text, `Choice ${i + 1}`));
  }

  switch (type) {
    case 'pickProp':
      return listOutputs('props', 'target', (p, i) => numbered(i, p?.displayName || p?.name, `Prop ${i + 1}`));
    case 'panorama':
      return listOutputs('hotspots', 'target', (h, i) => numbered(i, h?.name || h?.label, `Hotspot ${i + 1}`));
    case 'hyperText':
      return listOutputs('hyperlinks', 'targetBeatId', (l, i) => numbered(i, l?.word, `Link ${i + 1}`));
    case 'gpsLocation':
    case 'indoorLocation':
      return listOutputs('xrLocations', 'target', (l, i) => numbered(i, l?.name || l?.id, `Place ${i + 1}`));
    case 'randomTarget':
      // Branches are bare beat ids, or { target, weight, effects }.
      return (Array.isArray(params.choices) ? params.choices : []).map((c: any, i: number) =>
        typeof c === 'string' || c == null
          ? paramOutput(`choices[${i}]`, numbered(i, '', `Branch ${i + 1}`), c)
          : paramOutput(`choices[${i}].target`, numbered(i, c.label, `Branch ${i + 1}`), c.target));
    case 'conditionBeat': {
      // The Inspector keeps the labelled link next to the parameter.
      const withLink = (label: 'true' | 'false') => (targetId: string) => {
        const others = (Array.isArray(b.connections) ? b.connections : []).filter((c: any) => c?.label !== label && !c?.derivedFrom);
        return { connections: targetId ? [...others, { targetId, label }] : others };
      };
      return [
        paramOutput('trueTarget', 'If true', params.trueTarget, withLink('true')),
        paramOutput('falseTarget', 'If false', params.falseTarget, withLink('false')),
      ];
    }
    case 'setTimer':
      return [
        paramOutput('continueTarget', 'Continue (the timer runs on)', params.continueTarget),
        paramOutput('timerTarget', 'When time runs out', params.timerTarget),
      ];
    case 'keypad':
      return [storedLink('Right code'), paramOutput('failTarget', 'Too many tries', params.failTarget)];
    case 'aiConversation':
      return [paramOutput('fallbackExitTarget', 'When the conversation ends', params.fallbackExitTarget)];
    case 'freeLayout': {
      // Its buttons whose element is on the stage (FreeLayoutBeat.liveChoices),
      // then the timer, or — with neither — a click anywhere.
      // By the element's name (FreeLayoutBeat.liveChoices), not the Map key.
      const onStage = new Set(Array.from((b.locations as Map<string, any> | undefined)?.values?.() ?? []).map((l: any) => l?.name));
      const outs: LinkOutput[] = [];
      (Array.isArray(params.choices) ? params.choices : []).forEach((c: any, i: number) => {
        if (c?.locationName && onStage.has(c.locationName)) {
          outs.push(paramOutput(`choices[${i}].target`, `${outs.length + 1} · ${short(c.text) || c.locationName}`, c.target));
        }
      });
      const timed = Number(params.duration) > 0;
      if (timed) outs.push(paramOutput('timerTarget', 'When time runs out', params.timerTarget));
      if (!timed && outs.length === 0) outs.push(paramOutput('nextTarget', 'Next (click anywhere)', params.nextTarget));
      return outs;
    }
    case 'dialogTree':
      return dialogOutputs(params, paramOutput);
    default:
      break;
  }

  if (PARAMETER_DERIVED_TYPES.has(type)) return null;
  const def = (beatDefinitions.beatTypes as Record<string, { connectionType?: string }>)[type];
  const connectionType = def?.connectionType || 'single';
  if (connectionType === 'single') return [storedLink('Next')];
  return null;
}

/**
 * A Dialog Tree's outputs: every player line without a reply of its own
 * (picking it leaves the conversation), and every character line nobody
 * answers (it moves on by itself). Labelled with the lines leading there.
 */
function dialogOutputs(
  params: Record<string, any>,
  paramOutput: (key: string, label: string, target: unknown) => LinkOutput,
): LinkOutput[] {
  const out: LinkOutput[] = [];
  const walk = (node: any, path: string, trail: string[]) => {
    if (!node || typeof node !== 'object') return;
    const choices = Array.isArray(node.choices) ? node.choices : [];
    if (choices.length === 0) {
      const said = short(node.text, 32);
      out.push(paramOutput(`${path}.target`, [...trail, said ? `after “${said}”` : 'after the last line'].join(' › '), node.target));
      return;
    }
    choices.forEach((c: any, i: number) => {
      const text = short(c?.text, 32) || `Line ${i + 1}`;
      if (c?.dialogNode) walk(c.dialogNode, `${path}.choices[${i}].dialogNode`, [...trail, text]);
      else out.push(paramOutput(`${path}.choices[${i}].target`, [...trail, text].join(' › '), c?.target));
    });
  };
  walk(params.dialogTree, 'dialogTree', []);
  return out;
}
