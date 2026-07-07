import { describe, it, expect } from 'vitest';
import {
  buildCultureProfilePrompt,
  parseCultureProfile,
  inferCultureProfile,
  compareProfiles,
  SWEDEN_PROFILE,
  VALUE_DIMENSION_TYPES,
} from '../../src/kg';

const req = { label: 'New Zealand', region: undefined, language: 'English' };

const REPLY = `{"description":"Secular, individualist, high acceptance.","values":[
  {"dimension":"TraditionalVsSecularRational","position":0.7,"label":"secular-rational"},
  {"dimension":"SurvivalVsSelfExpression","position":0.85,"label":"self-expression"},
  {"dimension":"IndividualismCollectivism","position":1.4,"label":"clamped over-range"},
  {"dimension":"NotARealDimension","position":0.2,"label":"ignore me"},
  {"dimension":"TraditionalVsSecularRational","position":0.1,"label":"duplicate ignored"}
]}`;

describe('buildCultureProfilePrompt', () => {
  it('names the culture, language, every dimension and demands strict JSON', () => {
    // Country/culture as the label; a region/ethnicity WITHIN it as `region`.
    const p = buildCultureProfilePrompt({ label: 'India', region: 'Karnataka', language: 'Kannada' });
    expect(p).toContain('India');
    expect(p).toContain('Karnataka');
    expect(p).toContain('Kannada');
    for (const d of VALUE_DIMENSION_TYPES) expect(p).toContain(d);
    expect(p).toContain('STRICT JSON');
  });
});

describe('parseCultureProfile', () => {
  const profile = parseCultureProfile(REPLY, req);

  it('builds a profile carrying culture metadata decoupled from language', () => {
    expect(profile.label).toBe('New Zealand');
    expect(profile.languages).toEqual(['English']);
    expect(profile.id).toBe('new-zealand');
    expect(profile.description).toMatch(/secular/i);
  });

  it('keeps only valid, de-duplicated dimensions and clamps positions', () => {
    const dims = profile.values.map((v) => v.dimension);
    expect(dims).toContain('TraditionalVsSecularRational');
    expect(dims).not.toContain('NotARealDimension');
    // duplicate dimension appears once
    expect(dims.filter((d) => d === 'TraditionalVsSecularRational').length).toBe(1);
    const ic = profile.values.find((v) => v.dimension === 'IndividualismCollectivism');
    expect(ic?.position).toBe(1); // clamped from 1.4
    expect(profile.values.every((v) => v.basis === 'inferred')).toBe(true);
  });
});

describe('inferCultureProfile + compareProfiles', () => {
  it('an inferred profile can be diffed against a reference profile', async () => {
    const nz = await inferCultureProfile(req, async () => REPLY);
    const gaps = compareProfiles(nz, SWEDEN_PROFILE);
    expect(gaps.length).toBeGreaterThan(0);
    // Both secular/self-expression → the self-expression gap should be small.
    const sse = gaps.find((g) => g.dimension === 'SurvivalVsSelfExpression');
    expect(sse?.delta).toBeLessThan(0.3);
  });

  it('degrades to an empty value set on non-JSON output', async () => {
    const p = await inferCultureProfile(req, async () => 'sorry, no');
    expect(p.values).toEqual([]);
    expect(p.label).toBe('New Zealand');
  });
});
