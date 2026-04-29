/**
 * Step 7 — dossier policy fork tests. Confirms that:
 *   - the default ('reAnchor') suppresses reflections in dossier output
 *   - 'reflection' renders reflections under "Recent reflections:"
 *   - buildDossierForRef passes reflections through only in reflection mode
 */
import { describe, it, expect } from 'vitest';
import { buildDossier, buildDossierForRef } from '../../src/utils/dossier';

const sample = [
  { timestamp: 1, text: 'I felt seen when she answered honestly.', salience: 0.6 },
  { timestamp: 2, text: 'The wolf is not what he seems.', salience: 0.8 },
  { timestamp: 3, text: 'I am tired of being kind.', salience: 0.7 },
];

describe('buildDossier — dossier policy', () => {
  it('omits reflections by default (reAnchor implicit)', () => {
    const dossier = buildDossier(
      { id: 'c1', displayName: 'Granny', description: 'old' },
      { reflections: sample },
    );
    expect(dossier).not.toContain('Recent reflections:');
  });

  it('omits reflections when policy is explicitly reAnchor', () => {
    const dossier = buildDossier(
      { id: 'c1', displayName: 'Granny', description: 'old', dossierPolicy: 'reAnchor' },
      { reflections: sample },
    );
    expect(dossier).not.toContain('Recent reflections:');
  });

  it('renders reflections when policy is reflection', () => {
    const dossier = buildDossier(
      { id: 'c1', displayName: 'Granny', description: 'old', dossierPolicy: 'reflection' },
      { reflections: sample },
    );
    expect(dossier).toContain('Recent reflections:');
    expect(dossier).toContain('I am tired of being kind.');
    expect(dossier).toContain('The wolf is not what he seems.');
  });

  it('honours maxReflections cap', () => {
    const big = Array.from({ length: 12 }, (_, i) => ({ timestamp: i, text: `entry-${i}` }));
    const dossier = buildDossier(
      { id: 'c1', displayName: 'X', description: 'd', dossierPolicy: 'reflection' },
      { reflections: big, maxReflections: 3 },
    );
    // Tail-truncation keeps the newest 3.
    expect(dossier).toContain('entry-11');
    expect(dossier).toContain('entry-10');
    expect(dossier).toContain('entry-9');
    expect(dossier).not.toContain('entry-8');
  });

  it('skips the section when reflections array is empty', () => {
    const dossier = buildDossier(
      { id: 'c1', displayName: 'X', description: 'd', dossierPolicy: 'reflection' },
      { reflections: [] },
    );
    expect(dossier).not.toContain('Recent reflections:');
  });
});

describe('buildDossierForRef — dossier policy', () => {
  it('does not call getCharacterReflections in reAnchor mode', () => {
    let called = false;
    const characters = [{ id: 'c1', displayName: 'A', description: 'd', dossierPolicy: 'reAnchor' as const }];
    buildDossierForRef('c1', characters, {
      getCharacterReflections: (_ref: string) => { called = true; return []; },
    });
    expect(called).toBe(false);
  });

  it('calls getCharacterReflections in reflection mode and renders the result', () => {
    const characters = [{ id: 'c1', displayName: 'A', description: 'd', dossierPolicy: 'reflection' as const }];
    let captured = '';
    const dossier = buildDossierForRef('c1', characters, {
      getCharacterReflections: (ref: string) => {
        captured = ref;
        return [{ timestamp: 1, text: 'pulled-through' }];
      },
    });
    expect(captured).toBe('c1');
    expect(dossier).toContain('Recent reflections:');
    expect(dossier).toContain('pulled-through');
  });
});
