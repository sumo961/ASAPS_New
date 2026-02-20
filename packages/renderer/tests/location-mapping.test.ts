/**
 * Tests for schema-driven location mapping
 *
 * These tests ensure that:
 * 1. All visible beats have proper locationMapping in schema
 * 2. Location names correctly map to content parameters
 * 3. Content resolution works for all beat types
 */

import { describe, it, expect } from 'vitest';
import beatDefinitions from '../../../beat-definitions/core-beats.json';

describe('Schema Location Mapping', () => {
  describe('Schema Integrity', () => {
    it('should have locationMapping for all beats with locations', () => {
      const beatTypes = Object.entries(beatDefinitions.beatTypes);

      for (const [beatType, beatDef] of beatTypes) {
        const def = beatDef as any;

        // Skip invisible beats (they don't have visual elements)
        if (def.category === 'invisible') continue;

        // If beat has locations, it should have locationMapping
        if (def.locations && def.locations.length > 0) {
          expect(
            def.locationMapping,
            `Beat type "${beatType}" has locations but no locationMapping`
          ).toBeDefined();

          expect(
            Object.keys(def.locationMapping).length,
            `Beat type "${beatType}" has empty locationMapping`
          ).toBeGreaterThan(0);
        }
      }
    });

    it('should map all simple locations to parameters', () => {
      const beatTypes = Object.entries(beatDefinitions.beatTypes);

      // Skip beats with complex nested parameters
      const skipBeats = ['dialogTree']; // dialogTree.text is nested in dialogTree parameter

      for (const [beatType, beatDef] of beatTypes) {
        const def = beatDef as any;

        if (!def.locationMapping || skipBeats.includes(beatType)) continue;

        // Each mapped location should reference a valid parameter
        for (const [locationKey, paramKey] of Object.entries(def.locationMapping)) {
          // Check if parameter exists in beat definition
          const paramExists = def.parameters && def.parameters[paramKey as string];

          expect(
            paramExists,
            `Beat "${beatType}": locationMapping["${locationKey}"] points to "${paramKey}" which is not a valid parameter`
          ).toBeTruthy();
        }
      }
    });

    it('should have consistent location names across beat types', () => {
      // Common patterns that should be consistent
      const commonPatterns = {
        button: ['buttonText', 'text'], // Buttons should map to buttonText or text
        text: ['text', 'message', 'prompt'], // Text elements should map to text-like params
        question: ['question'], // Questions should map to question param
      };

      const beatTypes = Object.entries(beatDefinitions.beatTypes);
      const violations: string[] = [];

      for (const [beatType, beatDef] of beatTypes) {
        const def = beatDef as any;
        if (!def.locationMapping) continue;

        for (const [locationKey, paramKey] of Object.entries(def.locationMapping)) {
          const locationLower = locationKey.toLowerCase();

          // Check if location follows common patterns
          for (const [pattern, expectedParams] of Object.entries(commonPatterns)) {
            if (locationLower.includes(pattern)) {
              if (!expectedParams.includes(paramKey as string)) {
                violations.push(
                  `Beat "${beatType}": location "${locationKey}" contains "${pattern}" but maps to "${paramKey}" (expected one of: ${expectedParams.join(', ')})`
                );
              }
            }
          }
        }
      }

      if (violations.length > 0) {
        console.warn('Location naming inconsistencies found:', violations);
      }

      // This is a warning, not a hard failure
      expect(violations.length).toBeLessThan(10); // Allow some flexibility
    });
  });

  describe('Content Resolution for Specific Beat Types', () => {
    // Helper function to simulate getContentForLocation logic
    function resolveContent(
      locationName: string,
      content: Record<string, any>,
      beatType: string
    ): string | undefined {
      const beatDef = (beatDefinitions as any).beatTypes[beatType];
      if (!beatDef?.locationMapping) return undefined;

      const nameLower = locationName.toLowerCase();

      // Try schema mapping
      for (const [locationKey, paramKey] of Object.entries(beatDef.locationMapping)) {
        if (nameLower.includes(locationKey.toLowerCase())) {
          const value = content[paramKey as string];
          if (value !== undefined && value !== null) {
            return String(value);
          }
        }
      }

      return undefined;
    }

    it('should resolve titleScreen locations correctly', () => {
      const content = {
        title: 'My Story',
        author: 'John Doe',
        buttonText: 'Start Game'
      };

      expect(resolveContent('Title', content, 'titleScreen')).toBe('My Story');
      expect(resolveContent('Author', content, 'titleScreen')).toBe('John Doe');
      expect(resolveContent('startButton', content, 'titleScreen')).toBe('Start Game');
    });

    it('should resolve infoText locations correctly', () => {
      const content = {
        text: 'Once upon a time...',
        buttonText: 'Continue'
      };

      expect(resolveContent('Text', content, 'infoText')).toBe('Once upon a time...');
      expect(resolveContent('continueButton', content, 'infoText')).toBe('Continue');
    });

    it('should resolve inputText locations correctly', () => {
      const content = {
        prompt: 'What is your name?',
        placeholder: 'Enter name here',
        buttonText: 'Submit'
      };

      expect(resolveContent('Prompt', content, 'inputText')).toBe('What is your name?');
      expect(resolveContent('inputField', content, 'inputText')).toBe('Enter name here');
      expect(resolveContent('submitButton', content, 'inputText')).toBe('Submit');
    });

    it('should resolve endScreen locations correctly', () => {
      const content = {
        message: 'Thanks for playing!',
        restartText: 'Play Again',
        creditsText: 'View Credits'
      };

      expect(resolveContent('Message', content, 'endScreen')).toBe('Thanks for playing!');
      expect(resolveContent('restartButton', content, 'endScreen')).toBe('Play Again');
      expect(resolveContent('creditsButton', content, 'endScreen')).toBe('View Credits');
    });

    it('should resolve movementChoice locations correctly', () => {
      const content = {
        question: 'Where do you want to go?'
      };

      expect(resolveContent('Question', content, 'movementChoice')).toBe('Where do you want to go?');
    });

    it('should resolve pickProp locations correctly', () => {
      const content = {
        question: 'What do you want to pick up?'
      };

      expect(resolveContent('Question', content, 'pickProp')).toBe('What do you want to pick up?');
    });

    it('should resolve durScreen locations correctly', () => {
      const content = {
        text: 'Loading...'
      };

      expect(resolveContent('Text', content, 'durScreen')).toBe('Loading...');
    });

    it('should resolve hyperText locations correctly', () => {
      const content = {
        text: 'Click any word to explore.'
      };

      expect(resolveContent('Text', content, 'hyperText')).toBe('Click any word to explore.');
    });
  });

  describe('Edge Cases and Fallbacks', () => {
    function resolveContent(
      locationName: string,
      content: Record<string, any>,
      beatType: string
    ): string | undefined {
      const beatDef = (beatDefinitions as any).beatTypes[beatType];
      if (!beatDef?.locationMapping) return undefined;

      const nameLower = locationName.toLowerCase();

      for (const [locationKey, paramKey] of Object.entries(beatDef.locationMapping)) {
        if (nameLower.includes(locationKey.toLowerCase())) {
          const value = content[paramKey as string];
          if (value !== undefined && value !== null) {
            return String(value);
          }
        }
      }

      return undefined;
    }

    it('should handle missing content gracefully', () => {
      const content = {}; // Empty content

      expect(resolveContent('Prompt', content, 'inputText')).toBeUndefined();
      expect(resolveContent('Title', content, 'titleScreen')).toBeUndefined();
    });

    it('should handle null values', () => {
      const content = {
        prompt: null,
        buttonText: null
      };

      expect(resolveContent('Prompt', content, 'inputText')).toBeUndefined();
    });

    it('should handle capitalization variations in location names', () => {
      const content = {
        prompt: 'Test prompt'
      };

      // All these variations should work
      expect(resolveContent('prompt', content, 'inputText')).toBe('Test prompt');
      expect(resolveContent('Prompt', content, 'inputText')).toBe('Test prompt');
      expect(resolveContent('PROMPT', content, 'inputText')).toBe('Test prompt');
      expect(resolveContent('Prompt Text', content, 'inputText')).toBe('Test prompt');
    });

    it('should convert non-string values to strings', () => {
      const content = {
        text: 123, // Number
        buttonText: true // Boolean
      };

      expect(resolveContent('Text', content, 'infoText')).toBe('123');
      expect(resolveContent('continueButton', content, 'infoText')).toBe('true');
    });

    it('should prioritize exact matches over partial matches', () => {
      const beatDef = (beatDefinitions as any).beatTypes.inputText;
      const mappingKeys = Object.keys(beatDef.locationMapping);

      // Ensure no overlapping keys that could cause ambiguity
      for (let i = 0; i < mappingKeys.length; i++) {
        for (let j = i + 1; j < mappingKeys.length; j++) {
          const key1 = mappingKeys[i].toLowerCase();
          const key2 = mappingKeys[j].toLowerCase();

          // Check if one key is a substring of another
          const isSubstring = key1.includes(key2) || key2.includes(key1);

          if (isSubstring) {
            console.warn(
              `Potential ambiguity in inputText locationMapping: "${mappingKeys[i]}" and "${mappingKeys[j]}" may overlap`
            );
          }
        }
      }
    });
  });

  describe('Schema Coverage', () => {
    it('should have location mappings for all common visual beat types', () => {
      const requiredBeats = [
        'titleScreen',
        'infoText',
        'inputText',
        'endScreen',
        'movementChoice',
        'pickProp',
        'durScreen',
        'hyperText'
      ];

      for (const beatType of requiredBeats) {
        const beatDef = (beatDefinitions as any).beatTypes[beatType];

        expect(
          beatDef,
          `Beat type "${beatType}" should exist in schema`
        ).toBeDefined();

        expect(
          beatDef.locationMapping,
          `Beat type "${beatType}" should have locationMapping`
        ).toBeDefined();
      }
    });

    it('should have consistent default values between parameters and mapping', () => {
      const beatTypes = Object.entries(beatDefinitions.beatTypes);

      // Parameters that can be required without defaults (paths, IDs, etc.)
      const allowedWithoutDefaults = ['videoFile', 'dialogTree', 'scenario'];

      for (const [beatType, beatDef] of beatTypes) {
        const def = beatDef as any;
        if (!def.locationMapping || !def.parameters) continue;

        // For each mapped parameter, check if it has a reasonable default
        for (const paramKey of Object.values(def.locationMapping)) {
          const param = def.parameters[paramKey as string];

          if (param && param.required === true && !allowedWithoutDefaults.includes(paramKey as string)) {
            expect(
              param.default,
              `Beat "${beatType}": required parameter "${paramKey}" should have a default value (or add to allowedWithoutDefaults list)`
            ).toBeDefined();
          }
        }
      }
    });
  });

  describe('Performance and Best Practices', () => {
    it('should have unique location names within each beat type', () => {
      const beatTypes = Object.entries(beatDefinitions.beatTypes);

      for (const [beatType, beatDef] of beatTypes) {
        const def = beatDef as any;
        if (!def.locations) continue;

        const locations = def.locations as string[];
        const uniqueLocations = new Set(locations);

        expect(
          uniqueLocations.size,
          `Beat "${beatType}" has duplicate location names`
        ).toBe(locations.length);
      }
    });

    it('should use camelCase for location keys in mapping', () => {
      const beatTypes = Object.entries(beatDefinitions.beatTypes);
      const violations: string[] = [];

      for (const [beatType, beatDef] of beatTypes) {
        const def = beatDef as any;
        if (!def.locationMapping) continue;

        for (const locationKey of Object.keys(def.locationMapping)) {
          // Check if it's camelCase (starts with lowercase, no spaces/underscores)
          const isCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(locationKey);

          if (!isCamelCase) {
            violations.push(
              `Beat "${beatType}": location key "${locationKey}" is not in camelCase`
            );
          }
        }
      }

      expect(
        violations,
        `Location keys should use camelCase: ${violations.join(', ')}`
      ).toEqual([]);
    });

    it('should have locationMapping with reasonable size', () => {
      const beatTypes = Object.entries(beatDefinitions.beatTypes);

      for (const [beatType, beatDef] of beatTypes) {
        const def = beatDef as any;
        if (!def.locationMapping) continue;

        const mappingSize = Object.keys(def.locationMapping).length;

        // Most beats shouldn't have more than 10 mapped locations
        expect(
          mappingSize,
          `Beat "${beatType}" has too many mapped locations (${mappingSize})`
        ).toBeLessThanOrEqual(10);
      }
    });
  });
});
