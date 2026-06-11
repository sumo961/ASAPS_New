/**
 * Tests for extractStoryStateReferences — walks every beat in a
 * story and collects the names of inventory items, counters, and
 * variables that are actually referenced.
 *
 * Critical because the Inspector's Requirements autocomplete reads
 * the union of these + character/global declarations. If the
 * extraction misses a name that the story USES, the author can't
 * pick it from the dropdown and has to retype it (or worse, mistypes
 * it and gates the wrong condition).
 *
 * Coverage focus is on every code path in the file:
 *   - logic beat direct references (addRemoveInventory, setVariable)
 *   - setVariable type-dispatched (variable / counter / inventory)
 *   - conditionBeat flat vs nested condition forms
 *   - dialogTree nested choice walk
 *   - choice / prop effect collection
 *   - connection-level conditions + effects
 *   - top-level beat.requires
 *   - parameters.requires (legacy / AI emission)
 *   - mixed Beat instances + plain JSON input shape
 *   - defensive paths (null beat, non-array beats, malformed data)
 */
import { describe, it, expect } from 'vitest';
import { extractStoryStateReferences } from '../storyStateExtraction';

describe('extractStoryStateReferences', () => {
  describe('defensive shape', () => {
    it('returns empty sets for non-array input', () => {
      const result = extractStoryStateReferences('not an array' as any);
      expect(result.items.size).toBe(0);
      expect(result.counters.size).toBe(0);
      expect(result.variables.size).toBe(0);
    });

    it('returns empty sets for an empty array', () => {
      expect(extractStoryStateReferences([]).items.size).toBe(0);
    });

    it('skips null / undefined entries in the array', () => {
      const result = extractStoryStateReferences([null, undefined] as any);
      expect(result.items.size).toBe(0);
    });

    it('skips entries with no type / parameters without crashing', () => {
      expect(() => extractStoryStateReferences([{} as any])).not.toThrow();
    });
  });

  describe('logic beat — addRemoveInventory', () => {
    it('records the item name', () => {
      const beats = [
        { type: 'addRemoveInventory', parameters: { item: 'key' } },
      ];
      const result = extractStoryStateReferences(beats);
      expect(result.items.has('key')).toBe(true);
    });

    it('trims whitespace around the recorded name', () => {
      // addIfString strips leading/trailing whitespace so authors
      // who accidentally typed " key " don't end up with a
      // separate entry from "key".
      const beats = [
        { type: 'addRemoveInventory', parameters: { item: '  key  ' } },
      ];
      expect(extractStoryStateReferences(beats).items.has('key')).toBe(true);
    });

    it('skips empty / whitespace-only item names', () => {
      const beats = [
        { type: 'addRemoveInventory', parameters: { item: '   ' } },
        { type: 'addRemoveInventory', parameters: { item: '' } },
      ];
      expect(extractStoryStateReferences(beats).items.size).toBe(0);
    });
  });

  describe('logic beat — setVariable type-dispatched', () => {
    it('type:"counter" records to counters', () => {
      const beats = [
        { type: 'setVariable', parameters: { type: 'counter', name: 'score' } },
      ];
      expect(extractStoryStateReferences(beats).counters.has('score')).toBe(true);
    });

    it('type:"inventory" records to items', () => {
      const beats = [
        { type: 'setVariable', parameters: { type: 'inventory', name: 'rope' } },
      ];
      expect(extractStoryStateReferences(beats).items.has('rope')).toBe(true);
    });

    it('default (no type) records to variables', () => {
      const beats = [
        { type: 'setVariable', parameters: { name: 'playerName' } },
      ];
      expect(extractStoryStateReferences(beats).variables.has('playerName')).toBe(true);
    });

    it('accepts variableName as an alias for name', () => {
      const beats = [
        { type: 'setVariable', parameters: { variableName: 'mood' } },
      ];
      expect(extractStoryStateReferences(beats).variables.has('mood')).toBe(true);
    });
  });

  describe('conditionBeat — flat vs nested forms', () => {
    it('extracts state name from the flat inline form', () => {
      // The AI sometimes emits the flat shape: conditionType +
      // variableName at the top level, not nested under condition.
      const beats = [
        { type: 'conditionBeat', parameters: {
            conditionType: 'variable',
            variableName: 'isWise',
        } },
      ];
      expect(extractStoryStateReferences(beats).variables.has('isWise')).toBe(true);
    });

    it('extracts state name from the nested condition form', () => {
      const beats = [
        { type: 'conditionBeat', parameters: {
            condition: { type: 'variable', variableName: 'isWise' },
        } },
      ];
      expect(extractStoryStateReferences(beats).variables.has('isWise')).toBe(true);
    });

    it('counter conditions record to counters', () => {
      const beats = [
        { type: 'conditionBeat', parameters: {
            condition: { type: 'counter', variableName: 'cluesFound' },
        } },
      ];
      expect(extractStoryStateReferences(beats).counters.has('cluesFound')).toBe(true);
    });

    it('counterCompare records BOTH counter1 and counter2', () => {
      // Comparing two counters means both names need autocomplete.
      const beats = [
        { type: 'conditionBeat', parameters: {
            condition: {
              type: 'counterCompare',
              counter1: 'hp',
              counter2: 'maxHp',
            },
        } },
      ];
      const counters = extractStoryStateReferences(beats).counters;
      expect(counters.has('hp')).toBe(true);
      expect(counters.has('maxHp')).toBe(true);
    });

    it('inventory conditions read item (not variableName)', () => {
      // Per the source: inventory conditions store the item name
      // in `item`, not `variableName`. Easy to mis-extract.
      const beats = [
        { type: 'conditionBeat', parameters: {
            condition: { type: 'inventory', item: 'rope' },
        } },
      ];
      expect(extractStoryStateReferences(beats).items.has('rope')).toBe(true);
    });
  });

  describe('pickProp — items + counters + nested effects/conditions', () => {
    it('records prop inventory names', () => {
      const beats = [
        { type: 'pickProp', parameters: { props: [
            { inventoryName: 'key' },
            { inventoryName: 'rope' },
        ] } },
      ];
      const items = extractStoryStateReferences(beats).items;
      expect(items.has('key')).toBe(true);
      expect(items.has('rope')).toBe(true);
    });

    it('falls back through inventoryName > locationName > name', () => {
      const beats = [
        { type: 'pickProp', parameters: { props: [
            { name: 'item-by-name' },                       // name only
            { locationName: 'item-by-loc' },                // locationName
            { inventoryName: 'wins', locationName: 'loses' }, // inventoryName wins
        ] } },
      ];
      const items = extractStoryStateReferences(beats).items;
      expect(items.has('item-by-name')).toBe(true);
      expect(items.has('item-by-loc')).toBe(true);
      expect(items.has('wins')).toBe(true);
      expect(items.has('loses')).toBe(false);  // shadowed
    });

    it('records prop counters', () => {
      const beats = [
        { type: 'pickProp', parameters: { props: [
            { name: 'gold', counter: 'goldCounter' },
        ] } },
      ];
      expect(extractStoryStateReferences(beats).counters.has('goldCounter')).toBe(true);
    });

    it('collects from nested prop effects', () => {
      const beats = [
        { type: 'pickProp', parameters: { props: [
            { name: 'sword', effects: [{ type: 'incrementCounter', target: 'kills' }] },
        ] } },
      ];
      expect(extractStoryStateReferences(beats).counters.has('kills')).toBe(true);
    });
  });

  describe('choice effects — dialogTree, multiChoice, etc.', () => {
    it('walks effects on each choice', () => {
      const beats = [
        { type: 'dialogTree', parameters: { choices: [
            { id: 'c1', effects: [{ type: 'addInventory', target: 'shovel' }] },
            { id: 'c2', effects: [{ type: 'setVariable', target: 'gotShovel' }] },
        ] } },
      ];
      const result = extractStoryStateReferences(beats);
      expect(result.items.has('shovel')).toBe(true);
      expect(result.variables.has('gotShovel')).toBe(true);
    });

    it('walks conditions on choices', () => {
      const beats = [
        { type: 'dialogTree', parameters: { choices: [
            { id: 'c1', condition: { type: 'inventory', item: 'key' } },
        ] } },
      ];
      expect(extractStoryStateReferences(beats).items.has('key')).toBe(true);
    });
  });

  describe('dialogTree nested-node walk', () => {
    it('recurses into nested dialogTree.choices[*].next', () => {
      // DialogTrees are tree-shaped — choices nest forever. The
      // walker must reach effects at any depth.
      const beats = [
        { type: 'dialogTree', parameters: { dialogTree: {
            choices: [{
              id: 'c1',
              next: {
                choices: [{
                  id: 'c2',
                  effects: [{ type: 'addInventory', target: 'deep-treasure' }],
                }],
              },
            }],
        } } },
      ];
      expect(extractStoryStateReferences(beats).items.has('deep-treasure')).toBe(true);
    });

    it('survives a malformed nested node without crashing', () => {
      const beats = [
        { type: 'dialogTree', parameters: { dialogTree: {
            choices: [{ id: 'c1', next: 'not-an-object' as any }],
        } } },
      ];
      expect(() => extractStoryStateReferences(beats)).not.toThrow();
    });
  });

  describe('connection-level conditions and effects', () => {
    it('walks conn.condition + conn.effects', () => {
      const beats = [
        { type: 'infoText', parameters: {}, connections: [
            { targetId: 't', condition: { type: 'variable', variableName: 'isReady' } },
            { targetId: 't', effects: [{ type: 'incrementCounter', target: 'visits' }] },
        ] },
      ];
      const result = extractStoryStateReferences(beats);
      expect(result.variables.has('isReady')).toBe(true);
      expect(result.counters.has('visits')).toBe(true);
    });

    it('skips connections without condition/effects', () => {
      const beats = [
        { type: 'infoText', parameters: {}, connections: [
            { targetId: 't' },
        ] },
      ];
      expect(() => extractStoryStateReferences(beats)).not.toThrow();
    });
  });

  describe('requires (StateRequirement[])', () => {
    it('reads top-level beat.requires[*].condition', () => {
      const beats = [
        { type: 'infoText', parameters: {}, requires: [
            { condition: { type: 'inventory', item: 'badge' } },
        ] },
      ];
      expect(extractStoryStateReferences(beats).items.has('badge')).toBe(true);
    });

    it('reads parameters.requires (legacy / AI emission)', () => {
      // Per the source comment: AI-generated stories sometimes
      // tuck requires inside parameters.
      const beats = [
        { type: 'infoText', parameters: { requires: [
            { condition: { type: 'variable', variableName: 'pickedUp' } },
        ] } },
      ];
      expect(extractStoryStateReferences(beats).variables.has('pickedUp')).toBe(true);
    });
  });

  describe('input shape — Beat instances vs plain JSON', () => {
    it('calls beat.getParameters() when present', () => {
      // Beat instances expose getParameters() — the extraction
      // must call it (not look at beat.parameters directly).
      const beat = {
        type: 'setVariable',
        getParameters: () => ({ type: 'counter', name: 'fromInstance' }),
      } as any;
      expect(extractStoryStateReferences([beat]).counters.has('fromInstance')).toBe(true);
    });

    it('reads plain beat.parameters when no getParameters method', () => {
      const beat = {
        type: 'setVariable',
        parameters: { type: 'counter', name: 'fromPlain' },
      };
      expect(extractStoryStateReferences([beat]).counters.has('fromPlain')).toBe(true);
    });
  });

  describe('integration — multiple beat types collected at once', () => {
    it('unions references across the whole story', () => {
      const beats = [
        { type: 'setVariable', parameters: { name: 'visited' } },
        { type: 'addRemoveInventory', parameters: { item: 'token' } },
        { type: 'conditionBeat', parameters: {
            condition: { type: 'counter', variableName: 'score' },
        } },
        { type: 'infoText', parameters: {}, requires: [
            { condition: { type: 'inventory', item: 'badge' } },
        ] },
      ];
      const result = extractStoryStateReferences(beats);
      expect(result.variables.has('visited')).toBe(true);
      expect(result.items.has('token')).toBe(true);
      expect(result.items.has('badge')).toBe(true);
      expect(result.counters.has('score')).toBe(true);
    });

    it('does not pollute across kind boundaries (a counter name does not appear in items)', () => {
      // Regression — if a counter and item happen to share a
      // name, they remain in their own sets.
      const beats = [
        { type: 'setVariable', parameters: { type: 'counter', name: 'collisionName' } },
      ];
      const result = extractStoryStateReferences(beats);
      expect(result.counters.has('collisionName')).toBe(true);
      expect(result.items.has('collisionName')).toBe(false);
      expect(result.variables.has('collisionName')).toBe(false);
    });
  });
});
