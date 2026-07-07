import {
  KGGraph,
  KGNode,
  KGEdge,
  KGStoryInput,
  KGBeatInput,
  KGChoiceInput,
  KGConditionInput,
  KGCounterInput,
  BuildSystemicOptions,
  SYSTEMIC_NODE_TYPES as N,
  SYSTEMIC_EDGE_TYPES as E,
  PROTOSTORY_ELEMENT,
  ProtostoryElement,
} from './types';

/**
 * Beat types that function as narrative vectors (Koenitz, SPP): they gate flow,
 * set boundaries, or deliver a dramatic turn/ending rather than just presenting
 * content. Tagged so the graph can be read by the author's own model.
 */
const NARRATIVE_VECTOR_BEAT_TYPES = new Set(['conditionBeat', 'endScreen']);

function beatProtostoryElement(beatType?: string): ProtostoryElement {
  return beatType && NARRATIVE_VECTOR_BEAT_TYPES.has(beatType)
    ? 'narrativeVector'
    : PROTOSTORY_ELEMENT.Beat;
}

const MAX_LABEL = 60;

function truncate(text: string, max = MAX_LABEL): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

/** Stable id helpers — deterministic so test output is reproducible. */
const beatNodeId = (id: string) => `beat:${id}`;
const charNodeId = (c: { id?: string; name?: string }) => `char:${c.id ?? c.name ?? 'unknown'}`;
const counterNodeId = (name: string) => `counter:${name}`;
const varNodeId = (name: string) => `var:${name}`;
const choiceNodeId = (id: string) => `choice:${id}`;

/**
 * Build the systemic / protostory layer of the knowledge graph from a story.
 *
 * This is a pure, deterministic transform — no AI, no side effects. It expresses
 * the IDN's possibility space in its own native primitives (beats, choices,
 * conditions, counters, characters), which is the SPP "System" view. The output
 * is sorted by id so two runs over the same input are byte-identical.
 */
export function buildSystemicGraph(
  story: KGStoryInput,
  options: BuildSystemicOptions = {}
): KGGraph {
  const includeChoices = options.includeChoices !== false;

  const nodes = new Map<string, KGNode>();
  const edges: KGEdge[] = [];
  const edgeIds = new Set<string>();

  const addNode = (node: KGNode) => {
    const existing = nodes.get(node.id);
    if (existing) {
      // Merge source beats; keep the first-seen label/props.
      for (const b of node.sourceBeatIds) {
        if (!existing.sourceBeatIds.includes(b)) existing.sourceBeatIds.push(b);
      }
      return existing;
    }
    nodes.set(node.id, node);
    return node;
  };

  const addEdge = (
    type: string,
    source: string,
    target: string,
    extra?: { label?: string; props?: Record<string, unknown> }
  ) => {
    let base = `e:${type}:${source}->${target}`;
    let id = base;
    let n = 1;
    while (edgeIds.has(id)) id = `${base}#${n++}`;
    edgeIds.add(id);
    edges.push({ id, type, source, target, label: extra?.label, props: extra?.props });
  };

  const ensureCounter = (name: string, declared: boolean, displayName?: string) => {
    const id = counterNodeId(name);
    const existing = nodes.get(id);
    if (existing) {
      if (declared) (existing.props ??= {}).declared = true;
      return id;
    }
    addNode({
      id,
      layer: 'systemic',
      type: N.Counter,
      label: displayName || name,
      sourceBeatIds: [],
      protostoryElement: PROTOSTORY_ELEMENT.Counter,
      props: { name, declared },
    });
    return id;
  };

  // --- Characters and their counters -------------------------------------
  const characters = story.characters ?? [];
  for (const c of characters) {
    const id = charNodeId(c);
    addNode({
      id,
      layer: 'systemic',
      type: N.Character,
      label: c.displayName || c.name || 'Character',
      sourceBeatIds: [],
      protostoryElement: PROTOSTORY_ELEMENT.Character,
      props: { name: c.name, role: (c as { role?: string }).role },
    });
    for (const counter of (c.counters ?? []) as KGCounterInput[]) {
      const cid = ensureCounter(counter.name, true, counter.displayName);
      addEdge(E.hasCounter, id, cid);
    }
  }

  // --- Story variables ----------------------------------------------------
  for (const v of options.variables ?? []) {
    addNode({
      id: varNodeId(v.name),
      layer: 'systemic',
      type: N.Variable,
      label: v.name,
      sourceBeatIds: [],
      protostoryElement: PROTOSTORY_ELEMENT.Variable,
      props: { type: v.type, defaultValue: v.defaultValue },
    });
  }

  // Map speaker string → character node id (best-effort, case-insensitive).
  const speakerToChar = new Map<string, string>();
  for (const c of characters) {
    if (c.name) speakerToChar.set(c.name.toLowerCase(), charNodeId(c));
    if (c.displayName) speakerToChar.set(c.displayName.toLowerCase(), charNodeId(c));
  }

  const beats = story.beats ?? [];

  // --- Beats (+ choices, condition gating) -------------------------------
  for (const beat of beats) {
    const bid = beatNodeId(beat.id);
    addNode({
      id: bid,
      layer: 'systemic',
      type: N.Beat,
      label: beat.name || beat.id,
      sourceBeatIds: [beat.id],
      protostoryElement: beatProtostoryElement(beat.type),
      props: { beatType: beat.type, speaker: beat.speaker },
    });

    if (beat.speaker) {
      const charId = speakerToChar.get(beat.speaker.toLowerCase());
      if (charId) addEdge(E.spokenBy, bid, charId);
    }

    if (includeChoices) {
      collectChoices(beat, addNode, addEdge, ensureCounter);
    }

    // Condition beats gate flow on a counter/variable.
    if (beat.type === 'conditionBeat') {
      const cond = (beat.parameters?.condition ?? null) as KGConditionInput | null;
      const varName =
        cond?.variableName ?? (beat.parameters?.variableName as string | undefined);
      if (varName) {
        const targetId =
          cond?.type === 'variable' ? varNodeId(varName) : ensureCounter(varName, false);
        if (cond?.type === 'variable' && !nodes.has(targetId)) {
          addNode({
            id: targetId,
            layer: 'systemic',
            type: N.Variable,
            label: varName,
            sourceBeatIds: [beat.id],
            protostoryElement: PROTOSTORY_ELEMENT.Variable,
          });
        }
        addEdge(E.gatedBy, bid, targetId, {
          props: { operator: cond?.operator, value: cond?.value },
        });
      }
    }
  }

  // --- Transitions (leadsTo) ---------------------------------------------
  // Merge the two redundant sources of truth: top-level story.connections and
  // each beat's own connections[]. Dedupe on (source, target, label).
  const seenTransitions = new Set<string>();
  const addTransition = (
    sourceBeat: string,
    targetBeat: string,
    label?: string,
    condition?: KGConditionInput
  ) => {
    if (!targetBeat) return;
    const key = `${sourceBeat}|${targetBeat}|${label ?? ''}`;
    if (seenTransitions.has(key)) return;
    seenTransitions.add(key);
    addEdge(E.leadsTo, beatNodeId(sourceBeat), beatNodeId(targetBeat), {
      label,
      props: condition ? { condition } : undefined,
    });
  };

  for (const conn of story.connections ?? []) {
    addTransition(conn.source, conn.target, conn.label, conn.condition);
  }
  for (const beat of beats) {
    for (const conn of beat.connections ?? []) {
      const target = conn.targetId ?? conn.target;
      if (target) addTransition(beat.id, target, conn.label, conn.condition);
    }
  }

  // --- Finalize: sort for determinism ------------------------------------
  const sortedNodes = Array.from(nodes.values()).sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = edges.sort((a, b) => a.id.localeCompare(b.id));

  return {
    nodes: sortedNodes,
    edges: sortedEdges,
    meta: {
      projectId: options.projectId,
      projectName: options.projectName,
      layers: ['systemic'],
      generatedFrom: 'systemic',
      counts: { nodes: sortedNodes.length, edges: sortedEdges.length },
    },
  };
}

/**
 * Walk a beat's dialogTree, emitting Choice nodes and their edges. Recurses into
 * nested dialogNode continuations (intra-beat dialogue), anchoring every choice
 * to the owning beat.
 */
function collectChoices(
  beat: KGBeatInput,
  addNode: (n: KGNode) => KGNode,
  addEdge: (
    type: string,
    source: string,
    target: string,
    extra?: { label?: string; props?: Record<string, unknown> }
  ) => void,
  ensureCounter: (name: string, declared: boolean) => string
) {
  const root = beat.parameters?.dialogTree as
    | { choices?: KGChoiceInput[] }
    | undefined;
  if (!root?.choices?.length) return;

  const bid = beatNodeId(beat.id);
  let synthetic = 0;

  const visitChoice = (choice: KGChoiceInput, parentId: string, parentIsBeat: boolean) => {
    const choiceKey = choice.id ?? `${beat.id}_c${synthetic++}`;
    const cid = choiceNodeId(choiceKey);
    addNode({
      id: cid,
      layer: 'systemic',
      type: N.Choice,
      label: truncate(choice.text ?? 'choice'),
      sourceBeatIds: [beat.id],
      protostoryElement: PROTOSTORY_ELEMENT.Choice,
      props: { beatId: beat.id, text: choice.text },
    });

    addEdge(parentIsBeat ? E.offersChoice : E.continuesTo, parentId, cid);

    // Effects mutate counters.
    for (const effect of choice.effects ?? []) {
      if (!effect.target) continue;
      const isCounter =
        effect.type === 'incrementCounter' || effect.type === 'setCounter';
      if (isCounter) {
        const counterId = ensureCounter(effect.target, false);
        addEdge(E.affects, cid, counterId, {
          props: { effectType: effect.type, value: effect.value },
        });
      }
    }

    // Routing to another beat.
    if (choice.target) {
      addEdge(E.choiceLeadsTo, cid, beatNodeId(choice.target));
    }

    // Intra-beat dialogue continuation.
    for (const nested of choice.dialogNode?.choices ?? []) {
      visitChoice(nested, cid, false);
    }
  };

  for (const choice of root.choices) {
    visitChoice(choice, bid, true);
  }
}
