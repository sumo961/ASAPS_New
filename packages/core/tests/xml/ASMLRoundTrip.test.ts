/**
 * ASML round-trip tests — build a Story, ASMLGenerator.generate() it to XML,
 * ASMLParser.parse() it back, and assert structural fidelity (metadata, beat
 * ids/types/count, key params, connections). These exercise both the
 * 1341-line generator and the 2871-line parser together and are the place
 * lossy-serialization bugs surface.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ASMLGenerator } from '../../src/xml/ASMLGenerator';
import { ASMLParser } from '../../src/xml/ASMLParser';
import { Story } from '../../src/engine/Story';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';

const make = (config: { id: string; name: string; type: string; parameters?: any; connections?: any[] }) =>
  BeatTypeRegistry.getInstance().createBeat(config.type, {
    id: config.id,
    name: config.name,
    type: config.type,
    parameters: config.parameters || {},
    connections: config.connections || [],
  });

function buildStory(): Story {
  const story = new Story({ title: 'The Long Way Back', author: 'Ada Lovelace', firstBeatId: '0' });
  story.setMetadata({ title: 'The Long Way Back', author: 'Ada Lovelace', version: '1.0.0' });
  story.addBeat(make({ id: '0', name: 'Title', type: 'titleScreen', parameters: { title: 'The Long Way Back', author: 'Ada Lovelace', buttonText: 'Begin' }, connections: [{ targetId: '1' }] }));
  story.addBeat(make({ id: '1', name: 'Opening', type: 'infoText', parameters: { text: 'The harbor was quiet at dawn.', buttonText: 'Continue' }, connections: [{ targetId: '2' }] }));
  story.addBeat(make({ id: '2', name: 'The End', type: 'endScreen', parameters: { message: 'Fin.' } }));
  return story;
}

let gen: ASMLGenerator;
let parser: ASMLParser;
beforeEach(() => {
  gen = new ASMLGenerator();
  parser = new ASMLParser();
});

async function roundTrip(story: Story) {
  const xml = gen.generate(story);
  const result = await parser.parse(xml);
  return { xml, result };
}

describe('ASML round-trip', () => {
  it('generates well-formed XML that parses successfully', async () => {
    const { xml, result } = await roundTrip(buildStory());
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<story');
    expect(result.success).toBe(true);
    expect(result.story).toBeInstanceOf(Story);
  });

  it('preserves story metadata', async () => {
    const { result } = await roundTrip(buildStory());
    const meta = result.story!.getMetadata();
    expect(meta.title).toBe('The Long Way Back');
    expect(meta.author).toBe('Ada Lovelace');
  });

  it('preserves beat count, ids, and types', async () => {
    const { result } = await roundTrip(buildStory());
    const beats = result.story!.getAllBeats();
    expect(beats.map((b) => b.id).sort()).toEqual(['0', '1', '2']);
    const byId = new Map(beats.map((b) => [b.id, b]));
    expect(byId.get('0')!.type).toBe('titleScreen');
    expect(byId.get('1')!.type).toBe('infoText');
    expect(byId.get('2')!.type).toBe('endScreen');
  });

  it('preserves key beat parameters', async () => {
    const { result } = await roundTrip(buildStory());
    const byId = new Map(result.story!.getAllBeats().map((b) => [b.id, b]));
    expect(byId.get('1')!.getParameters().text).toBe('The harbor was quiet at dawn.');
    expect(byId.get('0')!.getParameters().title).toBe('The Long Way Back');
  });

  it('preserves the connection graph', async () => {
    const { result } = await roundTrip(buildStory());
    const byId = new Map(result.story!.getAllBeats().map((b) => [b.id, b]));
    const targets = (id: string) => byId.get(id)!.getConnections().map((c: any) => c.targetId);
    expect(targets('0')).toContain('1');
    expect(targets('1')).toContain('2');
  });

  it('escapes special characters in text and metadata', async () => {
    const story = new Story({ title: 'Tom & "Jerry" <fun>', author: 'A', firstBeatId: '0' });
    story.setMetadata({ title: 'Tom & "Jerry" <fun>', author: 'A', version: '1.0.0' });
    story.addBeat(make({ id: '0', name: 'T', type: 'infoText', parameters: { text: 'a < b && c > d "quoted"', buttonText: 'OK' } }));
    const { result } = await roundTrip(story);
    expect(result.success).toBe(true);
    expect(result.story!.getMetadata().title).toBe('Tom & "Jerry" <fun>');
    expect(result.story!.getAllBeats()[0].getParameters().text).toBe('a < b && c > d "quoted"');
  });

  it('round-trips twice to a stable structure (idempotent re-serialization)', async () => {
    const first = await roundTrip(buildStory());
    const second = await roundTrip(first.result.story!);
    expect(second.result.success).toBe(true);
    expect(second.result.story!.getAllBeats().map((b) => b.id).sort()).toEqual(['0', '1', '2']);
    expect(second.result.story!.getMetadata().title).toBe('The Long Way Back');
  });
});

describe('ASML round-trip — branching + rich beats', () => {
  it('preserves movementChoice choices and their branch targets', async () => {
    const story = new Story({ title: 'Branch', author: 'A', firstBeatId: '0' });
    story.setMetadata({ title: 'Branch', author: 'A', version: '1.0.0' });
    story.addBeat(
      make({
        id: '0',
        name: 'Fork',
        type: 'movementChoice',
        parameters: {
          question: 'Which way?',
          choices: [
            { text: 'North', target: '1' },
            { text: 'South', target: '2' },
          ],
        },
        connections: [
          { targetId: '1', label: 'North' },
          { targetId: '2', label: 'South' },
        ],
      }),
    );
    story.addBeat(make({ id: '1', name: 'N', type: 'endScreen', parameters: { message: 'North end' } }));
    story.addBeat(make({ id: '2', name: 'S', type: 'endScreen', parameters: { message: 'South end' } }));

    const { result } = await roundTrip(story);
    expect(result.success).toBe(true);
    const fork = result.story!.getAllBeats().find((b) => b.id === '0')!;
    expect(fork.type).toBe('movementChoice');
    const targets = fork.getConnections().map((c: any) => c.targetId).sort();
    expect(targets).toEqual(['1', '2']);
    // choice text survives
    const choices = fork.getParameters().choices ?? [];
    expect(choices.map((c: any) => c.text).sort()).toEqual(['North', 'South']);
  });

  it('preserves setVariable parameters', async () => {
    const story = new Story({ title: 'Vars', author: 'A', firstBeatId: '0' });
    story.setMetadata({ title: 'Vars', author: 'A', version: '1.0.0' });
    story.addBeat(
      make({ id: '0', name: 'Set', type: 'setVariable', parameters: { name: 'gold', value: '10', type: 'number', operation: 'set' }, connections: [{ targetId: '1' }] }),
    );
    story.addBeat(make({ id: '1', name: 'End', type: 'endScreen', parameters: { message: 'done' } }));

    const { result } = await roundTrip(story);
    const set = result.story!.getAllBeats().find((b) => b.id === '0')!;
    expect(set.type).toBe('setVariable');
    expect(set.getParameters().name).toBe('gold');
  });

  it('preserves characters across the round-trip', async () => {
    const story = new Story({ title: 'Cast', author: 'A', firstBeatId: '0' });
    story.setMetadata({ title: 'Cast', author: 'A', version: '1.0.0' });
    story.setCharacters([{ id: 'eve', name: 'eve', displayName: 'Eve' } as any]);
    story.addBeat(make({ id: '0', name: 'T', type: 'endScreen', parameters: { message: 'x' } }));

    const { result } = await roundTrip(story);
    expect(result.success).toBe(true);
    const chars = result.story!.getCharacters();
    expect(chars.some((c: any) => c.id === 'eve' || c.name === 'eve')).toBe(true);
  });

  it('preserves project settings (width/height)', async () => {
    const story = new Story({ title: 'Cfg', author: 'A', firstBeatId: '0' });
    story.setMetadata({ title: 'Cfg', author: 'A', version: '1.0.0' });
    story.setSettings({ project: { width: 800, height: 600, aspectRatio: '4:3', scalingMode: 'fit' } } as any);
    story.addBeat(make({ id: '0', name: 'T', type: 'endScreen', parameters: { message: 'x' } }));

    const { result } = await roundTrip(story);
    const settings = result.story!.getSettings() as any;
    expect(settings.project?.width).toBe(800);
    expect(settings.project?.height).toBe(600);
  });
});
