/**
 * The flowchart draws what the shared link walk finds (core utils/storyLinks),
 * styled by kind from graphStyle's link table. It kept its own list of beat
 * types and their link fields before (2026-11-26): links were drawn twice, and
 * a field only the walk knew was drawn plain or not at all.
 *
 * Real beats here, built the way the app builds them, and the bundled
 * templates as they load: the unit tests in graphBuild.test.ts use stand-ins.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { BeatTypeRegistry, beatLinks, defaultTargetIsLive } from '@asaps/core';
import { dialogTreeLayout } from '../../../utils/dialogTreeLayout';
import { buildGraphEdges } from '../graphBuild';
import { linkStyles, STANDALONE_LINK_KINDS } from '../graphStyle';
import { deserializeBeats } from '../../../utils/projectDeserializer';
import { flowchartLineCount } from '../graphBuild';

const registry = BeatTypeRegistry.getInstance();
const make = (type: string, id: string, params: Record<string, any> = {}, extra: Record<string, any> = {}): any => {
  const b: any = registry.createBeat(type, { id, type, name: id, x: 0, y: 0 } as any);
  if (!b.type) b.type = type;
  b.updateParameters?.(params);
  Object.assign(b, extra);
  return b;
};
const targets = (...ids: string[]) => ids.map((id) => make('infoText', id));
const build = (beats: any[], expanded: string[] = []) => buildGraphEdges({ beats, clusters: [], expandedDialogs: new Set(expanded) });
const from = (edges: any[], id: string) => edges.filter((e) => e.source === id)
  .map((e) => `${e.target}:${e.label}:${e.data?.via}`).sort();
const look = (e: any) => ({ stroke: e.style.stroke, dash: e.style.strokeDasharray });

describe('one line per link, from the link walk (real beats)', () => {
  it('Condition Check: True green, False red, once each', () => {
    const edges = build([make('conditionBeat', 'q', { trueTarget: 't1', falseTarget: 't2' }), ...targets('t1', 't2')]);
    expect(from(edges, 'q')).toEqual(['t1:True:condition-true', 't2:False:condition-false']);
    expect(look(edges.find((e) => e.target === 't1'))).toEqual({ stroke: '#22c55e', dash: undefined });
    expect(look(edges.find((e) => e.target === 't2'))).toEqual({ stroke: '#ef4444', dash: undefined });
  });

  it('Condition Check with both branches to one beat: two lines, True and False', () => {
    const edges = build([make('conditionBeat', 'q', { trueTarget: 't1', falseTarget: 't1' }), ...targets('t1')]);
    expect(from(edges, 'q')).toEqual(['t1:False:condition-false', 't1:True:condition-true']);
  });

  it('Set Timer: the timer target red and dashed, once; the way on beside it', () => {
    const edges = build([make('setTimer', 's', { timerTarget: 't1', continueTarget: 't2' }), ...targets('t1', 't2')]);
    const timer = edges.filter((e) => e.source === 's' && e.target === 't1');
    expect(timer).toHaveLength(1);
    expect(timer[0].label).toBe('Timer Target');
    expect(look(timer[0])).toEqual({ stroke: '#ef4444', dash: '5 5' });
    expect(edges.filter((e) => e.source === 's' && e.target === 't2')).toHaveLength(1);
  });

  it('a link in the list beside a field link to the same beat, under another name, keeps its own line', () => {
    const s = make('setTimer', 's', { timerTarget: 't1' });
    s.getConnections = () => [{ targetId: 't1', label: 'Timer Target' }, { targetId: 't1', label: 'Carry on' }];
    const edges = build([s, ...targets('t1')]).filter((e) => e.source === 's');
    expect(edges.map((e) => `${e.label}:${(e.data as any).via}`).sort()).toEqual(['Carry on:beat-connections', 'Timer Target:timer']);
  });

  it('an exit the expanded Dialog Tree has no card for stays on the beat (it vanished on expanding)', () => {
    // deep enough for the expanded view to cut it short
    let node: any = { id: 'last', text: 'End', choices: [{ id: 'x', text: 'Out', target: 't1' }] };
    for (let i = 0; i < 40; i++) node = { id: `n${i}`, text: 'More', choices: [{ id: `c${i}`, text: 'On', dialogNode: node }] };
    const d = make('dialogTree', 'd', { dialogTree: node });
    expect(dialogTreeLayout(node).exitEdges.some((e) => e.exitTarget === 't1')).toBe(false);
    const open = build([d, ...targets('t1')], ['d']);
    const out = open.filter((e) => e.target === 't1');
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('d');
  });

  it('Pick Prop: each prop once, green, named', () => {
    const edges = build([make('pickProp', 'p', { props: [{ id: 'k', name: 'Key', target: 't1' }, { id: 'r', name: 'Rope', target: 't2' }] }), ...targets('t1', 't2')]);
    expect(from(edges, 'p')).toEqual(['t1:Key:prop', 't2:Rope:prop']);
    expect(edges.every((e) => e.style!.stroke === '#10b981')).toBe(true);
  });

  it('Hypertext: each link once, cyan, labelled with its word', () => {
    const edges = build([make('hyperText', 'h', { text: 'the oil lamp', hyperlinks: [{ word: 'oil', targetBeatId: 't1' }] }), ...targets('t1')]);
    expect(from(edges, 'h')).toEqual(['t1:oil:hyperlink']);
    expect(edges[0].style!.stroke).toBe('#06b6d4');
  });

  it('Multi Choice: one grey line per choice; a guarded choice dashed violet with its guard', () => {
    const edges = build([make('multiChoice', 'm', { choices: [
      { text: 'Go', target: 't1' },
      { text: 'Unlock', target: 't2', conditions: [{ type: 'variable', variable: 'hasKey', operator: 'equals', value: true }] },
    ] }), ...targets('t1', 't2')]);
    expect(edges.filter((e) => e.source === 'm')).toHaveLength(2);
    const go = edges.find((e) => e.target === 't1')!; const unlock = edges.find((e) => e.target === 't2')!;
    expect(go.label).toBe('Go');
    expect(look(go)).toEqual({ stroke: '#64748b', dash: undefined });
    expect((unlock.data as any).guardSummary).toBeTruthy();
    expect(look(unlock)).toEqual({ stroke: '#8b5cf6', dash: '6 3' });
  });

  it('two choices that lead to the same beat share one line', () => {
    const edges = build([make('multiChoice', 'm', { choices: [{ text: 'A', target: 't1' }, { text: 'B', target: 't1' }] }), ...targets('t1')]);
    const line = edges.filter((e) => e.source === 'm');
    expect(line).toHaveLength(1);
    // … and the line says it stands for one more
    expect(line[0].label).toBe('A (+1)');
  });

  it('the same choice text twice to one beat is not counted twice', () => {
    const edges = build([make('multiChoice', 'm', { choices: [{ text: 'Go', target: 't1' }, { text: 'Go', target: 't1' }] }), ...targets('t1')]);
    expect(edges[0].label).toBe('Go');
  });

  it('Movement Choice keeps its orange dashed lines', () => {
    const edges = build([make('movementChoice', 'mv', { choices: [{ text: 'North', target: 't1' }] }), ...targets('t1')]);
    expect(edges).toHaveLength(1);
    expect(look(edges[0])).toEqual({ stroke: '#f59e0b', dash: '5 5' });
    expect(edges[0].label).toBe('North');
  });

  it('a collapsed Dialog Tree: every exit blue, nested ones too; expanded, none from the beat itself', () => {
    const tree = { id: 'root', text: 'Hi', choices: [
      { id: '1', text: 'Leave', target: 't1' },
      { id: '2', text: 'Stay', dialogNode: { id: 'n', text: 'Good', choices: [{ id: '3', text: 'Now go', target: 't2' }] } },
    ] };
    const beats = [make('dialogTree', 'd', { dialogTree: tree }), ...targets('t1', 't2')];
    const collapsed = build(beats).filter((e) => e.source === 'd');
    expect(collapsed.map((e) => e.target).sort()).toEqual(['t1', 't2']);
    expect(collapsed.every((e) => e.style!.stroke === '#3b82f6')).toBe(true);
    const open = build(beats, ['d']);
    expect(open.filter((e) => e.source === 'd')).toHaveLength(0);
    expect(open.filter((e) => e.id.startsWith('dlgexit-')).map((e) => e.target).sort()).toEqual(['t1', 't2']);
  });

  it('an expanded Dialog Tree still shows its requirement\'s way out', () => {
    const tree = { id: 'root', text: 'Hi', choices: [{ id: '1', text: 'Leave', target: 't1' }] };
    const d = make('dialogTree', 'd', { dialogTree: tree }, { requires: [{ fallbackTarget: 't2', explanation: 'needs the key' }] });
    const open = build([d, ...targets('t1', 't2')], ['d']);
    expect(from(open, 'd')).toEqual(['t2:requires: needs the key:requires']);
  });

  it('a requirement\'s fallback: amber dashed, with its explanation; beside a link to the same beat', () => {
    const b = make('infoText', 'b', {}, { requires: [{ fallbackTarget: 't1', explanation: 'you need the lantern to go any further down' }] });
    b.connections = [{ targetId: 't1', label: 'Next' }];
    const edges = build([b, ...targets('t1')]);
    expect(edges.filter((e) => e.source === 'b')).toHaveLength(2);
    const req = edges.find((e) => (e.data as any).via === 'requires')!;
    expect(req.label).toBe('requires: you need the lantern to go any f…');
    expect(look(req)).toEqual({ stroke: '#d97706', dash: '3 3' });
  });

  it('QR jump codes: purple dashed "QR"', () => {
    const edges = build([make('qrScan', 'qr', { qrJumpTargets: ['t1'] }), ...targets('t1')]);
    const qr = edges.filter((e) => (e.data as any).via === 'qr-jump');
    expect(qr).toHaveLength(1);
    expect(qr[0].label).toBe('QR');
    expect(look(qr[0])).toEqual({ stroke: '#a855f7', dash: '4 4' });
  });

  it('an End Screen\'s restart: dashed teal "↺ Restart", once', () => {
    const end = make('endScreen', 'e', { showRestart: true });
    end.connections = [{ targetId: 't1', label: 'Restart' }];
    const edges = build([end, ...targets('t1')]).filter((e) => e.source === 'e');
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBe('↺ Restart');
    expect(look(edges[0])).toEqual({ stroke: '#0d9488', dash: '8 4' });
  });

  it('an old-style condition on a link: amber, animated, "?" when unnamed', () => {
    const b = make('infoText', 'b');
    b.connections = [{ targetId: 't1', condition: { type: 'variable', variable: 'x', operator: 'equals', value: 1 } }];
    const e = build([b, ...targets('t1')])[0];
    expect(e).toMatchObject({ label: '?', animated: true });
    expect(e.style!.stroke).toBe('#fbbf24');
  });

  it('a link to the beat itself, or back to the choices, draws nothing', () => {
    const m = make('multiChoice', 'm', { choices: [{ text: 'Again', target: '__self__' }, { text: 'Loop', target: 'm' }] });
    expect(build([m])).toHaveLength(0);
  });

  it('a link field only the walk knows is drawn without the flowchart knowing the beat type', () => {
    // panorama hotspots and aiCondition categories never had a case of their own here
    const pano = make('panorama', 'pano', { hotspots: [{ name: 'Door', target: 't1' }] });
    const ai = make('aiCondition', 'ai', { categories: [{ name: 'kind', targetId: 't1' }, { name: 'rude', targetId: 't2' }], fallbackTarget: 't2' });
    const edges = build([pano, ai, ...targets('t1', 't2')]);
    expect(edges.filter((e) => e.source === 'pano').map((e) => e.target)).toEqual(['t1']);
    expect(edges.filter((e) => e.source === 'ai').map((e) => e.target).sort()).toEqual(['t1', 't2']);
  });

  it('a Free Layout\'s live buttons are links (its elements are kept in a Map on the live beat)', () => {
    const fl = make('freeLayout', 'fl', { choices: [{ text: 'Open', target: 't1', locationName: 'btn1' }, { text: 'Gone', target: 't2', locationName: 'deleted' }] });
    fl.locations = new Map([['btn1', { name: 'btn1' }]]);
    const edges = build([fl, ...targets('t1', 't2')]).filter((e) => e.source === 'fl');
    expect(edges.map((e) => e.target)).toEqual(['t1']);
  });
});

describe('the link table', () => {
  it('every kind with a look of its own names a kind the link walk produces', () => {
    const src = readFileSync(join(__dirname, '../../../../../core/src/utils/storyLinks.ts'), 'utf-8');
    const union = src.slice(src.indexOf('via:'), src.indexOf('/** Author-facing text'));
    const kinds = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(kinds.length).toBeGreaterThan(15);
    for (const k of [...Object.keys(linkStyles), ...STANDALONE_LINK_KINDS]) expect(kinds, `${k} is not a kind the walk gives`).toContain(k);
  });
});

describe('the bundled templates, as they load', () => {
  const dir = join(__dirname, '../../../../public/templates/src');
  const files = readdirSync(dir).filter((f) => f.endsWith('.project.json'));

  it('there are templates to check', () => expect(files.length).toBeGreaterThanOrEqual(5));

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8')).project.story.beats;

    it(`${file}: every link the walk finds is drawn, nothing else, no line twice`, () => {
      const beats = deserializeBeats(raw) as any[];
      const ids = new Set(beats.map((b) => b.id));
      for (const expanded of [[], beats.filter((b) => b.type === 'dialogTree').map((b) => b.id)]) {
        const edges = build(beats, expanded);
        const dialogOf = (nodeId: string) => (nodeId.startsWith('dlg:') ? nodeId.split(':')[1] : nodeId);
        const drawn = new Set(edges.filter((e) => ids.has(e.target)).map((e) => `${dialogOf(e.source)}>${e.target}`));
        const walked = new Set<string>();
        for (const b of beats) {
          const json = b.toJSON();
          for (const l of beatLinks({ ...json, connections: b.getConnections() })) {
            if (!ids.has(l.target) || l.target === b.id) continue;
            if (l.via === 'default-target' && !defaultTargetIsLive(b)) continue;
            walked.add(`${l.source}>${l.target}`);
          }
        }
        expect([...drawn].sort()).toEqual([...walked].sort());
        // no two lines of the same look between the same two beats
        const seen = new Set<string>();
        for (const e of edges) {
          const key = `${e.source}>${e.target}|${(e.data as any)?.via ?? e.id}`;
          expect(seen.has(key), `twice: ${key}`).toBe(false);
          seen.add(key);
        }
      }
    });

    it(`${file}: the header's link count is the number of lines between beats`, () => {
      const beats = deserializeBeats(raw) as any[];
      const ids = new Set(beats.map((b) => b.id));
      expect(flowchartLineCount(beats)).toBe(build(beats).filter((e) => ids.has(e.target)).length);
    });
  }
});
