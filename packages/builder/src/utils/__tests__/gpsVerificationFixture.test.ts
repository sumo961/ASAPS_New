/**
 * Validity guard for the bundled GPS verification example
 * (public/examples/gps-location-verification.asaps.zip). Keeps the importable
 * fixture honest as the setGpsLocation / gpsLocation schemas evolve: it must
 * stay a connected graph, cover all four Set GPS Location modes, bind each
 * geofence to a point set that some setGpsLocation actually writes, and its
 * beats must construct from the stored params without throwing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import { SetGpsLocationBeat, GpsLocationBeat } from '@asaps/core';

const ZIP = join(__dirname, '../../../public/examples/gps-location-verification.asaps.zip');
const FIELD_ZIP = join(__dirname, '../../../public/examples/gps-field-test.asaps.zip');

async function loadBeats(path: string): Promise<any[]> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const projectJson = await zip.file('project.json')!.async('string');
  return JSON.parse(projectJson).project.story.beats;
}

let beats: any[];

beforeAll(async () => {
  beats = await loadBeats(ZIP);
});

describe('GPS verification fixture', () => {
  it('is a connected graph (no dangling connections)', () => {
    const ids = new Set(beats.map(b => b.id));
    for (const b of beats) {
      for (const c of b.connections || []) {
        expect(ids.has(c.targetId), `${b.id} → ${c.targetId} dangles`).toBe(true);
      }
    }
  });

  it('exercises preset, scatter (both placements), and capture', () => {
    const modes = beats.filter(b => b.type === 'setGpsLocation').map(b => b.parameters.mode);
    expect(modes).toEqual(expect.arrayContaining(['preset', 'scatter', 'capture']));
    // scatter appears twice — uniform (offline) and walkable (OSM)
    const placements = beats.filter(b => b.type === 'setGpsLocation' && b.parameters.mode === 'scatter').map(b => b.parameters.placement);
    expect(placements).toEqual(expect.arrayContaining(['uniform', 'walkable']));
  });

  it('every geofence binds to a point set some setGpsLocation writes', () => {
    const written = new Set(beats.filter(b => b.type === 'setGpsLocation').map(b => b.parameters.pointName));
    const bound = beats
      .filter(b => b.type === 'gpsLocation')
      .flatMap(b => (b.parameters.xrLocations || []).map((e: any) => e.pointName))
      .filter(Boolean);
    expect(bound.length).toBeGreaterThan(0);
    for (const name of bound) expect(written.has(name), `no setGpsLocation writes '${name}'`).toBe(true);
  });

  it('exercises both a trigger geofence and a display geofence', () => {
    const gpsModes = beats.filter(b => b.type === 'gpsLocation').map(b => b.parameters.mode);
    expect(gpsModes).toContain('trigger-on-arrival');
    expect(gpsModes).toContain('display');
  });

  it('its GPS beats construct from the stored params without throwing + round-trip', () => {
    for (const b of beats.filter(b => b.type === 'setGpsLocation')) {
      const beat = new SetGpsLocationBeat({ id: b.id, type: 'setGpsLocation', parameters: b.parameters });
      const p = beat.getParameters();
      expect(p.mode).toBe(b.parameters.mode);
      expect(p.pointName).toBe(b.parameters.pointName);
    }
    for (const b of beats.filter(b => b.type === 'gpsLocation')) {
      const beat = new GpsLocationBeat({ id: b.id, type: 'gpsLocation', parameters: b.parameters } as any);
      expect(beat.getParameters().mode).toBe(b.parameters.mode);
      // the bound geofence surfaces its target as a connection
      const targets = beat.getConnections().map(c => c.targetId);
      expect(targets).toContain(b.parameters.defaultTarget);
    }
  });
});

describe('GPS field-test fixture (location-agnostic)', () => {
  let fieldBeats: any[];
  beforeAll(async () => {
    fieldBeats = await loadBeats(FIELD_ZIP);
  });

  it('is a connected graph (no dangling connections)', () => {
    const ids = new Set(fieldBeats.map(b => b.id));
    for (const b of fieldBeats) {
      for (const c of b.connections || []) {
        expect(ids.has(c.targetId), `${b.id} → ${c.targetId} dangles`).toBe(true);
      }
    }
  });

  it('contains NO authored coordinates — everything centers on the live player', () => {
    // the whole point of the field kit: it must work at ANY location
    const flat = JSON.stringify(fieldBeats);
    expect(flat).not.toMatch(/"lat"|"lng"|"fallbackLat"/);
    const modes = fieldBeats.filter(b => b.type === 'setGpsLocation').map(b => b.parameters.mode);
    expect(modes).toEqual(['capture', 'scatter']);
    const scatter = fieldBeats.find(b => b.type === 'setGpsLocation' && b.parameters.mode === 'scatter');
    expect(scatter.parameters.centerSource).toBe('current');
    expect(scatter.parameters.placement).toBe('walkable');
  });

  it('every geofence binds to a written point set; exercises trigger + display', () => {
    const written = new Set(fieldBeats.filter(b => b.type === 'setGpsLocation').map(b => b.parameters.pointName));
    const gpsBeats = fieldBeats.filter(b => b.type === 'gpsLocation');
    for (const b of gpsBeats) {
      for (const e of b.parameters.xrLocations || []) {
        expect(written.has(e.pointName), `no setGpsLocation writes '${e.pointName}'`).toBe(true);
      }
    }
    const gpsModes = gpsBeats.map(b => b.parameters.mode);
    expect(gpsModes).toContain('trigger-on-arrival');
    expect(gpsModes).toContain('display');
  });

  it('its GPS beats construct from the stored params without throwing', () => {
    for (const b of fieldBeats.filter(b => b.type === 'setGpsLocation')) {
      const beat = new SetGpsLocationBeat({ id: b.id, type: 'setGpsLocation', parameters: b.parameters });
      expect(beat.getParameters().pointName).toBe(b.parameters.pointName);
    }
    for (const b of fieldBeats.filter(b => b.type === 'gpsLocation')) {
      const beat = new GpsLocationBeat({ id: b.id, type: 'gpsLocation', parameters: b.parameters } as any);
      expect(beat.getParameters().mode).toBe(b.parameters.mode);
    }
  });
});
