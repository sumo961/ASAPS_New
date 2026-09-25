/**
 * Tests for the structural summary — the systemic-KG-derived section of
 * the Co-Designer digest. Built through the real buildWorkspaceKG so the
 * summary is pinned against actual graph semantics, not mocks.
 */
import { describe, it, expect } from 'vitest';
import { buildWorkspaceKG } from '../../components/knowledgeGraph/kgAdapter';
import { buildStructuralSummary } from '../structuralSummary';

const beats = [
  {
    id: 'b1', name: 'Talk', type: 'dialogTree',
    connections: [],
    getParameters: () => ({
      dialogTree: {
        text: 'What do you say?',
        choices: [
          { id: 'c1', text: 'Defend him', effects: [{ type: 'incrementCounter', target: 'loyalty', value: 1 }], target: 'b2' },
          { id: 'c2', text: 'Stay silent', target: 'b2' },
        ],
      },
    }),
  },
  {
    id: 'b2', name: 'Check Loyalty', type: 'conditionBeat',
    connections: [{ targetId: 'b3', label: 'high' }],
    getParameters: () => ({
      condition: { type: 'counter', variableName: 'loyalty', operator: '>=', value: 1 },
    }),
  },
  {
    id: 'b3', name: 'Good End', type: 'endScreen',
    connections: [],
    getParameters: () => ({ title: 'Fin' }),
  },
  {
    id: 'b4', name: 'Orphan Scene', type: 'infoText',
    connections: [],
    getParameters: () => ({ text: 'Nobody comes here.' }),
  },
];

const characters = [
  { id: 'ch1', name: 'elena', displayName: 'Elena', counters: [{ name: 'loyalty' }] },
];

describe('buildStructuralSummary', () => {
  const kg = buildWorkspaceKG(beats as any, [], characters as any, []);
  const summary = buildStructuralSummary(kg);

  it('reports state with writers, gates, and ownership', () => {
    expect(summary).toContain('STATE');
    expect(summary).toMatch(/counter "loyalty".*owned by Elena/);
    expect(summary).toMatch(/changed by: b1 choice "Defend him"/);
    expect(summary).toMatch(/gates: b2 \("Check Loyalty"\) \(>= 1\)/);
  });

  it('inventories choices per beat', () => {
    expect(summary).toContain('CHOICES: 2 across 1 beat (b1: 2)');
  });

  it('lists narrative vectors (condition + ending) with routing', () => {
    expect(summary).toContain('NARRATIVE VECTORS');
    expect(summary).toMatch(/b2 \("Check Loyalty"\) \[conditionBeat\] gates on "loyalty" >= 1 — "high" → b3/);
    expect(summary).toMatch(/b3 \("Good End"\) \[endScreen\]/);
  });

  it('flags dead ends and possibly-unreachable beats', () => {
    expect(summary).toContain('FLOW WARNINGS');
    expect(summary).toMatch(/Dead ends.*b4 \("Orphan Scene"\)/);
    expect(summary).toMatch(/No incoming transitions.*b4/);
  });

  it('endScreens are not dead ends — but a Restart with no target is flagged', () => {
    expect(summary).not.toMatch(/Dead ends[^\n]*b3/);
    expect(summary).toMatch(/Restart leads nowhere[^\n]*b3/);
  });
});

describe('buildStructuralSummary — links from parameters (2026-09-26)', () => {
  const beats2 = [
    { id: 's', name: 'Start', type: 'infoText', connections: [{ targetId: 'd' }], getParameters: () => ({ text: 'x' }) },
    { id: 'd', name: 'Nested talk', type: 'dialogTree', connections: [], getParameters: () => ({ dialogTree: { text: 'a',
      choices: [{ id: 'c1', text: 'hi', dialogNode: { text: 'b', choices: [{ id: 'c2', text: 'go', target: 'j' }] } }] } }) },
    { id: 'j', name: 'Judge', type: 'aiCondition', connections: [], getParameters: () => ({ categories: [{ name: 'a', description: 'a', targetId: 'e1' }, { name: 'b', description: 'b', targetId: 'e2' }] }) },
    { id: 'e1', name: 'End A', type: 'endScreen', connections: [], getParameters: () => ({ showRestart: false }) },
    { id: 'e2', name: 'End B', type: 'endScreen', connections: [], getParameters: () => ({ showRestart: false }) },
  ];
  const summary = buildStructuralSummary(buildWorkspaceKG(beats2 as any, [], [], []));

  it('a dialog tree whose exits sit in nested nodes is not a dead end; AI-condition categories are links', () => {
    expect(summary).not.toMatch(/Dead ends/);
    expect(summary).not.toMatch(/No incoming transitions/);
  });
});
