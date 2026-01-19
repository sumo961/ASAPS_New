/**
 * Tests for unified choice/effect formats across beat types
 * Verifies the bug fix for MovementChoice effects and new counter/sound features
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MovementChoiceBeat } from '../../src/beats/MovementChoiceBeat';
import { PickPropBeat } from '../../src/beats/PickPropBeat';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

describe('Unified Choice/Effect Formats', () => {
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
      clearChatHistory: vi.fn(),
    } as unknown as IRenderer;
  });

  describe('MovementChoiceBeat - Effects Bug Fix', () => {
    it('should apply effects from choice (BUG FIX)', async () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        type: 'movementChoice',
        question: 'Where to go?',
        choices: [
          {
            id: 'choice1',
            text: 'Go north',
            location: 'North Area',
            target: 'beat2',
            effects: [
              { type: 'setVariable', target: 'visited_north', value: true },
              { type: 'incrementCounter', target: 'exploration', value: 1 }
            ]
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      // Verify effects were applied (this was the bug - effects weren't being applied)
      expect(context.getVariable('visited_north')).toBe(true);
      expect(context.getCounter('exploration')).toBe(1);
    });

    it('should apply direct counter fields', async () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        type: 'movementChoice',
        question: 'Where to go?',
        choices: [
          {
            id: 'choice1',
            text: 'Go north',
            location: 'North Area',
            target: 'beat2',
            counter: 'courage',
            counterOperation: 'change',
            counterValue: 5
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      expect(context.getCounter('courage')).toBe(5);
    });

    it('should set counter when operation is "set"', async () => {
      context.setCounter('courage', 10);

      const beat = new MovementChoiceBeat({
        id: 'move1',
        type: 'movementChoice',
        question: 'Where to go?',
        choices: [
          {
            id: 'choice1',
            text: 'Go north',
            location: 'North Area',
            target: 'beat2',
            counter: 'courage',
            counterOperation: 'set',
            counterValue: 3
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      expect(context.getCounter('courage')).toBe(3);
    });

    it('should play sound effect when selected', async () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        type: 'movementChoice',
        question: 'Where to go?',
        choices: [
          {
            id: 'choice1',
            text: 'Go north',
            location: 'North Area',
            target: 'beat2',
            soundEffect: 'footsteps.mp3'
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      expect(mockRenderer.playSound).toHaveBeenCalledWith({ file: 'footsteps.mp3' });
    });
  });

  describe('PickPropBeat - Counter and Sound', () => {
    it('should still add prop to inventory (preserve existing behavior)', async () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        type: 'pickProp',
        question: 'What to pick?',
        props: [
          {
            id: 'prop1',
            name: 'Magic Sword',
            description: 'A shiny sword',
            target: 'beat2'
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      expect(context.hasInInventory('Magic Sword')).toBe(true);
    });

    it('should apply direct counter fields', async () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        type: 'pickProp',
        question: 'What to pick?',
        props: [
          {
            id: 'prop1',
            name: 'Health Potion',
            description: 'Restores health',
            target: 'beat2',
            counter: 'health',
            counterOperation: 'change',
            counterValue: 20
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      expect(context.getCounter('health')).toBe(20);
      expect(context.hasInInventory('Health Potion')).toBe(true);
    });

    it('should play sound effect when selected', async () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        type: 'pickProp',
        question: 'What to pick?',
        props: [
          {
            id: 'prop1',
            name: 'Gold Coin',
            description: 'Shiny gold',
            target: 'beat2',
            soundEffect: 'coin_pickup.mp3'
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      expect(mockRenderer.playSound).toHaveBeenCalledWith({ file: 'coin_pickup.mp3' });
    });

    it('should apply effects array AND counter fields (order: effects, inventory, counter, sound)', async () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        type: 'pickProp',
        question: 'What to pick?',
        props: [
          {
            id: 'prop1',
            name: 'Power Crystal',
            description: 'Increases power',
            target: 'beat2',
            effects: [
              { type: 'setVariable', target: 'has_crystal', value: true }
            ],
            counter: 'power',
            counterOperation: 'change',
            counterValue: 10,
            soundEffect: 'crystal.mp3'
          }
        ]
      });

      await beat.execute(context, mockRenderer);

      // Verify all effects applied in correct order
      expect(context.getVariable('has_crystal')).toBe(true);  // effects array
      expect(context.hasInInventory('Power Crystal')).toBe(true);  // inventory
      expect(context.getCounter('power')).toBe(10);  // counter field
      expect(mockRenderer.playSound).toHaveBeenCalledWith({ file: 'crystal.mp3' });  // sound
    });
  });

  describe('DialogTreeBeat - Sound Effect', () => {
    it('should play sound effect when choice is selected', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog1',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hello!',
          choices: [
            {
              id: 'c1',
              text: 'Hi there!',
              target: 'beat2',
              soundEffect: 'click.mp3'
            }
          ]
        }
      });

      await beat.execute(context, mockRenderer);

      expect(mockRenderer.playSound).toHaveBeenCalledWith({ file: 'click.mp3' });
    });

    it('should apply both counter fields and sound effect', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog1',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Do you want to be brave?',
          choices: [
            {
              id: 'c1',
              text: 'Yes, I am brave!',
              target: 'beat2',
              counter: 'courage',
              counterOperation: 'change',
              counterValue: 3,
              soundEffect: 'heroic.mp3'
            }
          ]
        }
      });

      await beat.execute(context, mockRenderer);

      expect(context.getCounter('courage')).toBe(3);
      expect(mockRenderer.playSound).toHaveBeenCalledWith({ file: 'heroic.mp3' });
    });
  });

  describe('Backward Compatibility', () => {
    it('MovementChoice should work without new fields', async () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        type: 'movementChoice',
        question: 'Where to go?',
        choices: [
          {
            id: 'choice1',
            text: 'Go north',
            location: 'North',
            target: 'beat2'
            // No counter, counterOperation, counterValue, soundEffect
          }
        ]
      });

      const result = await beat.execute(context, mockRenderer);

      expect(result).toBe('beat2');
      expect(mockRenderer.playSound).not.toHaveBeenCalled();
    });

    it('PickProp should work without new fields', async () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        type: 'pickProp',
        question: 'What to pick?',
        props: [
          {
            id: 'prop1',
            name: 'Apple',
            description: 'A red apple',
            target: 'beat2'
            // No counter, counterOperation, counterValue, soundEffect
          }
        ]
      });

      const result = await beat.execute(context, mockRenderer);

      expect(result).toBe('beat2');
      expect(context.hasInInventory('Apple')).toBe(true);
      expect(mockRenderer.playSound).not.toHaveBeenCalled();
    });

    it('DialogTree should work without soundEffect', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog1',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hello!',
          choices: [
            {
              id: 'c1',
              text: 'Hi!',
              target: 'beat2'
              // No soundEffect
            }
          ]
        }
      });

      const result = await beat.execute(context, mockRenderer);

      expect(result).toBe('beat2');
      expect(mockRenderer.playSound).not.toHaveBeenCalled();
    });
  });
});
