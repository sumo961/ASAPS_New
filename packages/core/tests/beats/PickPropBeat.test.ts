/**
 * Tests for PickPropBeat - object/item selection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PickPropBeat } from '../../src/beats/PickPropBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

// Mock renderer factory
function createMockRenderer(): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn().mockResolvedValue(undefined),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    setVisitedChoiceIds: vi.fn(),
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

describe('PickPropBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
      });

      const params = beat.getParameters();
      expect(params.question).toBe('What do you want to interact with?');
      expect(params.props).toEqual([]);
      expect(params.markVisited).toBe(false);
    });

    it('should create with custom question and props', () => {
      const props = [
        { id: 'key', name: 'Silver Key', description: 'A shiny key', target: 'beat_key' },
        { id: 'book', name: 'Old Book', description: 'A dusty book', target: 'beat_book' },
      ];

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        question: 'What catches your eye?',
        props,
      });

      expect(beat.question).toBe('What catches your eye?');
      expect(beat.props).toHaveLength(2);
      expect(beat.props[0].name).toBe('Silver Key');
    });

    it('should support parameters object format', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        parameters: {
          question: 'What do you pick up?',
          props: [
            { id: 'sword', name: 'Rusty Sword', target: 'beat_sword' },
          ],
          choiceDelay: 2,
          markVisited: true,
        },
      });

      expect(beat.question).toBe('What do you pick up?');
      expect(beat.props).toHaveLength(1);
      expect(beat.choiceDelay).toBe(2);
      expect(beat.markVisited).toBe(true);
    });

    it('should set choiceDelay from config', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        choiceDelay: 3,
      });

      expect(beat.choiceDelay).toBe(3);
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        question: 'Choose wisely',
        props: [{ id: 'gem', name: 'Ruby Gem', target: 'beat_gem' }],
        node: 'treasure_room',
        choiceDelay: 1.5,
        markVisited: true,
      });

      const params = beat.getParameters();
      expect(params.question).toBe('Choose wisely');
      expect(params.props).toHaveLength(1);
      expect(params.node).toBe('treasure_room');
      expect(params.choiceDelay).toBe(1.5);
      expect(params.markVisited).toBe(true);
    });
  });

  describe('updateParameters', () => {
    it('should update question', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
      });

      beat.updateParameters({ question: 'New question?' });
      expect(beat.question).toBe('New question?');
    });

    it('should update props and rebuild connections', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [{ id: 'old', name: 'Old Item', target: 'old_target' }],
      });

      const newProps = [
        { id: 'a', name: 'Item A', target: 'target_a' },
        { id: 'b', name: 'Item B', target: 'target_b' },
      ];

      beat.updateParameters({ props: newProps });

      expect(beat.props).toHaveLength(2);
      expect(beat.props[0].target).toBe('target_a');

      // Connections should be rebuilt
      const connections = beat.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections.some(c => c.targetId === 'target_a')).toBe(true);
      expect(connections.some(c => c.targetId === 'target_b')).toBe(true);
    });

    it('should update node parameter', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
      });

      beat.updateParameters({ node: 'new_background' });
      expect(beat.node).toBe('new_background');
    });

    it('should update choiceDelay and markVisited', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
      });

      beat.updateParameters({ choiceDelay: 3, markVisited: true });
      expect(beat.choiceDelay).toBe(3);
      expect(beat.markVisited).toBe(true);
    });
  });

  describe('getConnections', () => {
    it('should return connections from props', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'key', name: 'Silver Key', target: 'beat_key' },
          { id: 'book', name: 'Old Book', target: 'beat_book' },
          { id: 'map', name: 'Treasure Map', target: 'beat_map' },
        ],
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(3);
      expect(connections[0].targetId).toBe('beat_key');
      expect(connections[0].label).toBe('Silver Key');
      expect(connections[1].targetId).toBe('beat_book');
      expect(connections[2].targetId).toBe('beat_map');
    });

    it('should skip props without targets', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'valid', name: 'Valid Item', target: 'valid_target' },
          { id: 'no_target', name: 'No Target' } as any,
        ],
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].targetId).toBe('valid_target');
    });

    it('should use id as label if name is missing', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'mystery_item', target: 'beat_mystery' } as any,
        ],
      });

      const connections = beat.getConnections();
      expect(connections[0].label).toBe('mystery_item');
    });

    it('should include prop conditions in connections', () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          {
            id: 'magic_item',
            name: 'Magic Staff',
            target: 'beat_magic',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'spellbook' }],
          },
        ],
      });

      const connections = beat.getConnections();
      expect(connections[0].condition).toEqual([
        { type: 'inventory', operator: 'contains', item: 'spellbook' },
      ]);
    });
  });

  describe('performAction', () => {
    it('should render prop selection and return selected target', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('key');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        question: 'What do you pick up?',
        props: [
          { id: 'key', name: 'Silver Key', description: 'Shiny', target: 'beat_key' },
          { id: 'book', name: 'Old Book', description: 'Dusty', target: 'beat_book' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(renderer.renderPropSelection).toHaveBeenCalled();
      expect(result).toBe('beat_key');
    });

    it('should filter props based on conditions', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('public');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'public', name: 'Visible Item', target: 'beat_visible' },
          {
            id: 'secret',
            name: 'Secret Item',
            target: 'beat_secret',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'reveal_charm' }],
          },
        ],
      });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderPropSelection as any).mock.calls[0];
      const renderedProps = callArgs[1];
      expect(renderedProps).toHaveLength(1);
      expect(renderedProps[0].id).toBe('public');
    });

    it('should show secret prop when condition is met', async () => {
      context.addToInventory('reveal_charm');
      (renderer.renderPropSelection as any).mockResolvedValue('secret');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'public', name: 'Visible Item', target: 'beat_visible' },
          {
            id: 'secret',
            name: 'Secret Item',
            target: 'beat_secret',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'reveal_charm' }],
          },
        ],
      });

      const result = await beat.execute(context, renderer);

      const callArgs = (renderer.renderPropSelection as any).mock.calls[0];
      const renderedProps = callArgs[1];
      expect(renderedProps).toHaveLength(2);
      expect(result).toBe('beat_secret');
    });

    it('should process question with variable interpolation', async () => {
      context.setVariable('room', 'Library');
      (renderer.renderPropSelection as any).mockResolvedValue('book');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        question: 'You are in the $room$. What do you examine?',
        props: [
          { id: 'book', name: 'Old Book', target: 'beat_book' },
        ],
      });

      await beat.execute(context, renderer);

      expect(renderer.renderPropSelection).toHaveBeenCalledWith(
        'You are in the Library. What do you examine?',
        expect.any(Array),
        expect.any(Array)
      );
    });

    it('should add selected prop to inventory', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('key');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'key', name: 'Silver Key', target: 'beat_key' },
        ],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('Silver Key')).toBe(true);
    });

    it('should use inventoryName for inventory if available', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('key');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'key', name: 'Silver Key', inventoryName: 'silver_key', target: 'beat_key' } as any,
        ],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('silver_key')).toBe(true);
    });

    it('should apply choice effects when prop is selected', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('gem');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          {
            id: 'gem',
            name: 'Magic Gem',
            target: 'beat_gem',
            effects: [{ type: 'incrementCounter', target: 'power', value: 5 }],
          } as any,
        ],
      });

      await beat.execute(context, renderer);

      expect(context.getCounter('power')).toBe(5);
    });

    it('should play sound effect when prop has soundEffect', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('coins');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'coins', name: 'Gold Coins', target: 'beat_coins', soundEffect: 'coin_pickup.mp3' },
        ],
      });

      await beat.execute(context, renderer);

      expect(renderer.playSound).toHaveBeenCalledWith({ file: 'coin_pickup.mp3' });
    });

    it('should set markVisited state in renderer', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('item1');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        markVisited: true,
        props: [
          { id: 'item1', name: 'Item 1', target: 'target1' },
        ],
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith('markVisited', true);
    });

    it('should return null when no props available after filtering', async () => {
      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          {
            id: 'locked',
            name: 'Locked Item',
            target: 'locked_target',
            conditions: [{ type: 'inventory', operator: 'contains', item: 'nonexistent' }],
          },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBeNull();
      expect(renderer.renderPropSelection).not.toHaveBeenCalled();
    });

    it('should match prop by name if id not found', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('Silver Key');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'key_prop', name: 'Silver Key', target: 'beat_key' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('beat_key');
    });

    it('should handle case-insensitive name matching', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('SILVER KEY');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'key_prop', name: 'Silver Key', target: 'beat_key' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('beat_key');
    });

    it('should pass displayName to renderer when available', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('key');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        props: [
          { id: 'key', name: 'Silver Key', displayName: 'Clé en argent', target: 'beat_key' },
        ],
      });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderPropSelection as any).mock.calls[0];
      const renderedProps = callArgs[1];
      expect(renderedProps[0].displayName).toBe('Clé en argent');
    });

    it('should apply delay before rendering when choiceDelay is set', async () => {
      vi.useFakeTimers();
      (renderer.renderPropSelection as any).mockResolvedValue('item1');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Item',
        type: 'pickProp',
        choiceDelay: 2,
        props: [
          { id: 'item1', name: 'Item', target: 'target' },
        ],
      });

      const executePromise = beat.execute(context, renderer);

      // Renderer should not be called yet
      expect(renderer.renderPropSelection).not.toHaveBeenCalled();

      // Fast-forward past the delay
      await vi.advanceTimersByTimeAsync(2000);

      await executePromise;

      expect(renderer.renderPropSelection).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should record choice for AI context', async () => {
      (renderer.renderPropSelection as any).mockResolvedValue('gem');

      const beat = new PickPropBeat({
        id: 'pick1',
        name: 'Pick Gem',
        type: 'pickProp',
        question: 'What do you pick?',
        props: [
          { id: 'gem', name: 'Magic Gem', target: 'beat_gem' },
        ],
      });

      await beat.execute(context, renderer);

      const history = context.getChoiceHistory();
      expect(history).toHaveLength(1);
      expect(history[0].beatType).toBe('pickProp');
      expect(history[0].choiceText).toContain('Magic Gem');
    });
  });
});
