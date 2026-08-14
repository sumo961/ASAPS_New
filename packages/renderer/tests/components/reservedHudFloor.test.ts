/**
 * reservedHudFloor — how far down a text box must start so it is not drawn
 * under a screen-docked HUD.
 *
 * The rule that matters is "in the way", not "at the top". The mechanism this
 * replaces used a single stage-wide floor derived only from the top-centre
 * countdown, on the reasoning that corner HUDs were timer chips too small to
 * reach centred content. A character meter frame with four counters is not.
 */
import { describe, it, expect } from 'vitest';
import { reservedHudFloor, type ReservedHudRect } from '../../src/components/PositionedBeatView';

const STAGE_H = 768;
// The frame measured in the report: top-left, four counters.
const topLeftFrame: ReservedHudRect = { x: 12, y: 12, width: 200, height: 148 };

describe('reservedHudFloor', () => {
  it('lifts text that passes under a top-corner HUD', () => {
    expect(reservedHudFloor([topLeftFrame], 100, 800, STAGE_H)).toBe(168);
  });

  it('leaves text alone when the HUD is not over it', () => {
    // A text box starting to the right of the frame never touches it, and
    // pushing it down would be a spurious layout change.
    expect(reservedHudFloor([topLeftFrame], 300, 800, STAGE_H)).toBe(0);
  });

  it('treats edge contact as clear, not as overlap', () => {
    // The frame ends at x=212; a box starting exactly there does not overlap.
    expect(reservedHudFloor([topLeftFrame], 212, 800, STAGE_H)).toBe(0);
    expect(reservedHudFloor([topLeftFrame], 211, 800, STAGE_H)).toBe(168);
  });

  it('ignores bottom-anchored HUDs', () => {
    // Lifting text away from a bottom inventory frame would push it further
    // into the frame, not clear of it.
    const bottomInv: ReservedHudRect = { x: 12, y: 600, width: 200, height: 150 };
    expect(reservedHudFloor([bottomInv], 100, 800, STAGE_H)).toBe(0);
  });

  it('clears the lowest of several HUDs it passes under', () => {
    const second: ReservedHudRect = { x: 12, y: 168, width: 200, height: 100 };
    expect(reservedHudFloor([topLeftFrame, second], 100, 800, STAGE_H)).toBe(276);
  });

  it('is inert with no HUDs', () => {
    expect(reservedHudFloor(undefined, 0, 1024, STAGE_H)).toBe(0);
    expect(reservedHudFloor([], 0, 1024, STAGE_H)).toBe(0);
  });
});
