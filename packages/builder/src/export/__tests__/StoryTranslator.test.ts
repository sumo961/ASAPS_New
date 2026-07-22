/**
 * Tests for StoryTranslator - AI-powered story content translation
 *
 * Tests the pure extraction and application logic (no AI calls).
 */

import { describe, it, expect } from 'vitest';
import { extractTranslatableStrings, applyVideoTranslations } from '../StoryTranslator';

// Helper to create minimal project data
function createProjectData(overrides: any = {}): any {
  return {
    project: {
      story: {
        metadata: { title: 'Test Story' },
        characters: [],
        beats: [],
        ...overrides.story,
      },
      globalSettings: overrides.globalSettings,
      ...overrides.project,
    },
  };
}

describe('StoryTranslator', () => {
  describe('extractTranslatableStrings', () => {
    it('should extract story title from metadata', () => {
      const data = createProjectData({
        story: { metadata: { title: 'Murder Mystery' } },
      });

      const strings = extractTranslatableStrings(data);

      expect(strings['project.story.metadata.title']).toBe('Murder Mystery');
    });

    it('should return empty when no story exists', () => {
      const strings = extractTranslatableStrings({ project: {} });

      expect(Object.keys(strings)).toHaveLength(0);
    });

    it('should extract character names', () => {
      const data = createProjectData({
        story: {
          characters: [
            { name: 'Detective Holmes' },
            { name: 'Dr. Watson' },
          ],
        },
      });

      const strings = extractTranslatableStrings(data);

      expect(strings['project.story.characters.0.name']).toBe('Detective Holmes');
      expect(strings['project.story.characters.1.name']).toBe('Dr. Watson');
    });

    it('should extract counter displayNames', () => {
      const data = createProjectData({
        story: {
          characters: [
            {
              name: 'Hero',
              counters: [
                { name: 'courage', displayName: 'Courage' },
                { name: 'health', displayName: 'Health Points' },
              ],
            },
          ],
        },
      });

      const strings = extractTranslatableStrings(data);

      expect(strings['project.story.characters.0.counters.0.displayName']).toBe('Courage');
      expect(strings['project.story.characters.0.counters.1.displayName']).toBe('Health Points');
    });

    it('should extract inventory displayNames and descriptions', () => {
      const data = createProjectData({
        story: {
          characters: [
            {
              name: 'Hero',
              inventory: [
                { name: 'key', displayName: 'Golden Key', description: 'A shiny golden key' },
                { name: 'sword' }, // No displayName - should use name
              ],
            },
          ],
        },
      });

      const strings = extractTranslatableStrings(data);

      expect(strings['project.story.characters.0.inventory.0.displayName']).toBe('Golden Key');
      expect(strings['project.story.characters.0.inventory.0.description']).toBe('A shiny golden key');
      expect(strings['project.story.characters.0.inventory.1.displayName']).toBe('sword');
    });

    it('should extract HUD overlay labels', () => {
      const data = createProjectData({
        globalSettings: {
          hudOverlays: {
            timerHud: { label: 'Time', staticText: 'Day 1' },
            countdownMeter: { label: 'Countdown' },
          },
        },
      });

      const strings = extractTranslatableStrings(data);

      expect(strings['project.globalSettings.hudOverlays.timerHud.label']).toBe('Time');
      expect(strings['project.globalSettings.hudOverlays.timerHud.staticText']).toBe('Day 1');
      expect(strings['project.globalSettings.hudOverlays.countdownMeter.label']).toBe('Countdown');
    });

    it('should extract environment node and prop names', () => {
      const data = createProjectData({
        story: {
          environment: {
            nodes: [
              {
                name: 'Living Room',
                props: [
                  { name: 'Old Painting' },
                  { name: 'Bookshelf' },
                ],
              },
              { name: 'Kitchen' },
            ],
          },
        },
      });

      const strings = extractTranslatableStrings(data);

      expect(strings['project.story.environment.nodes.0.name']).toBe('Living Room');
      expect(strings['project.story.environment.nodes.0.props.0.name']).toBe('Old Painting');
      expect(strings['project.story.environment.nodes.0.props.1.name']).toBe('Bookshelf');
      expect(strings['project.story.environment.nodes.1.name']).toBe('Kitchen');
    });

    describe('beat string extraction', () => {
      it('should extract common text fields from beats', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'infoText',
                parameters: {
                  text: 'You arrive at the mansion.',
                  buttonText: 'Continue',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.text']).toBe('You arrive at the mansion.');
        expect(strings['project.story.beats.0.parameters.buttonText']).toBe('Continue');
      });

      it('extracts video caption cues into displayText (text stays the source key)', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'videoBeat',
                parameters: {
                  videoAssetId: 'asset_vid',
                  captions: [
                    { start: 0, end: 3, text: 'Welcome to Valletta.' },
                    { start: 3, end: 7, text: 'Founded in 1566.' },
                  ],
                },
              },
            ],
          },
        });
        const strings = extractTranslatableStrings(data);
        expect(strings['project.story.beats.0.parameters.captions.0.displayText']).toBe('Welcome to Valletta.');
        expect(strings['project.story.beats.0.parameters.captions.1.displayText']).toBe('Founded in 1566.');
        // asset id is NOT extracted for translation
        expect(strings['project.story.beats.0.parameters.videoAssetId']).toBeUndefined();
      });

      it('should extract text variations', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'durScreen',
                parameters: {
                  text: 'Time passes...',
                  textVariations: ['Hours go by...', 'The clock ticks on...'],
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.text']).toBe('Time passes...');
        expect(strings['project.story.beats.0.parameters.textVariations.0']).toBe('Hours go by...');
        expect(strings['project.story.beats.0.parameters.textVariations.1']).toBe('The clock ticks on...');
      });

      it('should extract dialogTree strings recursively', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'dialogTree',
                parameters: {
                  dialogTree: {
                    id: 'root',
                    speaker: 'Wizard',
                    text: 'What would you like to know?',
                    choices: [
                      {
                        id: 'c1',
                        text: 'Tell me about magic',
                        dialogNode: {
                          id: 'n1',
                          speaker: 'Wizard',
                          text: 'Magic is wonderful!',
                          choices: [
                            { id: 'c2', text: 'Thank you!', target: 'beat_end' },
                          ],
                        },
                      },
                      { id: 'c3', text: 'Goodbye', target: 'beat_exit' },
                    ],
                  },
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        const prefix = 'project.story.beats.0.parameters.dialogTree';
        expect(strings[`${prefix}.speaker`]).toBe('Wizard');
        expect(strings[`${prefix}.text`]).toBe('What would you like to know?');
        expect(strings[`${prefix}.choices.0.text`]).toBe('Tell me about magic');
        expect(strings[`${prefix}.choices.0.dialogNode.speaker`]).toBe('Wizard');
        expect(strings[`${prefix}.choices.0.dialogNode.text`]).toBe('Magic is wonderful!');
        expect(strings[`${prefix}.choices.0.dialogNode.choices.0.text`]).toBe('Thank you!');
        expect(strings[`${prefix}.choices.1.text`]).toBe('Goodbye');
      });

      it('should extract movementChoice displayText', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'movementChoice',
                parameters: {
                  question: 'Where to go?',
                  choices: [
                    { text: 'Go North', displayText: 'North', target: 'beat_north' },
                    { text: 'Go South', target: 'beat_south' },
                    { text: null, location: 'Library', target: 'beat_lib' },
                  ],
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        // Uses existing displayText
        expect(strings['project.story.beats.0.parameters.choices.0.displayText']).toBe('North');
        // Falls back to text
        expect(strings['project.story.beats.0.parameters.choices.1.displayText']).toBe('Go South');
        // Falls back to location when text is null
        expect(strings['project.story.beats.0.parameters.choices.2.displayText']).toBe('Library');
      });

      it('should extract multiChoice displayText (text stays the matching key)', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'multiChoice',
                parameters: {
                  question: 'Friend or foe?',
                  choices: [
                    { id: 'a', text: 'Friend', displayText: 'Ally', target: 'beat_friend' },
                    { id: 'b', text: 'Foe', target: 'beat_foe' },
                  ],
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        // Uses existing displayText, falls back to text — written into
        // displayText so `text` keeps matching baked button locations.
        expect(strings['project.story.beats.0.parameters.choices.0.displayText']).toBe('Ally');
        expect(strings['project.story.beats.0.parameters.choices.1.displayText']).toBe('Foe');
        expect(strings['project.story.beats.0.parameters.choices.0.text']).toBeUndefined();
        // The question rides the common fields
        expect(strings['project.story.beats.0.parameters.question']).toBe('Friend or foe?');
      });

      it('should extract aiConversation openingLine but not AI instructions', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'aiConversation',
                parameters: {
                  openingLine: 'Hello, traveler. What brings you here?',
                  scenario: 'A tavern conversation',
                  npcPersonality: 'Gruff but kind',
                  systemInstructions: 'Stay in character.',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);
        const prefix = 'project.story.beats.0.parameters';

        expect(strings[`${prefix}.openingLine`]).toBe('Hello, traveler. What brings you here?');
        // AI instructions stay in the source language
        expect(strings[`${prefix}.scenario`]).toBeUndefined();
        expect(strings[`${prefix}.npcPersonality`]).toBeUndefined();
        expect(strings[`${prefix}.systemInstructions`]).toBeUndefined();
      });

      it('should extract arBeat anchor labels', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'arBeat',
                parameters: {
                  anchors: [
                    { id: 'a1', label: 'Open the chest', onTap: 'asaps://beat/chest' },
                    { id: 'a2', onTap: 'asaps://beat/door' },
                  ],
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);
        expect(strings['project.story.beats.0.parameters.anchors.0.label']).toBe('Open the chest');
        expect(strings['project.story.beats.0.parameters.anchors.1.label']).toBeUndefined();
      });

      it('should emit the runtime UI-string catalog', () => {
        const data = createProjectData({ story: { beats: [] } });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.globalSettings.uiStrings.continue']).toBe('Continue');
        expect(strings['project.globalSettings.uiStrings.inventoryTitle']).toBe('Inventory');
        expect(strings['project.globalSettings.uiStrings.loadingThinking']).toBe('Thinking...');
      });

      it('should extract pickProp displayNames and descriptions', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'pickProp',
                parameters: {
                  question: 'What do you pick up?',
                  props: [
                    { name: 'Silver Key', displayName: 'Clé en argent', description: 'A shiny key' },
                    { name: 'Old Book' }, // Should use name as displayName fallback
                  ],
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.question']).toBe('What do you pick up?');
        expect(strings['project.story.beats.0.parameters.props.0.displayName']).toBe('Clé en argent');
        expect(strings['project.story.beats.0.parameters.props.0.description']).toBe('A shiny key');
        expect(strings['project.story.beats.0.parameters.props.1.displayName']).toBe('Old Book');
      });

      it('should extract endScreen specific fields', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'endScreen',
                parameters: {
                  message: 'You won!',
                  restartText: 'Play Again',
                  creditsText: 'View Credits',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.message']).toBe('You won!');
        expect(strings['project.story.beats.0.parameters.restartText']).toBe('Play Again');
        expect(strings['project.story.beats.0.parameters.creditsText']).toBe('View Credits');
      });

      it('should extract inputText placeholder', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'inputText',
                parameters: {
                  prompt: 'Enter your name:',
                  placeholder: 'Type here...',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.prompt']).toBe('Enter your name:');
        expect(strings['project.story.beats.0.parameters.placeholder']).toBe('Type here...');
      });

      it('should extract keypad clearButtonText', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'keypad',
                parameters: {
                  text: 'Enter the code:',
                  clearButtonText: 'Clear',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.clearButtonText']).toBe('Clear');
      });

      it('should extract hyperText link words', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'hyperText',
                parameters: {
                  text: 'Look at the silver key on the desk.',
                  hyperlinks: [
                    { word: 'silver key', targetBeatId: 'beat_key' },
                    { word: 'desk', targetBeatId: 'beat_desk' },
                  ],
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.text']).toBe('Look at the silver key on the desk.');
        expect(strings['project.story.beats.0.parameters.hyperlinks.0.word']).toBe('silver key');
        expect(strings['project.story.beats.0.parameters.hyperlinks.1.word']).toBe('desk');
      });

      it('should extract aiInfoText/aiDurScreen fallbackText', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'aiInfoText',
                parameters: {
                  prompt: 'Generate a greeting',
                  fallbackText: 'Hello, traveler!',
                },
              },
              {
                type: 'aiDurScreen',
                parameters: {
                  prompt: 'Generate a transition',
                  fallbackText: 'Time passes...',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.fallbackText']).toBe('Hello, traveler!');
        expect(strings['project.story.beats.1.parameters.fallbackText']).toBe('Time passes...');
        // AI prompts are system instructions — they should NOT be extracted for translation
        expect(strings['project.story.beats.0.parameters.prompt']).toBeUndefined();
        expect(strings['project.story.beats.1.parameters.prompt']).toBeUndefined();
      });

      it('should extract onlineContent displayTemplate and errorMessage', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'onlineContent',
                parameters: {
                  displayTemplate: 'Current weather: {{temp}}',
                  errorMessage: 'Failed to load weather data.',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.displayTemplate']).toBe('Current weather: {{temp}}');
        expect(strings['project.story.beats.0.parameters.errorMessage']).toBe('Failed to load weather data.');
      });

      it('should extract aiDialogTree npcName', () => {
        const data = createProjectData({
          story: {
            beats: [
              {
                type: 'aiDialogTree',
                parameters: {
                  npcName: 'Merchant Bob',
                },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        expect(strings['project.story.beats.0.parameters.npcName']).toBe('Merchant Bob');
      });
    });

    describe('complex extraction scenarios', () => {
      it('should handle a full project with multiple beat types', () => {
        const data = createProjectData({
          story: {
            metadata: { title: 'The Great Adventure' },
            characters: [
              {
                name: 'Hero',
                counters: [{ name: 'courage', displayName: 'Courage' }],
                inventory: [{ name: 'compass', displayName: 'Magic Compass' }],
              },
            ],
            beats: [
              {
                type: 'titleScreen',
                parameters: { title: 'The Great Adventure', author: 'AI' },
              },
              {
                type: 'infoText',
                parameters: { text: 'You wake up in a strange land.', buttonText: 'Look around' },
              },
              {
                type: 'movementChoice',
                parameters: {
                  question: 'Which way?',
                  choices: [
                    { text: 'Go North', target: 'beat_north' },
                    { text: 'Go South', target: 'beat_south' },
                  ],
                },
              },
              {
                type: 'endScreen',
                parameters: { message: 'You win!', restartText: 'Play Again' },
              },
            ],
          },
        });

        const strings = extractTranslatableStrings(data);

        // Should have multiple entries
        expect(Object.keys(strings).length).toBeGreaterThan(5);
        expect(strings['project.story.metadata.title']).toBe('The Great Adventure');
        expect(strings['project.story.characters.0.name']).toBe('Hero');
        expect(strings['project.story.beats.1.parameters.text']).toBe('You wake up in a strange land.');
      });

      it('should emit only the runtime UI-string catalog for a project with no authored content', () => {
        const data = createProjectData({
          story: {
            metadata: {},
            characters: [],
            beats: [],
          },
        });

        const strings = extractTranslatableStrings(data);

        // The runtime UI-string catalog is always emitted (renderer chrome,
        // loading messages) — no authored strings beyond that.
        const keys = Object.keys(strings);
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.every(k => k.startsWith('project.globalSettings.uiStrings.'))).toBe(true);
      });
    });
  });

  describe('applyVideoTranslations', () => {
    const withVideo = (videoTranslations: any) => createProjectData({
      story: {
        beats: [{ type: 'videoBeat', parameters: { videoAssetId: 'asset_base', videoTranslations } }],
      },
    });

    it('swaps videoAssetId to the per-language override', () => {
      const out = applyVideoTranslations(withVideo({ sv: { videoAssetId: 'asset_sv' } }), 'sv');
      expect(out.project.story.beats[0].parameters.videoAssetId).toBe('asset_sv');
    });

    it('keeps the base video for languages without an override', () => {
      const out = applyVideoTranslations(withVideo({ sv: { videoAssetId: 'asset_sv' } }), 'mt');
      expect(out.project.story.beats[0].parameters.videoAssetId).toBe('asset_base');
    });

    it('is a no-op for the source language (null) and does not mutate the input', () => {
      const input = withVideo({ sv: { videoAssetId: 'asset_sv' } });
      const out = applyVideoTranslations(input, null);
      expect(out).toBe(input);
      expect(input.project.story.beats[0].parameters.videoAssetId).toBe('asset_base');
    });

    it('does not mutate the input when it does swap (returns a clone)', () => {
      const input = withVideo({ sv: { videoAssetId: 'asset_sv' } });
      const out = applyVideoTranslations(input, 'sv');
      expect(out).not.toBe(input);
      expect(input.project.story.beats[0].parameters.videoAssetId).toBe('asset_base');
      expect(out.project.story.beats[0].parameters.videoAssetId).toBe('asset_sv');
    });
  });
});
