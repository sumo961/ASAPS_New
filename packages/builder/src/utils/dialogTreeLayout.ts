/**
 * dialogTreeLayout — positions for the cluster-style dialogTree expansion
 * (B1b v2): the internal dialog renders as REAL child nodes inside a
 * container node, connected by real edges, so the inside of a dialog
 * speaks the same visual language as the rest of the flowchart.
 *
 * Tidy-tree layout over the outline rows: column = tree depth, leaves get
 * sequential rows, parents center on their children. Pure math — no DOM.
 */
import { dialogTreeOutline, type DialogOutlineRow } from './dialogTreeOutline';

export const DLG_NODE_W = 150;
export const DLG_NODE_H = 44;
export const DLG_COL_W = 175;
export const DLG_ROW_H = 56;
/** Container chrome: header height and inner padding. */
export const DLG_HEADER_H = 40;
export const DLG_PAD = 12;

export interface DialogLayoutNode extends DialogOutlineRow {
  /** Position relative to the container node's top-left. */
  x: number;
  y: number;
}

export interface DialogLayoutEdge {
  /** Outline pathIds; '' target means an EXIT (see exitTarget). */
  sourcePath: string;
  targetPath?: string;
  /** Beat id for exit edges; '__self__' loops resolve to the root path. */
  exitTarget?: string;
  conditions?: DialogOutlineRow['conditions'];
}

export interface DialogLayout {
  nodes: DialogLayoutNode[];
  /** Structural edges INSIDE the container (npc→choice, choice→nested npc,
   *  choice→root for '__self__' loops). Guards ride the npc→choice edge —
   *  the choice is OFFERED only when the guard holds. */
  internalEdges: DialogLayoutEdge[];
  /** Edges leaving the container: child pathId → beat id. */
  exitEdges: DialogLayoutEdge[];
  width: number;
  height: number;
  truncated: boolean;
}

/** Parent pathId of a row ('root.c0.n' → 'root.c0'; 'root.c0' → 'root'). */
function parentPath(pathId: string): string | null {
  const i = pathId.lastIndexOf('.');
  return i === -1 ? null : pathId.slice(0, i);
}

export function dialogTreeLayout(tree: any): DialogLayout {
  const outline = dialogTreeOutline(tree);
  const byPath = new Map(outline.rows.map(r => [r.pathId, r]));
  const children = new Map<string, string[]>();
  for (const row of outline.rows) {
    const p = parentPath(row.pathId);
    if (p != null && byPath.has(p)) {
      const list = children.get(p) ?? [];
      list.push(row.pathId);
      children.set(p, list);
    }
  }

  // Tidy tree: leaves take sequential slots, internal nodes center on their
  // children. Walk in outline (document) order via recursion from root.
  const slot = new Map<string, number>();
  let nextLeaf = 0;
  const assign = (pathId: string): number => {
    const kids = children.get(pathId) ?? [];
    if (kids.length === 0) {
      const s = nextLeaf++;
      slot.set(pathId, s);
      return s;
    }
    const kidSlots = kids.map(assign);
    const s = (Math.min(...kidSlots) + Math.max(...kidSlots)) / 2;
    slot.set(pathId, s);
    return s;
  };
  if (byPath.has('root')) assign('root');

  const nodes: DialogLayoutNode[] = outline.rows.map(row => ({
    ...row,
    x: DLG_PAD + row.depth * DLG_COL_W,
    y: DLG_HEADER_H + DLG_PAD + (slot.get(row.pathId) ?? 0) * DLG_ROW_H,
  }));

  const internalEdges: DialogLayoutEdge[] = [];
  const exitEdges: DialogLayoutEdge[] = [];
  for (const row of outline.rows) {
    const p = parentPath(row.pathId);
    if (p != null && byPath.has(p)) {
      internalEdges.push({
        sourcePath: p,
        targetPath: row.pathId,
        // The guard gates the OFFER of a choice — it rides the edge into
        // the choice node, same ◇ language as top-level guarded edges.
        conditions: row.kind === 'choice' ? row.conditions : undefined,
      });
    }
    if (row.exitTarget === '__self__') {
      internalEdges.push({ sourcePath: row.pathId, targetPath: 'root' });
    } else if (row.exitTarget) {
      exitEdges.push({ sourcePath: row.pathId, exitTarget: row.exitTarget });
    }
  }

  const maxDepth = outline.rows.reduce((m, r) => Math.max(m, r.depth), 0);
  const leafCount = Math.max(1, nextLeaf);
  return {
    nodes,
    internalEdges,
    exitEdges,
    width: DLG_PAD * 2 + maxDepth * DLG_COL_W + DLG_NODE_W,
    height: DLG_HEADER_H + DLG_PAD * 2 + (leafCount - 1) * DLG_ROW_H + DLG_NODE_H,
    truncated: outline.truncated,
  };
}
