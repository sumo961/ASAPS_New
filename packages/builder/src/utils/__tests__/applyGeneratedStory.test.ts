/**
 * applyGeneratedStory — the single AI-story → builder-state path. These
 * tests pin the behaviours the two old App.tsx handlers each had only half
 * of, so neither can silently regress again.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  applyGeneratedStory,
  flattenConditionParams,
  withFictionalTimeHud,
  type ApplyGeneratedStoryDeps,
} from '../applyGeneratedStory';

vi.mock('../../themes/migration/GlobalSettingsAdapter', () => ({
  themeToGlobalSettings: (theme: any, existing: any) => ({ ...existing, themeId: theme.meta.id }),
}));

function fakeBeat(type: string, position: any, options: any) {
  return {
    id: options?.id,
    name: options?.name,
    type,
    x: position?.x,
    y: position?.y,
    speaker: undefined as string | undefined,
    params: {} as any,
    connections: [] as any[],
    updateParameters(p: any) { this.params = { ...this.params, ...p }; },
    addConnection(c: any) { this.connections.push(c); },
    getConnections() { return this.connections; },
  };
}

function makeDeps(over: Partial<ApplyGeneratedStoryDeps> = {}) {
  const calls: string[] = [];
  let settings: any = { variables: [], hudOverlays: {} };
  const deps: ApplyGeneratedStoryDeps & { calls: string[]; loaded: any[]; settings: () => any } = {
    calls,
    loaded: [],
    settings: () => settings,
    actions: {
      createBeat: vi.fn((t, pos, opt) => { calls.push('createBeat'); return fakeBeat(t, pos, opt) as any; }),
      loadStoryData: vi.fn((d) => { calls.push('loadStoryData'); deps.loaded.push(d); }),
    },
    currentAuthor: 'Existing Author',
    getGlobalSettings: () => settings,
    commitGlobalSettings: vi.fn((next) => { calls.push('commit'); settings = next; }),
    setCharacters: vi.fn(() => calls.push('setCharacters')),
    reportImportValidation: vi.fn(() => calls.push('validate')),
    clearTranslations: vi.fn(() => calls.push('clearTranslations')),
    requestClusterArrange: vi.fn(() => calls.push('arrange')),
    beforeStateLoad: vi.fn(() => calls.push('beforeStateLoad')),
    ...over,
  };
  return deps;
}

const story = () => ({
  metadata: { title: 'The Ledger', author: 'AI', firstBeatId: 'b1' },
  beats: [
    { id: 'b1', type: 'infoText', name: 'Start', parameters: { text: 'Hi' }, cluster: ' Act 1 ', notes: 'author note' },
    { id: 'b2', type: 'dialogTree', label: 'Talk', parameters: { speaker: 'Interactor' } },
    { id: 'b3', type: 'conditionBeat', name: 'Gate', parameters: {
      condition: { type: 'variable', variable: 'trust', operator: '>=', value: 2 },
      trueConnection: { target: 'b2' }, falseConnection: { target: 'b1' },
    } },
  ],
  connections: [{ source: 'b1', target: 'b2', label: 'go' }, { sourceId: 'b1', targetId: 'b3' }],
  characters: [{ id: 'pc', name: 'Nia', displayName: 'Nia K.', role: 'player' }],
  clusters: [{ id: 'Act 1', name: 'Act 1' }],
  variables: [{ name: 'trust', type: 'number', initialValue: 0 }],
});

describe('applyGeneratedStory', () => {
  it('lands the whole story in ONE loadStoryData call, guarded by beforeStateLoad', async () => {
    const deps = makeDeps();
    const r = await applyGeneratedStory(story(), deps, { fallbackTitle: 'x' });
    expect(deps.actions.loadStoryData).toHaveBeenCalledTimes(1);
    const d = deps.loaded[0];
    expect(d.title).toBe('The Ledger');
    expect(d.author).toBe('AI');
    expect(d.beats.map((b: any) => b.id)).toEqual(['b1', 'b2', 'b3']);
    expect(d.clusters).toEqual([{ id: 'Act 1', name: 'Act 1' }]);
    expect(d.characters[0].id).toBe('pc');
    expect(deps.calls.indexOf('beforeStateLoad')).toBe(deps.calls.indexOf('loadStoryData') - 1);
    expect(deps.requestClusterArrange).toHaveBeenCalled();
    expect(r.beatCount).toBe(3);
    expect(r.clusterCount).toBe(1);
  });

  it('wires connections onto the source instances with a default label, and de-dupes spellings', async () => {
    const deps = makeDeps();
    await applyGeneratedStory(story(), deps, { fallbackTitle: 'x' });
    const b1 = deps.loaded[0].beats[0];
    expect(b1.connections).toEqual([
      { targetId: 'b2', label: 'go' },
      { targetId: 'b3', label: 'To Gate' },
    ]);
  });

  it('carries cluster membership (trimmed) and notes onto the beat instance', async () => {
    const deps = makeDeps();
    await applyGeneratedStory(story(), deps, { fallbackTitle: 'x' });
    const b1 = deps.loaded[0].beats[0];
    expect(b1.cluster).toBe('Act 1');
    expect(b1.notes).toBe('author note');
  });

  it('flattens nested conditionBeat params and extracts true/false targets', async () => {
    const deps = makeDeps();
    await applyGeneratedStory(story(), deps, { fallbackTitle: 'x' });
    const gate = deps.loaded[0].beats[2];
    expect(gate.params).toMatchObject({ conditionType: 'variable', variableName: 'trust', operator: '>=', value: 2, trueTarget: 'b2', falseTarget: 'b1' });
    expect(gate.params.condition).toBeUndefined();
    expect(gate.params.trueConnection).toBeUndefined();
  });

  it('migrates the legacy "Interactor" speaker to the player character', async () => {
    const deps = makeDeps();
    const s = story();
    // speaker lives on the instance; the fake copies params only, so seed it
    deps.actions.createBeat = vi.fn((t, pos, opt) => {
      const b = fakeBeat(t, pos, opt) as any;
      if (opt.id === 'b2') b.speaker = 'Interactor';
      return b;
    });
    await applyGeneratedStory(s, deps, { fallbackTitle: 'x' });
    expect(deps.loaded[0].beats[1].speaker).toBe('Nia K.');
  });

  it('always sets characters — an empty story clears the previous project\'s cast', async () => {
    const deps = makeDeps();
    const s = story(); delete (s as any).characters;
    await applyGeneratedStory(s, deps, { fallbackTitle: 'x' });
    expect(deps.setCharacters).toHaveBeenCalledWith([]);
    expect(deps.clearTranslations).toHaveBeenCalled();
  });

  it('merges variables, applies the suggested theme on top, then the fictional-time HUD', async () => {
    const deps = makeDeps({ resolveTheme: vi.fn(async (id) => ({ meta: { id, name: 'Ink & Brass' } })) });
    const s: any = story();
    s.suggestedTheme = { themeId: 'ink-brass', reason: 'noir' };
    s.beats.push({ id: 'b4', type: 'setVariable', parameters: { type: 'fictionalTime', operation: 'set', timeYear: 1923, timeMonth: 5, timeDay: 2, timeHour: 21 } });
    const r = await applyGeneratedStory(s, deps, { fallbackTitle: 'x' });
    const final = deps.settings();
    expect(final.variables.map((v: any) => v.name)).toEqual(['trust']);
    expect(final.themeId).toBe('ink-brass');
    expect(final.hudOverlays.fictionalTime).toMatchObject({ enabled: true, initialTime: { year: 1923, month: 5, day: 2, hour: 21, minute: 0 } });
    expect(final.hudOverlays.timerHud.enabled).toBe(true);
    expect(r.themeApplied).toBe('Ink & Brass');
    expect(r.fictionalTimeHudEnabled).toBe(true);
    expect(deps.commitGlobalSettings).toHaveBeenCalledTimes(3);
  });

  it('runs the normalize pipeline only when asked (MCP raw input)', async () => {
    const loadSchema = vi.fn(async () => undefined);
    const deps = makeDeps({ loadSchema });
    await applyGeneratedStory(story(), deps, { fallbackTitle: 'x' });
    expect(loadSchema).not.toHaveBeenCalled();
    await applyGeneratedStory(story(), deps, { fallbackTitle: 'x', normalize: true });
    expect(loadSchema).toHaveBeenCalledTimes(1);
  });

  it('falls back to the given title and current author, and positions beats without coordinates', async () => {
    const deps = makeDeps();
    const s: any = { beats: [{ id: 'only', type: 'infoText' }] };
    const r = await applyGeneratedStory(s, deps, { fallbackTitle: 'Injected Story' });
    expect(r.title).toBe('Injected Story');
    expect(deps.loaded[0].author).toBe('Existing Author');
    const b = deps.loaded[0].beats[0];
    expect(typeof b.x).toBe('number');
    expect(typeof b.y).toBe('number');
  });

  it('reports unknown beat types instead of failing', async () => {
    const deps = makeDeps();
    const r = await applyGeneratedStory({ beats: [{ id: 'z', type: 'hologram' }] }, deps, { fallbackTitle: 'x' });
    expect(r.unknownBeatTypes).toEqual(['hologram']);
    expect(deps.loaded[0].beats).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('flattenConditionParams leaves already-flat params alone', () => {
    expect(flattenConditionParams({ conditionType: 'inventory', item: 'key' })).toEqual({ conditionType: 'inventory', item: 'key' });
  });

  it('withFictionalTimeHud is a no-op without fictional time or when already enabled', () => {
    const prev: any = { hudOverlays: {} };
    expect(withFictionalTimeHud(prev, { beats: [{ type: 'infoText' }] })).toBe(prev);
    const on: any = { hudOverlays: { fictionalTime: { enabled: true } } };
    expect(withFictionalTimeHud(on, { beats: [{ type: 'conditionBeat', parameters: { conditionType: 'fictionalTime' } }] })).toBe(on);
    const off: any = { hudOverlays: { timerHud: { enabled: true, position: 'top-left' } } };
    const next: any = withFictionalTimeHud(off, { beats: [{ type: 'conditionBeat', parameters: { conditionType: 'fictionalTime' } }] });
    expect(next.hudOverlays.fictionalTime.enabled).toBe(true);
    expect(next.hudOverlays.timerHud.position).toBe('top-left'); // existing timer HUD kept
  });
});
