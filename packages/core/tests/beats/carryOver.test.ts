/**
 * What a newer ASAPS wrote survives an older one (2026-10-21): every beat type
 * used to rebuild its data from the fields it knows, so a teammate on an older
 * version removed whatever was new on the next save.
 */
import { describe, it, expect } from 'vitest';
import { types as utilTypes } from 'node:util';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';

const registry = BeatTypeRegistry.getInstance();
const make = (type: string, extra: any = {}) => registry.createBeat(type, {
  id: 'b', name: 'b', type, connections: [], futureTop: { v: 1 },
  ...extra,
  parameters: { futureParam: 'x', ...(extra.parameters ?? {}) },
} as any);

describe('carry-over of unknown fields', () => {
  it('every beat type keeps a parameter and a top-level field it does not know', () => {
    const losing: string[] = [];
    for (const type of registry.getBeatTypes()) {
      const json = make(type, { parameters: { text: 'Hi' } }).toJSON();
      if (json.parameters?.futureParam !== 'x' || json.futureTop?.v !== 1) losing.push(type);
    }
    expect(losing).toEqual([]);
  });

  it('keeps unknown parameters given later (an update), not just at creation', () => {
    const beat = make('infoText', { parameters: { text: 'Hi' } });
    beat.updateParameters({ text: 'Hello', anotherFuture: 3 });
    const json = beat.toJSON();
    expect(json.parameters).toMatchObject({ text: 'Hello', futureParam: 'x', anotherFuture: 3 });
  });

  it('never brings back a known parameter that was cleared', () => {
    const beat = make('dialogTree', { parameters: { chatFrameImage: 'asset_1', dialogTree: { id: 'root', speaker: 'A', text: 'Hi', choices: [] } } });
    beat.updateParameters({ chatFrameImage: '' });
    expect(beat.toJSON().parameters.chatFrameImage).toBeUndefined();
  });

  it('does not write an old parameter name back next to its converted value', () => {
    const json = make('setVariable', { parameters: { variable: 'met_vic', value: true } }).toJSON();
    expect(json.parameters.variable === undefined || json.parameters.variable === json.parameters.variableName).toBe(true);
    expect(json.parameters.futureParam).toBe('x');
  });

  it('leaks no tracking Proxy into a beat', () => {
    for (const type of registry.getBeatTypes()) {
      const beat: any = make(type, { parameters: { text: 'Hi' } });
      for (const key of Object.keys(beat)) {
        if (key === '_carry') continue;
        expect(utilTypes.isProxy(beat[key]), `${type}.${key}`).toBe(false);
      }
      expect(() => structuredClone(beat.toJSON())).not.toThrow();
    }
  });
});

describe('beat types this version does not know', () => {
  const raw = {
    id: 'b9', name: 'Future beat', type: 'holoScene', x: 10, y: 20, cluster: 'c1', futureTop: 'kept',
    connections: [{ targetId: 'b10' }],
    parameters: { hologram: { layers: 3 }, text: 'from the future' },
  };

  it('come back exactly as they were', () => {
    const json = registry.createBeat('holoScene', JSON.parse(JSON.stringify(raw)) as any).toJSON();
    expect(json).toMatchObject(raw);
    expect(json.parameters).toEqual(raw.parameters);
  });

  it('a logic-only one keeps its type too (it used to become setVariable)', () => {
    const json = registry.createBeat('setHologramState', { ...raw, type: 'setHologramState' } as any).toJSON();
    expect(json.type).toBe('setHologramState');
    expect(json.parameters).toEqual(raw.parameters);
  });
});
