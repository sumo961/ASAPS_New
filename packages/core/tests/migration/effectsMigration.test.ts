/**
 * Tests for the effects migration utility
 * Verifies conversion of flat counter fields → canonical effects and dead entry cleanup
 */
import { describe, it, expect } from 'vitest';
import { migrateChoiceEffects, migrateDialogTreeEffects } from '../../src/migration/effectsMigration';

describe('effectsMigration', () => {
  describe('migrateChoiceEffects', () => {
    it('should convert flat counter fields with change operation to incrementCounter effect', () => {
      const choice: any = {
        id: 'c1',
        text: 'Go north',
        counter: 'courage',
        counterOperation: 'change',
        counterValue: 5,
      };

      migrateChoiceEffects(choice);

      expect(choice.counter).toBeUndefined();
      expect(choice.counterOperation).toBeUndefined();
      expect(choice.counterValue).toBeUndefined();
      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'courage', value: 5 },
      ]);
    });

    it('should convert flat counter fields with set operation to setCounter effect', () => {
      const choice: any = {
        id: 'c1',
        text: 'Be brave',
        counter: 'courage',
        counterOperation: 'set',
        counterValue: 10,
      };

      migrateChoiceEffects(choice);

      expect(choice.counter).toBeUndefined();
      expect(choice.effects).toEqual([
        { type: 'setCounter', target: 'courage', value: 10 },
      ]);
    });

    it('should default to incrementCounter when counterOperation is missing', () => {
      const choice: any = {
        id: 'c1',
        counter: 'gold',
        counterValue: 3,
      };

      migrateChoiceEffects(choice);

      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'gold', value: 3 },
      ]);
    });

    it('should default counterValue to 1 when missing', () => {
      const choice: any = {
        id: 'c1',
        counter: 'visits',
      };

      migrateChoiceEffects(choice);

      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'visits', value: 1 },
      ]);
    });

    it('should remove dead type: "counter" entries from effects array', () => {
      const choice: any = {
        id: 'c1',
        effects: [
          { type: 'counter', counter: 'health', operation: 'add', value: 5 },
          { type: 'setVariable', target: 'visited', value: true },
        ],
      };

      migrateChoiceEffects(choice);

      expect(choice.effects).toEqual([
        { type: 'setVariable', target: 'visited', value: true },
      ]);
    });

    it('should remove dead type: "counter" AND convert flat fields', () => {
      const choice: any = {
        id: 'c1',
        effects: [
          { type: 'counter', counter: 'health', operation: 'add', value: 5 },
        ],
        counter: 'health',
        counterOperation: 'change',
        counterValue: 5,
      };

      migrateChoiceEffects(choice);

      // Dead entry removed, flat fields converted to canonical
      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'health', value: 5 },
      ]);
      expect(choice.counter).toBeUndefined();
    });

    it('should not duplicate if canonical effect already exists for same counter', () => {
      const choice: any = {
        id: 'c1',
        effects: [
          { type: 'incrementCounter', target: 'health', value: 5 },
        ],
        counter: 'health',
        counterOperation: 'change',
        counterValue: 5,
      };

      migrateChoiceEffects(choice);

      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'health', value: 5 },
      ]);
    });

    it('should preserve existing valid effects when no flat fields present', () => {
      const choice: any = {
        id: 'c1',
        effects: [
          { type: 'setVariable', target: 'flag', value: true },
          { type: 'addInventory', target: 'sword' },
        ],
      };

      migrateChoiceEffects(choice);

      expect(choice.effects).toEqual([
        { type: 'setVariable', target: 'flag', value: true },
        { type: 'addInventory', target: 'sword' },
      ]);
    });

    it('should handle choice with no counter fields or effects gracefully', () => {
      const choice: any = {
        id: 'c1',
        text: 'Hello',
      };

      migrateChoiceEffects(choice);

      expect(choice.counter).toBeUndefined();
      expect(choice.effects).toBeUndefined();
    });

    it('should handle null/undefined choice gracefully', () => {
      expect(migrateChoiceEffects(null as any)).toBeNull();
      expect(migrateChoiceEffects(undefined as any)).toBeUndefined();
    });

    it('should handle counterValue of 0 correctly', () => {
      const choice: any = {
        id: 'c1',
        counter: 'score',
        counterOperation: 'set',
        counterValue: 0,
      };

      migrateChoiceEffects(choice);

      expect(choice.effects).toEqual([
        { type: 'setCounter', target: 'score', value: 0 },
      ]);
    });

    it('should handle negative counterValue', () => {
      const choice: any = {
        id: 'c1',
        counter: 'health',
        counterOperation: 'change',
        counterValue: -10,
      };

      migrateChoiceEffects(choice);

      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'health', value: -10 },
      ]);
    });
  });

  describe('migrateDialogTreeEffects', () => {
    it('should migrate flat counter fields on all choices in a node', () => {
      const node: any = {
        id: 'root',
        speaker: 'NPC',
        text: 'Hello',
        choices: [
          { id: 'c1', text: 'A', counter: 'a', counterOperation: 'change', counterValue: 1 },
          { id: 'c2', text: 'B', counter: 'b', counterOperation: 'set', counterValue: 5 },
          { id: 'c3', text: 'C' }, // No counter
        ],
      };

      migrateDialogTreeEffects(node);

      expect(node.choices[0].counter).toBeUndefined();
      expect(node.choices[0].effects).toEqual([
        { type: 'incrementCounter', target: 'a', value: 1 },
      ]);
      expect(node.choices[1].effects).toEqual([
        { type: 'setCounter', target: 'b', value: 5 },
      ]);
      expect(node.choices[2].effects).toBeUndefined();
    });

    it('should recurse into nested dialogNodes', () => {
      const node: any = {
        id: 'root',
        choices: [
          {
            id: 'c1',
            text: 'A',
            dialogNode: {
              id: 'inner',
              choices: [
                { id: 'ic1', text: 'Inner', counter: 'deep', counterOperation: 'change', counterValue: 3 },
              ],
            },
          },
        ],
      };

      migrateDialogTreeEffects(node);

      const innerChoice = node.choices[0].dialogNode.choices[0];
      expect(innerChoice.counter).toBeUndefined();
      expect(innerChoice.effects).toEqual([
        { type: 'incrementCounter', target: 'deep', value: 3 },
      ]);
    });

    it('should handle deeply nested dialog trees (3+ levels)', () => {
      const node: any = {
        id: 'root',
        choices: [
          {
            id: 'c1',
            dialogNode: {
              id: 'level2',
              choices: [
                {
                  id: 'c2',
                  dialogNode: {
                    id: 'level3',
                    choices: [
                      { id: 'c3', counter: 'deep_counter', counterValue: 99 },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      migrateDialogTreeEffects(node);

      const deepChoice = node.choices[0].dialogNode.choices[0].dialogNode.choices[0];
      expect(deepChoice.counter).toBeUndefined();
      expect(deepChoice.effects).toEqual([
        { type: 'incrementCounter', target: 'deep_counter', value: 99 },
      ]);
    });

    it('should handle null/undefined node gracefully', () => {
      expect(() => migrateDialogTreeEffects(null)).not.toThrow();
      expect(() => migrateDialogTreeEffects(undefined)).not.toThrow();
    });

    it('should handle node with no choices', () => {
      const node: any = { id: 'root', speaker: 'NPC', text: 'End' };
      expect(() => migrateDialogTreeEffects(node)).not.toThrow();
    });
  });
});
