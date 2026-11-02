/**
 * The simulator against the real engine: a scripted player plays each template
 * and fixture at random, and everything it meets must be what Path Analysis
 * says. Choices, dialog, items, variables, counters, roles and feelings go
 * through the engine's own code here, so a simulator that drifts fails this.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Story } from '../../src/engine/Story';
import { StoryEngine } from '../../src/engine/StoryEngine';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';

const TEMPLATES = path.resolve(__dirname, '../../../builder/public/templates/src');
const FIXTURES = path.resolve(__dirname, '../fixtures');

function sources(): Array<[string, any]> {
  const out: Array<[string, any]> = [];
  // ordinary-wonders walks to real places: its GPS beats wait for a location no test has.
  for (const f of fs.readdirSync(TEMPLATES).filter((n) => n.endsWith('.project.json') && !n.startsWith('ordinary-wonders'))) {
    const j = JSON.parse(fs.readFileSync(path.join(TEMPLATES, f), 'utf8'));
    out.push([f, j.project ?? j]);
  }
  out.push(['hollowstar', { story: JSON.parse(fs.readFileSync(path.join(FIXTURES, 'hollowstar.json'), 'utf8')).story ?? JSON.parse(fs.readFileSync(path.join(FIXTURES, 'hollowstar.json'), 'utf8')) }]);
  return out;
}

function buildStory(project: any): Story {
  const st = project.story ?? project;
  const first = st.metadata?.firstBeatId ?? st.firstBeatId ?? st.beats[0].id;
  const story = new Story({ title: 't', author: 'a', firstBeatId: first } as any);
  if (st.emotionPalette?.length) story.setEmotionPalette(st.emotionPalette);
  if (st.traitModulations) story.setTraitModulations(st.traitModulations);
  if (st.characters?.length) story.setCharacters(st.characters);
  const settings = project.globalSettings ?? st.settings;
  if (settings) story.setSettings(settings);
  const registry = BeatTypeRegistry.getInstance();
  for (const b of st.beats) story.addBeat(registry.createBeat(b.type, JSON.parse(JSON.stringify(b))));
  return story;
}

const unanswered = new Set<string>();

interface Game { seq: string[]; end: 'ending' | 'stop' | 'stuck' | 'crash'; }

async function play(project: any, random: () => number): Promise<Game> {
  const story = buildStory(project);
  const seq: string[] = [];
  let cur = '';
  let same = 0;
  let finish: (end: Game['end']) => void = () => {};
  const finished = new Promise<Game['end']>((resolve) => { finish = resolve; });
  const stopWith = (end: Game['end']) => { finish(end); engine.stop(); };
  for (const beat of story.getAllBeats()) {
    const run = (beat as any).execute.bind(beat);
    (beat as any).execute = (c: any, r: any) => {
      seq.push(beat.id); cur = beat.id; same = 0;
      if (seq.length > 400) stopWith('stuck');
      return run(c, r);
    };
  }
  const choose = async (choices: any[]) => {
    if (++same > 60) { stopWith('stuck'); return new Promise(() => {}); }
    return choices[Math.floor(random() * choices.length)].id;
  };
  const impl: any = {
    renderChoices: choose,
    showChoices: choose,
    renderMovement: (_q: any, c: any) => choose(c),
    renderPropSelection: (_q: any, p: any) => choose(p),
    renderEndScreen: async () => { stopWith('ending'); return 'exit'; },
    renderHyperText: async (data: any) => data.links[Math.floor(random() * data.links.length)].targetBeatId,
    renderInputText: async () => 'word',
  };
  // A beat that keeps asking without an answer we understand must not hang the test.
  let calls = 0;
  const renderer = new Proxy({}, { get(_t, p: string) {
    if (p === 'then') return undefined;
    if (impl[p]) return impl[p];
    if (/^(render|show|play|wait|present)/.test(p)) {
      return async () => {
        if (++calls > 3000) { unanswered.add(`${cur}:${p}`); stopWith('stuck'); await new Promise(() => {}); }
        return undefined;
      };
    }
    return () => undefined;
  } });
  const engine: any = new StoryEngine(renderer as any, { mockMode: true });
  await engine.loadStory(story);
  const done = engine.start().then(() => 'stop' as const, () => 'crash' as const);
  const end = await Promise.race([done, finished]);
  void cur;
  return { seq, end };
}

describe('the simulator matches the engine', () => {
  const realTimeout = globalThis.setTimeout;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    (globalThis as any).setTimeout = (f: any, _ms?: number, ...a: any[]) => setImmediate(f, ...a);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    (globalThis as any).setTimeout = realTimeout;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(sources())('%s', async (_name, project) => {
    const paths = new StateSimulationAnalyzer(buildStory(project), { maxDepth: 300 }).analyzeRaw();
    const played = new Set(paths.flatMap((p) => p.steps.map((s) => s.beatId)));
    const stopsAt = (type: string[]) => new Set(paths.filter((p) => type.includes(p.outcome.type)).map((p) => p.outcome.beatId));
    const endings = stopsAt(['ending']);
    const stops = stopsAt(['deadEnd', 'stuck', 'cycle']);
    let seed = 20261102;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const problems = new Set<string>();
    for (let g = 0; g < 150; g++) {
      const game = await play(project, random);
      for (const id of game.seq) if (!played.has(id)) problems.add(`engine played ${id}, on no simulated path`);
      const last = game.seq[game.seq.length - 1];
      if (game.end === 'ending' && !endings.has(last)) problems.add(`engine ended at ${last}, not a simulated ending`);
      if (game.end === 'stop' && !stops.has(last)) problems.add(`engine stopped at ${last}, not a simulated stop`);
    }
    expect([...problems, ...unanswered]).toEqual([]);
  }, 180000);
});
