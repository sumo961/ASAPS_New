/**
 * Integration tests for the effects migration in beat constructors and runtime.
 * Verifies that:
 * 1. Beat constructors migrate flat counter fields to canonical effects
 * 2. Runtime applies effects correctly after migration
 * 3. setCounter effect type works in StoryContext.applyEffect()
 * 4. Backward compatibility: beats with pre-existing canonical effects still work
 * 5. Mixed old + new format works correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { MovementChoiceBeat } from '../../src/beats/MovementChoiceBeat';
import { PickPropBeat } from '../../src/beats/PickPropBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

describe('Effects Migration Integration', () => {
  let context: StoryContext;
  let mockRenderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    mockRenderer = {
      renderMovement: vi.fn().mockResolvedValue('choice1'),
      renderPropSelection: vi.fn().mockResolvedValue('prop1'),
      renderDialog: vi.fn().mockResolvedValue(undefined),
      renderChoices: vi.fn().mockResolvedValue('c1'),
      playSound: vi.fn().mockResolvedValue(undefined),
      setState: vi.fn(),
      getState: vi.fn(),
      clearChatHistory: vi.fn(),
    } as unknown as IRenderer;
  });

  describe('StoryContext.applyEffect - setCounter', () => {
    it('should handle setCounter effect type', () => {
      context.setCounter('health', 50);
      context.applyEffect({ type: 'setCounter', target: 'health', value: 100 });
      expect(context.getCounter('health')).toBe(100);
    });

    it('should set counter to 0 when value is 0', () => {
      context.setCounter('score', 50);
      context.applyEffect({ type: 'setCounter', target: 'score', value: 0 });
      expect(context.getCounter('score')).toBe(0);
    });

    it('should default to 0 when value is undefined', () => {
      context.setCounter('score', 50);
      context.applyEffect({ type: 'setCounter', target: 'score' });
      expect(context.getCounter('score')).toBe(0);
    });

    it('should create counter if it does not exist', () => {
      context.applyEffect({ type: 'setCounter', target: 'newCounter', value: 42 });
      expect(context.getCounter('newCounter')).toBe(42);
    });
  });

  describe('DialogTreeBeat - constructor migration', () => {
    it('should migrate flat counter fields on choices to canonical effects', () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hi',
          choices: [
            {
              id: 'c1',
              text: 'Brave',
              target: 'next',
              counter: 'courage',
              counterOperation: 'change',
              counterValue: 5,
            },
          ],
        },
      });

      const params = beat.getParameters();
      const choice = params.dialogTree.choices[0];

      // Flat fields should be removed
      expect(choice.counter).toBeUndefined();
      expect(choice.counterOperation).toBeUndefined();
      expect(choice.counterValue).toBeUndefined();

      // Canonical effect should exist
      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'courage', value: 5 },
      ]);
    });

    it('should migrate set operation to setCounter effect', () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hi',
          choices: [
            {
              id: 'c1',
              text: 'Reset',
              target: 'next',
              counter: 'score',
              counterOperation: 'set',
              counterValue: 0,
            },
          ],
        },
      });

      const choice = beat.getParameters().dialogTree.choices[0];
      expect(choice.effects).toEqual([
        { type: 'setCounter', target: 'score', value: 0 },
      ]);
    });

    it('should remove dead type: "counter" effects from ASML import', () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hi',
          choices: [
            {
              id: 'c1',
              text: 'Go',
              target: 'next',
              effects: [
                { type: 'counter', counter: 'health', operation: 'add', value: 5 },
              ],
              counter: 'health',
              counterOperation: 'change',
              counterValue: 5,
            },
          ],
        },
      });

      const choice = beat.getParameters().dialogTree.choices[0];
      // Dead entry removed, flat fields converted
      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'health', value: 5 },
      ]);
    });

    it('should migrate nested dialog tree choices', () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hi',
          choices: [
            {
              id: 'c1',
              text: 'Talk',
              dialogNode: {
                id: 'inner',
                speaker: 'NPC',
                text: 'Response',
                choices: [
                  {
                    id: 'ic1',
                    text: 'Great',
                    target: 'next',
                    counter: 'friendship',
                    counterOperation: 'change',
                    counterValue: 2,
                  },
                ],
              },
            },
          ],
        },
      });

      const innerChoice = beat.getParameters().dialogTree.choices[0].dialogNode.choices[0];
      expect(innerChoice.counter).toBeUndefined();
      expect(innerChoice.effects).toEqual([
        { type: 'incrementCounter', target: 'friendship', value: 2 },
      ]);
    });

    it('should preserve existing canonical effects during migration', () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hi',
          choices: [
            {
              id: 'c1',
              text: 'Go',
              target: 'next',
              effects: [
                { type: 'setVariable', target: 'visited', value: true },
                { type: 'addInventory', target: 'key' },
              ],
            },
          ],
        },
      });

      const choice = beat.getParameters().dialogTree.choices[0];
      expect(choice.effects).toEqual([
        { type: 'setVariable', target: 'visited', value: true },
        { type: 'addInventory', target: 'key' },
      ]);
    });
  });

  describe('DialogTreeBeat - runtime after migration', () => {
    it('should apply migrated incrementCounter effect at runtime', async () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Be brave?',
          choices: [
            {
              id: 'c1',
              text: 'Yes!',
              target: 'next',
              counter: 'courage',
              counterOperation: 'change',
              counterValue: 5,
            },
          ],
        },
      });

      await beat.execute(context, mockRenderer);

      expect(context.getCounter('courage')).toBe(5);
    });

    it('should apply migrated setCounter effect at runtime', async () => {
      context.setCounter('courage', 100);

      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Reset?',
          choices: [
            {
              id: 'c1',
              text: 'Yes',
              target: 'next',
              counter: 'courage',
              counterOperation: 'set',
              counterValue: 0,
            },
          ],
        },
      });

      await beat.execute(context, mockRenderer);

      expect(context.getCounter('courage')).toBe(0);
    });

    it('should apply multiple effect types from effects array', async () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Take this',
          choices: [
            {
              id: 'c1',
              text: 'Thanks',
              target: 'next',
              effects: [
                { type: 'setVariable', target: 'gotGift', value: true },
                { type: 'incrementCounter', target: 'gifts', value: 1 },
                { type: 'addInventory', target: 'magic_ring' },
              ],
            },
          ],
        },
      });

      await beat.execute(context, mockRenderer);

      expect(context.getVariable('gotGift')).toBe(true);
      expect(context.getCounter('gifts')).toBe(1);
      expect(context.hasInInventory('magic_ring')).toBe(true);
    });
  });

  describe('MovementChoiceBeat - constructor migration', () => {
    it('should migrate flat counter fields on choices', () => {
      const beat = new MovementChoiceBeat({
        id: 'mc1',
        type: 'movementChoice',
        name: 'Test',
        question: 'Where?',
        choices: [
          {
            id: 'choice1',
            text: 'North',
            location: 'north',
            target: 'beat2',
            counter: 'exploration',
            counterOperation: 'change',
            counterValue: 1,
          },
        ],
      });

      const choice = beat.getParameters().choices[0];
      expect(choice.counter).toBeUndefined();
      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'exploration', value: 1 },
      ]);
    });

    it('should apply migrated effect at runtime', async () => {
      const beat = new MovementChoiceBeat({
        id: 'mc1',
        type: 'movementChoice',
        name: 'Test',
        question: 'Where?',
        choices: [
          {
            id: 'choice1',
            text: 'North',
            location: 'north',
            target: 'beat2',
            counter: 'courage',
            counterOperation: 'set',
            counterValue: 50,
          },
        ],
      });

      await beat.execute(context, mockRenderer);

      expect(context.getCounter('courage')).toBe(50);
    });

    it('should apply variable and inventory effects from effects array', async () => {
      const beat = new MovementChoiceBeat({
        id: 'mc1',
        type: 'movementChoice',
        name: 'Test',
        question: 'Where?',
        choices: [
          {
            id: 'choice1',
            text: 'Secret path',
            location: 'secret',
            target: 'beat2',
            effects: [
              { type: 'setVariable', target: 'found_secret', value: true },
              { type: 'addInventory', target: 'treasure_map' },
              { type: 'incrementCounter', target: 'discoveries', value: 1 },
            ],
          },
        ],
      });

      await beat.execute(context, mockRenderer);

      expect(context.getVariable('found_secret')).toBe(true);
      expect(context.hasInInventory('treasure_map')).toBe(true);
      expect(context.getCounter('discoveries')).toBe(1);
    });
  });

  describe('PickPropBeat - constructor migration', () => {
    it('should migrate flat counter fields on props', () => {
      const beat = new PickPropBeat({
        id: 'pp1',
        type: 'pickProp',
        name: 'Test',
        question: 'Pick?',
        props: [
          {
            id: 'prop1',
            name: 'Potion',
            description: 'Health potion',
            target: 'beat2',
            counter: 'health',
            counterOperation: 'change',
            counterValue: 20,
          },
        ],
      });

      const prop = beat.getParameters().props[0];
      expect(prop.counter).toBeUndefined();
      expect(prop.effects).toEqual([
        { type: 'incrementCounter', target: 'health', value: 20 },
      ]);
    });

    it('should apply migrated effect at runtime AND still add to inventory', async () => {
      const beat = new PickPropBeat({
        id: 'pp1',
        type: 'pickProp',
        name: 'Test',
        question: 'Pick?',
        props: [
          {
            id: 'prop1',
            name: 'Potion',
            description: 'Health potion',
            target: 'beat2',
            counter: 'health',
            counterOperation: 'change',
            counterValue: 20,
          },
        ],
      });

      await beat.execute(context, mockRenderer);

      // Counter effect applied via canonical effects
      expect(context.getCounter('health')).toBe(20);
      // Inventory still added (inherent pickProp behavior)
      expect(context.hasInInventory('Potion')).toBe(true);
    });

    it('should apply removeInventory effect from effects array', async () => {
      context.addToInventory('old_key');

      const beat = new PickPropBeat({
        id: 'pp1',
        type: 'pickProp',
        name: 'Test',
        question: 'Pick?',
        props: [
          {
            id: 'prop1',
            name: 'New Key',
            description: 'Replace key',
            target: 'beat2',
            effects: [
              { type: 'removeInventory', target: 'old_key' },
              { type: 'setVariable', target: 'upgraded_key', value: true },
            ],
          },
        ],
      });

      await beat.execute(context, mockRenderer);

      expect(context.hasInInventory('old_key')).toBe(false);
      expect(context.hasInInventory('New Key')).toBe(true);
      expect(context.getVariable('upgraded_key')).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle choices with no counter fields and no effects', async () => {
      const beat = new MovementChoiceBeat({
        id: 'mc1',
        type: 'movementChoice',
        name: 'Test',
        question: 'Where?',
        choices: [
          {
            id: 'choice1',
            text: 'North',
            location: 'north',
            target: 'beat2',
          },
        ],
      });

      const result = await beat.execute(context, mockRenderer);
      expect(result).toBe('beat2');
    });

    it('should handle choices with pre-existing canonical effects (no migration needed)', async () => {
      const beat = new MovementChoiceBeat({
        id: 'mc1',
        type: 'movementChoice',
        name: 'Test',
        question: 'Where?',
        choices: [
          {
            id: 'choice1',
            text: 'North',
            location: 'north',
            target: 'beat2',
            effects: [
              { type: 'incrementCounter', target: 'steps', value: 1 },
            ],
          },
        ],
      });

      await beat.execute(context, mockRenderer);
      expect(context.getCounter('steps')).toBe(1);
    });

    it('should handle getParameters/updateParameters round-trip preserving effects', () => {
      const beat = new DialogTreeBeat({
        id: 'dt1',
        type: 'dialogTree',
        name: 'Test',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hi',
          choices: [
            {
              id: 'c1',
              text: 'Go',
              target: 'next',
              counter: 'score',
              counterOperation: 'change',
              counterValue: 10,
            },
          ],
        },
      });

      // Get parameters (should have migrated effects)
      const params = beat.getParameters();
      expect(params.dialogTree.choices[0].effects).toEqual([
        { type: 'incrementCounter', target: 'score', value: 10 },
      ]);

      // Update parameters (simulate re-save from editor)
      beat.updateParameters(params);

      // Get again — effects should be preserved
      const params2 = beat.getParameters();
      expect(params2.dialogTree.choices[0].effects).toEqual([
        { type: 'incrementCounter', target: 'score', value: 10 },
      ]);
      expect(params2.dialogTree.choices[0].counter).toBeUndefined();
    });
  });
});
