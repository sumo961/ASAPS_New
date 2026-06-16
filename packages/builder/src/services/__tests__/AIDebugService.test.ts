/**
 * Tests for AIDebugService — compares an AI-generated debug file (stashed in
 * localStorage) against the live project beats/connections and reports
 * discrepancies. Drives the public runDebugAnalysis end-to-end plus the pure
 * connection-target extractors. UI checks are disabled unless a test targets
 * them, since jsdom has no ReactFlow [data-id] nodes.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { AIDebugService, getAIDebugService } from '../AIDebugService';

// jsdom here resolves bare `localStorage` to Node's flag-gated built-in, which
// throws SecurityError. Install a minimal in-memory shim on both window and the
// global so the service's localStorage access works.
beforeAll(() => {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  }
});

const svc = () => new AIDebugService();

const debugBeat = (over: any = {}) => ({ id: 'b1', name: 'Beat One', type: 'infoText', parameters: {}, ...over });

const projectBeat = (over: any = {}) =>
  ({
    id: 'b1',
    name: 'Beat One',
    type: 'infoText',
    getParameters: () => over.parameters ?? {},
    getConnections: () => over.connections ?? [],
    ...over,
  }) as any;

const debugFile = (beats: any[], over: any = {}) => ({
  title: 'My Story',
  beatCount: beats.length,
  story: { beats },
  ...over,
});

const stash = (file: any) => localStorage.setItem('asaps_latest_debug', JSON.stringify(file));

beforeEach(() => {
  localStorage.clear();
});

describe('getLatestDebugFile', () => {
  it('returns null when nothing is stored', () => {
    expect(svc().getLatestDebugFile()).toBeNull();
  });

  it('parses a stored debug file', () => {
    stash(debugFile([debugBeat()]));
    expect(svc().getLatestDebugFile()?.title).toBe('My Story');
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('asaps_latest_debug', '{not json');
    expect(svc().getLatestDebugFile()).toBeNull();
  });
});

describe('getDebugHistory', () => {
  it('returns an empty array when none stored', () => {
    expect(svc().getDebugHistory()).toEqual([]);
  });

  it('returns the stored history array', () => {
    localStorage.setItem('asaps_debug_history', JSON.stringify([{ filename: 'a.json', timestamp: 1, data: {} }]));
    expect(svc().getDebugHistory()).toHaveLength(1);
  });
});

describe('runDebugAnalysis', () => {
  it('returns an error result when no debug file exists', async () => {
    const r = await svc().runDebugAnalysis([], []);
    expect(r.success).toBe(false);
    expect(r.issues[0].message).toMatch(/no debug file/i);
  });

  it('reports success when beats and connections match', async () => {
    stash(debugFile([debugBeat({ connections: [{ targetId: 'b2' }] }), debugBeat({ id: 'b2', type: 'endScreen' })]));
    const beats = [
      projectBeat({ id: 'b1', connections: [{ targetId: 'b2' }] }),
      projectBeat({ id: 'b2', type: 'endScreen' }),
    ];
    const r = await svc().runDebugAnalysis(beats, [], { checkUI: false });
    expect(r.success).toBe(true);
    expect(r.summary.issues.errors).toBe(0);
    expect(r.summary.totalBeats).toMatchObject({ expected: 2, actual: 2, matched: 2 });
    expect(r.beatComparisons).toHaveLength(2);
  });

  it('flags a beat missing from the project as an error', async () => {
    stash(debugFile([debugBeat(), debugBeat({ id: 'b2', name: 'Gone' })]));
    const r = await svc().runDebugAnalysis([projectBeat({ id: 'b1' })], [], { checkUI: false });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.category === 'beat_missing' && i.beatId === 'b2')).toBe(true);
    expect(r.summary.totalBeats.matched).toBe(1);
  });

  it('flags a type mismatch as an error', async () => {
    stash(debugFile([debugBeat({ type: 'dialogTree' })]));
    const r = await svc().runDebugAnalysis([projectBeat({ id: 'b1', type: 'infoText' })], [], { checkUI: false });
    expect(r.issues.some((i) => i.category === 'type_mismatch')).toBe(true);
  });

  it('warns about a missing key parameter', async () => {
    stash(debugFile([debugBeat({ type: 'infoText', parameters: { text: 'hi', buttonText: 'Next' } })]));
    const r = await svc().runDebugAnalysis(
      [projectBeat({ id: 'b1', type: 'infoText', parameters: { text: 'hi' } })],
      [],
      { checkUI: false },
    );
    const pm = r.issues.find((i) => i.category === 'parameter_mismatch');
    expect(pm?.message).toMatch(/buttonText/);
    expect(pm?.severity).toBe('warning');
  });

  it('warns about an extra project beat not in the debug file', async () => {
    stash(debugFile([debugBeat()]));
    const r = await svc().runDebugAnalysis(
      [projectBeat({ id: 'b1' }), projectBeat({ id: 'extra', name: 'Extra' })],
      [],
      { checkUI: false },
    );
    expect(r.issues.some((i) => i.category === 'beat_extra' && i.beatId === 'extra')).toBe(true);
  });

  it('flags a connection present in the debug file but missing from the project', async () => {
    stash(debugFile([debugBeat({ connections: [{ targetId: 'b2' }] }), debugBeat({ id: 'b2' })]));
    const r = await svc().runDebugAnalysis(
      [projectBeat({ id: 'b1' }), projectBeat({ id: 'b2' })],
      [],
      { checkUI: false },
    );
    expect(r.issues.some((i) => i.category === 'connection_missing')).toBe(true);
  });

  it('accepts a connection supplied via the project connections array', async () => {
    stash(debugFile([debugBeat({ connections: [{ targetId: 'b2' }] }), debugBeat({ id: 'b2' })]));
    const r = await svc().runDebugAnalysis(
      [projectBeat({ id: 'b1' }), projectBeat({ id: 'b2' })],
      [{ source: 'b1', target: 'b2' }],
      { checkUI: false },
    );
    expect(r.issues.some((i) => i.category === 'connection_missing')).toBe(false);
  });
});

describe('extractConnectionTargets (debug beat)', () => {
  const e = svc() as any;

  it('collects targets from connections, params, choices, dialog, hyperlinks and dedupes', () => {
    const t = e.extractConnectionTargets({
      id: 'b1',
      connections: [{ targetId: 'x' }, { target: 'y' }],
      parameters: {
        connection: { target: 'z' },
        trueTarget: 't',
        falseTarget: 'f',
        choices: [{ target: 'c1' }, { target: 'c2' }],
        dialogTree: { choices: [{ target: 'd1' }] },
        hyperlinks: [{ targetBeatId: 'h1' }],
        defaultTarget: 'def',
      },
    });
    expect(new Set(t)).toEqual(new Set(['x', 'y', 'z', 't', 'f', 'c1', 'c2', 'd1', 'h1', 'def']));
  });

  it('dedupes repeated targets', () => {
    const t = e.extractConnectionTargets({ id: 'b1', parameters: { trueTarget: 'same', defaultTarget: 'same' } });
    expect(t).toEqual(['same']);
  });

  it('returns an empty array for a beat with no targets', () => {
    expect(e.extractConnectionTargets({ id: 'b1', parameters: {} })).toEqual([]);
  });
});

describe('extractConnectionTargetsFromBeat (project beat)', () => {
  const e = svc() as any;

  it('merges getConnections() and the connections array, deduped', () => {
    const beat = {
      getConnections: () => [{ targetId: 'a' }, { targetId: 'b' }],
      connections: [{ targetId: 'b' }, { targetId: 'c' }],
    };
    expect(new Set(e.extractConnectionTargetsFromBeat(beat))).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('checkUIRendering', () => {
  it('warns for beats with no matching [data-id] node and not for rendered ones', () => {
    document.body.innerHTML = '<div data-id="b1"></div>';
    const issues = (svc() as any).checkUIRendering(
      [{ id: 'b1', name: 'Rendered' }, { id: 'b2', name: 'Hidden' }],
      false,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ category: 'ui_not_rendered', beatId: 'b2' });
    document.body.innerHTML = '';
  });
});

describe('singleton', () => {
  it('getAIDebugService returns a stable instance', () => {
    expect(getAIDebugService()).toBe(getAIDebugService());
  });
});
