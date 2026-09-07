/**
 * Spatial beats reserved nothing against screen HUDs: the question/choice
 * panel of a hotspot or map beat sat under the meters while every other beat
 * type stepped around them. This pins the plumbing — the rects and the live
 * subscription must reach the inner SlotFlowView, which owns the reserve
 * logic (tested elsewhere). jsdom cannot evaluate the resulting
 * `max(env(...), Npx)` padding, so the inner view is stubbed and its props read.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';

vi.mock('../../src/components/SlotFlowView', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    SlotFlowView: (props: any) => (
      <div
        data-testid="slot-stub"
        data-reserved={JSON.stringify(props.reservedHudRects ?? null)}
        data-subscribe={typeof props.onSubscribeReservedHudRects}
      />
    ),
  };
});

import { SpatialFlowView } from '../../src/components/SpatialFlowView';
import { getSpatialSpec } from '../../src/utils/slotLayout';

beforeEach(() => installRendererDomStubs());

describe('SpatialFlowView — screen-HUD reservation plumbing', () => {
  it('threads reservedHudRects and the subscription to the flow layer', async () => {
    const rects = [{ x: 200, y: 0, width: 620, height: 60 }];
    const unsubscribe = vi.fn();
    const { getByTestId } = render(
      <SpatialFlowView
        beatType="movementChoice"
        spatial={getSpatialSpec('movementChoice')!}
        content={{ question: 'Where to?' }}
        backgroundColor="#101010"
        reservedHudRects={rects}
        onSubscribeReservedHudRects={() => unsubscribe}
        onAction={vi.fn()}
      />,
    );
    const stub = await waitFor(() => getByTestId('slot-stub'));
    expect(JSON.parse(stub.getAttribute('data-reserved')!)).toEqual(rects);
    expect(stub.getAttribute('data-subscribe')).toBe('function');
  });

  it('passes nothing when the host reserves nothing', async () => {
    const { getByTestId } = render(
      <SpatialFlowView beatType="movementChoice" spatial={getSpatialSpec('movementChoice')!} content={{ question: 'Q' }} backgroundColor="#101010" onAction={vi.fn()} />,
    );
    const stub = await waitFor(() => getByTestId('slot-stub'));
    expect(stub.getAttribute('data-reserved')).toBe('null');
    expect(stub.getAttribute('data-subscribe')).toBe('undefined');
  });
});
