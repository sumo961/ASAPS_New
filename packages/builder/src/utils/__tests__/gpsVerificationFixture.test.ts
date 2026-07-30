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

describe('QR Scan fixture', () => {
  const QR_ZIP = join(__dirname, '../../../public/examples/qr-scan-verification.asaps.zip');
  let qrBeats: any[];
  beforeAll(async () => {
    qrBeats = await loadBeats(QR_ZIP);
  });

  it('is a connected graph including condition true/false targets', () => {
    const ids = new Set(qrBeats.map(b => b.id));
    for (const b of qrBeats) {
      for (const c of b.connections || []) {
        expect(ids.has(c.targetId), `${b.id} → ${c.targetId} dangles`).toBe(true);
      }
      if (b.type === 'conditionBeat') {
        expect(ids.has(b.parameters.trueTarget), `${b.id} trueTarget dangles`).toBe(true);
        expect(ids.has(b.parameters.falseTarget), `${b.id} falseTarget dangles`).toBe(true);
      }
    }
  });

  it('the printed CODE A payload (asaps://beat/A_pass) targets a real beat + is drawn as a jump edge', () => {
    const ids = new Set(qrBeats.map(b => b.id));
    expect(ids.has('A_pass')).toBe(true); // must match the QR sheet payload
    const aScan = qrBeats.find(b => b.id === 'A_scan');
    expect(aScan.parameters.qrJumpTargets).toContain('A_pass');
  });

  it('covers the protocol axes: asaps-interpretation on, raw+pattern station, variable + inventory checks', () => {
    const scanners = qrBeats.filter(b => b.type === 'qrScan');
    expect(scanners.length).toBe(4);
    const d = qrBeats.find(b => b.id === 'D_scan');
    expect(d.parameters.interpretAsapsUri).toBe(false);
    expect(d.parameters.matchPatterns).toEqual(['^WORLD\\d+$']);
    const condTypes = qrBeats.filter(b => b.type === 'conditionBeat').map(b => b.parameters.condition.type);
    expect(condTypes).toEqual(expect.arrayContaining(['variable', 'inventory']));
  });

  it('the QR sheet exists and carries exactly the four payloads the story expects', () => {
    const html = readFileSync(join(__dirname, '../../../public/examples/qr-scan-verification-codes.html'), 'utf-8');
    for (const payload of ['asaps://beat/A_pass', 'asaps://variable/scanned/red', 'asaps://inventory/add/badge', 'WORLD42']) {
      expect(html).toContain(payload);
    }
  });
});

describe('Web View fixture', () => {
  const WV_ZIP = join(__dirname, '../../../public/examples/web-view-verification.asaps.zip');
  let wvBeats: any[];
  beforeAll(async () => {
    wvBeats = await loadBeats(WV_ZIP);
  });

  it('is a connected graph and closes the replay loop back to the start', () => {
    const ids = new Set(wvBeats.map(b => b.id));
    for (const b of wvBeats) {
      for (const c of b.connections || []) {
        expect(ids.has(c.targetId), `${b.id} → ${c.targetId} dangles`).toBe(true);
      }
      if (b.type === 'conditionBeat') {
        expect(ids.has(b.parameters.trueTarget)).toBe(true);
        expect(ids.has(b.parameters.falseTarget)).toBe(true);
      }
    }
    // the QR-round lesson: session-resume strands finished runs without this
    const end = wvBeats.find(b => b.type === 'endScreen');
    expect(end.connections.some((c: any) => c.targetId === 't')).toBe(true);
  });

  it('hosted-page URLs are ${baseUrl}-substituted and the base URL is collected first', () => {
    const setup = wvBeats.find(b => b.id === 'setup');
    expect(setup.parameters.variable).toBe('baseUrl');
    const views = wvBeats.filter(b => b.type === 'webView');
    expect(views.length).toBe(4);
    const hosted = views.filter(b => b.parameters.url.startsWith('${baseUrl}/'));
    expect(hosted.length).toBe(3); // static / postmessage / exit — D uses a real blocked site
  });

  it('covers the protocol axes: passContext, postMessage+saveTo (condition-verified), exitUrlPattern, blocked site', () => {
    const a = wvBeats.find(b => b.id === 'A_view');
    expect(a.parameters.passContext).toEqual(['playerName']);
    const bv = wvBeats.find(b => b.id === 'B_view');
    expect(bv.parameters.saveTo).toBe('webResult');
    const check = wvBeats.find(b => b.id === 'B_check');
    expect(check.parameters.condition.value).toBe('done-via-message');
    const cv = wvBeats.find(b => b.id === 'C_view');
    expect(cv.parameters.exitUrlPattern).toBe('exit-done');
    const dv = wvBeats.find(b => b.id === 'D_view');
    expect(dv.parameters.url).toMatch(/^https:\/\//);
  });

  it('the test pages exist and carry the exact postMessage protocol + exit-URL target', () => {
    const dir = join(__dirname, '../../../public/examples/web-view-test-pages');
    const pm = readFileSync(join(dir, 'page-postmessage.html'), 'utf-8');
    expect(pm).toContain("parent.postMessage({asaps:'result', value:'done-via-message'}, '*')");
    const ex = readFileSync(join(dir, 'page-exit.html'), 'utf-8');
    expect(ex).toContain('exit-done.html'); // must match C_view's exitUrlPattern
    readFileSync(join(dir, 'page-static.html'));
    readFileSync(join(dir, 'exit-done.html'));
    readFileSync(join(dir, 'index.html'));
  });
});

describe('AR Scene fixture', () => {
  const AR_ZIP = join(__dirname, '../../../public/examples/ar-scene-verification.asaps.zip');
  let arBeats: any[];
  let arZip: JSZip;
  beforeAll(async () => {
    arZip = await JSZip.loadAsync(readFileSync(AR_ZIP));
    const data = JSON.parse(await arZip.file('project.json')!.async('string'));
    arBeats = data.project.story.beats;
  });

  it('is a connected graph, closes the replay loop, and condition targets resolve', () => {
    const ids = new Set(arBeats.map(b => b.id));
    for (const b of arBeats) {
      for (const c of b.connections || []) {
        expect(ids.has(c.targetId), `${b.id} → ${c.targetId} dangles`).toBe(true);
      }
      if (b.type === 'conditionBeat') {
        expect(ids.has(b.parameters.trueTarget)).toBe(true);
        expect(ids.has(b.parameters.falseTarget)).toBe(true);
      }
    }
    const end = arBeats.find(b => b.type === 'endScreen');
    expect(end.connections.some((c: any) => c.targetId === 't')).toBe(true);
  });

  it('the bundled .mind asset exists and every arBeat references it', async () => {
    const arStations = arBeats.filter(b => b.type === 'arBeat');
    expect(arStations.length).toBe(2);
    const markerId = arStations[0].parameters.markerAssetId;
    expect(markerId).toBeTruthy();
    // asset payload + metadata must ride in the zip under other/
    const assetFile = arZip.file(`other/${markerId}_ar-marker.mind`);
    expect(assetFile, 'compiled .mind missing from zip').toBeTruthy();
    const mindBytes = await assetFile!.async('uint8array');
    expect(mindBytes.length).toBeGreaterThan(100_000); // real compiled tracker, not a stub
    const meta = JSON.parse(await arZip.file(`other/${markerId}.json`)!.async('string'));
    expect(meta.id).toBe(markerId);
    expect(meta.type).toBe('other');
    for (const b of arStations) expect(b.parameters.markerAssetId).toBe(markerId);
  });

  it('covers the protocol axes: bare-beat-id tap route + asaps://variable anchor + condition check', () => {
    const ids = new Set(arBeats.map(b => b.id));
    const a = arBeats.find(b => b.id === 'A_ar');
    const left = a.parameters.anchors.find((x: any) => x.id === 'left');
    const right = a.parameters.anchors.find((x: any) => x.id === 'right');
    expect(ids.has(left.onTap)).toBe(true); // bare beat id resolves
    expect(right.onTap).toBe('asaps://variable/picked/right');
    const check = arBeats.find(b => b.id === 'B_check');
    expect(check.parameters.condition).toMatchObject({ type: 'variable', variableName: 'picked', value: 'right' });
    // fallbacks route honestly (never to a PASS screen)
    expect(a.parameters.fallbackTarget).toBe('A_fail');
    expect(arBeats.find(b => b.id === 'B_ar').parameters.fallbackTarget).toBe('B_check');
  });

  it("orders each station's honest/check exit FIRST in connections", () => {
    // getNextBeat() takes the first unconditional connection, and that is
    // where asaps://variable taps and skips land. Field failure 2026-07-29:
    // B_ar had [A_pass, B_check], so the Station B variable tap advanced
    // into Station A's PASS flow ("returns to the beginning"). Rule (same
    // as the QR fixtures): the check/fail exit is connections[0]; PASS
    // screens are only reachable via bare-beat-id anchor taps.
    const first = (id: string) => arBeats.find(b => b.id === id).connections[0].targetId;
    expect(first('A_ar')).toBe('A_fail');
    expect(first('B_ar')).toBe('B_check');
  });

  it('the marker sheet exists and generates deterministically (seeded)', () => {
    const html = readFileSync(join(__dirname, '../../../public/examples/ar-scene-marker.html'), 'utf-8');
    expect(html).toContain('mulberry32(20260727)'); // fixed seed — print & .mind stay in sync
    expect(html).toContain('mind-ar@1.2.5');        // must match the renderer's pinned version
    readFileSync(join(__dirname, '../../../public/examples/ar-marker.png'));
    readFileSync(join(__dirname, '../../../public/examples/ar-marker.mind'));
  });
});

describe('Indoor Location fixture', () => {
  const INDOOR_ZIP = join(__dirname, '../../../public/examples/indoor-location-verification.asaps.zip');
  let inBeats: any[];
  let inZip: JSZip;
  let inProject: any;
  beforeAll(async () => {
    inZip = await JSZip.loadAsync(readFileSync(INDOOR_ZIP));
    inProject = JSON.parse(await inZip.file('project.json')!.async('string'));
    inBeats = inProject.project.story.beats;
  });

  it('is a connected graph and closes the replay loop back to the start', () => {
    const ids = new Set(inBeats.map(b => b.id));
    for (const b of inBeats) {
      for (const c of b.connections || []) {
        expect(ids.has(c.targetId), `${b.id} → ${c.targetId} dangles`).toBe(true);
      }
    }
    const end = inBeats.find(b => b.type === 'endScreen');
    expect(end.connections.some((c: any) => c.targetId === 't')).toBe(true);
  });

  it('covers the protocol axes: 3 beacon zones, per-zone targets, honest skip exit first', () => {
    const beat = inBeats.find(b => b.type === 'indoorLocation');
    expect(beat.parameters.mode).toBe('trigger-on-arrival');
    const locs = beat.parameters.xrLocations;
    expect(locs.map((l: any) => l.beaconUuid)).toEqual(['beacon-a', 'beacon-b', 'beacon-c']);
    const ids = new Set(inBeats.map(b => b.id));
    for (const l of locs) expect(ids.has(l.target), `${l.id} target dangles`).toBe(true);
    // honest-fail rules: skips must never masquerade as arrival
    expect(beat.parameters.defaultTarget).toBe('fail');
    expect(beat.connections[0].targetId).toBe('fail'); // honest exit FIRST
    // equidistant determinism is declaration order — zone A must be first
    expect(locs[0].id).toBe('zone_a');
  });

  it('the venue config drives the Mock Sensors sliders (beacons + floor plan asset)', async () => {
    const venue = inProject.project.globalSettings.location.venue;
    expect(venue.beacons.map((b: any) => b.uuid)).toEqual(['beacon-a', 'beacon-b', 'beacon-c']);
    expect(venue.floorWidth).toBe(16);
    // the floor-plan asset rides in the zip with matching metadata
    const assetId = venue.floorPlan;
    const png = inZip.file(`backgrounds/${assetId}_indoor-floorplan.png`);
    expect(png, 'floor plan PNG missing from zip').toBeTruthy();
    const bytes = await png!.async('uint8array');
    expect(bytes.length).toBeGreaterThan(1000);
    expect([...bytes.slice(1, 4)].map(c => String.fromCharCode(c)).join('')).toBe('PNG');
    const meta = JSON.parse(await inZip.file(`backgrounds/${assetId}.json`)!.async('string'));
    expect(meta.id).toBe(assetId);
    expect(meta.type).toBe('image');
    // beacon positions match the zones (same physical spot ⇒ slider maps 1:1)
    const beat = inBeats.find(b => b.type === 'indoorLocation');
    for (const l of beat.parameters.xrLocations) {
      const b = venue.beacons.find((v: any) => v.uuid === l.beaconUuid);
      expect({ x: b.x, y: b.y }).toEqual({ x: l.x, y: l.y });
    }
  });
});
