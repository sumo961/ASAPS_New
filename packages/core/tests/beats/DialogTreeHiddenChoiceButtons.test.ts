/**
 * Fixed canvas + conditional dialog choices (2026-09-25): the layout placed
 * a button for every choice in the node, the renderer got only the visible
 * choices, and the positioned view drew an orphan button per hidden choice
 * labelled with a visible choice's text ("Take the call" ×6).
 */
import { describe, it, expect } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

const onlyIn = (variant: string) => [{ type: 'variable', variableName: 'CaseVariant', operator: '==', value: variant }];
const notIn = (variant: string) => [{ type: 'variable', variableName: 'CaseVariant', operator: '!=', value: variant }];

function beat() {
  return new DialogTreeBeat({
    id: 'b3', type: 'dialogTree',
    locations: [
      { id: 'npc', kind: 'dialog', name: 'NPC', x: 100, y: 50, width: 800, height: 90 },
      { id: 'choice_0', kind: 'button', name: 'Choice 0', x: 300, y: 240, width: 450, height: 70 },
      { id: 'choice_1', kind: 'button', name: 'Choice 1', x: 300, y: 330, width: 450, height: 70 },
    ],
    parameters: { dialogTree: { id: 'n0', speaker: 'N', text: 'What do you do?', choices: [
      { id: 'read', text: 'Read the file', target: 'x', conditions: notIn('C') },
      { id: 'parents', text: 'Call the parents', target: 'x', conditions: notIn('C') },
      { id: 'take', text: 'Take the call', target: 'y', conditions: onlyIn('C') },
      { id: 'voicemail', text: 'Let it go to voicemail', target: 'y', conditions: onlyIn('C') },
    ] } },
  } as any);
}

describe('dialogTree hidden choices in fixed layout', () => {
  for (const [variant, expected] of [['A', ['Read the file', 'Call the parents']], ['C', ['Take the call', 'Let it go to voicemail']]] as const) {
    it(`variant ${variant}: one button location per visible choice, none for hidden ones`, async () => {
      const ctx = makeContext((c) => c.setVariable('CaseVariant', variant));
      const { renderer, methods } = makeRenderer();
      void beat().execute(ctx, renderer).catch(() => {});
      await new Promise((r) => setTimeout(r, 20));
      const [choices, locations] = methods.renderChoices.mock.calls[0] as any[];
      expect(choices.map((c: any) => c.text)).toEqual(expected);
      const buttons = locations.filter((l: any) => l.kind === 'button');
      expect(buttons.map((l: any) => l.name)).toEqual(expected);
      // One column (the authored x/width), stacked without gaps in choice order.
      expect(buttons.map((l: any) => [l.x, l.width])).toEqual([[300, 450], [300, 450]]);
      expect(buttons[1].y).toBeGreaterThan(buttons[0].y + buttons[0].height);
      expect(buttons[1].y - (buttons[0].y + buttons[0].height)).toBeLessThanOrEqual(20);
    });
  }
});
