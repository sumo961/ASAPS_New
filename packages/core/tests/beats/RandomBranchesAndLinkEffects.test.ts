/**
 * Random branches that set state, and links that set state (2026-09-24).
 *
 * Before: randomTarget reduced every branch to a bare id (effects and
 * weights were dropped), the story generator taught a `targets` shape the
 * runtime never read, and link effects — declared by the schema's connection
 * type — were applied by nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RandomTargetBeat } from '../../src/beats/RandomTargetBeat';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import { serializeBeatFromJSON } from '../../src/persistence/BeatSerializer';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

afterEach(() => vi.restoreAllMocks());

describe('randomTarget branches', () => {
  it('applies the drawn branch effects and returns its target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const ctx = makeContext();
    const beat = new RandomTargetBeat({ id: 'r', type: 'randomTarget', parameters: { choices: [
      { target: 'caseA', effects: [{ type: 'setVariable', target: 'caseVariant', value: 'A' }] },
      { target: 'caseB', effects: [{ type: 'setVariable', target: 'caseVariant', value: 'B' }, { type: 'setCounter', target: 'Clock', value: 180 }] },
    ] } } as any);
    const next = await beat.execute(ctx, makeRenderer().renderer);
    expect(next).toBe('caseB');
    expect(ctx.getVariable('caseVariant')).toBe('B');
    expect(ctx.getCounter('Clock')).toBe(180);
  });

  it('draws by weight, and weight 0 is never drawn', async () => {
    const beat = new RandomTargetBeat({ id: 'r', type: 'randomTarget', parameters: { choices: [
      { target: 'rare', weight: 1 }, { target: 'never', weight: 0 }, { target: 'common', weight: 3 },
    ] } } as any);
    const pick = async (r: number) => { vi.spyOn(Math, 'random').mockReturnValue(r); return beat.execute(makeContext(), makeRenderer().renderer); };
    expect(await pick(0.2)).toBe('rare');    // 0.8 of 4 → first weight unit
    expect(await pick(0.26)).toBe('common'); // 1.04 → past rare, skips weight-0
    expect(await pick(0.999)).toBe('common');
  });

  it('reads the generator\'s old `targets` shape and keeps plain lists plain', () => {
    const legacy = new RandomTargetBeat({ id: 'r', type: 'randomTarget', parameters: { targets: [{ targetId: 'a', weight: 2 }, { targetId: 'b' }] } } as any);
    expect(legacy.getConnections().map((c) => c.targetId)).toEqual(['a', 'b']);
    expect(legacy.getParameters().choices).toEqual([{ target: 'a', weight: 2 }, { target: 'b' }]);
    const plain = new RandomTargetBeat({ id: 'r', type: 'randomTarget', parameters: { choices: ['a', 'b'] } } as any);
    expect(plain.getParameters()).toEqual({ choices: ['a', 'b'] });
    // The graph links carry no effects — they can't fire twice.
    const withFx = new RandomTargetBeat({ id: 'r', type: 'randomTarget', parameters: { choices: [{ target: 'a', effects: [{ type: 'incrementCounter', target: 'x' }] }] } } as any);
    expect(withFx.getConnections()[0]).not.toHaveProperty('effects');
  });
});

describe('link effects', () => {
  it('run once when the player continues along the link', async () => {
    const ctx = makeContext();
    const beat = new InfoTextBeat({ id: 'i', type: 'infoText', text: 'Briefing', connections: [
      { targetId: 'next', effects: [{ type: 'setCounter', target: 'Clock', value: 240 }, { type: 'incrementCounter', target: 'Prep' }] },
    ] } as any);
    expect(await beat.execute(ctx, makeRenderer().renderer)).toBe('next');
    expect(ctx.getCounter('Clock')).toBe(240);
    expect(ctx.getCounter('Prep')).toBe(1);
  });

  it('with several links to one beat, use the one whose condition holds', async () => {
    const ctx = makeContext((c) => c.setVariable('route', 'fast'));
    const beat = new InfoTextBeat({ id: 'i', type: 'infoText', text: 'x', connections: [
      { targetId: 'n', condition: { type: 'variable', variableName: 'route', operator: '==', value: 'fast' }, effects: [{ type: 'incrementCounter', target: 'fast' }] },
      { targetId: 'n', effects: [{ type: 'incrementCounter', target: 'slow' }] },
    ] } as any);
    await beat.execute(ctx, makeRenderer().renderer);
    expect(ctx.getCounter('fast')).toBe(1);
    expect(ctx.hasCounter('slow')).toBe(false);
  });

  it('survive the project save format', () => {
    const saved = serializeBeatFromJSON({ id: 'i', type: 'infoText', parameters: {}, connections: [{ targetId: 'n', label: 'Go', effects: [{ type: 'incrementCounter', target: 'x' }] }, { targetId: 'm', effects: [] }] });
    expect(saved.connections).toEqual([{ targetId: 'n', label: 'Go', effects: [{ type: 'incrementCounter', target: 'x' }] }, { targetId: 'm' }]);
  });
});
