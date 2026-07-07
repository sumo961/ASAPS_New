import { Node as RFNode, Edge as RFEdge, MarkerType } from 'reactflow';
import {
  buildSystemicGraph,
  KGGraph,
  KGNode,
  KGStoryInput,
  KGVariableInput,
  SYSTEMIC_NODE_TYPES as N,
  SYSTEMIC_EDGE_TYPES as E,
} from '@asaps/core';

/**
 * Runtime beats (the @asaps/core `Beat` class) store dialogue/condition data on
 * subclass fields, not under a serialized `parameters` object. `getParameters()`
 * reconstructs the plain `parameters` shape the KG builder reads — so we
 * serialize through it here rather than reaching into the instances.
 */
interface RuntimeBeatLike {
  id: string;
  name?: string;
  type?: string;
  speaker?: string;
  connections?: Array<{ targetId?: string; target?: string; label?: string; condition?: unknown }>;
  getParameters?: () => Record<string, unknown>;
}

interface RuntimeCharacterLike {
  id?: string;
  name?: string;
  displayName?: string;
  role?: string;
  counters?: Array<{ name: string; displayName?: string; value?: number }>;
}

interface WorkspaceConnection {
  source: string;
  target: string;
  label?: string;
}

/** Adapt the builder's live story state into the KG builder's plain input. */
export function toKGStoryInput(
  beats: RuntimeBeatLike[],
  connections: WorkspaceConnection[],
  characters: RuntimeCharacterLike[]
): KGStoryInput {
  return {
    beats: beats.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      speaker: b.speaker,
      connections: (b.connections ?? []).map((c) => ({
        targetId: c.targetId ?? c.target,
        label: c.label,
        condition: c.condition as never,
      })),
      parameters: b.getParameters ? b.getParameters() : {},
    })),
    connections: (connections ?? []).map((c) => ({
      source: c.source,
      target: c.target,
      label: c.label,
    })),
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      role: c.role,
      counters: c.counters,
    })) as KGStoryInput['characters'],
  };
}

/** Build the systemic KG straight from live workspace state. */
export function buildWorkspaceKG(
  beats: RuntimeBeatLike[],
  connections: WorkspaceConnection[],
  characters: RuntimeCharacterLike[],
  variables: KGVariableInput[] = [],
  options: { projectId?: string; projectName?: string } = {}
): KGGraph {
  return buildSystemicGraph(toKGStoryInput(beats, connections, characters), {
    variables,
    ...options,
  });
}

/** Visual identity per node type (systemic types + a fallback for cultural). */
export const KG_NODE_COLORS: Record<string, string> = {
  [N.Beat]: '#8b5cf6',
  [N.Choice]: '#f59e0b',
  [N.Character]: '#3b82f6',
  [N.Counter]: '#10b981',
  [N.Variable]: '#06b6d4',
};

const FALLBACK_COLOR = '#64748b';
const CULTURAL_COLOR = '#ec4899'; // rose — the extracted cultural layer
const CONTENTION_COLOR = '#dc2626'; // red — sensitive / contested elements

export function nodeColor(type: string): string {
  return KG_NODE_COLORS[type] ?? FALLBACK_COLOR;
}

/** Legend swatch colour, aware of the cultural layer. */
export function legendColor(type: string, layer?: string): string {
  return layer === 'cultural' ? CULTURAL_COLOR : nodeColor(type);
}

/** Edge types drawn dashed (state/conditional or cultural relationships, not flow). */
const DASHED_EDGES = new Set<string>([
  E.gatedBy,
  E.affects,
  E.hasCounter,
  'assertedIn',
  'relatesTo',
  'assertsAbout',
  'suggestedAlternative',
]);

/** Column index per node type — drives the deterministic columnar layout. */
const COLUMN: Record<string, number> = {
  [N.Character]: 0,
  [N.Counter]: 1,
  [N.Variable]: 1,
  [N.Beat]: 2,
  [N.Choice]: 3,
};

const COL_WIDTH = 340;
const ROW_HEIGHT = 64;

export interface KGLayoutResult {
  nodes: RFNode[];
  edges: RFEdge[];
}

/**
 * Deterministic columnar layout. Systemic KG nodes carry no canvas
 * coordinates, so we group by type into columns (characters → counters →
 * beats → choices), which reads far more clearly than the authored flowchart
 * positions would for a heterogeneous graph. Pure: same graph → same layout.
 */
export function layoutKG(
  graph: KGGraph,
  opts: { visibleTypes?: Set<string>; matchIds?: Set<string> | null } = {}
): KGLayoutResult {
  const visible = opts.visibleTypes;
  const shownNodes = graph.nodes.filter((n) => !visible || visible.has(n.type));
  const shownIds = new Set(shownNodes.map((n) => n.id));

  // Stack each column independently, sorted by label for stability.
  const byColumn = new Map<number, KGNode[]>();
  for (const node of shownNodes) {
    const col = COLUMN[node.type] ?? 4;
    const list = byColumn.get(col) ?? [];
    list.push(node);
    byColumn.set(col, list);
  }
  for (const list of byColumn.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, list] of byColumn) {
    list.forEach((node, i) => {
      positions.set(node.id, { x: col * COL_WIDTH, y: i * ROW_HEIGHT });
    });
  }

  const matchIds = opts.matchIds ?? null;

  const nodes: RFNode[] = shownNodes.map((n) => {
    const dimmed = matchIds ? !matchIds.has(n.id) : false;
    const cultural = n.layer === 'cultural';
    const contentious = cultural && n.contention?.contentious === true;
    const fill = cultural ? CULTURAL_COLOR : nodeColor(n.type);
    const border = contentious ? CONTENTION_COLOR : fill;
    return {
      id: n.id,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: { label: n.label, kgType: n.type, kgLayer: n.layer },
      style: {
        background: fill,
        color: '#fff',
        border: `${contentious ? 3 : 2}px solid ${border}`,
        borderRadius: cultural ? 16 : 8, // pill shape distinguishes the cultural layer
        padding: '6px 10px',
        fontSize: 11,
        width: 220,
        opacity: dimmed ? 0.25 : 1,
      },
    };
  });

  const edges: RFEdge[] = graph.edges
    .filter((e) => shownIds.has(e.source) && shownIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: false,
      style: DASHED_EDGES.has(e.type)
        ? { strokeDasharray: '4 3', stroke: '#94a3b8' }
        : { stroke: '#cbd5e1' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      data: { kgType: e.type },
    }));

  return { nodes, edges };
}
