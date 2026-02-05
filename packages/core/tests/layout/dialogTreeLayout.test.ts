/**
 * Tests for DialogTree Layout Module
 */

import { describe, it, expect } from 'vitest';
import {
  computeDialogTreeLayout,
  DEFAULT_DIALOG_TREE_THEME,
  type DialogTreePhase,
  type DialogTreeLayoutInput,
} from '../../src/layout/dialogTreeLayout';
import type { Location } from '../../src/types';

describe('dialogTreeLayout', () => {
  const defaultPhase: DialogTreePhase = {
    id: 'test-phase',
    speaker: 'NPC',
    text: 'Hello, traveler! How can I help you today?',
    choices: [
      { id: 'choice_0', text: 'Tell me about the quest' },
      { id: 'choice_1', text: 'Goodbye' },
    ],
  };

  const defaultInput: DialogTreeLayoutInput = {
    phase: defaultPhase,
    stageWidth: 1024,
    stageHeight: 768,
    theme: DEFAULT_DIALOG_TREE_THEME,
  };

  describe('computeDialogTreeLayout', () => {
    it('should return dialog and buttons', () => {
      const layout = computeDialogTreeLayout(defaultInput);

      expect(layout.dialog).toBeDefined();
      expect(layout.dialog.kind).toBe('dialog');
      expect(layout.dialog.content).toBe(defaultPhase.text);
      expect(layout.dialog.speaker).toBe('NPC');

      expect(layout.buttons).toHaveLength(2);
      expect(layout.buttons[0].kind).toBe('button');
      expect(layout.buttons[0].content).toBe('Tell me about the quest');
      expect(layout.buttons[1].content).toBe('Goodbye');
    });

    it('should center dialog horizontally', () => {
      const layout = computeDialogTreeLayout(defaultInput);

      // Dialog should be roughly centered
      const dialogCenterX = layout.dialog.x + layout.dialog.width / 2;
      const stageCenterX = defaultInput.stageWidth / 2;
      expect(Math.abs(dialogCenterX - stageCenterX)).toBeLessThan(50);
    });

    it('should center buttons horizontally', () => {
      const layout = computeDialogTreeLayout(defaultInput);

      // Buttons should be centered
      layout.buttons.forEach(btn => {
        const btnCenterX = btn.x + btn.width / 2;
        const stageCenterX = defaultInput.stageWidth / 2;
        expect(Math.abs(btnCenterX - stageCenterX)).toBeLessThan(50);
      });
    });

    it('should position buttons below dialog', () => {
      const layout = computeDialogTreeLayout(defaultInput);

      const dialogBottom = layout.dialog.y + layout.dialog.height;
      expect(layout.buttons[0].y).toBeGreaterThan(dialogBottom);
    });

    it('should position buttons vertically stacked', () => {
      const layout = computeDialogTreeLayout(defaultInput);

      const btn0Bottom = layout.buttons[0].y + layout.buttons[0].height;
      expect(layout.buttons[1].y).toBeGreaterThan(btn0Bottom);
    });

    it('should handle empty choices', () => {
      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        phase: {
          ...defaultPhase,
          choices: [],
        },
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.dialog).toBeDefined();
      expect(layout.buttons).toHaveLength(0);
    });

    it('should handle empty text', () => {
      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        phase: {
          ...defaultPhase,
          text: '',
        },
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.dialog).toBeDefined();
      expect(layout.dialog.width).toBeGreaterThanOrEqual(200); // minWidth
    });
  });

  describe('position priority: overrides > storedLocations > auto-calculated', () => {
    it('should apply overrides to dialog position', () => {
      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        overrides: {
          npc: { x: 100, y: 200, width: 300, height: 150 },
        },
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.dialog.x).toBe(100);
      expect(layout.dialog.y).toBe(200);
      expect(layout.dialog.width).toBe(300);
      expect(layout.dialog.height).toBe(150);
    });

    it('should apply overrides to button positions', () => {
      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        overrides: {
          choice_0: { x: 50, y: 300, width: 200, height: 60 },
        },
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.buttons[0].x).toBe(50);
      expect(layout.buttons[0].y).toBe(300);
      expect(layout.buttons[0].width).toBe(200);
      // Height might be adjusted to ensure text fits
      expect(layout.buttons[0].height).toBeGreaterThanOrEqual(60);
    });

    it('should use storedLocations when no overrides', () => {
      const storedLocations = new Map<string, Location>();
      storedLocations.set('dialog_loc', {
        kind: 'dialog',
        name: 'npc',
        x: 150,
        y: 80,
        width: 400,
        height: 120,
      });

      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        storedLocations,
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.dialog.x).toBe(150);
      expect(layout.dialog.y).toBe(80);
    });

    it('should prefer overrides over storedLocations', () => {
      const storedLocations = new Map<string, Location>();
      storedLocations.set('dialog_loc', {
        kind: 'dialog',
        name: 'npc',
        x: 150,
        y: 80,
        width: 400,
        height: 120,
      });

      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        storedLocations,
        overrides: {
          npc: { x: 200, y: 100 },
        },
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.dialog.x).toBe(200);
      expect(layout.dialog.y).toBe(100);
      // Width/height should come from storedLocations since not in override
      expect(layout.dialog.width).toBe(400);
      expect(layout.dialog.height).toBe(120);
    });

    it('should apply z-index from overrides', () => {
      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        overrides: {
          npc: { z: 10 },
          choice_0: { z: 5 },
        },
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.dialog.z).toBe(10);
      expect(layout.buttons[0].z).toBe(5);
    });
  });

  describe('toLocations()', () => {
    it('should convert layout to Location array', () => {
      const layout = computeDialogTreeLayout(defaultInput);
      const locations = layout.toLocations();

      expect(locations.length).toBe(3); // 1 dialog + 2 buttons
      expect(locations[0].kind).toBe('dialog');
      expect(locations[0].name).toBe('npc');
      expect(locations[1].kind).toBe('button');
      expect(locations[2].kind).toBe('button');
    });

    it('should include correct positions in Location', () => {
      const layout = computeDialogTreeLayout(defaultInput);
      const locations = layout.toLocations();

      const dialogLoc = locations.find(l => l.kind === 'dialog')!;
      expect(dialogLoc.x).toBe(layout.dialog.x);
      expect(dialogLoc.y).toBe(layout.dialog.y);
      expect(dialogLoc.width).toBe(layout.dialog.width);
      expect(dialogLoc.height).toBe(layout.dialog.height);
    });
  });

  describe('toVisualElements()', () => {
    it('should convert layout to VisualElement-compatible objects', () => {
      const layout = computeDialogTreeLayout(defaultInput);
      const elements = layout.toVisualElements();

      expect(elements.length).toBe(3); // 1 dialog + 2 buttons
      expect(elements[0].type).toBe('dialog');
      expect(elements[0].id).toBe('npc');
      expect(elements[1].type).toBe('button');
      expect(elements[2].type).toBe('button');
    });

    it('should include all required VisualElement properties', () => {
      const layout = computeDialogTreeLayout(defaultInput);
      const elements = layout.toVisualElements();

      const dialogEl = elements[0];
      expect(dialogEl.id).toBeDefined();
      expect(dialogEl.type).toBeDefined();
      expect(dialogEl.name).toBeDefined();
      expect(dialogEl.text).toBeDefined();
      expect(dialogEl.x).toBeDefined();
      expect(dialogEl.y).toBeDefined();
      expect(dialogEl.width).toBeDefined();
      expect(dialogEl.height).toBeDefined();
      expect(dialogEl.z).toBeDefined();
      expect(dialogEl.rotation).toBe(0);
      expect(dialogEl.scale).toBe(1);
      expect(dialogEl.visible).toBe(true);
      expect(dialogEl.locked).toBe(false);
    });

    it('should use z from override or default incremental z', () => {
      // Without overrides - incremental z
      const layout1 = computeDialogTreeLayout(defaultInput);
      const elements1 = layout1.toVisualElements();
      expect(elements1[0].z).toBe(0); // dialog default
      expect(elements1[1].z).toBe(1); // button 0
      expect(elements1[2].z).toBe(2); // button 1

      // With z override
      const input2: DialogTreeLayoutInput = {
        ...defaultInput,
        overrides: {
          npc: { z: 100 },
          choice_1: { z: 50 },
        },
      };
      const layout2 = computeDialogTreeLayout(input2);
      const elements2 = layout2.toVisualElements();
      expect(elements2[0].z).toBe(100); // from override
      expect(elements2[1].z).toBe(1);   // default incremental
      expect(elements2[2].z).toBe(50);  // from override
    });

    it('should include speaker in dialog element', () => {
      const layout = computeDialogTreeLayout(defaultInput);
      const elements = layout.toVisualElements();

      const dialogEl = elements.find(e => e.type === 'dialog')!;
      expect(dialogEl.speaker).toBe('NPC');
      expect(dialogEl.name).toBe('NPC: NPC');
    });
  });

  describe('button height safeguard', () => {
    it('should ensure button height is at least calculated height', () => {
      // Simulate ASML import with old stored heights that are too small
      const storedLocations = new Map<string, Location>();
      storedLocations.set('btn_0', {
        kind: 'button',
        name: 'choice',
        x: 200,
        y: 200,
        width: 300,
        height: 30, // Too small for multi-line text
      });

      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        phase: {
          ...defaultPhase,
          choices: [
            {
              id: 'choice_0',
              text: 'This is a very long choice text that will definitely need multiple lines to display properly and should not be clipped',
            },
          ],
        },
        storedLocations,
      };

      const layout = computeDialogTreeLayout(input);
      // Height should be at least the calculated height, not the stored 30px
      expect(layout.buttons[0].height).toBeGreaterThan(30);
    });

    it('should use stored height if larger than calculated', () => {
      const storedLocations = new Map<string, Location>();
      storedLocations.set('btn_0', {
        kind: 'button',
        name: 'choice',
        x: 200,
        y: 200,
        width: 300,
        height: 200, // Much larger than needed
      });

      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        phase: {
          ...defaultPhase,
          choices: [
            { id: 'choice_0', text: 'Short' },
          ],
        },
        storedLocations,
      };

      const layout = computeDialogTreeLayout(input);
      // Should use the larger stored height
      expect(layout.buttons[0].height).toBe(200);
    });
  });

  describe('WYSIWYG guarantee', () => {
    it('should produce identical positions from toLocations and toVisualElements', () => {
      const layout = computeDialogTreeLayout(defaultInput);
      const locations = layout.toLocations();
      const elements = layout.toVisualElements();

      // Dialog positions should match
      const dialogLoc = locations.find(l => l.kind === 'dialog')!;
      const dialogEl = elements.find(e => e.type === 'dialog')!;
      expect(dialogLoc.x).toBe(dialogEl.x);
      expect(dialogLoc.y).toBe(dialogEl.y);
      expect(dialogLoc.width).toBe(dialogEl.width);
      expect(dialogLoc.height).toBe(dialogEl.height);

      // Button positions should match
      const buttonLocs = locations.filter(l => l.kind === 'button');
      const buttonEls = elements.filter(e => e.type === 'button');
      buttonLocs.forEach((loc, idx) => {
        expect(loc.x).toBe(buttonEls[idx].x);
        expect(loc.y).toBe(buttonEls[idx].y);
        expect(loc.width).toBe(buttonEls[idx].width);
        expect(loc.height).toBe(buttonEls[idx].height);
      });
    });
  });

  describe('theme customization', () => {
    it('should respect custom startY', () => {
      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        theme: {
          ...DEFAULT_DIALOG_TREE_THEME,
          startY: 100,
        },
      };

      const layout = computeDialogTreeLayout(input);
      // Without overrides, dialog should start at custom startY
      expect(layout.dialog.y).toBe(100);
    });

    it('should respect custom textButtonGap', () => {
      const smallGapInput: DialogTreeLayoutInput = {
        ...defaultInput,
        theme: {
          ...DEFAULT_DIALOG_TREE_THEME,
          textButtonGap: 10,
        },
      };

      const largeGapInput: DialogTreeLayoutInput = {
        ...defaultInput,
        theme: {
          ...DEFAULT_DIALOG_TREE_THEME,
          textButtonGap: 50,
        },
      };

      const smallGapLayout = computeDialogTreeLayout(smallGapInput);
      const largeGapLayout = computeDialogTreeLayout(largeGapInput);

      const smallGap = smallGapLayout.buttons[0].y - (smallGapLayout.dialog.y + smallGapLayout.dialog.height);
      const largeGap = largeGapLayout.buttons[0].y - (largeGapLayout.dialog.y + largeGapLayout.dialog.height);

      expect(largeGap).toBeGreaterThan(smallGap);
    });

    it('should respect custom buttonGap', () => {
      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        theme: {
          ...DEFAULT_DIALOG_TREE_THEME,
          buttonGap: 30,
        },
      };

      const layout = computeDialogTreeLayout(input);
      const gap = layout.buttons[1].y - (layout.buttons[0].y + layout.buttons[0].height);
      expect(gap).toBe(30);
    });
  });

  describe('legacy ASML support', () => {
    it('should accept "text" kind as dialog from storedLocations', () => {
      const storedLocations = new Map<string, Location>();
      storedLocations.set('text_loc', {
        kind: 'text' as Location['kind'], // Legacy ASML uses 'text' instead of 'dialog'
        name: 'npc_text',
        x: 100,
        y: 50,
        width: 500,
        height: 150,
      });

      const input: DialogTreeLayoutInput = {
        ...defaultInput,
        storedLocations,
      };

      const layout = computeDialogTreeLayout(input);
      expect(layout.dialog.x).toBe(100);
      expect(layout.dialog.y).toBe(50);
    });
  });
});
