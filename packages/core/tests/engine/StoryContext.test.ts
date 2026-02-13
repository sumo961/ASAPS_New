/**
 * Tests for StoryContext - story state management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

describe('StoryContext', () => {
  let context: StoryContext;

  beforeEach(() => {
    // Mock window.setInterval and window.clearInterval for timer tests
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
    context = new StoryContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should create with default state', () => {
      expect(context.getCurrentBeatId()).toBe('0');
      expect(context.getVariables()).toEqual({});
      expect(context.getCounters()).toEqual({});
      expect(context.getInventory()).toEqual([]);
      expect(context.getVisitedBeats()).toEqual([]);
    });

    it('should accept initial state', () => {
      const ctx = new StoryContext({
        currentBeatId: 'start',
        variables: { name: 'Hero' },
        counters: { score: 100 },
        inventory: [{ name: 'sword', quantity: 1 }],
        visitedBeats: new Set(['intro']),
      });

      expect(ctx.getCurrentBeatId()).toBe('start');
      expect(ctx.getVariable('name')).toBe('Hero');
      expect(ctx.getCounter('score')).toBe(100);
      expect(ctx.hasInInventory('sword')).toBe(true);
      expect(ctx.getVisitedBeats()).toContain('intro');
    });
  });

  describe('variables', () => {
    it('should get and set variables', () => {
      context.setVariable('name', 'Player');
      expect(context.getVariable('name')).toBe('Player');
    });

    it('should return undefined for non-existent variable', () => {
      expect(context.getVariable('nonexistent')).toBeUndefined();
    });

    it('should support any value type', () => {
      context.setVariable('string', 'hello');
      context.setVariable('number', 42);
      context.setVariable('boolean', true);
      context.setVariable('object', { x: 10, y: 20 });
      context.setVariable('array', [1, 2, 3]);

      expect(context.getVariable('string')).toBe('hello');
      expect(context.getVariable('number')).toBe(42);
      expect(context.getVariable('boolean')).toBe(true);
      expect(context.getVariable('object')).toEqual({ x: 10, y: 20 });
      expect(context.getVariable('array')).toEqual([1, 2, 3]);
    });

    it('should emit variableChanged event', () => {
      const listener = vi.fn();
      context.on('variableChanged', listener);

      context.setVariable('test', 'value');

      expect(listener).toHaveBeenCalledWith({ name: 'test', value: 'value' });
    });

    it('should overwrite existing variables', () => {
      context.setVariable('status', 'active');
      context.setVariable('status', 'inactive');
      expect(context.getVariable('status')).toBe('inactive');
    });

    it('should return copy of all variables', () => {
      context.setVariable('a', 1);
      context.setVariable('b', 2);

      const vars = context.getVariables();
      vars.c = 3; // Modify the copy

      expect(context.getVariable('c')).toBeUndefined();
    });
  });

  describe('counters', () => {
    it('should get and set counters', () => {
      context.setCounter('score', 100);
      expect(context.getCounter('score')).toBe(100);
    });

    it('should return 0 for non-existent counter', () => {
      expect(context.getCounter('nonexistent')).toBe(0);
    });

    it('should increment counter', () => {
      context.setCounter('score', 50);
      context.incrementCounter('score', 10);
      expect(context.getCounter('score')).toBe(60);
    });

    it('should increment counter by 1 by default', () => {
      context.setCounter('clicks', 0);
      context.incrementCounter('clicks');
      expect(context.getCounter('clicks')).toBe(1);
    });

    it('should increment non-existent counter from 0', () => {
      context.incrementCounter('newCounter', 5);
      expect(context.getCounter('newCounter')).toBe(5);
    });

    it('should emit counterChanged event', () => {
      const listener = vi.fn();
      context.on('counterChanged', listener);

      context.setCounter('test', 100);

      expect(listener).toHaveBeenCalledWith({ name: 'test', value: 100 });
    });

    it('should return copy of all counters', () => {
      context.setCounter('a', 1);
      context.setCounter('b', 2);

      const counters = context.getCounters();
      counters.c = 3; // Modify the copy

      expect(context.getCounter('c')).toBe(0);
    });
  });

  describe('inventory', () => {
    it('should add items to inventory', () => {
      context.addToInventory('sword');
      expect(context.hasInInventory('sword')).toBe(true);
    });

    it('should stack duplicate items', () => {
      context.addToInventory('key');
      context.addToInventory('key');
      // Now items stack - getInventory returns item names, not duplicated
      expect(context.getInventory()).toEqual(['key']);
      // But the quantity should be 2
      expect(context.getInventoryQuantity('key')).toBe(2);
    });

    it('should remove items from inventory', () => {
      context.addToInventory('potion');
      context.removeFromInventory('potion');
      expect(context.hasInInventory('potion')).toBe(false);
    });

    it('should handle removing non-existent items', () => {
      expect(() => context.removeFromInventory('nonexistent')).not.toThrow();
    });

    it('should emit inventoryChanged on add', () => {
      const listener = vi.fn();
      context.on('inventoryChanged', listener);

      context.addToInventory('shield');

      expect(listener).toHaveBeenCalledWith({ action: 'add', item: 'shield', quantity: 1, newTotal: 1 });
    });

    it('should emit inventoryChanged on remove', () => {
      context.addToInventory('shield');
      const listener = vi.fn();
      context.on('inventoryChanged', listener);

      context.removeFromInventory('shield');

      expect(listener).toHaveBeenCalledWith({ action: 'remove', item: 'shield', quantity: 1, newTotal: 0 });
    });

    it('should emit event when adding duplicate (quantity increase)', () => {
      context.addToInventory('item');
      const listener = vi.fn();
      context.on('inventoryChanged', listener);

      context.addToInventory('item');

      // Now duplicates increase quantity, so event is emitted
      expect(listener).toHaveBeenCalledWith({ action: 'add', item: 'item', quantity: 1, newTotal: 2 });
    });

    it('should return copy of inventory', () => {
      context.addToInventory('sword');
      const inv = context.getInventory();
      inv.push('axe');

      expect(context.getInventory()).toEqual(['sword']);
    });
  });

  describe('character inventories', () => {
    it('should add items to character inventory', () => {
      context.addInventoryItem('npc', 'gold');
      expect(context.hasInventoryItem('npc', 'gold')).toBe(true);
    });

    it('should use main inventory for player', () => {
      context.addInventoryItem('player', 'sword');
      expect(context.hasInInventory('sword')).toBe(true);
    });

    it('should remove items from character inventory', () => {
      context.addInventoryItem('merchant', 'potion');
      context.removeInventoryItem('merchant', 'potion');
      expect(context.hasInventoryItem('merchant', 'potion')).toBe(false);
    });

    it('should return false for non-existent character inventory', () => {
      expect(context.hasInventoryItem('unknown', 'item')).toBe(false);
    });
  });

  describe('timers', () => {
    it('should set and get timer', () => {
      context.setTimer('countdown', 60);
      expect(context.getTimer('countdown')).toBeGreaterThan(0);
    });

    it('should set timer with target beat', () => {
      context.setTimer('bomb', 10, 'explosion_beat');
      expect(context.getTimerTarget('bomb')).toBe('explosion_beat');
    });

    it('should clear timer', () => {
      context.setTimer('temp', 30);
      context.clearTimer('temp');
      expect(context.getTimer('temp')).toBe(0);
    });

    it('should emit timerSet event', () => {
      const listener = vi.fn();
      context.on('timerSet', listener);

      context.setTimer('test', 15, 'target');

      expect(listener).toHaveBeenCalledWith({
        name: 'test',
        value: 15,
        target: 'target',
      });
    });

    it('should emit timerCleared event', () => {
      context.setTimer('test', 15);
      const listener = vi.fn();
      context.on('timerCleared', listener);

      context.clearTimer('test');

      expect(listener).toHaveBeenCalledWith({ name: 'test' });
    });
  });

  describe('visited beats', () => {
    it('should mark beats as visited', () => {
      context.markBeatVisited('intro');
      expect(context.getVisitedBeats()).toContain('intro');
    });

    it('should track multiple visited beats', () => {
      context.markBeatVisited('beat1');
      context.markBeatVisited('beat2');
      context.markBeatVisited('beat3');

      const visited = context.getVisitedBeats();
      expect(visited).toContain('beat1');
      expect(visited).toContain('beat2');
      expect(visited).toContain('beat3');
    });

    it('should not duplicate visited beats', () => {
      context.markBeatVisited('same');
      context.markBeatVisited('same');

      const visited = context.getVisitedBeats();
      expect(visited.filter(b => b === 'same')).toHaveLength(1);
    });

    it('should add to history when marking visited', () => {
      context.markBeatVisited('beat1');
      context.markBeatVisited('beat2');

      const history = context.getHistory();
      expect(history).toEqual(['beat1', 'beat2']);
    });
  });

  describe('checkCondition - counter', () => {
    beforeEach(() => {
      context.setCounter('score', 50);
    });

    it('should check == operator', () => {
      expect(context.checkCondition({
        type: 'counter',
        operator: '==',
        variableName: 'score',
        value: 50,
      })).toBe(true);

      expect(context.checkCondition({
        type: 'counter',
        operator: '==',
        variableName: 'score',
        value: 100,
      })).toBe(false);
    });

    it('should check != operator', () => {
      expect(context.checkCondition({
        type: 'counter',
        operator: '!=',
        variableName: 'score',
        value: 100,
      })).toBe(true);
    });

    it('should check > operator', () => {
      expect(context.checkCondition({
        type: 'counter',
        operator: '>',
        variableName: 'score',
        value: 25,
      })).toBe(true);

      expect(context.checkCondition({
        type: 'counter',
        operator: '>',
        variableName: 'score',
        value: 50,
      })).toBe(false);
    });

    it('should check >= operator', () => {
      expect(context.checkCondition({
        type: 'counter',
        operator: '>=',
        variableName: 'score',
        value: 50,
      })).toBe(true);
    });

    it('should check < operator', () => {
      expect(context.checkCondition({
        type: 'counter',
        operator: '<',
        variableName: 'score',
        value: 100,
      })).toBe(true);
    });

    it('should check <= operator', () => {
      expect(context.checkCondition({
        type: 'counter',
        operator: '<=',
        variableName: 'score',
        value: 50,
      })).toBe(true);
    });

    it('should return 0 for non-existent counter', () => {
      expect(context.checkCondition({
        type: 'counter',
        operator: '==',
        variableName: 'nonexistent',
        value: 0,
      })).toBe(true);
    });
  });

  describe('checkCondition - variable', () => {
    beforeEach(() => {
      context.setVariable('status', 'active');
    });

    it('should check == operator for strings', () => {
      expect(context.checkCondition({
        type: 'variable',
        operator: '==',
        variableName: 'status',
        value: 'active',
      })).toBe(true);
    });

    it('should check != operator for strings', () => {
      expect(context.checkCondition({
        type: 'variable',
        operator: '!=',
        variableName: 'status',
        value: 'inactive',
      })).toBe(true);
    });
  });

  describe('checkCondition - inventory', () => {
    beforeEach(() => {
      context.addToInventory('key');
      context.addToInventory('map');
    });

    it('should check contains operator', () => {
      expect(context.checkCondition({
        type: 'inventory',
        operator: 'contains',
        item: 'key',
      })).toBe(true);

      expect(context.checkCondition({
        type: 'inventory',
        operator: 'contains',
        item: 'sword',
      })).toBe(false);
    });

    it('should check not operator', () => {
      expect(context.checkCondition({
        type: 'inventory',
        operator: 'not',
        item: 'sword',
      })).toBe(true);

      expect(context.checkCondition({
        type: 'inventory',
        operator: 'not',
        item: 'key',
      })).toBe(false);
    });

    it('should check != operator (negation)', () => {
      expect(context.checkCondition({
        type: 'inventory',
        operator: '!=',
        item: 'sword',
      })).toBe(true);
    });
  });

  describe('checkCondition - counterCompare', () => {
    beforeEach(() => {
      context.setCounter('strength', 10);
      context.setCounter('defense', 8);
    });

    it('should compare two counters', () => {
      expect(context.checkCondition({
        type: 'counterCompare',
        operator: '>',
        counter1: 'strength',
        counter2: 'defense',
      })).toBe(true);
    });

    it('should check equality of counters', () => {
      context.setCounter('attack', 10);

      expect(context.checkCondition({
        type: 'counterCompare',
        operator: '==',
        counter1: 'strength',
        counter2: 'attack',
      })).toBe(true);
    });

    it('should return false for missing counters', () => {
      expect(context.checkCondition({
        type: 'counterCompare',
        operator: '>',
      })).toBe(false);
    });
  });

  describe('checkCondition - visitedBeat', () => {
    beforeEach(() => {
      context.markBeatVisited('intro');
      context.markBeatVisited('chapter1');
    });

    it('should return true for visited beat', () => {
      expect(context.checkCondition({
        type: 'visitedBeat',
        operator: '==',
        beatId: 'intro',
      })).toBe(true);
    });

    it('should return false for unvisited beat', () => {
      expect(context.checkCondition({
        type: 'visitedBeat',
        operator: '==',
        beatId: 'chapter2',
      })).toBe(false);
    });

    it('should check not visited', () => {
      expect(context.checkCondition({
        type: 'visitedBeat',
        operator: '!=',
        beatId: 'chapter2',
      })).toBe(true);
    });

    it('should support variableName as beatId fallback', () => {
      expect(context.checkCondition({
        type: 'visitedBeat',
        operator: '==',
        variableName: 'intro',
      })).toBe(true);
    });
  });

  describe('applyEffect', () => {
    it('should set variable', () => {
      context.applyEffect({
        type: 'setVariable',
        target: 'name',
        value: 'Hero',
      });
      expect(context.getVariable('name')).toBe('Hero');
    });

    it('should add to inventory', () => {
      context.applyEffect({
        type: 'addInventory',
        target: 'sword',
      });
      expect(context.hasInInventory('sword')).toBe(true);
    });

    it('should remove from inventory', () => {
      context.addToInventory('potion');
      context.applyEffect({
        type: 'removeInventory',
        target: 'potion',
      });
      expect(context.hasInInventory('potion')).toBe(false);
    });

    it('should increment counter', () => {
      context.setCounter('score', 100);
      context.applyEffect({
        type: 'incrementCounter',
        target: 'score',
        value: 50,
      });
      expect(context.getCounter('score')).toBe(150);
    });

    it('should increment counter by 1 if value not specified', () => {
      context.setCounter('clicks', 0);
      context.applyEffect({
        type: 'incrementCounter',
        target: 'clicks',
      });
      expect(context.getCounter('clicks')).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset all state to defaults', () => {
      context.setVariable('name', 'Test');
      context.setCounter('score', 100);
      context.addToInventory('item');
      context.markBeatVisited('beat1');
      context.setCurrentBeatId('beat5');

      context.reset();

      expect(context.getCurrentBeatId()).toBe('0');
      expect(context.getVariables()).toEqual({});
      expect(context.getCounters()).toEqual({});
      expect(context.getInventory()).toEqual([]);
      expect(context.getVisitedBeats()).toEqual([]);
      expect(context.getHistory()).toEqual([]);
    });

    it('should emit reset event', () => {
      const listener = vi.fn();
      context.on('reset', listener);

      context.reset();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('serialization', () => {
    it('should serialize state', () => {
      context.setVariable('name', 'Player');
      context.setCounter('score', 100);
      context.addToInventory('sword');
      context.markBeatVisited('intro');
      context.setCurrentBeatId('chapter1');

      const serialized = context.serialize();

      expect(serialized.currentBeatId).toBe('chapter1');
      expect(serialized.variables.name).toBe('Player');
      expect(serialized.counters.score).toBe(100);
      // Inventory now stores InventoryEntry objects
      expect(serialized.inventory).toContainEqual({ name: 'sword', quantity: 1 });
      expect(serialized.visitedBeats).toContain('intro');
    });

    it('should serialize history', () => {
      context.markBeatVisited('beat1');
      context.markBeatVisited('beat2');
      context.markBeatVisited('beat3');

      const serialized = context.serialize();

      expect(serialized.history).toEqual(['beat1', 'beat2', 'beat3']);
    });

    it('should load from serialized state', () => {
      const serialized = {
        currentBeatId: 'savedBeat',
        variables: { savedVar: 'value' },
        counters: { savedCounter: 50 },
        inventory: [{ name: 'savedItem', quantity: 3 }],  // New format with quantity
        characterInventories: {},
        visitedBeats: ['visited1', 'visited2'],
        timers: {},
        history: ['beat1', 'savedBeat'],
      };

      context.loadFromSerialized(serialized);

      expect(context.getCurrentBeatId()).toBe('savedBeat');
      expect(context.getVariable('savedVar')).toBe('value');
      expect(context.getCounter('savedCounter')).toBe(50);
      expect(context.hasInInventory('savedItem')).toBe(true);
      expect(context.getInventoryQuantity('savedItem')).toBe(3);
      expect(context.getVisitedBeats()).toContain('visited1');
      expect(context.getHistory()).toEqual(['beat1', 'savedBeat']);
    });

    it('should migrate old format inventory when loading', () => {
      // Old format used string[] for inventory
      const serialized = {
        currentBeatId: 'oldSave',
        variables: {},
        counters: {},
        inventory: ['sword', 'shield'] as any,  // Old string[] format
        characterInventories: {},
        visitedBeats: [],
        timers: {},
        history: [],
      };

      context.loadFromSerialized(serialized);

      expect(context.hasInInventory('sword')).toBe(true);
      expect(context.hasInInventory('shield')).toBe(true);
      // Migrated items have quantity 1
      expect(context.getInventoryQuantity('sword')).toBe(1);
    });

    it('should emit stateLoaded event', () => {
      const listener = vi.fn();
      context.on('stateLoaded', listener);

      context.loadFromSerialized({
        currentBeatId: '0',
        variables: {},
        counters: {},
        inventory: [],
        characterInventories: {},
        visitedBeats: [],
        timers: {},
        history: [],
      });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('debug session', () => {
    it('should start debug session', () => {
      const sessionId = context.startDebugSession();
      expect(sessionId).toMatch(/^debug_/);
    });

    it('should track path in debug session', () => {
      context.startDebugSession();
      context.addToDebugPath('beat1');
      context.addToDebugPath('beat2');

      expect(context.getCurrentPath()).toEqual(['beat1', 'beat2']);
    });

    it('should complete path and start new', () => {
      context.startDebugSession();
      context.addToDebugPath('beat1');
      context.addToDebugPath('beat2');
      context.completeDebugPath();
      context.addToDebugPath('beat3');

      expect(context.getCurrentPath()).toEqual(['beat3']);
      expect(context.getPathHistory()).toEqual([['beat1', 'beat2']]);
    });

    it('should end debug session', () => {
      context.startDebugSession();
      context.addToDebugPath('beat1');
      context.endDebugSession();

      expect(context.getCurrentPath()).toEqual([]);
      expect(context.getPathHistory()).toEqual([]);
    });

    it('should emit debugSessionStarted event', () => {
      const listener = vi.fn();
      context.on('debugSessionStarted', listener);

      const sessionId = context.startDebugSession();

      expect(listener).toHaveBeenCalledWith({ sessionId });
    });

    it('should emit debugSessionEnded event', () => {
      const sessionId = context.startDebugSession();
      const listener = vi.fn();
      context.on('debugSessionEnded', listener);

      context.endDebugSession();

      expect(listener).toHaveBeenCalledWith({ sessionId });
    });
  });

  describe('analysis caching', () => {
    it('should cache reachability results', () => {
      const results = { reachable: ['beat1', 'beat2'] };
      context.cacheReachabilityResults(results);

      expect(context.getCachedReachability()).toEqual(results);
    });

    it('should cache path results', () => {
      const results = { paths: [['a', 'b', 'c']] };
      context.cachePathResults(results);

      expect(context.getCachedPaths()).toEqual(results);
    });

    it('should invalidate cache', () => {
      context.cacheReachabilityResults({ data: 'test' });
      context.cachePathResults({ data: 'test' });

      context.invalidateAnalysisCache();

      expect(context.getCachedReachability()).toBeNull();
      expect(context.getCachedPaths()).toBeNull();
    });

    it('should check cache validity', () => {
      vi.useFakeTimers();

      context.cacheReachabilityResults({ data: 'test' });
      expect(context.isCacheValid('reachability', 60000)).toBe(true);

      vi.advanceTimersByTime(70000);
      expect(context.isCacheValid('reachability', 60000)).toBe(false);

      vi.useRealTimers();
    });

    it('should emit analysisCacheInvalidated event', () => {
      const listener = vi.fn();
      context.on('analysisCacheInvalidated', listener);

      context.invalidateAnalysisCache();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('AI suggestions', () => {
    it('should add AI suggestion', () => {
      const id = context.addAISuggestion({
        type: 'story_improvement',
        description: 'Add more choices',
      });

      expect(id).toMatch(/^suggestion_/);
    });

    it('should get suggestions', () => {
      context.addAISuggestion({
        type: 'dialog',
        description: 'Improve dialog',
      });

      const suggestions = context.getSuggestions();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('dialog');
      expect(suggestions[0].applied).toBe(false);
    });

    it('should mark suggestion as applied', () => {
      const id = context.addAISuggestion({
        type: 'test',
        description: 'Test suggestion',
      });

      context.applySuggestion(id);

      const suggestions = context.getSuggestions();
      expect(suggestions[0].applied).toBe(true);
    });

    it('should filter suggestions by applied status', () => {
      const id1 = context.addAISuggestion({
        type: 'test',
        description: 'Applied',
      });
      context.addAISuggestion({
        type: 'test',
        description: 'Not applied',
      });

      context.applySuggestion(id1);

      expect(context.getSuggestions({ applied: true })).toHaveLength(1);
      expect(context.getSuggestions({ applied: false })).toHaveLength(1);
    });

    it('should filter suggestions by type', () => {
      context.addAISuggestion({ type: 'dialog', description: 'Dialog' });
      context.addAISuggestion({ type: 'story', description: 'Story' });
      context.addAISuggestion({ type: 'dialog', description: 'Dialog 2' });

      expect(context.getSuggestions({ type: 'dialog' })).toHaveLength(2);
      expect(context.getSuggestions({ type: 'story' })).toHaveLength(1);
    });

    it('should remove suggestion', () => {
      const id = context.addAISuggestion({
        type: 'test',
        description: 'To remove',
      });

      context.removeAISuggestion(id);

      expect(context.getSuggestions()).toHaveLength(0);
    });

    it('should clear all suggestions', () => {
      context.addAISuggestion({ type: 'a', description: 'A' });
      context.addAISuggestion({ type: 'b', description: 'B' });

      context.clearAISuggestions();

      expect(context.getSuggestions()).toHaveLength(0);
    });
  });

  describe('fictional time', () => {
    it('should not have fictional time by default', () => {
      expect(context.getFictionalTime()).toBeUndefined();
    });

    it('should set and get fictional time', () => {
      context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
      const ft = context.getFictionalTime();
      expect(ft).toEqual({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
    });

    it('should return a copy (not a reference)', () => {
      context.setFictionalTime({ year: 2024, month: 1, day: 1, hour: 0, minute: 0 });
      const ft = context.getFictionalTime()!;
      ft.year = 9999;
      expect(context.getFictionalTime()!.year).toBe(2024);
    });

    it('should emit fictionalTimeChanged on set', () => {
      const listener = vi.fn();
      context.on('fictionalTimeChanged', listener);
      context.setFictionalTime({ year: 1929, month: 1, day: 15, hour: 9, minute: 0 });
      expect(listener).toHaveBeenCalledWith({ year: 1929, month: 1, day: 15, hour: 9, minute: 0 });
    });

    describe('advanceFictionalTime', () => {
      beforeEach(() => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
      });

      it('should do nothing if no fictional time is set', () => {
        const fresh = new StoryContext();
        fresh.advanceFictionalTime(1, 'hours');
        expect(fresh.getFictionalTime()).toBeUndefined();
      });

      it('should advance by minutes', () => {
        context.advanceFictionalTime(30, 'minutes');
        expect(context.getFictionalTime()).toEqual({ year: 1968, month: 4, day: 4, hour: 9, minute: 30 });
      });

      it('should advance by hours', () => {
        context.advanceFictionalTime(3, 'hours');
        expect(context.getFictionalTime()).toEqual({ year: 1968, month: 4, day: 4, hour: 12, minute: 0 });
      });

      it('should advance by days', () => {
        context.advanceFictionalTime(2, 'days');
        expect(context.getFictionalTime()).toEqual({ year: 1968, month: 4, day: 6, hour: 9, minute: 0 });
      });

      it('should advance by months', () => {
        context.advanceFictionalTime(1, 'months');
        expect(context.getFictionalTime()).toEqual({ year: 1968, month: 5, day: 4, hour: 9, minute: 0 });
      });

      it('should advance by years', () => {
        context.advanceFictionalTime(1, 'years');
        expect(context.getFictionalTime()).toEqual({ year: 1969, month: 4, day: 4, hour: 9, minute: 0 });
      });

      it('should handle month rollover', () => {
        context.setFictionalTime({ year: 1968, month: 12, day: 31, hour: 23, minute: 30 });
        context.advanceFictionalTime(1, 'hours');
        const ft = context.getFictionalTime()!;
        expect(ft.year).toBe(1969);
        expect(ft.month).toBe(1);
        expect(ft.day).toBe(1);
        expect(ft.hour).toBe(0);
        expect(ft.minute).toBe(30);
      });

      it('should subtract time (negative amount)', () => {
        context.advanceFictionalTime(-2, 'days');
        expect(context.getFictionalTime()).toEqual({ year: 1968, month: 4, day: 2, hour: 9, minute: 0 });
      });

      it('should emit fictionalTimeChanged on advance', () => {
        const listener = vi.fn();
        context.on('fictionalTimeChanged', listener);
        context.advanceFictionalTime(1, 'hours');
        expect(listener).toHaveBeenCalled();
      });
    });

    describe('formatFictionalTime', () => {
      beforeEach(() => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
      });

      it('should return empty string if no fictional time set', () => {
        const fresh = new StoryContext();
        expect(fresh.formatFictionalTime('date')).toBe('');
      });

      it('should format as 12h time', () => {
        expect(context.formatFictionalTime('time-12h')).toBe('9:00 AM');
      });

      it('should format PM correctly', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 21, minute: 30 });
        expect(context.formatFictionalTime('time-12h')).toBe('9:30 PM');
      });

      it('should format midnight as 12:00 AM', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 0, minute: 0 });
        expect(context.formatFictionalTime('time-12h')).toBe('12:00 AM');
      });

      it('should format noon as 12:00 PM', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 12, minute: 0 });
        expect(context.formatFictionalTime('time-12h')).toBe('12:00 PM');
      });

      it('should format as 24h time', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 21, minute: 5 });
        expect(context.formatFictionalTime('time-24h')).toBe('21:05');
      });

      it('should format as date', () => {
        expect(context.formatFictionalTime('date')).toBe('4 April 1968');
      });

      it('should format as datetime 12h', () => {
        expect(context.formatFictionalTime('datetime-12h')).toBe('4 April 1968, 9:00 AM');
      });

      it('should format as datetime 24h', () => {
        expect(context.formatFictionalTime('datetime-24h')).toBe('4 April 1968, 09:00');
      });

      it('should format as year only', () => {
        expect(context.formatFictionalTime('year')).toBe('1968');
      });

      it('should format as day-number from initial', () => {
        const initial = { year: 1968, month: 4, day: 1, hour: 0, minute: 0 };
        expect(context.formatFictionalTime('day-number', initial)).toBe('Day 4');
      });

      it('should return Day 1 without initial time', () => {
        expect(context.formatFictionalTime('day-number')).toBe('Day 1');
      });
    });

    describe('fictionalTime condition', () => {
      it('should return false if no fictional time set', () => {
        const result = context.checkCondition({
          type: 'fictionalTime',
          operator: '>',
          compareTime: { year: 1960, month: 1, day: 1, hour: 0, minute: 0 },
        });
        expect(result).toBe(false);
      });

      it('should return false if no compareTime', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
        const result = context.checkCondition({
          type: 'fictionalTime',
          operator: '>',
        });
        expect(result).toBe(false);
      });

      it('should check "after" (>) correctly', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '>',
          compareTime: { year: 1960, month: 1, day: 1, hour: 0, minute: 0 },
        })).toBe(true);
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '>',
          compareTime: { year: 1970, month: 1, day: 1, hour: 0, minute: 0 },
        })).toBe(false);
      });

      it('should check "before" (<) correctly', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '<',
          compareTime: { year: 1970, month: 1, day: 1, hour: 0, minute: 0 },
        })).toBe(true);
      });

      it('should check "exactly" (==) correctly', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '==',
          compareTime: { year: 1968, month: 4, day: 4, hour: 9, minute: 0 },
        })).toBe(true);
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '==',
          compareTime: { year: 1968, month: 4, day: 4, hour: 9, minute: 1 },
        })).toBe(false);
      });

      it('should check "not equal" (!=) correctly', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '!=',
          compareTime: { year: 1970, month: 1, day: 1, hour: 0, minute: 0 },
        })).toBe(true);
      });

      it('should check ">=" correctly', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '>=',
          compareTime: { year: 1968, month: 4, day: 4, hour: 9, minute: 0 },
        })).toBe(true);
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '>=',
          compareTime: { year: 1968, month: 4, day: 3, hour: 0, minute: 0 },
        })).toBe(true);
      });

      it('should check "<=" correctly', () => {
        context.setFictionalTime({ year: 1968, month: 4, day: 4, hour: 9, minute: 0 });
        expect(context.checkCondition({
          type: 'fictionalTime',
          operator: '<=',
          compareTime: { year: 1968, month: 4, day: 4, hour: 9, minute: 0 },
        })).toBe(true);
      });
    });

    describe('serialization', () => {
      it('should serialize fictional time', () => {
        context.setFictionalTime({ year: 1929, month: 1, day: 15, hour: 9, minute: 0 });
        const serialized = context.serialize();
        expect(serialized.fictionalTime).toEqual({ year: 1929, month: 1, day: 15, hour: 9, minute: 0 });
      });

      it('should serialize undefined fictional time', () => {
        const serialized = context.serialize();
        expect(serialized.fictionalTime).toBeUndefined();
      });

      it('should restore fictional time from serialized state', () => {
        context.setFictionalTime({ year: 1929, month: 1, day: 15, hour: 9, minute: 0 });
        const serialized = context.serialize();

        const restored = new StoryContext();
        restored.loadFromSerialized(serialized);
        expect(restored.getFictionalTime()).toEqual({ year: 1929, month: 1, day: 15, hour: 9, minute: 0 });
      });

      it('should handle loading serialized state without fictional time', () => {
        const serialized = context.serialize();
        const restored = new StoryContext();
        restored.loadFromSerialized(serialized);
        expect(restored.getFictionalTime()).toBeUndefined();
      });
    });
  });

  describe('current beat management', () => {
    it('should get current beat ID', () => {
      expect(context.getCurrentBeatId()).toBe('0');
    });

    it('should set current beat ID', () => {
      context.setCurrentBeatId('newBeat');
      expect(context.getCurrentBeatId()).toBe('newBeat');
    });

    it('should emit beatChanged event', () => {
      const listener = vi.fn();
      context.on('beatChanged', listener);

      context.setCurrentBeatId('chapter2');

      expect(listener).toHaveBeenCalledWith({ beatId: 'chapter2' });
    });
  });
});
