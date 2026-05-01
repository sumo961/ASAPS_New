import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONDITION_TEMPLATES,
  findConditionTemplate,
  groupConditionTemplates,
  conditionToFlatParams,
} from '../conditionTemplates';

describe('conditionTemplates — library', () => {
  it('contains templates in every category', () => {
    const cats = new Set(DEFAULT_CONDITION_TEMPLATES.map((t) => t.category));
    expect(cats.has('mood')).toBe(true);
    expect(cats.has('emotion')).toBe(true);
    expect(cats.has('sentiment')).toBe(true);
    expect(cats.has('trait')).toBe(true);
    expect(cats.has('goal')).toBe(true);
    expect(cats.has('variant')).toBe(true);
  });

  it('every template has a unique id and a non-empty description', () => {
    const ids = new Set<string>();
    for (const t of DEFAULT_CONDITION_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.name.length).toBeGreaterThan(3);
    }
  });

  it('findConditionTemplate returns undefined for unknown ids', () => {
    expect(findConditionTemplate('nope')).toBeUndefined();
    expect(findConditionTemplate('')).toBeUndefined();
  });

  it('findConditionTemplate finds known templates', () => {
    const t = findConditionTemplate('sentiment-trusts-player-now');
    expect(t).toBeDefined();
    expect(t?.category).toBe('sentiment');
  });
});

describe('conditionTemplates — forge()', () => {
  const args = { target: 'char_alex', playerRef: 'player' };

  it('mood-now-happy forges a literal valence ≥ 0.3 condition', () => {
    const t = findConditionTemplate('mood-now-happy')!;
    const c = t.forge(args) as any;
    expect(c.type).toBe('mood');
    expect(c.character).toBe('char_alex');
    expect(c.moodAxis).toBe('valence');
    expect(c.operator).toBe('>=');
    expect(c.value).toBe(0.3);
    // Threshold templates omit the baseline — defaults to literal.
    expect(c.baseline).toBeUndefined();
  });

  it('mood-improved-since-start forges a delta-from-initial condition', () => {
    const t = findConditionTemplate('mood-improved-since-start')!;
    const c = t.forge(args) as any;
    expect(c.type).toBe('mood');
    expect(c.baseline).toBe('initial');
    expect(c.value).toBe(0.3);
    expect(c.operator).toBe('>=');
  });

  it('sentiment-trusts-player-now uses playerRef for the target', () => {
    const t = findConditionTemplate('sentiment-trusts-player-now')!;
    const c = t.forge(args) as any;
    expect(c.type).toBe('sentiment');
    expect(c.character).toBe('char_alex');
    expect(c.sentimentTarget).toBe('player');
    expect(c.sentimentEmotion).toBe('trust');
    expect(c.operator).toBe('>=');
    expect(c.value).toBe(0.4);
  });

  it('sentiment-trust-grown-since-start carries the initial baseline', () => {
    const t = findConditionTemplate('sentiment-trust-grown-since-start')!;
    const c = t.forge(args) as any;
    expect(c.baseline).toBe('initial');
    expect(c.value).toBe(0.3);
    expect(c.sentimentEmotion).toBe('trust');
  });

  it('emotion-fear-eased-since-start uses negative threshold (delta of fear ≤ -0.2)', () => {
    const t = findConditionTemplate('emotion-fear-eased-since-start')!;
    const c = t.forge(args) as any;
    expect(c.type).toBe('emotion');
    expect(c.emotionName).toBe('fear');
    expect(c.operator).toBe('<=');
    expect(c.value).toBe(-0.2);
    expect(c.baseline).toBe('initial');
  });

  it('trait templates carry trait names', () => {
    const ag = findConditionTemplate('trait-low-agreeableness')!.forge(args) as any;
    expect(ag.type).toBe('trait');
    expect(ag.traitName).toBe('agreeableness');
    expect(ag.value).toBe(0.3);
    expect(ag.operator).toBe('<=');

    const con = findConditionTemplate('trait-high-conscientiousness')!.forge(args) as any;
    expect(con.traitName).toBe('conscientiousness');
    expect(con.operator).toBe('>=');
    expect(con.value).toBe(0.7);
  });

  it('goal templates seed an empty goalId for the author to fill in', () => {
    const t = findConditionTemplate('goal-met')!;
    const c = t.forge(args) as any;
    expect(c.type).toBe('goal');
    expect(c.character).toBe('char_alex');
    expect(c.goalStatus).toBe('met');
    expect(c.goalId).toBe('');
  });

  it('variant template seeds an empty variantId', () => {
    const t = findConditionTemplate('variant-active')!;
    const c = t.forge(args) as any;
    expect(c.type).toBe('characterVariant');
    expect(c.variantId).toBe('');
    expect(c.operator).toBe('==');
  });
});

describe('conditionToFlatParams', () => {
  it('flattens a mood condition into ConditionBeat-style params', () => {
    const cond: any = {
      type: 'mood', character: 'char_alex', moodAxis: 'valence',
      operator: '>=', value: 0.3,
    };
    const flat = conditionToFlatParams(cond);
    expect(flat.conditionType).toBe('mood');
    expect(flat.character).toBe('char_alex');
    expect(flat.moodAxis).toBe('valence');
    expect(flat.operator).toBe('>=');
    expect(flat.value).toBe(0.3);
    expect(flat.type).toBeUndefined();
  });

  it('passes baseline through verbatim', () => {
    const cond: any = {
      type: 'sentiment', character: 'char_alex',
      sentimentTarget: 'player', sentimentEmotion: 'trust',
      operator: '>=', value: 0.3, baseline: 'initial',
    };
    const flat = conditionToFlatParams(cond);
    expect(flat.baseline).toBe('initial');
    expect(flat.conditionType).toBe('sentiment');
  });
});

describe('groupConditionTemplates', () => {
  it('returns categories in mood/emotion/sentiment/trait/goal/variant order', () => {
    const groups = groupConditionTemplates();
    const cats = groups.map((g) => g.category);
    expect(cats).toEqual(['mood', 'emotion', 'sentiment', 'trait', 'goal', 'variant']);
  });

  it('every group has at least one member', () => {
    const groups = groupConditionTemplates();
    for (const g of groups) {
      expect(g.members.length).toBeGreaterThan(0);
    }
  });
});
