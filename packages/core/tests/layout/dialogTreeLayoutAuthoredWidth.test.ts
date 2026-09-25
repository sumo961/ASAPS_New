/**
 * A choice beyond the authored button slots lines up with them (x, width)
 * instead of the auto column sized to the longest choice (2026-09-25).
 */
import { describe, it, expect } from 'vitest';
import { computeDialogTreeLayout } from '../../src/layout/dialogTreeLayout';

describe('dialogTree layout: unauthored buttons follow the authored column', () => {
  it('inherits x and width from the last authored button', () => {
    const stored = new Map<string, any>([
      ['npc', { kind: 'dialog', name: 'npc', x: 102, y: 50, width: 819, height: 90 }],
      ['choice_0', { kind: 'button', name: 'Choice 0', x: 295, y: 240, width: 456, height: 70 }],
      ['choice_1', { kind: 'button', name: 'Choice 1', x: 295, y: 330, width: 457, height: 70 }],
    ]);
    const layout = computeDialogTreeLayout({
      phase: { id: 'n0', speaker: '', text: 'What do you do?', choices: [
        { id: 'a', text: 'One' }, { id: 'b', text: 'Two' }, { id: 'c', text: 'A third choice with a longer label' },
      ] },
      stageWidth: 1024, stageHeight: 768,
      theme: { fontSize: 16, fontFamily: 'Arial', padding: 20, maxTextWidthRatio: 0.8, maxButtonWidthRatio: 0.6, textButtonGap: 20, buttonGap: 16, startY: 50 },
      storedLocations: stored,
    } as any);
    const third = layout.toLocations().filter((l) => l.kind === 'button')[2];
    expect({ x: third.x, width: third.width }).toEqual({ x: 295, width: 457 });
  });
});
