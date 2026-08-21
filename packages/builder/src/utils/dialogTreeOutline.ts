/**
 * dialogTreeOutline — flatten a dialogTree parameter into render rows for
 * the flowchart's expanded dialogTree node (B1b: the disclosure-triangle
 * expansion — "logic visible where it acts" applied to the one legitimately
 * nested structure).
 *
 * Read-only view data: NPC exchanges and player choices in document order,
 * with guards and exits annotated. Exit rows carry a stable `pathId` that
 * doubles as the ReactFlow source-handle id, so the beat's outgoing edges
 * originate from the exact internal row that produces them.
 */
import type { Condition } from '@asaps/core';

export interface DialogOutlineRow {
  /** Stable path — 'root', 'root.c0', 'root.c0.n', … Handle id for exits. */
  pathId: string;
  /** The dialog node's own id (NPC rows) — used for editor focus events. */
  nodeId?: string;
  depth: number;
  kind: 'npc' | 'choice';
  speaker?: string;
  text: string;
  conditions?: Condition[];
  /** Beat id this row exits to; '__self__' marks a loop to the tree root. */
  exitTarget?: string;
  /** Choice continues into a nested NPC node (rendered as following rows). */
  hasNested?: boolean;
}

export interface DialogOutline {
  rows: DialogOutlineRow[];
  /** Rows with a real beat exit (excluding '__self__' loops). */
  exits: DialogOutlineRow[];
  /** True when depth/row caps cut the walk short. */
  truncated: boolean;
}

const MAX_DEPTH = 6; // NPC nesting levels shown
const MAX_ROWS = 40;

export function dialogTreeOutline(tree: any): DialogOutline {
  const rows: DialogOutlineRow[] = [];
  let truncated = false;

  const walkNode = (node: any, pathId: string, depth: number): void => {
    if (!node) return;
    if (rows.length >= MAX_ROWS || depth >= MAX_DEPTH) {
      truncated = true;
      return;
    }
    rows.push({
      pathId,
      nodeId: node.id,
      depth,
      kind: 'npc',
      speaker: node.speaker,
      text: String(node.text ?? ''),
      conditions: Array.isArray(node.conditions) && node.conditions.length ? node.conditions : undefined,
      exitTarget: node.target || undefined,
    });
    const choices: any[] = Array.isArray(node.choices) ? node.choices : [];
    choices.forEach((choice, i) => {
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        return;
      }
      const choicePath = `${pathId}.c${i}`;
      const hasNested = !!choice?.dialogNode;
      rows.push({
        pathId: choicePath,
        depth: depth + 1,
        kind: 'choice',
        text: String(choice?.text ?? ''),
        conditions: Array.isArray(choice?.conditions) && choice.conditions.length ? choice.conditions : undefined,
        exitTarget: choice?.target || undefined,
        hasNested,
      });
      if (hasNested) {
        walkNode(choice.dialogNode, `${choicePath}.n`, depth + 2);
      }
    });
  };

  walkNode(tree, 'root', 0);

  return {
    rows,
    exits: rows.filter(r => r.exitTarget && r.exitTarget !== '__self__'),
    truncated,
  };
}
