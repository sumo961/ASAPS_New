/**
 * Mount + interaction tests for SpatialFlowView (920-line image-layer + flow
 * composite). spatial spec comes from the real getSpatialSpec(beatType). With
 * no dynamicActions the read-gate starts earned, so hotspot buttons are
 * immediately clickable → onAction(hotspotId). Browser-API gaps stubbed via
 * installRendererDomStubs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { SpatialFlowView } from '../../src/components/SpatialFlowView';
import { getSpatialSpec } from '../../src/utils/slotLayout';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';

beforeEach(() => installRendererDomStubs());

const spec = () => getSpatialSpec('movementChoice')!;

describe('SpatialFlowView', () => {
  it('has a spatial spec for movementChoice', () => {
    expect(spec()).toBeTruthy();
  });

  it('mounts and composes the flow content', async () => {
    const { container } = render(
      <SpatialFlowView
        beatType="movementChoice"
        spatial={spec()}
        content={{ question: 'Which way through the harbor?' }}
        backgroundColor="#101010"
        onAction={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain('Which way through the harbor?'));
  });

  it('renders hotspot buttons and fires onAction on click (gate earned, no dynamic actions)', async () => {
    const onAction = vi.fn();
    const { getByLabelText } = render(
      <SpatialFlowView
        beatType="movementChoice"
        spatial={spec()}
        content={{ question: 'Pick a door.' }}
        backgroundColor="#101010"
        hotspots={[{ id: 'door-left', label: 'Left Door', x: 0.2, y: 0.4, width: 0.2, height: 0.2 } as any]}
        showHotspotOutlines
        onAction={onAction}
      />,
    );
    const hotspot = await waitFor(() => getByLabelText('Left Door'));
    expect((hotspot as HTMLButtonElement).disabled).toBe(false); // gate earned (no dynamicActions)
    fireEvent.click(hotspot);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('door-left'));
  });

  it('falls back to the hotspot id for the aria-label when no label is set', async () => {
    const { getByLabelText } = render(
      <SpatialFlowView
        beatType="movementChoice"
        spatial={spec()}
        content={{ question: 'Q' }}
        backgroundColor="#101010"
        hotspots={[{ id: 'plain', x: 0.5, y: 0.5, width: 0.1, height: 0.1 } as any]}
        showHotspotOutlines
        onAction={vi.fn()}
      />,
    );
    await waitFor(() => expect(getByLabelText('plain')).toBeTruthy());
  });

  it('paints the backdrop color when no image is present', async () => {
    const { container } = render(
      <SpatialFlowView
        beatType="movementChoice"
        spatial={spec()}
        content={{ question: 'Q' }}
        backgroundColor="rgb(9, 9, 9)"
        onAction={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('*')).toBeTruthy());
    expect(container.innerHTML).toContain('rgb(9, 9, 9)');
  });
});
