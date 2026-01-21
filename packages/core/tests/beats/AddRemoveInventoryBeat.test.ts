/**
 * Tests for AddRemoveInventoryBeat - inventory operation tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddRemoveInventoryBeat } from '../../src/beats/AddRemoveInventoryBeat';
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

describe('AddRemoveInventoryBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    // Mock window for potential timer usage
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Inventory Beat',
        type: 'addRemoveInventory',
      });

      const params = beat.getParameters();
      expect(params.action).toBe('add');
      expect(params.item).toBe('');
      expect(params.character).toBe('player');
      expect(params.fromChar).toBe('');
      expect(params.toChar).toBe('');
    });

    it('should create with direct config properties', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Sword',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'sword',
        character: 'hero',
      });

      const params = beat.getParameters();
      expect(params.action).toBe('add');
      expect(params.item).toBe('sword');
      expect(params.character).toBe('hero');
    });

    it('should create with parameters object', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Remove Key',
        type: 'addRemoveInventory',
        parameters: {
          action: 'remove',
          item: 'key',
          character: 'player',
        },
      });

      const params = beat.getParameters();
      expect(params.action).toBe('remove');
      expect(params.item).toBe('key');
    });

    it('should create transfer action with fromChar and toChar', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Transfer Gold',
        type: 'addRemoveInventory',
        parameters: {
          action: 'transfer',
          item: 'gold',
          fromChar: 'player',
          toChar: 'merchant',
        },
      });

      const params = beat.getParameters();
      expect(params.action).toBe('transfer');
      expect(params.fromChar).toBe('player');
      expect(params.toChar).toBe('merchant');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Test',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'potion',
        character: 'wizard',
        fromChar: 'from',
        toChar: 'to',
      });

      expect(beat.getParameters()).toEqual({
        action: 'add',
        item: 'potion',
        quantity: 1,  // Default quantity
        character: 'wizard',
        fromChar: 'from',
        toChar: 'to',
      });
    });

    it('should return custom quantity', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Test',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'gold',
        quantity: 50,
        character: 'player',
      });

      expect(beat.getParameters().quantity).toBe(50);
    });
  });

  describe('updateParameters', () => {
    it('should update action', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Test',
        type: 'addRemoveInventory',
      });

      beat.updateParameters({ action: 'remove' });
      expect(beat.getParameters().action).toBe('remove');
    });

    it('should update item', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Test',
        type: 'addRemoveInventory',
      });

      beat.updateParameters({ item: 'new_item' });
      expect(beat.getParameters().item).toBe('new_item');
    });

    it('should update character', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Test',
        type: 'addRemoveInventory',
      });

      beat.updateParameters({ character: 'npc' });
      expect(beat.getParameters().character).toBe('npc');
    });

    it('should update fromChar and toChar', () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Test',
        type: 'addRemoveInventory',
      });

      beat.updateParameters({ fromChar: 'player', toChar: 'merchant' });
      expect(beat.getParameters().fromChar).toBe('player');
      expect(beat.getParameters().toChar).toBe('merchant');
    });
  });

  describe('performAction - add', () => {
    it('should add item to player inventory', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Sword',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'sword',
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('sword')).toBe(true);
    });

    it('should add item to NPC inventory', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Give to Merchant',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'potion',
        character: 'merchant',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInventoryItem('merchant', 'potion')).toBe(true);
    });

    it('should default to player character', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Key',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'key',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('key')).toBe(true);
    });
  });

  describe('performAction - remove', () => {
    it('should remove item from player inventory', async () => {
      context.addToInventory('sword');
      expect(context.hasInInventory('sword')).toBe(true);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Remove Sword',
        type: 'addRemoveInventory',
        action: 'remove',
        item: 'sword',
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('sword')).toBe(false);
    });

    it('should remove item from NPC inventory', async () => {
      context.addInventoryItem('merchant', 'gold');
      expect(context.hasInventoryItem('merchant', 'gold')).toBe(true);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Take from Merchant',
        type: 'addRemoveInventory',
        action: 'remove',
        item: 'gold',
        character: 'merchant',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInventoryItem('merchant', 'gold')).toBe(false);
    });

    it('should handle removing non-existent item gracefully', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Remove Nothing',
        type: 'addRemoveInventory',
        action: 'remove',
        item: 'nonexistent',
        connections: [{ targetId: 'next' }],
      });

      // Should not throw
      await expect(beat.execute(context, renderer)).resolves.toBe('next');
    });
  });

  describe('performAction - transfer', () => {
    it('should transfer item between characters', async () => {
      context.addToInventory('gold_coin');
      expect(context.hasInInventory('gold_coin')).toBe(true);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Pay Merchant',
        type: 'addRemoveInventory',
        action: 'transfer',
        item: 'gold_coin',
        fromChar: 'player',
        toChar: 'merchant',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('gold_coin')).toBe(false);
      expect(context.hasInventoryItem('merchant', 'gold_coin')).toBe(true);
    });

    it('should transfer item from NPC to player', async () => {
      context.addInventoryItem('blacksmith', 'armor');

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Buy Armor',
        type: 'addRemoveInventory',
        action: 'transfer',
        item: 'armor',
        fromChar: 'blacksmith',
        toChar: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInventoryItem('blacksmith', 'armor')).toBe(false);
      expect(context.hasInInventory('armor')).toBe(true);
    });

    it('should log error if fromChar missing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Bad Transfer',
        type: 'addRemoveInventory',
        action: 'transfer',
        item: 'item',
        fromChar: '', // Missing
        toChar: 'target',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transfer requires fromChar and toChar')
      );

      consoleSpy.mockRestore();
    });

    it('should log error if toChar missing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Bad Transfer',
        type: 'addRemoveInventory',
        action: 'transfer',
        item: 'item',
        fromChar: 'source',
        toChar: '', // Missing
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transfer requires fromChar and toChar')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should log error and continue if item is empty', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'No Item',
        type: 'addRemoveInventory',
        action: 'add',
        item: '', // Empty
        connections: [{ targetId: 'next' }],
      });

      const result = await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('has no item specified')
      );
      expect(result).toBe('next');

      consoleSpy.mockRestore();
    });

    it('should log warning for unknown action', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Unknown Action',
        type: 'addRemoveInventory',
        action: 'unknown' as any,
        item: 'item',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown action 'unknown'")
      );

      consoleSpy.mockRestore();
    });
  });

  describe('quantity operations', () => {
    it('should add multiple items with quantity', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Gold',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'gold',
        quantity: 100,
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('gold')).toBe(true);
      expect(context.getInventoryQuantity('gold')).toBe(100);
    });

    it('should add to existing quantity', async () => {
      // Add initial gold
      context.addToInventory('gold', 50);
      expect(context.getInventoryQuantity('gold')).toBe(50);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add More Gold',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'gold',
        quantity: 30,
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.getInventoryQuantity('gold')).toBe(80);
    });

    it('should remove partial quantity', async () => {
      context.addToInventory('gold', 100);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Spend Gold',
        type: 'addRemoveInventory',
        action: 'remove',
        item: 'gold',
        quantity: 40,
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('gold')).toBe(true);
      expect(context.getInventoryQuantity('gold')).toBe(60);
    });

    it('should remove item completely when quantity reaches zero', async () => {
      context.addToInventory('gold', 50);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Spend All Gold',
        type: 'addRemoveInventory',
        action: 'remove',
        item: 'gold',
        quantity: 50,
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.hasInInventory('gold')).toBe(false);
      expect(context.getInventoryQuantity('gold')).toBe(0);
    });

    it('should use quantity from variable reference', async () => {
      context.setVariable('goldAmount', 75);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Variable Gold',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'gold',
        quantity: '$goldAmount',
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.getInventoryQuantity('gold')).toBe(75);
    });

    it('should remove quantity using variable reference', async () => {
      context.addToInventory('gold', 100);
      context.setVariable('payment', 35);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Remove Variable Gold',
        type: 'addRemoveInventory',
        action: 'remove',
        item: 'gold',
        quantity: '$payment',
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.getInventoryQuantity('gold')).toBe(65);
    });

    it('should handle string quantity from input', async () => {
      context.setVariable('userInput', '50');

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add String Quantity',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'gold',
        quantity: '$userInput',
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.getInventoryQuantity('gold')).toBe(50);
    });

    it('should transfer quantity between characters', async () => {
      context.addToInventory('gold', 100);

      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Pay Merchant',
        type: 'addRemoveInventory',
        action: 'transfer',
        item: 'gold',
        quantity: 30,
        fromChar: 'player',
        toChar: 'merchant',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.getInventoryQuantity('gold')).toBe(70);
      expect(context.getCharacterInventoryQuantity('merchant', 'gold')).toBe(30);
    });

    it('should handle quantity as string number', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Gold String',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'gold',
        quantity: '25',
        character: 'player',
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      expect(context.getInventoryQuantity('gold')).toBe(25);
    });
  });

  describe('navigation', () => {
    it('should always return next beat', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Item',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'sword',
        connections: [{ targetId: 'continue_beat' }],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('continue_beat');
    });

    it('should return null if no connections', async () => {
      const beat = new AddRemoveInventoryBeat({
        id: 'inv1',
        name: 'Add Item',
        type: 'addRemoveInventory',
        action: 'add',
        item: 'sword',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBeNull();
    });
  });
});
