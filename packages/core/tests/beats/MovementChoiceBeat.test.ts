/**
 * Tests for MovementChoiceBeat - location-based navigation choices
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MovementChoiceBeat } from '../../src/beats/MovementChoiceBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

// Mock renderer factory
function createMockRenderer(): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(''),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

describe('MovementChoiceBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
      });

      const params = beat.getParameters();
      expect(params.question).toBe('Where do you want to go?');
      expect(params.choices).toEqual([]);
      expect(params.markVisited).toBe(false);
      expect(params.showTextOnHover).toBe(false);
    });

    it('should create with custom question', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        question: 'Where to?',
      });

      expect(beat.question).toBe('Where to?');
    });

    it('should create with choices array', () => {
      const choices = [
        { id: '1', text: 'Go North', target: 'forest' },
        { id: '2', text: 'Go South', target: 'village' },
      ];

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices,
      });

      expect(beat.choices).toHaveLength(2);
      expect(beat.choices[0].text).toBe('Go North');
      expect(beat.choices[1].target).toBe('village');
    });

    it('should support parameters object format', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        parameters: {
          question: 'Choose your path',
          choices: [
            { id: '1', text: 'Left', target: 'left_path' },
          ],
          markVisited: true,
          showTextOnHover: true,
        },
      });

      expect(beat.question).toBe('Choose your path');
      expect(beat.choices).toHaveLength(1);
      expect(beat.markVisited).toBe(true);
      expect(beat.showTextOnHover).toBe(true);
    });

    it('should set choiceDelay from config', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choiceDelay: 2,
      });

      expect(beat.choiceDelay).toBe(2);
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        question: 'Where next?',
        choices: [{ id: '1', text: 'Forest', target: 'forest' }],
        node: 'crossroads',
        choiceDelay: 1.5,
        markVisited: true,
        showTextOnHover: false,
      });

      const params = beat.getParameters();
      expect(params.question).toBe('Where next?');
      expect(params.choices).toHaveLength(1);
      expect(params.node).toBe('crossroads');
      expect(params.choiceDelay).toBe(1.5);
      expect(params.markVisited).toBe(true);
      expect(params.showTextOnHover).toBe(false);
    });
  });

  describe('updateParameters', () => {
    it('should update question', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
      });

      beat.updateParameters({ question: 'New question?' });
      expect(beat.question).toBe('New question?');
    });

    it('should update choices and rebuild connections', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [{ id: '1', text: 'Old', target: 'old_target' }],
      });

      const newChoices = [
        { id: '2', text: 'New A', target: 'target_a' },
        { id: '3', text: 'New B', target: 'target_b' },
      ];

      beat.updateParameters({ choices: newChoices });

      expect(beat.choices).toHaveLength(2);
      expect(beat.choices[0].target).toBe('target_a');

      // Connections should be rebuilt
      const connections = beat.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections.some(c => c.targetId === 'target_a')).toBe(true);
      expect(connections.some(c => c.targetId === 'target_b')).toBe(true);
    });

    it('should update node parameter', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
      });

      beat.updateParameters({ node: 'new_background' });
      expect(beat.node).toBe('new_background');
    });

    it('should update choiceDelay', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
      });

      beat.updateParameters({ choiceDelay: 3 });
      expect(beat.choiceDelay).toBe(3);
    });

    it('should update markVisited and showTextOnHover', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
      });

      beat.updateParameters({ markVisited: true, showTextOnHover: true });
      expect(beat.markVisited).toBe(true);
      expect(beat.showTextOnHover).toBe(true);
    });
  });

  describe('getConnections', () => {
    it('should return connections from choices', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: '1', text: 'Forest', target: 'forest_beat' },
          { id: '2', text: 'Cave', target: 'cave_beat' },
          { id: '3', text: 'River', target: 'river_beat' },
        ],
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(3);
      expect(connections[0].targetId).toBe('forest_beat');
      expect(connections[0].label).toBe('Forest');
      expect(connections[1].targetId).toBe('cave_beat');
      expect(connections[2].targetId).toBe('river_beat');
    });

    it('should skip choices without targets', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: '1', text: 'Valid', target: 'valid_target' },
          { id: '2', text: 'No target' } as any, // Missing target
        ],
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].targetId).toBe('valid_target');
    });

    it('should use choice id as label if text is missing', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'north_choice', target: 'north' } as any,
        ],
      });

      const connections = beat.getConnections();
      expect(connections[0].label).toBe('north_choice');
    });

    it('should include choice conditions in connections', () => {
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          {
            id: '1',
            text: 'Secret Path',
            target: 'secret',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'key' }],
          },
        ],
      });

      const connections = beat.getConnections();
      expect(connections[0].condition).toEqual([
        { type: 'inventory', operator: 'contains', item: 'key' },
      ]);
    });
  });

  describe('performAction', () => {
    it('should render movement choices and return selected target', async () => {
      (renderer.renderMovement as any).mockResolvedValue('forest');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        question: 'Where to go?',
        choices: [
          { id: 'forest', text: 'Forest', target: 'forest_beat' },
          { id: 'village', text: 'Village', target: 'village_beat' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(renderer.renderMovement).toHaveBeenCalled();
      expect(result).toBe('forest_beat');
    });

    it('should filter choices based on conditions', async () => {
      // No inventory item means secret choice should be filtered
      (renderer.renderMovement as any).mockResolvedValue('public');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'public', text: 'Public Path', target: 'public_beat' },
          {
            id: 'secret',
            text: 'Secret Path',
            target: 'secret_beat',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'magic_key' }],
          },
        ],
      });

      await beat.execute(context, renderer);

      // Check that renderMovement was called with only the public choice
      expect(renderer.renderMovement).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ id: 'public' }),
        ]),
        expect.any(Array)
      );

      // The secret choice should not be in the call
      const callArgs = (renderer.renderMovement as any).mock.calls[0];
      const renderedChoices = callArgs[1];
      expect(renderedChoices).toHaveLength(1);
      expect(renderedChoices[0].id).toBe('public');
    });

    it('should show secret choice when condition is met', async () => {
      context.addToInventory('magic_key');
      (renderer.renderMovement as any).mockResolvedValue('secret');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'public', text: 'Public Path', target: 'public_beat' },
          {
            id: 'secret',
            text: 'Secret Path',
            target: 'secret_beat',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'magic_key' }],
          },
        ],
      });

      const result = await beat.execute(context, renderer);

      // Both choices should be available
      const callArgs = (renderer.renderMovement as any).mock.calls[0];
      const renderedChoices = callArgs[1];
      expect(renderedChoices).toHaveLength(2);
      expect(result).toBe('secret_beat');
    });

    it('should process question with variable interpolation', async () => {
      context.setVariable('location', 'Crossroads');
      (renderer.renderMovement as any).mockResolvedValue('north');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        question: 'You are at the $location$. Where to?',
        choices: [
          { id: 'north', text: 'North', target: 'north_beat' },
        ],
      });

      await beat.execute(context, renderer);

      expect(renderer.renderMovement).toHaveBeenCalledWith(
        'You are at the Crossroads. Where to?',
        expect.any(Array),
        expect.any(Array)
      );
    });

    it('should process choice text with variable interpolation', async () => {
      context.setVariable('destination', 'Mountains');
      (renderer.renderMovement as any).mockResolvedValue('go');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'go', text: 'Go to the $destination$', target: 'mountains' },
        ],
      });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderMovement as any).mock.calls[0];
      expect(callArgs[1][0].text).toBe('Go to the Mountains');
    });

    it('should set currentLocation variable when choice has location', async () => {
      (renderer.renderMovement as any).mockResolvedValue('forest');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'forest', text: 'Forest', target: 'forest_beat', location: 'dark_forest' },
        ],
      });

      await beat.execute(context, renderer);

      expect(context.getVariable('currentLocation')).toBe('dark_forest');
    });

    it('should set markVisited state in renderer', async () => {
      (renderer.renderMovement as any).mockResolvedValue('choice1');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        markVisited: true,
        choices: [
          { id: 'choice1', text: 'Choice 1', target: 'target1' },
        ],
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith('markVisited', true);
    });

    it('should set showTextOnHover state in renderer', async () => {
      (renderer.renderMovement as any).mockResolvedValue('choice1');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        showTextOnHover: true,
        choices: [
          { id: 'choice1', text: 'Choice 1', target: 'target1' },
        ],
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith('showTextOnHover', true);
    });

    it('should return null when no choices available', async () => {
      // All choices filtered out
      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          {
            id: 'locked',
            text: 'Locked',
            target: 'locked_beat',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'nonexistent' }],
          },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBeNull();
      expect(renderer.renderMovement).not.toHaveBeenCalled();
    });

    it('should match choice by text if id not found', async () => {
      (renderer.renderMovement as any).mockResolvedValue('Forest Path');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'choice1', text: 'Forest Path', target: 'forest' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('forest');
    });

    it('should handle case-insensitive text matching', async () => {
      (renderer.renderMovement as any).mockResolvedValue('FOREST PATH');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'choice1', text: 'Forest Path', target: 'forest' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('forest');
    });

    it('should return null for unmatched choice', async () => {
      (renderer.renderMovement as any).mockResolvedValue('unknown_choice');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choices: [
          { id: 'choice1', text: 'Option 1', target: 'target1' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBeNull();
    });

    it('should apply choice delay before rendering', async () => {
      vi.useFakeTimers();
      (renderer.renderMovement as any).mockResolvedValue('choice1');

      const beat = new MovementChoiceBeat({
        id: 'move1',
        name: 'Movement',
        type: 'movementChoice',
        choiceDelay: 2, // 2 seconds
        choices: [
          { id: 'choice1', text: 'Choice', target: 'target' },
        ],
      });

      const executePromise = beat.execute(context, renderer);

      // Renderer should not be called yet
      expect(renderer.renderMovement).not.toHaveBeenCalled();

      // Fast-forward past the delay
      await vi.advanceTimersByTimeAsync(2000);

      await executePromise;

      expect(renderer.renderMovement).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
