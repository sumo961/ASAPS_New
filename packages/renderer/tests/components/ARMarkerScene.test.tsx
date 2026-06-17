/**
 * Tests for ARMarkerScene — the mind-ar marker-tracking surface. loadMindAR is
 * mocked with a fake MindARThree whose addAnchor returns capturable anchor
 * objects (so we can fire onTargetFound/onTargetLost) and whose start() we
 * control. Covers the loader-failure + constructor-failure + start-failure
 * error/fallback paths, the tracking "aim" hint, and anchor visibility →
 * onAction(onTap || id).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../src/utils/mindarLoader', () => ({ loadMindAR: vi.fn() }));

import { ARMarkerScene } from '../../src/components/ARMarkerScene';
import { loadMindAR } from '../../src/utils/mindarLoader';

const loadMock = loadMindAR as ReturnType<typeof vi.fn>;

let madeAnchors: any[] = [];
let startImpl: () => Promise<void>;
let ctorThrows = false;

class FakeMindAR {
  constructor(_opts: any) {
    if (ctorThrows) throw new Error('ctor boom');
  }
  addAnchor() {
    const a: any = { onTargetFound: null, onTargetLost: null };
    madeAnchors.push(a);
    return a;
  }
  start = vi.fn(() => startImpl());
  stop = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  madeAnchors = [];
  ctorThrows = false;
  startImpl = () => Promise.resolve();
  loadMock.mockResolvedValue({ MindARThree: FakeMindAR });
});

const anchor = (over: any = {}) => ({ id: 'a1', label: 'Door', onTap: 'go-door', offsetX: 0, offsetY: 0, scale: 1, ...over });

describe('ARMarkerScene', () => {
  it('shows the error overlay + fallback when the tracker fails to load', async () => {
    loadMock.mockRejectedValue(new Error('cdn down'));
    const onFallback = vi.fn();
    const { getByText } = render(<ARMarkerScene markerUrl="m.mind" anchors={[]} onAction={vi.fn()} onFallback={onFallback} />);
    await waitFor(() => expect(getByText(/AR tracker unavailable/i)).toBeTruthy());
    fireEvent.click(getByText('Use simple overlay'));
    expect(onFallback).toHaveBeenCalled();
  });

  it('errors when the MindARThree constructor throws', async () => {
    ctorThrows = true;
    const { getByText } = render(<ARMarkerScene markerUrl="m.mind" anchors={[]} onAction={vi.fn()} onFallback={vi.fn()} />);
    await waitFor(() => expect(getByText(/AR tracker unavailable/i)).toBeTruthy());
  });

  it('errors when start() rejects', async () => {
    startImpl = () => Promise.reject(new Error('no camera'));
    const { getByText } = render(<ARMarkerScene markerUrl="m.mind" anchors={[anchor()]} onAction={vi.fn()} onFallback={vi.fn()} />);
    await waitFor(() => expect(getByText(/AR tracker unavailable/i)).toBeTruthy());
  });

  it('reaches tracking and shows the aim hint when no marker is visible yet', async () => {
    const { getByText } = render(<ARMarkerScene markerUrl="m.mind" anchors={[anchor()]} onAction={vi.fn()} onFallback={vi.fn()} />);
    await waitFor(() => expect(getByText(/Aim at the marker/i)).toBeTruthy());
  });

  it('reveals an anchor on target-found and fires onAction(onTap) when tapped', async () => {
    const onAction = vi.fn();
    const { getByText, queryByText } = render(
      <ARMarkerScene markerUrl="m.mind" anchors={[anchor()]} onAction={onAction} onFallback={vi.fn()} />,
    );
    await waitFor(() => expect(madeAnchors.length).toBe(1));
    expect(queryByText('Door')).toBeNull(); // not visible until found

    act(() => madeAnchors[0].onTargetFound());
    const btn = getByText('Door');
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledWith('go-door');
  });

  it('hides an anchor again on target-lost', async () => {
    const { queryByText } = render(
      <ARMarkerScene markerUrl="m.mind" anchors={[anchor({ onTap: undefined })]} onAction={vi.fn()} onFallback={vi.fn()} />,
    );
    await waitFor(() => expect(madeAnchors.length).toBe(1));
    act(() => madeAnchors[0].onTargetFound());
    expect(queryByText('Door')).not.toBeNull();
    act(() => madeAnchors[0].onTargetLost());
    expect(queryByText('Door')).toBeNull();
  });

  it('falls back to the anchor id for onAction when onTap is unset', async () => {
    const onAction = vi.fn();
    const { getByText } = render(
      <ARMarkerScene markerUrl="m.mind" anchors={[anchor({ onTap: undefined, label: 'Door' })]} onAction={onAction} onFallback={vi.fn()} />,
    );
    await waitFor(() => expect(madeAnchors.length).toBe(1));
    act(() => madeAnchors[0].onTargetFound());
    fireEvent.click(getByText('Door'));
    expect(onAction).toHaveBeenCalledWith('a1'); // id fallback
  });
});
