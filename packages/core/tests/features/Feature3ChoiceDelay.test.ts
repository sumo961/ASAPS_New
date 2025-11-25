/**
 * Feature 3: Choice Delay with Fade-in - Integration Tests
 *
 * Tests the complete implementation as per FEATURE_3_IMPLEMENTATION.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { ASMLGenerator } from '../../src/xml/ASMLGenerator';
import { ASMLParser } from '../../src/xml/ASMLParser';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { createTestBeat, createTestStory } from '../test-utils';
import { MovementChoiceBeat } from '../../src/beats/MovementChoiceBeat';
import { PickPropBeat } from '../../src/beats/PickPropBeat';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';

describe('Feature 3: Choice Delay with Fade-in', () => {
  let beatRegistry: BeatTypeRegistry;
  let generator: ASMLGenerator;
  let parser: ASMLParser;

  beforeEach(() => {
    beatRegistry = BeatTypeRegistry.getInstance();
    generator = new ASMLGenerator();
    parser = new ASMLParser();
  });

  function createMovementChoiceBeat(config: any): MovementChoiceBeat {
    const beatConfig = {
      id: config.id || 'movement_beat',
      name: config.name || 'Movement Test',
      type: 'movementChoice' as const,
      parameters: {
        question: config.question || 'Where do you want to go?',
        choiceDelay: config.choiceDelay,
        choices: config.choices || []
      },
      ...config
    };
    return createTestBeat(beatConfig) as MovementChoiceBeat;
  }

  function createPickPropBeat(config: any): PickPropBeat {
    const beatConfig = {
      id: config.id || 'pickprop_beat',
      name: config.name || 'PickProp Test',
      type: 'pickProp' as const,
      parameters: {
        question: config.question || 'What do you want?',
        choiceDelay: config.choiceDelay,
        props: config.props || []
      },
      ...config
    };
    return createTestBeat(beatConfig) as PickPropBeat;
  }

  function createDialogTreeBeat(config: any): DialogTreeBeat {
    const beatConfig = {
      id: config.id || 'dialog_beat',
      name: config.name || 'Dialog Test',
      type: 'dialogTree' as const,
      parameters: {
        choiceDelay: config.choiceDelay,
        dialogTree: config.dialogTree || {
          id: 'root',
          speaker: 'NPC',
          text: 'Hello'
        }
      },
      ...config
    };
    return createTestBeat(beatConfig) as DialogTreeBeat;
  }

  describe('1. movementChoice beat with choiceDelay', () => {
    it('should export ASML with delay element', () => {
      const beat = createMovementChoiceBeat({
        id: 'movement_beat',
        name: 'Movement Test',
        question: 'Where do you want to go?',
        choiceDelay: 2.0,
        choices: [
          {
            id: 'left',
            text: 'Go left',
            location: 'forest',
            target: 'next_beat'
          },
          {
            id: 'right',
            text: 'Go right',
            location: 'cave',
            target: 'cave_beat'
          }
        ]
      });

      const story = new Story();
      story.addBeat(beat);

      const xml = generator.generate(story);

      // Test that delay element exists in export
      expect(xml).toContain('<delay val="2" />');

      // Test that it's in the correct location (before choices)
      const delayIndex = xml.indexOf('<delay val="2" />');
      const firstChoiceIndex = xml.indexOf('<choice');
      expect(delayIndex).toBeLessThan(firstChoiceIndex);

      // Verify choices are still present
      expect(xml).toContain('text="Go left"');
      expect(xml).toContain('text="Go right"');
    });

    it('should import ASML and preserve choiceDelay', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<story>
  <settings>
    <project width="1024" height="768" aspectRatio="4:3" scalingMode="fit" />
    <debug firstbeat="0" showvals="off" />
    <colors pcolor="#7D8DA3" palpha="90" />
    <fonts titleFont="Gothic" textFont="Handwriting2" />
    <textbox radius="20" />
    <texteffects animation="none" />
    <hotspots visible="true" labels="true" />
    <backgroundsound name="" volume="70" mute="false" />
  </settings>
  <environment>
  </environment>
  <characters>
  </characters>
  <plot>
    <clusters />
    <beat>
      <id id="movement_beat" name="Movement Test" />
      <function kind="movementChoice" question="Where do you want to go?">
        <delay val="2.0" />
        <choice id="left" text="Go left" location="forest" target="next_beat" />
        <choice id="right" text="Go right" location="cave" target="cave_beat" />
      </function>
    </beat>
  </plot>
</story>`;

      const result = await parser.parse(xml);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      if (result.success && result.story) {
        const beat = result.story.getBeat('movement_beat');
        expect(beat).toBeDefined();

        const params = beat!.getParameters();
        expect(params.choiceDelay).toBe(2.0);
      }
    });
  });

  describe('2. pickProp beat with choiceDelay', () => {
    it('should export ASML with delay element', () => {
      const story = new Story();
      story.addBeat({
        id: 'pickprop_beat',
        name: 'PickProp Test',
        type: 'pickProp',
        parameters: {
          question: 'What do you want to interact with?',
          choiceDelay: 2.5,
          props: [
            {
              id: 'sword',
              name: 'Sword',
              description: 'A sharp sword',
              target: 'sword_beat'
            },
            {
              id: 'shield',
              name: 'Shield',
              description: 'A sturdy shield',
              target: 'shield_beat'
            }
          ]
        }
      });

      const xml = generator.generate(story);

      // Test that delay element exists in export
      expect(xml).toContain('<delay val="2.5" />');

      // Test that it's in the correct location (before props)
      const delayIndex = xml.indexOf('<delay val="2.5" />');
      const firstPropIndex = xml.indexOf('<prop');
      expect(delayIndex).toBeLessThan(firstPropIndex);

      // Verify props are still present
      expect(xml).toContain('name="Sword"');
      expect(xml).toContain('name="Shield"');
    });
  });

  describe('3. dialogTree beat with choiceDelay', () => {
    it('should export ASML with delay element', () => {
      const story = new Story();
      story.addBeat({
        id: 'dialog_beat',
        name: 'Dialog Test',
        type: 'dialogTree',
        parameters: {
          choiceDelay: 1.5,
          dialogTree: {
            id: 'root',
            speaker: 'NPC',
            text: 'Hello, traveler!',
            choices: [
              {
                id: 'greet',
                text: 'Greet them',
                target: 'greet_beat'
              },
              {
                id: 'ignore',
                text: 'Walk away',
                target: 'ignore_beat'
              }
            ]
          }
        }
      });

      const xml = generator.generate(story);

      // Test that delay element exists in export
      expect(xml).toContain('<delay val="1.5" />');

      // Test that it's in the correct location (before choices in dialogTree)
      const delayIndex = xml.indexOf('<delay val="1.5" />');
      const firstChoiceIndex = xml.indexOf('<choice');
      expect(delayIndex).toBeLessThan(firstChoiceIndex);

      // Verify dialog tree structure and choices are still present
      expect(xml).toContain('speaker="NPC"');
      expect(xml).toContain('text="Hello, traveler!"');
      expect(xml).toContain('text="Greet them"');
      expect(xml).toContain('text="Walk away"');
    });
  });

  describe('4. Beats WITHOUT choiceDelay should not export delay element', () => {
    it('should not include delay element when choiceDelay is not set', () => {
      const story = new Story();
      story.addBeat({
        id: 'no_delay_beat',
        name: 'No Delay Test',
        type: 'movementChoice',
        parameters: {
          question: 'Where do you want to go?',
          choices: [
            {
              id: 'left',
              text: 'Go left',
              location: 'forest',
              target: 'next_beat'
            }
          ]
        }
      });

      const xml = generator.generate(story);

      // Test that delay element does NOT exist
      expect(xml).not.toContain('<delay');

      // Verify beat still works normally
      expect(xml).toContain('kind="movementChoice"');
      expect(xml).toContain('text="Go left"');
    });

    it('should not include delay element when choiceDelay is 0', () => {
      const story = new Story();
      story.addBeat({
        id: 'zero_delay_beat',
        name: 'Zero Delay Test',
        type: 'pickProp',
        parameters: {
          question: 'What do you see?',
          choiceDelay: 0,
          props: [
            {
              id: 'rock',
              name: 'Rock',
              description: 'Just a rock',
              target: 'next_beat'
            }
          ]
        }
      });

      const xml = generator.generate(story);

      // Test that delay element does NOT exist when value is 0
      expect(xml).not.toContain('<delay');
    });
  });

  describe('5. Import/export round-trip', () => {
    it('should preserve choiceDelay through complete round-trip', async () => {
      const originalStory = new Story();
      originalStory.addBeat({
        id: 'roundtrip_beat',
        name: 'Round Trip Test',
        type: 'movementChoice',
        parameters: {
          question: 'Test question?',
          choiceDelay: 3.5,
          choices: [
            {
              id: 'option1',
              text: 'Option 1',
              location: 'loc1',
              target: 'beat1'
            }
          ]
        }
      });

      // Export to XML
      const xml = generator.generate(originalStory);
      expect(xml).toContain('<delay val="3.5" />');

      // Import back from XML
      const result = await parser.parse(xml);
      expect(result.success).toBe(true);

      if (result.success && result.story) {
        const importedBeat = result.story.getBeat('roundtrip_beat');
        expect(importedBeat).toBeDefined();

        const params = importedBeat!.getParameters();
        expect(params.choiceDelay).toBe(3.5);
        expect(params.question).toBe('Test question?');
        expect(params.choices).toHaveLength(1);
        expect(params.choices[0].text).toBe('Option 1');
      }
    });
  });

  describe('6. Edge cases', () => {
    it('should handle negative delay values (treat as 0)', () => {
      const story = new Story();
      story.addBeat({
        id: 'negative_delay_beat',
        name: 'Negative Delay Test',
        type: 'movementChoice',
        parameters: {
          question: 'Test?',
          choiceDelay: -1,
          choices: [
            {
              id: 'option',
              text: 'Option',
              location: 'loc',
              target: 'next'
            }
          ]
        }
      });

      const xml = generator.generate(story);
      // Should not export delay for negative values
      expect(xml).not.toContain('<delay');
    });

    it('should handle decimal precision correctly', () => {
      const story = new Story();
      story.addBeat({
        id: 'decimal_delay_beat',
        name: 'Decimal Delay Test',
        type: 'dialogTree',
        parameters: {
          choiceDelay: 2.75,
          dialogTree: {
            id: 'root',
            speaker: 'Test',
            text: 'Test',
            choices: [
              {
                id: 'c1',
                text: 'Choice',
                target: 'next'
              }
            ]
          }
        }
      });

      const xml = generator.generate(story);
      // Should preserve decimal precision
      expect(xml).toContain('val="2.75"');
    });
  });
});