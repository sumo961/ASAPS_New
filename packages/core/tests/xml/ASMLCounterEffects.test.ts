/**
 * Tests for ASML parser producing canonical effects and generator reading them.
 * Verifies the fix for dead `type: "counter"` entries and proper round-trip.
 */
import { describe, it, expect } from 'vitest';
import { ASMLParser } from '../../src/xml/ASMLParser';
import { ASMLGenerator } from '../../src/xml/ASMLGenerator';
import { Story } from '../../src/engine/Story';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';

describe('ASML Counter Effects Format', () => {
  describe('ASMLParser - canonical effects', () => {
    it('should produce incrementCounter effect from ASML counter attribute', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<story title="Test">
  <plot>
    <beat>
      <id id="0" name="Dialog1" />
      <function kind="conversationChoice">
        <questioner>NPC</questioner>
        <question>Hello!</question>
        <choice id="c1" content="Be brave" targetBeat="beat2" counter="courage,05" />
      </function>
    </beat>
  </plot>
</story>`;

      const parser = new ASMLParser();
      const result = await parser.parse(xml);

      expect(result.success).toBe(true);
      expect(result.story).toBeDefined();

      // Find the dialogTree beat
      const beats = result.story!.getAllBeats();
      const beat = beats.find(b => b.name === 'Dialog1');
      expect(beat).toBeDefined();

      const params = beat!.getParameters();
      const dialogTree = params?.dialogTree;
      expect(dialogTree).toBeDefined();

      const choice = dialogTree.choices[0];

      // Should have canonical incrementCounter effect
      expect(choice.effects).toBeDefined();
      expect(choice.effects.length).toBe(1);
      expect(choice.effects[0]).toEqual({
        type: 'incrementCounter',
        target: 'courage',
        value: 5,
      });

      // Should NOT have dead type: "counter" entries
      expect(choice.effects[0].type).not.toBe('counter');
    });

    it('should skip counter attribute with "undefined,00" value', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<story title="Test">
  <plot>
    <beat>
      <id id="0" name="Dialog1" />
      <function kind="conversationChoice">
        <questioner>NPC</questioner>
        <question>Hello!</question>
        <choice id="c1" content="Go" targetBeat="beat2" counter="undefined,00" />
      </function>
    </beat>
  </plot>
</story>`;

      const parser = new ASMLParser();
      const result = await parser.parse(xml);

      expect(result.success).toBe(true);
      const beats = result.story!.getAllBeats();
      const beat = beats.find(b => b.name === 'Dialog1');
      expect(beat).toBeDefined();
      const params = beat!.getParameters();
      const choice = params.dialogTree.choices[0];

      // Should not have any effects for "undefined,00"
      expect(choice.effects ?? []).toEqual([]);
    });

    it('should parse counter value of 0 correctly', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<story title="Test">
  <plot>
    <beat>
      <id id="0" name="Dialog1" />
      <function kind="conversationChoice">
        <questioner>NPC</questioner>
        <question>Hello!</question>
        <choice id="c1" content="Reset" targetBeat="beat2" counter="score,00" />
      </function>
    </beat>
  </plot>
</story>`;

      const parser = new ASMLParser();
      const result = await parser.parse(xml);

      expect(result.success).toBe(true);
      const beats = result.story!.getAllBeats();
      const beat = beats.find(b => b.name === 'Dialog1');
      expect(beat).toBeDefined();
      const params = beat!.getParameters();
      const choice = params.dialogTree.choices[0];

      expect(choice.effects).toEqual([
        { type: 'incrementCounter', target: 'score', value: 0 },
      ]);
    });
  });

  describe('ASMLGenerator - reads from effects array', () => {
    it('should export counter attributes from effects array', () => {
      const registry = BeatTypeRegistry.getInstance();
      const story = new Story();

      story.addBeat(registry.createBeat('dialogTree', {
        id: 'beat1',
        name: 'Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hello',
          choices: [
            {
              id: 'c1',
              text: 'Be brave',
              target: 'beat2',
              effects: [
                { type: 'incrementCounter', target: 'courage', value: 5 },
              ],
            },
          ],
        },
      }));
      story.addBeat(registry.createBeat('endScreen', {
        id: 'beat2',
        name: 'End',
        type: 'endScreen',
        message: 'Done',
      }));
      story.setMetadata({ firstBeatId: 'beat1' });

      const generator = new ASMLGenerator();
      const xml = generator.generate(story);

      // Should contain counter attribute in ASML format
      expect(xml).toContain('counter="courage"');
      expect(xml).toContain('operation="change"');
      expect(xml).toContain('val="5"');
    });

    it('should export setCounter as operation="set"', () => {
      const registry = BeatTypeRegistry.getInstance();
      const story = new Story();

      story.addBeat(registry.createBeat('dialogTree', {
        id: 'beat1',
        name: 'Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hello',
          choices: [
            {
              id: 'c1',
              text: 'Reset score',
              target: 'beat2',
              effects: [
                { type: 'setCounter', target: 'score', value: 0 },
              ],
            },
          ],
        },
      }));
      story.addBeat(registry.createBeat('endScreen', {
        id: 'beat2',
        name: 'End',
        type: 'endScreen',
        message: 'Done',
      }));
      story.setMetadata({ firstBeatId: 'beat1' });

      const generator = new ASMLGenerator();
      const xml = generator.generate(story);

      expect(xml).toContain('counter="score"');
      expect(xml).toContain('operation="set"');
      expect(xml).toContain('val="0"');
    });

    it('should export non-counter effects as child elements', () => {
      const registry = BeatTypeRegistry.getInstance();
      const story = new Story();

      story.addBeat(registry.createBeat('dialogTree', {
        id: 'beat1',
        name: 'Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hello',
          choices: [
            {
              id: 'c1',
              text: 'Take gift',
              target: 'beat2',
              effects: [
                { type: 'incrementCounter', target: 'gifts', value: 1 },
                { type: 'setVariable', target: 'gotGift', value: 'true' },
                { type: 'addInventory', target: 'ring' },
              ],
            },
          ],
        },
      }));
      story.addBeat(registry.createBeat('endScreen', {
        id: 'beat2',
        name: 'End',
        type: 'endScreen',
        message: 'Done',
      }));
      story.setMetadata({ firstBeatId: 'beat1' });

      const generator = new ASMLGenerator();
      const xml = generator.generate(story);

      // Counter exported as attribute
      expect(xml).toContain('counter="gifts"');

      // Non-counter effects exported as child elements
      expect(xml).toContain('type="setVariable"');
      expect(xml).toContain('target="gotGift"');
      expect(xml).toContain('type="addInventory"');
      expect(xml).toContain('target="ring"');
    });
  });
});
