/**
 * Tests for extractBeatSourceStrings - single-beat string extraction for translation sync
 *
 * This function produces ID-based keys (e.g., beat:abc123.parameters.text) used
 * for incremental staleness detection when a user edits source text.
 */

import { describe, it, expect } from 'vitest';
import { extractBeatSourceStrings } from '../StoryTranslator';

describe('extractBeatSourceStrings', () => {
  it('should extract text field from infoText beat', () => {
    const beat = { type: 'infoText', parameters: { text: 'Hello world' } };
    const strings = extractBeatSourceStrings(beat, 'beat1');

    expect(strings['beat:beat1.parameters.text']).toBe('Hello world');
  });

  it('should extract common fields from durScreen beat', () => {
    const beat = {
      type: 'durScreen',
      parameters: {
        text: 'Main text',
        buttonText: 'Continue',
      },
    };
    const strings = extractBeatSourceStrings(beat, 'dur1');

    expect(strings['beat:dur1.parameters.text']).toBe('Main text');
    expect(strings['beat:dur1.parameters.buttonText']).toBe('Continue');
  });

  it('should extract textVariations', () => {
    const beat = {
      type: 'durScreen',
      parameters: {
        text: 'Main',
        textVariations: ['Variant A', 'Variant B'],
      },
    };
    const strings = extractBeatSourceStrings(beat, 'tv1');

    expect(strings['beat:tv1.parameters.textVariations.0']).toBe('Variant A');
    expect(strings['beat:tv1.parameters.textVariations.1']).toBe('Variant B');
  });

  it('should extract movementChoice displayText from choices', () => {
    const beat = {
      type: 'movementChoice',
      parameters: {
        text: 'Where do you go?',
        choices: [
          { text: 'Forest', displayText: 'Dark Forest', location: 'forest', target: 'b2' },
          { text: 'Cave', location: 'cave', target: 'b3' },
        ],
      },
    };
    const strings = extractBeatSourceStrings(beat, 'mc1');

    expect(strings['beat:mc1.parameters.text']).toBe('Where do you go?');
    // displayText preferred over text for choices
    expect(strings['beat:mc1.parameters.choices.0.displayText']).toBe('Dark Forest');
    // Falls back to text when no displayText
    expect(strings['beat:mc1.parameters.choices.1.displayText']).toBe('Cave');
  });

  it('should extract pickProp displayName and description', () => {
    const beat = {
      type: 'pickProp',
      parameters: {
        text: 'Pick an item',
        props: [
          { name: 'key', displayName: 'Golden Key', description: 'A shiny golden key' },
          { name: 'torch', description: 'A burning torch' },
        ],
      },
    };
    const strings = extractBeatSourceStrings(beat, 'pp1');

    expect(strings['beat:pp1.parameters.text']).toBe('Pick an item');
    expect(strings['beat:pp1.parameters.props.0.displayName']).toBe('Golden Key');
    expect(strings['beat:pp1.parameters.props.0.description']).toBe('A shiny golden key');
    // Falls back to name when no displayName
    expect(strings['beat:pp1.parameters.props.1.displayName']).toBe('torch');
    expect(strings['beat:pp1.parameters.props.1.description']).toBe('A burning torch');
  });

  it('should extract endScreen fields', () => {
    const beat = {
      type: 'endScreen',
      parameters: {
        message: 'The End',
        restartText: 'Play Again',
        creditsText: 'Created by Test',
      },
    };
    const strings = extractBeatSourceStrings(beat, 'end1');

    expect(strings['beat:end1.parameters.message']).toBe('The End');
    expect(strings['beat:end1.parameters.restartText']).toBe('Play Again');
    expect(strings['beat:end1.parameters.creditsText']).toBe('Created by Test');
  });

  it('should extract inputText placeholder', () => {
    const beat = {
      type: 'inputText',
      parameters: {
        text: 'Enter the password:',
        placeholder: 'Type here...',
      },
    };
    const strings = extractBeatSourceStrings(beat, 'inp1');

    expect(strings['beat:inp1.parameters.text']).toBe('Enter the password:');
    expect(strings['beat:inp1.parameters.placeholder']).toBe('Type here...');
  });

  it('should extract hyperText hyperlinks', () => {
    const beat = {
      type: 'hyperText',
      parameters: {
        text: 'You see a door and a window.',
        hyperlinks: [
          { word: 'door', target: 'b2' },
          { word: 'window', target: 'b3' },
        ],
      },
    };
    const strings = extractBeatSourceStrings(beat, 'ht1');

    expect(strings['beat:ht1.parameters.text']).toBe('You see a door and a window.');
    expect(strings['beat:ht1.parameters.hyperlinks.0.word']).toBe('door');
    expect(strings['beat:ht1.parameters.hyperlinks.1.word']).toBe('window');
  });

  it('should extract titleScreen fields', () => {
    const beat = {
      type: 'titleScreen',
      parameters: {
        title: 'My Story',
        author: 'Test Author',
        buttonText: 'Start',
      },
    };
    const strings = extractBeatSourceStrings(beat, 'ts1');

    expect(strings['beat:ts1.parameters.title']).toBe('My Story');
    expect(strings['beat:ts1.parameters.author']).toBe('Test Author');
    expect(strings['beat:ts1.parameters.buttonText']).toBe('Start');
  });

  it('should return empty object for beat with no translatable content', () => {
    const beat = {
      type: 'setVariable',
      parameters: { variable: 'hasKey', value: 'true' },
    };
    const strings = extractBeatSourceStrings(beat, 'sv1');

    expect(Object.keys(strings)).toHaveLength(0);
  });

  it('should skip non-string fields', () => {
    const beat = {
      type: 'infoText',
      parameters: {
        text: 'Valid text',
        buttonText: 42, // not a string
      },
    };
    const strings = extractBeatSourceStrings(beat, 'ns1');

    expect(strings['beat:ns1.parameters.text']).toBe('Valid text');
    expect(strings['beat:ns1.parameters.buttonText']).toBeUndefined();
  });

  it('should handle beat with parameters at top level', () => {
    // Some beats store params directly on the object
    const beat = {
      type: 'infoText',
      text: 'Top-level text',
    };
    const strings = extractBeatSourceStrings(beat, 'tl1');

    expect(strings['beat:tl1.parameters.text']).toBe('Top-level text');
  });

  it('should extract dialogTree dialog nodes and choices', () => {
    const beat = {
      type: 'dialogTree',
      parameters: {
        text: 'Dialog intro',
        dialogTree: {
          speaker: 'Guard',
          text: 'NPC says hello',
          choices: [
            { text: 'Hello back', target: 'b2' },
            { text: 'Goodbye', target: 'b3', dialogNode: { text: 'Farewell then.' } },
          ],
        },
      },
    };
    const strings = extractBeatSourceStrings(beat, 'dt1');

    expect(strings['beat:dt1.parameters.text']).toBe('Dialog intro');
    // Dialog tree root node
    expect(strings['beat:dt1.parameters.dialogTree.speaker']).toBe('Guard');
    expect(strings['beat:dt1.parameters.dialogTree.text']).toBe('NPC says hello');
    // Choices
    expect(strings['beat:dt1.parameters.dialogTree.choices.0.text']).toBe('Hello back');
    expect(strings['beat:dt1.parameters.dialogTree.choices.1.text']).toBe('Goodbye');
    // Nested dialogNode
    expect(strings['beat:dt1.parameters.dialogTree.choices.1.dialogNode.text']).toBe('Farewell then.');
  });

  it('should extract AI beat fallback text but not prompts', () => {
    const beat = {
      type: 'aiInfoText',
      parameters: {
        prompt: 'Generate some text about the forest',
        fallbackText: 'The forest is dark and mysterious.',
      },
    };
    const strings = extractBeatSourceStrings(beat, 'ai1');

    expect(strings['beat:ai1.parameters.fallbackText']).toBe('The forest is dark and mysterious.');
    // AI prompts are system instructions, not user-facing text — they should NOT be extracted
    expect(strings['beat:ai1.parameters.prompt']).toBeUndefined();
  });
});
