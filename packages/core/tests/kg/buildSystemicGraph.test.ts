import { describe, it, expect } from 'vitest';
import {
  buildSystemicGraph,
  SYSTEMIC_NODE_TYPES as N,
  SYSTEMIC_EDGE_TYPES as E,
  KGStoryInput,
  KGVariableInput,
} from '../../src/kg';
import swedenFixture from '../fixtures/sweden-kg.json';
import srilankaFixture from '../fixtures/srilanka-kg.json';

/** Pull the structural story + variables out of an exported project.json. */
function load(fixture: any): { story: KGStoryInput; variables: KGVariableInput[] } {
  const project = fixture.project ?? fixture;
  return {
    story: project.story as KGStoryInput,
    variables: (project.globalSettings?.variables ?? []) as KGVariableInput[],
  };
}

describe('buildSystemicGraph — Sweden seed project', () => {
  const { story, variables } = load(swedenFixture);
  const graph = buildSystemicGraph(story, {
    variables,
    projectId: swedenFixture.metadata?.projectId,
    projectName: swedenFixture.metadata?.projectName,
  });

  it('produces a systemic-only graph with matching meta counts', () => {
    expect(graph.meta.layers).toEqual(['systemic']);
    expect(graph.meta.generatedFrom).toBe('systemic');
    expect(graph.meta.counts.nodes).toBe(graph.nodes.length);
    expect(graph.meta.counts.edges).toBe(graph.edges.length);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it('creates one Beat node per story beat', () => {
    const beatNodes = graph.nodes.filter((n) => n.type === N.Beat);
    expect(beatNodes.length).toBe(story.beats!.length); // 44
    // Every beat node is anchored to its source beat id.
    for (const n of beatNodes) {
      expect(n.sourceBeatIds.length).toBe(1);
      expect(n.layer).toBe('systemic');
    }
  });

  it('creates Character nodes wired to their counters via hasCounter', () => {
    const chars = graph.nodes.filter((n) => n.type === N.Character);
    expect(chars.length).toBe(2); // Player, Child
    const hasCounter = graph.edges.filter((e) => e.type === E.hasCounter);
    expect(hasCounter.length).toBe(2); // support, self esteem
    const counterNames = graph.nodes
      .filter((n) => n.type === N.Counter)
      .map((n) => (n.props?.name as string) ?? n.label);
    expect(counterNames).toContain('support');
    expect(counterNames).toContain('self esteem');
  });

  it('extracts dialogue Choice nodes that affect counters', () => {
    const choices = graph.nodes.filter((n) => n.type === N.Choice);
    expect(choices.length).toBeGreaterThan(0);
    // The opening dialogTree's first choice decrements `support`.
    const affects = graph.edges.filter((e) => e.type === E.affects);
    expect(affects.length).toBeGreaterThan(0);
    for (const e of affects) {
      const target = graph.nodes.find((n) => n.id === e.target);
      expect(target?.type).toBe(N.Counter);
    }
    // offersChoice always goes Beat → Choice.
    for (const e of graph.edges.filter((x) => x.type === E.offersChoice)) {
      expect(graph.nodes.find((n) => n.id === e.source)?.type).toBe(N.Beat);
      expect(graph.nodes.find((n) => n.id === e.target)?.type).toBe(N.Choice);
    }
  });

  it('gates condition beats on the counter they check', () => {
    const gated = graph.edges.filter((e) => e.type === E.gatedBy);
    expect(gated.length).toBeGreaterThan(0);
    // beat_13 checks `support`.
    const supportGate = gated.find((e) => e.target === 'counter:support');
    expect(supportGate).toBeTruthy();
    expect(supportGate!.source.startsWith('beat:')).toBe(true);
  });

  it('builds deduplicated leadsTo transitions between beats', () => {
    const leadsTo = graph.edges.filter((e) => e.type === E.leadsTo);
    expect(leadsTo.length).toBeGreaterThan(0);
    // No duplicate (source,target,label) transitions.
    const keys = leadsTo.map((e) => `${e.source}|${e.target}|${e.label ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Endpoints are always Beat nodes.
    for (const e of leadsTo) {
      expect(e.source.startsWith('beat:')).toBe(true);
      expect(e.target.startsWith('beat:')).toBe(true);
    }
  });

  it('tags nodes by protostory element (SPP), with condition/ending beats as narrative vectors', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    // Counters/variables are procedural components.
    expect(byId.get('counter:support')?.protostoryElement).toBe('procedural');
    // Choices are agency points (UI).
    const aChoice = graph.nodes.find((n) => n.type === 'Choice');
    expect(aChoice?.protostoryElement).toBe('ui');
    // A plain dialogTree beat is narrative design; a conditionBeat is a narrative vector.
    const dialog = graph.nodes.find(
      (n) => n.type === 'Beat' && n.props?.beatType === 'dialogTree'
    );
    const condition = graph.nodes.find(
      (n) => n.type === 'Beat' && n.props?.beatType === 'conditionBeat'
    );
    const ending = graph.nodes.find(
      (n) => n.type === 'Beat' && n.props?.beatType === 'endScreen'
    );
    expect(dialog?.protostoryElement).toBe('narrativeDesign');
    expect(condition?.protostoryElement).toBe('narrativeVector');
    expect(ending?.protostoryElement).toBe('narrativeVector');
  });

  it('is deterministic — two builds are byte-identical', () => {
    const again = buildSystemicGraph(story, { variables });
    const first = buildSystemicGraph(story, { variables });
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });

  it('omits Choice nodes when includeChoices is false', () => {
    const noChoices = buildSystemicGraph(story, { variables, includeChoices: false });
    expect(noChoices.nodes.some((n) => n.type === N.Choice)).toBe(false);
    expect(noChoices.edges.some((e) => e.type === E.offersChoice)).toBe(false);
  });
});

describe('buildSystemicGraph — Sweden vs Sri Lanka', () => {
  it('produces structurally identical systemic graphs (cultural signal is NOT here)', () => {
    // The two seed projects are parallel adaptations with identical structure.
    // This test pins the core finding that motivates the cultural layer:
    // the systemic graph cannot distinguish them.
    const se = load(swedenFixture);
    const lk = load(srilankaFixture);
    const gSe = buildSystemicGraph(se.story, { variables: se.variables });
    const gLk = buildSystemicGraph(lk.story, { variables: lk.variables });

    const shape = (g: ReturnType<typeof buildSystemicGraph>) => ({
      nodeIds: g.nodes.map((n) => `${n.type}:${n.id}`).sort(),
      edgeIds: g.edges.map((e) => `${e.type}:${e.source}->${e.target}`).sort(),
    });

    expect(shape(gSe)).toEqual(shape(gLk));
  });
});
