// A scaled-down figure shrinks toward its centre; clamping its outline to
// x >= 0 pushed it right with no way back (2026-10-20).
import { describe, it, expect } from 'vitest';
import { clampOnStage } from '../VisualBeatEditor';

describe('clampOnStage', () => {
  it('allows partly off-stage positions but keeps a 24 px strip on stage', () => {
    expect(clampOnStage(-20, 200, 1024)).toBe(-20);
    expect(clampOnStage(-500, 200, 1024)).toBe(24 - 200);
    expect(clampOnStage(2000, 200, 1024)).toBe(1024 - 24);
    expect(clampOnStage(-5, 10, 1024)).toBe(0); // smaller than the strip: stays fully on
  });
});
