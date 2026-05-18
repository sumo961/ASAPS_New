import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetVariableBeat } from '../../src/beats/SetVariableBeat';
import { ConditionBeat } from '../../src/beats/ConditionBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function createMockRenderer(): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

// Minimal fake Story exposing the two methods StoryContext touches during
// seeding. Each character carries an editor-style counters[] array.
function makeStory(characters: any[]) {
  return {
    getCharacters: () => characters,
    getFirstBeatId: () => '0',
  } as any;
}

const wolf = {
  id: 'wolf',
  name: 'Wolf',
  displayName: 'Wolf',
  counters: [{ name: 'health', displayName: 'Health', value: 100, visible: true }],
};
const granny = {
  id: 'granny',
  name: 'Granny',
  displayName: 'Granny',
  counters: [{ name: 'health', displayName: 'Health', value: 40, visible: true }],
};

async function runSetVariable(context: StoryContext, params: Record<string, any>) {
  const beat = new SetVariableBeat({
    id: `sv_${Math.random()}`,
    name: 'Set',
    type: 'setVariable',
    parameters: params as any,
  } as any);
  await (beat as any).performAction(context, createMockRenderer());
}

describe('Character-scoped counters', () => {
  describe('WS1 — seeding Character.counters[] into the runtime store', () => {
    it('seeds each character\'s authored counters at construction', () => {
      const context = new StoryContext(undefined, makeStory([wolf, granny]));
      expect(context.getCharacterCounter('wolf', 'health')).toBe(100);
      expect(context.getCharacterCounter('granny', 'health')).toBe(40);
    });

    it('does not leak character counters into the global store', () => {
      const context = new StoryContext(undefined, makeStory([wolf, granny]));
      expect(context.getCounter('health')).toBe(0);
    });

    it('re-seeds on reset()', () => {
      const context = new StoryContext(undefined, makeStory([wolf]));
      context.setCharacterCounter('wolf', 'health', 5);
      context.reset();
      expect(context.getCharacterCounter('wolf', 'health')).toBe(100);
    });

    it('does not overwrite a value already present (loaded save / prior mutation)', () => {
      const context = new StoryContext(undefined, makeStory([wolf]));
      // Simulate a beat mutating before a manual re-seed call.
      context.setCharacterCounter('wolf', 'health', 12);
      context.seedCharacterCountersFromStory();
      expect(context.getCharacterCounter('wolf', 'health')).toBe(12);
    });
  });

  describe('WS2 — setVariable scoped mutation, no cross-character collision', () => {
    it('mutates only the targeted character; same counter name is independent', async () => {
      const context = new StoryContext(undefined, makeStory([wolf, granny]));
      await runSetVariable(context, {
        type: 'counter', name: 'health', operation: 'subtract', value: 30, character: 'wolf',
      });
      expect(context.getCharacterCounter('wolf', 'health')).toBe(70);
      expect(context.getCharacterCounter('granny', 'health')).toBe(40); // untouched
      expect(context.getCounter('health')).toBe(0); // global untouched
    });

    it('supports set/add/multiply on the scoped store', async () => {
      const context = new StoryContext(undefined, makeStory([wolf]));
      await runSetVariable(context, { type: 'counter', name: 'health', operation: 'set', value: 10, character: 'wolf' });
      expect(context.getCharacterCounter('wolf', 'health')).toBe(10);
      await runSetVariable(context, { type: 'counter', name: 'health', operation: 'add', value: 5, character: 'wolf' });
      expect(context.getCharacterCounter('wolf', 'health')).toBe(15);
      await runSetVariable(context, { type: 'counter', name: 'health', operation: 'multiply', value: 2, character: 'wolf' });
      expect(context.getCharacterCounter('wolf', 'health')).toBe(30);
    });
  });

  describe('Zero-regression — omitted owner is the unchanged global path', () => {
    it('setVariable without character writes the global counter only', async () => {
      const context = new StoryContext(undefined, makeStory([wolf]));
      await runSetVariable(context, { type: 'counter', name: 'score', operation: 'add', value: 7 });
      expect(context.getCounter('score')).toBe(7);
      expect(context.getCharacterCounter('wolf', 'score')).toBe(0);
    });

    it('works with a characterless story (global counter unaffected)', async () => {
      const context = new StoryContext(undefined, makeStory([]));
      await runSetVariable(context, { type: 'counter', name: 'tally', operation: 'set', value: 3 });
      expect(context.getCounter('tally')).toBe(3);
    });
  });

  describe('WS3 — conditionBeat scoped counter reads', () => {
    function cond(extra: Record<string, any>) {
      return new ConditionBeat({
        id: 'c1', name: 'c', type: 'conditionBeat',
        conditionType: 'counter', variableName: 'health',
        operator: '<', value: 50, trueTarget: 'low', falseTarget: 'ok',
        ...extra,
      } as any);
    }

    it('reads the character-scoped counter when character is set', () => {
      const context = new StoryContext(undefined, makeStory([wolf, granny]));
      // wolf.health=100 (>=50 → false), granny.health=40 (<50 → true)
      expect(context.checkCondition(cond({ character: 'wolf' }).condition)).toBe(false);
      expect(context.checkCondition(cond({ character: 'granny' }).condition)).toBe(true);
    });

    it('reads the global counter when character is omitted', () => {
      const context = new StoryContext(undefined, makeStory([wolf]));
      // global health defaults to 0 (<50 → true), independent of wolf.health=100
      expect(context.checkCondition(cond({}).condition)).toBe(true);
    });

    it('counterCompare scopes both operands to the owner when set', () => {
      const ctx = new StoryContext(undefined, makeStory([{
        id: 'wolf', name: 'Wolf', displayName: 'Wolf',
        counters: [
          { name: 'hp', displayName: 'HP', value: 30, visible: true },
          { name: 'maxhp', displayName: 'Max', value: 100, visible: true },
        ],
      }]));
      const cc = new ConditionBeat({
        id: 'cc', name: 'cc', type: 'conditionBeat',
        conditionType: 'counterCompare', counter1: 'hp', counter2: 'maxhp',
        operator: '<', trueTarget: 't', falseTarget: 'f', character: 'wolf',
      } as any);
      expect(ctx.checkCondition(cc.condition)).toBe(true); // 30 < 100
    });
  });

  describe('WS5/WS7 — param pass-through + serialization round-trip', () => {
    it('SetVariableBeat round-trips the character param via getParameters', () => {
      const beat = new SetVariableBeat({
        id: 'sv', name: 'Set', type: 'setVariable',
        parameters: { type: 'counter', name: 'health', operation: 'subtract', value: 10, character: 'wolf' },
      } as any);
      expect(beat.getParameters().character).toBe('wolf');
    });

    it('characterCounters survive serialize → loadFromSerialized', async () => {
      const context = new StoryContext(undefined, makeStory([wolf, granny]));
      await runSetVariable(context, {
        type: 'counter', name: 'health', operation: 'subtract', value: 25, character: 'wolf',
      });
      const snapshot = context.serialize();

      const restored = new StoryContext(undefined, makeStory([wolf, granny]));
      restored.loadFromSerialized(snapshot);
      expect(restored.getCharacterCounter('wolf', 'health')).toBe(75);
      expect(restored.getCharacterCounter('granny', 'health')).toBe(40);
    });
  });
});
