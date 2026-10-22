/**
 * A folder project written by a newer ASAPS, opened and saved by this one:
 * fields and beat types this version doesn't know come out unchanged
 * (carryOver.ts, BeatSerializer.otherFields).
 */
import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { serializeToDirectory, deserializeFromDirectory } from '../../src/persistence/DirectoryFormat';

const registry = BeatTypeRegistry.getInstance();

function roundTrip(beatsJson: any[]): any[] {
  const beats = beatsJson.map((b) => registry.createBeat(b.type, JSON.parse(JSON.stringify(b))).toJSON());
  const { files } = serializeToDirectory({
    project: { id: 'p', name: 'P', createdAt: new Date('2026-01-01'), modifiedAt: new Date('2026-01-01'), version: '1' },
    story: { metadata: { firstBeatId: beats[0].id }, beats, clusters: [], characters: [], environment: { props: [], nodes: [] }, containerBeatPositions: [] },
  } as any);
  return files.filter((f) => f.path.startsWith('clusters/_unclustered/')).map((f) => JSON.parse(f.content));
}

async function reopen(fileJson: any[]): Promise<any[]> {
  const files: Record<string, string> = {
    'p/project.json': JSON.stringify({ id: 'p', name: 'P', firstBeatId: fileJson[0].id, createdAt: '2026-01-01', modifiedAt: '2026-01-01', version: '1' }),
    'p/clusters/_index.json': JSON.stringify({ clusters: [], containerBeatPositions: [] }),
  };
  for (const b of fileJson) files[`p/clusters/_unclustered/${b.type}_${b.id}.json`] = JSON.stringify(b);
  const reader = {
    readText: async (p: string) => files[p],
    exists: async (p: string) => p in files || Object.keys(files).some((f) => f.startsWith(p + '/')),
    listDir: async (p: string) => [...new Map(Object.keys(files).filter((f) => f.startsWith(p + '/')).map((f) => {
      const rest = f.slice(p.length + 1).split('/');
      return [rest[0], { name: rest[0], isDirectory: rest.length > 1 }] as const;
    })).values()],
  };
  const r = await deserializeFromDirectory('p', reader as any);
  return r.beats;
}

describe('a newer project through this version', () => {
  const newer = [
    {
      id: 'b1', type: 'multiChoice', name: 'Ask', x: 1, y: 2, futureTop: { mode: 'x' }, timeDisplayMode: 'manual', explainHuds: true,
      parameters: { question: 'Which way?', futureParam: [1, 2], choices: [{ id: 'c1', text: 'Left', target: 'b2', futureChoice: 'z' }] },
      connections: [],
    },
    { id: 'b2', type: 'holoScene', name: 'From the future', futureTop: 7, parameters: { layers: 3, text: 'hi' }, connections: [{ targetId: 'b1' }] },
  ];

  it('keeps unknown fields, known fields the file writer used to drop, and unknown beat types', async () => {
    const files = roundTrip(newer);
    const ask = files.find((b) => b.id === 'b1');
    expect(ask.futureTop).toEqual({ mode: 'x' });
    expect(ask.timeDisplayMode).toBe('manual');
    expect(ask.explainHuds).toBe(true);
    expect(ask.parameters.futureParam).toEqual([1, 2]);
    expect(ask.parameters.choices[0].futureChoice).toBe('z');
    const holo = files.find((b) => b.id === 'b2');
    expect(holo).toMatchObject({ type: 'holoScene', futureTop: 7, parameters: { layers: 3, text: 'hi' } });

    // …and again after reading the folder back (open → save → open → save)
    const again = roundTrip(await reopen(files));
    expect(again.find((b) => b.id === 'b1')).toMatchObject({ futureTop: { mode: 'x' }, parameters: { futureParam: [1, 2] } });
    expect(again.find((b) => b.id === 'b2')).toMatchObject({ type: 'holoScene', futureTop: 7, parameters: { layers: 3 } });
  });
});
