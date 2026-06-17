/**
 * Tests for PanoramaView (688-line Photo-Sphere-Viewer glue). PSV's Viewer and
 * MarkersPlugin are mocked with fakes that capture the event handlers the
 * component registers, so we can fire 'select-marker' → onHotspotClick and the
 * editor 'click' → onEditorClick(pitch°, yaw°) without WebGL.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';

// vi.mock is hoisted, so the fake + capture maps must be created via vi.hoisted.
const psv = vi.hoisted(() => {
  const viewerEvents: Record<string, (e: any) => void> = {};
  const markerEvents: Record<string, (e: any) => void> = {};
  class FakeViewer {
    state = { ready: true };
    dataHelper = {
      hFovToVFov: (x: number) => x,
      fovToZoomLevel: (x: number) => x,
      zoomLevelToFov: (x: number) => x,
      vFovToHFov: (x: number) => x,
    };
    constructor(_opts: any) {}
    addEventListener(ev: string, cb: (e: any) => void) {
      viewerEvents[ev] = cb;
    }
    removeEventListener() {}
    getPlugin() {
      return {
        addEventListener: (ev: string, cb: (e: any) => void) => {
          markerEvents[ev] = cb;
        },
        removeEventListener: () => {},
        setMarkers: () => {},
        clearMarkers: () => {},
        addMarker: () => {},
        updateMarker: () => {},
      };
    }
    zoom() {}
    setOption() {}
    rotate() {}
    getPosition() {
      return { yaw: 0, pitch: 0 };
    }
    getZoomLevel() {
      return 50;
    }
    destroy() {}
  }
  return { viewerEvents, markerEvents, FakeViewer };
});

vi.mock('@photo-sphere-viewer/core', () => ({ Viewer: psv.FakeViewer }));
vi.mock('@photo-sphere-viewer/markers-plugin', () => ({ MarkersPlugin: class {} }));
vi.mock('@photo-sphere-viewer/core/index.css', () => ({}));
vi.mock('@photo-sphere-viewer/markers-plugin/index.css', () => ({}));

import { PanoramaView } from '../../src/components/PanoramaView';

const viewerEvents = psv.viewerEvents;
const markerEvents = psv.markerEvents;

beforeEach(() => {
  installRendererDomStubs();
  for (const k of Object.keys(viewerEvents)) delete viewerEvents[k];
  for (const k of Object.keys(markerEvents)) delete markerEvents[k];
});

const hotspot = (id: string) => ({ id, yaw: 10, pitch: 0, text: id }) as any;

describe('PanoramaView', () => {
  it('mounts the viewer and registers marker/click handlers', async () => {
    render(
      <PanoramaView panoramaUrl="pano.jpg" hotspots={[hotspot('h1')]} onHotspotClick={vi.fn()} />,
    );
    await waitFor(() => expect(typeof markerEvents['select-marker']).toBe('function'));
    expect(typeof viewerEvents['click']).toBe('function');
  });

  it('fires onHotspotClick when a marker is selected', async () => {
    const onHotspotClick = vi.fn();
    render(<PanoramaView panoramaUrl="pano.jpg" hotspots={[hotspot('door')]} onHotspotClick={onHotspotClick} />);
    await waitFor(() => expect(markerEvents['select-marker']).toBeTruthy());
    await markerEvents['select-marker']({ marker: { data: { hotspotId: 'door' } } });
    expect(onHotspotClick).toHaveBeenCalledWith('door');
  });

  it('ignores a marker-select without a hotspotId', async () => {
    const onHotspotClick = vi.fn();
    render(<PanoramaView panoramaUrl="pano.jpg" hotspots={[hotspot('door')]} onHotspotClick={onHotspotClick} />);
    await waitFor(() => expect(markerEvents['select-marker']).toBeTruthy());
    await markerEvents['select-marker']({ marker: { data: {} } });
    expect(onHotspotClick).not.toHaveBeenCalled();
  });

  it('in editor mode, a viewer click reports pitch/yaw in degrees', async () => {
    const onEditorClick = vi.fn();
    render(
      <PanoramaView
        panoramaUrl="pano.jpg"
        hotspots={[]}
        onHotspotClick={vi.fn()}
        editorMode
        onEditorClick={onEditorClick}
      />,
    );
    await waitFor(() => expect(viewerEvents['click']).toBeTruthy());
    viewerEvents['click']({ data: { pitch: 0, yaw: Math.PI } }); // π rad → 180°
    expect(onEditorClick).toHaveBeenCalledWith(0, 180);
  });

  it('does not report editor clicks when not in editor mode', async () => {
    const onEditorClick = vi.fn();
    render(<PanoramaView panoramaUrl="pano.jpg" hotspots={[]} onHotspotClick={vi.fn()} onEditorClick={onEditorClick} />);
    await waitFor(() => expect(viewerEvents['click']).toBeTruthy());
    viewerEvents['click']({ data: { pitch: 0, yaw: Math.PI } });
    expect(onEditorClick).not.toHaveBeenCalled();
  });
});
