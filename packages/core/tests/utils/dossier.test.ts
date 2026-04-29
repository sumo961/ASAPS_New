import { describe, it, expect } from 'vitest';
import { buildDossier, buildDossierForRef } from '../../src/utils/dossier';

const granny = {
  id: 'char_1',
  name: 'Granny',
  displayName: 'Grandma',
  description: 'A kind old woman who lives in the woods. Loves to bake cookies.',
  tags: ['warm', 'wise'],
  role: 'npc',
};

describe('buildDossier', () => {
  it('returns empty string for null/undefined character', () => {
    expect(buildDossier(null)).toBe('');
    expect(buildDossier(undefined)).toBe('');
  });

  it('returns empty string when only the name line would be present', () => {
    expect(buildDossier({ id: 'char_2', name: 'Bare' })).toBe('');
  });

  it('renders name + description as a multi-line block', () => {
    const out = buildDossier(granny);
    expect(out).toContain('CHARACTER DOSSIER');
    expect(out).toContain('Name: Grandma');
    expect(out).toContain('Description: A kind old woman');
  });

  it('renders tags when present', () => {
    const out = buildDossier(granny);
    expect(out).toContain('Tags: warm, wise');
  });

  it('renders role suffix only when not "npc"', () => {
    const player = { ...granny, role: 'player' };
    expect(buildDossier(player)).toContain('Name: Grandma (player)');
    expect(buildDossier(granny)).not.toContain('(npc)');
  });

  it('honours the anchor-reminder flag', () => {
    expect(buildDossier(granny, { includeAnchorReminder: false })).toContain('CHARACTER DOSSIER:');
    expect(buildDossier(granny, { includeAnchorReminder: false })).not.toContain('canonical');
    expect(buildDossier(granny)).toContain('canonical');
  });

  it('omits the state block when state has no content', () => {
    const out = buildDossier(granny, { state: { counters: {}, variables: {}, flags: {} } });
    expect(out).not.toContain('Current state');
  });

  it('renders counters in alphabetical order', () => {
    const out = buildDossier(granny, {
      state: {
        counters: { trust: 5, anger: 1 },
        variables: {},
        flags: {},
      },
    });
    const a = out.indexOf('anger: 1');
    const t = out.indexOf('trust: 5');
    expect(a).toBeGreaterThan(0);
    expect(t).toBeGreaterThan(a);
  });

  it('renders only true flags', () => {
    const out = buildDossier(granny, {
      state: {
        counters: {},
        variables: {},
        flags: { metPlayer: true, hasAccused: false },
      },
    });
    expect(out).toContain('metPlayer: yes');
    expect(out).not.toContain('hasAccused');
  });

  it('renders variables, skipping empty / null values', () => {
    const out = buildDossier(granny, {
      state: {
        counters: {},
        variables: { mood: 'curious', goal: '', missing: null, weight: 12 },
        flags: {},
      },
    });
    expect(out).toContain('mood: curious');
    expect(out).toContain('weight: 12');
    expect(out).not.toContain('goal:');
    expect(out).not.toContain('missing:');
  });

  it('uses a custom heading when supplied', () => {
    const out = buildDossier(granny, { heading: 'NPC PROFILE' });
    expect(out).toContain('NPC PROFILE');
    expect(out).not.toContain('CHARACTER DOSSIER');
  });
});

describe('buildDossierForRef', () => {
  const characters = [granny, { id: 'char_2', name: 'Wolf' }];

  it('returns empty string when ref does not resolve', () => {
    expect(buildDossierForRef('char_999', characters, null)).toBe('');
    expect(buildDossierForRef(null, characters, null)).toBe('');
    expect(buildDossierForRef('char_1', null, null)).toBe('');
  });

  it('builds dossier from the resolved character', () => {
    const out = buildDossierForRef('char_1', characters, null);
    expect(out).toContain('Name: Grandma');
  });

  it('passes character-scoped state from contextLike.getCharacterState', () => {
    const ctx = {
      getCharacterState: (ref: string) =>
        ref === 'char_1'
          ? { counters: { trust: 7 }, variables: {}, flags: {} }
          : { counters: {}, variables: {}, flags: {} },
    };
    const out = buildDossierForRef('char_1', characters, ctx);
    expect(out).toContain('trust: 7');
  });
});
