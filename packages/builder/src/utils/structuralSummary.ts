/**
 * Structural summary — renders the systemic knowledge graph (SPP layer)
 * as compact text for the Co-Designer's story digest.
 *
 * This is the information the flat beat list CANNOT give the model
 * cheaply: state dependencies (which choices move which counters, which
 * beats gate on them), the choice inventory, narrative vectors
 * (conditions + endings), and flow warnings (dead ends, orphans). It is
 * derived from the actual graph, so the model can treat it as ground
 * truth for branching/state questions instead of re-deriving structure
 * from prose. Scales with structure, not text — a few KB even for large
 * stories.
 */

import type { KGGraph, KGNode, KGEdge } from '@asaps/core';

function byType(nodes: KGNode[], type: string): KGNode[] {
  return nodes.filter(n => n.type === type);
}

function beatRef(node: KGNode | undefined): string {
  if (!node) return '?';
  const rawId = node.id.replace(/^beat:/, '');
  return node.label && node.label !== rawId ? `${rawId} ("${node.label}")` : rawId;
}

export function buildStructuralSummary(kg: KGGraph): string {
  const nodeById = new Map(kg.nodes.map(n => [n.id, n]));
  const edgesByType = new Map<string, KGEdge[]>();
  for (const e of kg.edges) {
    const list = edgesByType.get(e.type) ?? [];
    list.push(e);
    edgesByType.set(e.type, list);
  }
  const edges = (type: string) => edgesByType.get(type) ?? [];

  const lines: string[] = [];
  lines.push('STORY STRUCTURE (derived from the actual graph — ground truth for branching/state questions):');

  // ---- State: counters & variables with writers and gates ----------------
  const stateNodes = [...byType(kg.nodes, 'Counter'), ...byType(kg.nodes, 'Variable')];
  if (stateNodes.length > 0) {
    lines.push('', 'STATE (who changes it, who gates on it):');
    for (const sn of stateNodes) {
      const owner = edges('hasCounter').find(e => e.target === sn.id);
      const ownerLabel = owner ? nodeById.get(owner.source)?.label : undefined;

      // Dedupe: nested dialog trees produce many distinct choice nodes with
      // identical (truncated) labels — one line per unique rendering.
      const writers = [...new Set(
        edges('affects')
          .filter(e => e.target === sn.id)
          .map(e => {
            const choice = nodeById.get(e.source);
            const beatId = choice?.sourceBeatIds?.[0];
            return `${beatId ?? '?'} choice "${choice?.label ?? '?'}"${e.label ? ` (${e.label})` : ''}`;
          })
      )];

      const gates = [...new Set(
        edges('gatedBy')
          .filter(e => e.target === sn.id)
          .map(e => {
            const op = e.props?.operator;
            const val = e.props?.value;
            return `${beatRef(nodeById.get(e.source))}${op !== undefined ? ` (${op} ${val})` : ''}`;
          })
      )];

      const kind = sn.type === 'Counter' ? 'counter' : 'variable';
      const bits: string[] = [];
      if (ownerLabel) bits.push(`owned by ${ownerLabel}`);
      bits.push(writers.length > 0 ? `changed by: ${writers.join('; ')}` : 'never changed');
      bits.push(gates.length > 0 ? `gates: ${gates.join('; ')}` : 'never checked');
      lines.push(`- ${kind} "${sn.label}" — ${bits.join(' — ')}`);
    }
  }

  // ---- Choice inventory ---------------------------------------------------
  const choiceNodes = byType(kg.nodes, 'Choice');
  if (choiceNodes.length > 0) {
    const perBeat = new Map<string, number>();
    for (const c of choiceNodes) {
      const beat = c.sourceBeatIds?.[0] ?? '?';
      perBeat.set(beat, (perBeat.get(beat) ?? 0) + 1);
    }
    const parts = [...perBeat.entries()].map(([b, n]) => `${b}: ${n}`);
    lines.push('', `CHOICES: ${choiceNodes.length} across ${perBeat.size} beat${perBeat.size === 1 ? '' : 's'} (${parts.join(', ')})`);
  }

  // ---- Narrative vectors: conditions + endings ---------------------------
  const vectors = kg.nodes.filter(
    n => n.type === 'Beat' || n.type === 'NarrativeVector'
  ).filter(n => n.protostoryElement === 'narrativeVector');
  if (vectors.length > 0) {
    lines.push('', 'NARRATIVE VECTORS (conditions and endings):');
    for (const v of vectors) {
      const beatType = (v.props?.beatType as string) ?? '?';
      const outgoing = edges('leadsTo')
        .filter(e => e.source === v.id)
        .map(e => `${e.label ? `"${e.label}" → ` : '→ '}${beatRef(nodeById.get(e.target))}`);
      const gate = edges('gatedBy').find(e => e.source === v.id);
      const gateNote = gate
        ? ` gates on "${nodeById.get(gate.target)?.label}"${gate.props?.operator !== undefined ? ` ${gate.props.operator} ${gate.props.value}` : ''}`
        : '';
      lines.push(`- ${beatRef(v)} [${beatType}]${gateNote}${outgoing.length > 0 ? ` — ${outgoing.join(', ')}` : ''}`);
    }
  }

  // ---- Flow warnings ------------------------------------------------------
  const beatNodes = kg.nodes.filter(n => n.type === 'Beat' || n.protostoryElement === 'narrativeVector');
  const flowEdges = [...edges('leadsTo'), ...edges('choiceLeadsTo')];
  const hasOutgoing = new Set(flowEdges.map(e => e.source));
  // A beat also "has outgoing flow" when it offers choices that route somewhere.
  for (const oc of edges('offersChoice')) {
    const choiceRoutes = flowEdges.some(e => e.source === oc.target);
    if (choiceRoutes) hasOutgoing.add(oc.source);
  }
  const hasIncoming = new Set(flowEdges.map(e => e.target));

  const deadEnds = beatNodes.filter(
    n => !hasOutgoing.has(n.id) && (n.props?.beatType as string) !== 'endScreen'
  );
  const noIncoming = beatNodes.filter(n => !hasIncoming.has(n.id));

  if (deadEnds.length > 0 || noIncoming.length > 1) {
    lines.push('', 'FLOW WARNINGS:');
    if (deadEnds.length > 0) {
      lines.push(`- Dead ends (no outgoing transition, not an ending): ${deadEnds.map(beatRef).join(', ')} — players get stuck here.`);
    }
    if (noIncoming.length > 1) {
      lines.push(`- No incoming transitions (one is the start beat; the rest may be unreachable): ${noIncoming.map(beatRef).join(', ')}`);
    }
  }

  return lines.join('\n');
}
