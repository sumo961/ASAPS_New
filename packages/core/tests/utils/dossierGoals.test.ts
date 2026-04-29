/**
 * Step 8 — dossier rendering for goals.
 */
import { describe, it, expect } from 'vitest';
import { buildDossier, buildDossierForRef } from '../../src/utils/dossier';

const knight = {
  id: 'k', displayName: 'Knight', description: 'a knight',
  goals: [
    { id: 'g1', name: 'Find the Grail', description: 'sacred relic', priority: 0.9 },
    { id: 'g2', name: 'Return home', priority: 0.4 },
    { id: 'g3', name: 'Protect the queen', priority: 0.7 },
  ],
};

describe('buildDossier — goals', () => {
  it('renders open goals under Pursuing: sorted by priority', () => {
    const out = buildDossier(knight, { goalStatuses: { g1: 'open', g2: 'open', g3: 'open' } });
    expect(out).toContain('Pursuing:');
    const grail = out.indexOf('Find the Grail');
    const queen = out.indexOf('Protect the queen');
    const home = out.indexOf('Return home');
    expect(grail).toBeGreaterThanOrEqual(0);
    expect(grail).toBeLessThan(queen);
    expect(queen).toBeLessThan(home);
  });

  it('renders descriptions when provided', () => {
    const out = buildDossier(knight, { goalStatuses: { g1: 'open' } });
    expect(out).toContain('Find the Grail — sacred relic');
  });

  it('separates closed outcomes into Recent outcomes:', () => {
    const out = buildDossier(knight, { goalStatuses: { g1: 'met', g2: 'failed', g3: 'open' } });
    expect(out).toContain('Pursuing:');
    expect(out).toContain('Protect the queen');
    expect(out).toContain('Recent outcomes:');
    expect(out).toContain('achieved Find the Grail');
    expect(out).toContain('failed Return home');
  });

  it('caps with maxGoals (default 5)', () => {
    const many = {
      id: 'k', displayName: 'X', description: 'x',
      goals: Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, name: `g-${i}`, priority: 1 - i * 0.1 })),
    };
    const out = buildDossier(many, { goalStatuses: {}, maxGoals: 3 });
    expect(out).toContain('g-0');
    expect(out).toContain('g-1');
    expect(out).toContain('g-2');
    expect(out).not.toContain('g-3');
  });

  it('omits the section when goals are empty', () => {
    const empty = { id: 'k', displayName: 'X', description: 'x', goals: [] };
    const out = buildDossier(empty, { goalStatuses: {} });
    expect(out).not.toContain('Pursuing:');
    expect(out).not.toContain('Recent outcomes:');
  });

  it('treats missing status entries as open', () => {
    const out = buildDossier(knight, {});
    expect(out).toContain('Pursuing:');
    expect(out).toContain('Find the Grail');
  });

  it('abandoned goals are not rendered as outcomes', () => {
    const out = buildDossier(knight, { goalStatuses: { g1: 'abandoned' } });
    expect(out).not.toContain('Recent outcomes:');
  });
});

describe('buildDossierForRef — goals', () => {
  it('does not call getCharacterGoalStatuses when character has no goals', () => {
    let called = false;
    const characters = [{ id: 'c1', displayName: 'A', description: 'd' }];
    buildDossierForRef('c1', characters, {
      getCharacterGoalStatuses: () => { called = true; return {}; },
    });
    expect(called).toBe(false);
  });

  it('calls getCharacterGoalStatuses when character has goals', () => {
    let captured = '';
    const characters = [knight];
    const out = buildDossierForRef('k', characters, {
      getCharacterGoalStatuses: (ref: string) => { captured = ref; return { g1: 'met' }; },
    });
    expect(captured).toBe('k');
    expect(out).toContain('achieved Find the Grail');
  });
});
