/**
 * Tests for useStoryBuilder — the central editor-state hook. It's a
 * self-contained useState reducer (no Zustand / context), so renderHook +
 * act exercise its full action surface directly: beat CRUD, connect/
 * disconnect, clusters, settings, import, and ASML export.
 *
 * Beats come from the real BeatTypeRegistry (default types like infoText /
 * dialogTree are registered), so no mocking is needed.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStoryBuilder } from '../useStoryBuilder';

function setup() {
  return renderHook(() => useStoryBuilder());
}

describe('initial state', () => {
  it('starts with default title/author and empty collections', () => {
    const { result } = setup();
    expect(result.current.state.title).toBe('My Interactive Story');
    expect(result.current.state.author).toBe('Story Author');
    expect(result.current.state.beats).toEqual([]);
    expect(result.current.state.clusters).toEqual([]);
    expect(result.current.state.connections).toEqual([]);
  });
});

describe('title / author', () => {
  it('setTitle and setAuthor update state', () => {
    const { result } = setup();
    act(() => result.current.actions.setTitle('Quest'));
    act(() => result.current.actions.setAuthor('Ada'));
    expect(result.current.state.title).toBe('Quest');
    expect(result.current.state.author).toBe('Ada');
  });
});

describe('beat CRUD', () => {
  it('addBeat appends a beat with sequential ids and a default position', () => {
    const { result } = setup();
    let a: any, b: any;
    act(() => { a = result.current.actions.addBeat('infoText'); });
    act(() => { b = result.current.actions.addBeat('infoText'); });
    expect(a.id).toBe('beat_0');
    expect(b.id).toBe('beat_1');
    expect(a.type).toBe('infoText');
    expect(a.x).toBe(200);
    expect(a.y).toBe(200);
    expect(result.current.state.beats.map((x: any) => x.id)).toEqual(['beat_0', 'beat_1']);
  });

  it('honors a custom position and id/name', () => {
    const { result } = setup();
    let beat: any;
    act(() => {
      beat = result.current.actions.addBeat('infoText', { x: 50, y: 75 }, { id: 'intro', name: 'Opening' });
    });
    expect(beat.id).toBe('intro');
    expect(beat.name).toBe('Opening');
    expect(beat.x).toBe(50);
    expect(beat.y).toBe(75);
  });

  it('createBeat returns a beat WITHOUT adding it to state', () => {
    const { result } = setup();
    let beat: any;
    act(() => { beat = result.current.actions.createBeat('infoText'); });
    expect(beat).toBeTruthy();
    expect(result.current.state.beats).toEqual([]);
  });

  it('addExistingBeat adds a pre-created beat', () => {
    const { result } = setup();
    let beat: any;
    act(() => { beat = result.current.actions.createBeat('infoText', undefined, { id: 'x1' }); });
    act(() => result.current.actions.addExistingBeat(beat));
    expect(result.current.state.beats.map((b: any) => b.id)).toEqual(['x1']);
  });

  it('updateBeat mutates the beat and bumps its _version', () => {
    const { result } = setup();
    act(() => { result.current.actions.addBeat('infoText', undefined, { id: 'b1' }); });
    act(() => result.current.actions.updateBeat('b1', { name: 'Renamed' } as any));
    const beat: any = result.current.state.beats.find((b: any) => b.id === 'b1');
    expect(beat.name).toBe('Renamed');
    expect(beat._version).toBeGreaterThanOrEqual(1);
  });

  it('deleteBeat removes the beat and its connections', () => {
    const { result } = setup();
    act(() => { result.current.actions.addBeat('infoText', undefined, { id: 'a' }); });
    act(() => { result.current.actions.addBeat('infoText', undefined, { id: 'b' }); });
    act(() => result.current.actions.connectBeats('a', 'b'));
    act(() => result.current.actions.deleteBeat('a'));
    expect(result.current.state.beats.map((x: any) => x.id)).toEqual(['b']);
    expect(result.current.state.connections.some((c: any) => c.source === 'a' || c.target === 'a')).toBe(false);
  });

  it('moveBeat updates the beat coordinates', () => {
    const { result } = setup();
    act(() => { result.current.actions.addBeat('infoText', undefined, { id: 'm' }); });
    act(() => result.current.actions.moveBeat('m', { x: 999, y: 111 }));
    const beat: any = result.current.state.beats.find((b: any) => b.id === 'm');
    expect(beat.x).toBe(999);
    expect(beat.y).toBe(111);
  });
});

describe('connections', () => {
  function withTwoBeats() {
    const h = setup();
    act(() => { h.result.current.actions.addBeat('infoText', undefined, { id: 'a' }); });
    act(() => { h.result.current.actions.addBeat('infoText', undefined, { id: 'b' }); });
    return h;
  }

  it('connectBeats adds a connection to the source beat and to state', () => {
    const { result } = withTwoBeats();
    act(() => result.current.actions.connectBeats('a', 'b'));
    const a: any = result.current.state.beats.find((x: any) => x.id === 'a');
    expect(a.getConnections().some((c: any) => c.targetId === 'b')).toBe(true);
    expect(result.current.state.connections).toContainEqual(
      expect.objectContaining({ source: 'a', target: 'b' }),
    );
  });

  it('does not add a duplicate connection', () => {
    const { result } = withTwoBeats();
    act(() => result.current.actions.connectBeats('a', 'b'));
    act(() => result.current.actions.connectBeats('a', 'b'));
    const a: any = result.current.state.beats.find((x: any) => x.id === 'a');
    expect(a.getConnections().filter((c: any) => c.targetId === 'b')).toHaveLength(1);
  });

  it('is a no-op when source or target does not exist', () => {
    const { result } = withTwoBeats();
    act(() => result.current.actions.connectBeats('a', 'ghost'));
    expect(result.current.state.connections).toEqual([]);
  });

  it('disconnectBeats removes the connection', () => {
    const { result } = withTwoBeats();
    act(() => result.current.actions.connectBeats('a', 'b'));
    act(() => result.current.actions.disconnectBeats('a', 'b'));
    const a: any = result.current.state.beats.find((x: any) => x.id === 'a');
    expect(a.getConnections().some((c: any) => c.targetId === 'b')).toBe(false);
    expect(result.current.state.connections).toEqual([]);
  });
});

describe('clusters', () => {
  const cluster = (id: string, name = 'C') => ({ id, name }) as any;

  it('addCluster / renameCluster / removeCluster manage the cluster list', () => {
    const { result } = setup();
    act(() => result.current.actions.addCluster(cluster('c1', 'Act One')));
    expect(result.current.state.clusters.map((c: any) => c.id)).toEqual(['c1']);

    act(() => result.current.actions.renameCluster('c1', 'Prologue'));
    expect(result.current.state.clusters[0].name).toBe('Prologue');

    act(() => result.current.actions.removeCluster('c1'));
    expect(result.current.state.clusters).toEqual([]);
  });

  it('removeCluster keeps member beats as REAL Beat instances (regression: rest-spread stripped the prototype and crashed extractSpeakers)', () => {
    const { result } = setup();
    let beat: any;
    act(() => { beat = result.current.actions.addBeat('dialogTree', undefined, { id: 'db' }); });
    act(() => result.current.actions.addCluster(cluster('c1')));
    act(() => result.current.actions.moveBeatToCluster('db', 'c1'));
    act(() => result.current.actions.moveBeatInContainer('db', 'c1', 30, 40));

    act(() => result.current.actions.removeCluster('c1'));

    const survivor: any = result.current.state.beats.find((b: any) => b.id === 'db');
    expect(survivor).toBeDefined();
    expect(survivor.cluster).toBeUndefined();
    // The beat must still be a class instance with its methods intact
    expect(typeof survivor.getParameters).toBe('function');
    expect(() => survivor.getParameters()).not.toThrow();
    // Its in-container position is gone with the cluster
    expect(result.current.state.containerBeatPositions).toEqual([]);
  });

  it('moveBeatToCluster grows the container to fit the default member grid', () => {
    const { result } = setup();
    act(() => result.current.actions.addCluster({
      ...cluster('c1'),
      containerBounds: { width: 400, height: 300 },
    } as any));
    // 10 members → 5 grid rows → needs 600px height
    for (let i = 0; i < 10; i++) {
      act(() => { result.current.actions.addBeat('infoText', undefined, { id: `m${i}` }); });
      act(() => result.current.actions.moveBeatToCluster(`m${i}`, 'c1'));
    }
    const c: any = result.current.state.clusters[0];
    expect(c.containerBounds.height).toBe(600);
    expect(c.containerBounds.width).toBe(400);
  });

  it('moveBeatToCluster never shrinks an already-large container', () => {
    const { result } = setup();
    act(() => result.current.actions.addCluster({
      ...cluster('c1'),
      containerBounds: { width: 900, height: 800 },
    } as any));
    act(() => { result.current.actions.addBeat('infoText', undefined, { id: 'm0' }); });
    act(() => result.current.actions.moveBeatToCluster('m0', 'c1'));
    const c: any = result.current.state.clusters[0];
    expect(c.containerBounds).toEqual({ width: 900, height: 800 });
  });

  it('removeBeatFromCluster clears membership + container position, beat and connections survive', () => {
    const { result } = setup();
    act(() => { result.current.actions.addBeat('infoText', undefined, { id: 'a' }); });
    act(() => { result.current.actions.addBeat('infoText', undefined, { id: 'b' }); });
    act(() => result.current.actions.connectBeats('a', 'b'));
    act(() => result.current.actions.addCluster(cluster('c1')));
    act(() => result.current.actions.moveBeatToCluster('a', 'c1'));
    act(() => result.current.actions.moveBeatToCluster('b', 'c1'));
    act(() => result.current.actions.moveBeatInContainer('a', 'c1', 10, 10));

    act(() => result.current.actions.removeBeatFromCluster('a'));

    const a: any = result.current.state.beats.find((x: any) => x.id === 'a');
    const b: any = result.current.state.beats.find((x: any) => x.id === 'b');
    expect(a.cluster).toBeUndefined();
    expect(b.cluster).toBe('c1'); // untouched sibling stays in the cluster
    expect(typeof a.getParameters).toBe('function');
    expect(a.getConnections().some((c: any) => c.targetId === 'b')).toBe(true);
    expect(result.current.state.containerBeatPositions.map((p: any) => p.beatId)).toEqual([]);
    // cluster itself still exists
    expect(result.current.state.clusters.map((c: any) => c.id)).toEqual(['c1']);
  });
});

describe('settings, import, clear', () => {
  it('updateSettings replaces the settings object', () => {
    const { result } = setup();
    act(() => result.current.actions.updateSettings({ theme: 'builtin-twine' }));
    expect(result.current.state.settings).toEqual({ theme: 'builtin-twine' });
  });

  it('importBeats loads beats and applies title/author options', () => {
    const { result } = setup();
    let beats: any[];
    act(() => {
      const a = result.current.actions.createBeat('infoText', undefined, { id: 'p0' });
      const b = result.current.actions.createBeat('infoText', undefined, { id: 'p1' });
      beats = [a, b];
    });
    act(() => result.current.actions.importBeats(beats!, { title: 'Imported', author: 'Bee' }));
    expect(result.current.state.beats.map((x: any) => x.id)).toEqual(['p0', 'p1']);
    expect(result.current.state.title).toBe('Imported');
    expect(result.current.state.author).toBe('Bee');
  });

  it('clearStory resets state and the beat-id counter', () => {
    const { result } = setup();
    act(() => { result.current.actions.addBeat('infoText'); });
    act(() => result.current.actions.setTitle('Dirty'));
    act(() => result.current.actions.clearStory());
    expect(result.current.state.beats).toEqual([]);
    expect(result.current.state.title).toBe('My Interactive Story');
    // counter reset → next beat is beat_0 again
    let next: any;
    act(() => { next = result.current.actions.addBeat('infoText'); });
    expect(next.id).toBe('beat_0');
  });
});

describe('exportStory', () => {
  it('produces an ASML string carrying the current title', () => {
    const { result } = setup();
    act(() => result.current.actions.setTitle('Exported Tale'));
    act(() => { result.current.actions.addBeat('titleScreen', undefined, { id: 'beat_0' }); });
    let xml = '';
    act(() => { xml = result.current.actions.exportStory(); });
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);
    expect(xml).toContain('Exported Tale');
  });
});
