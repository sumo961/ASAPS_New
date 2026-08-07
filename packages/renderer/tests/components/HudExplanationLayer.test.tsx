/**
 * HudExplanationLayer — callouts must follow the packer, never a hardcoded
 * corner, and the overlay trigger must actually gate forward progress.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { HudExplanationLayer, DEFAULT_HUD_CAPTIONS } from '../../src/components/HudExplanationLayer';
import { layoutScreenHuds, placementMap, type HudBox } from '../../src/utils/hudLayout';

const stage = { width: 1024, height: 768 };

function setup(boxes: HudBox[], props: Partial<React.ComponentProps<typeof HudExplanationLayer>> = {}) {
  const placements = placementMap(layoutScreenHuds(boxes, stage));
  return render(
    <HudExplanationLayer boxes={boxes} placements={placements} stage={stage} {...props} />,
  );
}

const TIMER: HudBox = { id: '__timer', corner: 'top-right', width: 160, height: 40, kind: 'timer' };
const MOOD: HudBox = { id: 'mood-rail-top-left', corner: 'top-left', width: 200, height: 54, kind: 'mood' };

describe('HudExplanationLayer', () => {
  it('annotates every HUD that is actually on screen', () => {
    setup([TIMER, MOOD]);
    expect(screen.getByText(DEFAULT_HUD_CAPTIONS.timer)).toBeTruthy();
    expect(screen.getByText(DEFAULT_HUD_CAPTIONS.mood)).toBeTruthy();
  });

  it('renders nothing when there are no HUDs to explain', () => {
    const { container } = setup([]);
    expect(container.querySelector('[data-testid="hud-explanation-layer"]')).toBeNull();
  });

  it('uses author caption overrides and falls back per kind', () => {
    setup([TIMER, MOOD], { captions: { timer: 'Story clock' } });
    expect(screen.getByText('Story clock')).toBeTruthy();
    expect(screen.getByText(DEFAULT_HUD_CAPTIONS.mood)).toBeTruthy();
  });

  it('skips kinds the author opted out of', () => {
    setup([TIMER, MOOD], { skipKinds: ['mood'] });
    expect(screen.getByText(DEFAULT_HUD_CAPTIONS.timer)).toBeTruthy();
    expect(screen.queryByText(DEFAULT_HUD_CAPTIONS.mood)).toBeNull();
  });

  it('positions callouts from the packer, not a fixed corner', () => {
    // Two HUDs stacked in the SAME corner must get vertically distinct
    // callouts — the regression guard against hardcoded placement.
    const second: HudBox = { id: 'meter-x', corner: 'top-right', width: 140, height: 70, kind: 'meter' };
    const { container } = setup([TIMER, second]);
    const tops = [...container.querySelectorAll('[data-hud-callout]')]
      .map((el) => (el as HTMLElement).style.top);
    expect(new Set(tops).size).toBe(2);
  });

  it('keeps callouts inside the stage on a narrow viewport', () => {
    const placements = placementMap(layoutScreenHuds([TIMER], { width: 320, height: 480 }));
    const { container } = render(
      <HudExplanationLayer boxes={[TIMER]} placements={placements} stage={{ width: 320, height: 480 }} />,
    );
    const el = container.querySelector('[data-hud-callout]') as HTMLElement;
    expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(el.style.left)).toBeLessThanOrEqual(320);
  });

  describe('input gating', () => {
    it('overlay trigger swallows clicks aimed at the beat beneath', () => {
      const { container } = setup([TIMER], { onAcknowledge: vi.fn() });
      const layer = container.querySelector('[data-testid="hud-explanation-layer"]') as HTMLElement;
      expect(layer.style.pointerEvents).toBe('auto');
    });

    it('standalone beat leaves its own continue button reachable', () => {
      const { container } = setup([TIMER]);
      const layer = container.querySelector('[data-testid="hud-explanation-layer"]') as HTMLElement;
      expect(layer.style.pointerEvents).toBe('none');
    });

    it('dims the beat only for the overlay trigger', () => {
      // The scrim is what separates the acknowledge control from the beat's own
      // brass button beneath it. The standalone beat must NOT dim its own screen.
      const { container: overlay } = setup([TIMER], { onAcknowledge: vi.fn() });
      expect(overlay.querySelector('[data-testid="hud-explanation-scrim"]')).toBeTruthy();

      const { container: standalone } = setup([TIMER]);
      expect(standalone.querySelector('[data-testid="hud-explanation-scrim"]')).toBeNull();
    });

    it('centres the acknowledge — the one region the corner packer never uses', () => {
      // Every HUD lands in one of six corners, so dead centre cannot collide
      // with one however the stack re-packs.
      const { container } = setup([TIMER], { onAcknowledge: vi.fn() });
      const btn = container.querySelector('[data-testid="hud-explanation-acknowledge"]') as HTMLElement;
      expect(btn.style.left).toBe('50%');
      expect(btn.style.top).toBe('50%');
      expect(btn.style.transform).toContain('translate(-50%, -50%)');
    });

    it('matches the story buttons (accent pill) so it reads as a real button', () => {
      const { container } = setup([TIMER], {
        onAcknowledge: vi.fn(), accentColor: '#d9a441', accentTextColor: '#201607',
      });
      const btn = container.querySelector('[data-testid="hud-explanation-acknowledge"]') as HTMLElement;
      expect(btn.style.borderRadius).toBe('999px');
      expect(btn.style.background).toContain('217, 164, 65');
      expect(btn.style.color).toContain('32, 22, 7');
    });

    it('shows an acknowledge button only for the overlay trigger', () => {
      const onAcknowledge = vi.fn();
      const { rerender } = setup([TIMER], { onAcknowledge, acknowledgeText: 'Understood' });
      fireEvent.click(screen.getByText('Understood'));
      expect(onAcknowledge).toHaveBeenCalledOnce();

      const placements = placementMap(layoutScreenHuds([TIMER], stage));
      rerender(<HudExplanationLayer boxes={[TIMER]} placements={placements} stage={stage} />);
      expect(screen.queryByText('Got it')).toBeNull();
    });
  });
});
