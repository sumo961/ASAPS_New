/**
 * Tests for TranslationResource generation and application
 *
 * Tests the ID-based key conversion, manual resource creation,
 * applyTranslationResource, and manifest building.
 */

import { describe, it, expect } from 'vitest';
import {
  positionalToIdBased,
  idBasedToPositional,
  createManualTranslationResource,
  applyTranslationResource,
  buildTranslationManifest,
  extractTranslatableStrings,
} from '../StoryTranslator';
import { createEmptyResource } from '@asaps/core';

// Helper to create project data with beats that have IDs
function createProjectWithBeats(beats: any[] = []): any {
  return {
    project: {
      story: {
        metadata: { title: 'Test Story' },
        characters: [],
        beats,
      },
    },
  };
}

describe('TranslationResource', () => {
  describe('positionalToIdBased', () => {
    it('should convert beat positional keys to ID-based keys', () => {
      const project = createProjectWithBeats([
        { id: 'beat_abc', type: 'infoText', parameters: { text: 'Hello' } },
        { id: 'beat_def', type: 'infoText', parameters: { text: 'World' } },
      ]);

      const positional = {
        'project.story.beats.0.parameters.text': 'Hello',
        'project.story.beats.1.parameters.text': 'World',
      };

      const result = positionalToIdBased(positional, project);

      expect(result['beat:beat_abc.parameters.text']).toBe('Hello');
      expect(result['beat:beat_def.parameters.text']).toBe('World');
    });

    it('should preserve non-beat keys as-is', () => {
      const project = createProjectWithBeats([]);

      const positional = {
        'project.story.metadata.title': 'Test Story',
        'project.story.characters.0.name': 'Hero',
      };

      const result = positionalToIdBased(positional, project);

      expect(result['project.story.metadata.title']).toBe('Test Story');
      expect(result['project.story.characters.0.name']).toBe('Hero');
    });

    it('should handle deep nested beat parameters', () => {
      const project = createProjectWithBeats([
        {
          id: 'beat_dialog',
          type: 'dialogTree',
          parameters: {
            dialogTree: {
              text: 'Root question',
              choices: [{ text: 'Choice 1' }],
            },
          },
        },
      ]);

      const positional = {
        'project.story.beats.0.parameters.dialogTree.text': 'Root question',
        'project.story.beats.0.parameters.dialogTree.choices.0.text': 'Choice 1',
      };

      const result = positionalToIdBased(positional, project);

      expect(result['beat:beat_dialog.parameters.dialogTree.text']).toBe('Root question');
      expect(result['beat:beat_dialog.parameters.dialogTree.choices.0.text']).toBe('Choice 1');
    });

    it('should handle project with no beats array', () => {
      const project = { project: { story: {} } };

      const positional = {
        'project.story.metadata.title': 'Test',
        'project.story.beats.0.parameters.text': 'Hello',
      };

      const result = positionalToIdBased(positional, project);

      // Non-beat key preserved, beat key kept as-is (no beats array)
      expect(result['project.story.metadata.title']).toBe('Test');
      expect(result['project.story.beats.0.parameters.text']).toBe('Hello');
    });
  });

  describe('idBasedToPositional', () => {
    it('should convert ID-based keys back to positional keys', () => {
      const project = createProjectWithBeats([
        { id: 'beat_abc', type: 'infoText', parameters: { text: 'Hello' } },
        { id: 'beat_def', type: 'infoText', parameters: { text: 'World' } },
      ]);

      const idBased = {
        'beat:beat_abc.parameters.text': 'Hallo',
        'beat:beat_def.parameters.text': 'Welt',
      };

      const result = idBasedToPositional(idBased, project);

      expect(result['project.story.beats.0.parameters.text']).toBe('Hallo');
      expect(result['project.story.beats.1.parameters.text']).toBe('Welt');
    });

    it('should preserve non-beat keys', () => {
      const project = createProjectWithBeats([]);

      const idBased = {
        'project.story.metadata.title': 'Test Story',
        'project.story.characters.0.name': 'Hero',
      };

      const result = idBasedToPositional(idBased, project);

      expect(result['project.story.metadata.title']).toBe('Test Story');
      expect(result['project.story.characters.0.name']).toBe('Hero');
    });

    it('should skip keys for deleted beats (ID not found)', () => {
      const project = createProjectWithBeats([
        { id: 'beat_abc', type: 'infoText', parameters: { text: 'Hello' } },
      ]);

      const idBased = {
        'beat:beat_abc.parameters.text': 'Hallo',
        'beat:deleted_beat.parameters.text': 'Gone',  // beat was deleted
      };

      const result = idBasedToPositional(idBased, project);

      expect(result['project.story.beats.0.parameters.text']).toBe('Hallo');
      expect(Object.keys(result)).toHaveLength(1); // deleted beat skipped
    });
  });

  describe('positionalToIdBased ↔ idBasedToPositional roundtrip', () => {
    it('should roundtrip correctly for beat keys', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'A' } },
        { id: 'b2', type: 'durScreen', parameters: { text: 'B' } },
        { id: 'b3', type: 'endScreen', parameters: { message: 'C' } },
      ]);

      const original = {
        'project.story.beats.0.parameters.text': 'A',
        'project.story.beats.1.parameters.text': 'B',
        'project.story.beats.2.parameters.message': 'C',
        'project.story.metadata.title': 'Test',
      };

      const idBased = positionalToIdBased(original, project);
      const roundtripped = idBasedToPositional(idBased, project);

      expect(roundtripped).toEqual(original);
    });

    it('should be stable when beats are reordered', () => {
      // Original order: b1, b2, b3
      const projectOriginal = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'First' } },
        { id: 'b2', type: 'infoText', parameters: { text: 'Second' } },
        { id: 'b3', type: 'infoText', parameters: { text: 'Third' } },
      ]);

      const positional = {
        'project.story.beats.0.parameters.text': 'First',
        'project.story.beats.1.parameters.text': 'Second',
        'project.story.beats.2.parameters.text': 'Third',
      };

      // Convert to ID-based using original order
      const idBased = positionalToIdBased(positional, projectOriginal);

      expect(idBased['beat:b1.parameters.text']).toBe('First');
      expect(idBased['beat:b2.parameters.text']).toBe('Second');
      expect(idBased['beat:b3.parameters.text']).toBe('Third');

      // Now reorder beats: b3, b1, b2
      const projectReordered = createProjectWithBeats([
        { id: 'b3', type: 'infoText', parameters: { text: 'Third' } },
        { id: 'b1', type: 'infoText', parameters: { text: 'First' } },
        { id: 'b2', type: 'infoText', parameters: { text: 'Second' } },
      ]);

      // Convert back using new order
      const positionalReordered = idBasedToPositional(idBased, projectReordered);

      // Values should follow the new positions
      expect(positionalReordered['project.story.beats.0.parameters.text']).toBe('Third');
      expect(positionalReordered['project.story.beats.1.parameters.text']).toBe('First');
      expect(positionalReordered['project.story.beats.2.parameters.text']).toBe('Second');
    });
  });

  describe('createManualTranslationResource', () => {
    it('should create resource with all strings marked untranslated', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'Hello', buttonText: 'Continue' } },
      ]);

      const resource = createManualTranslationResource(project, 'de', 'German');

      expect(resource.languageCode).toBe('de');
      expect(resource.languageName).toBe('German');
      expect(resource.origin).toBe('human');
      expect(resource.direction).toBe('ltr');

      // All strings should be untranslated with source text as value
      for (const entry of Object.values(resource.strings)) {
        expect(entry.status).toBe('untranslated');
      }
    });

    it('should use ID-based keys', () => {
      const project = createProjectWithBeats([
        { id: 'beat_abc', type: 'infoText', parameters: { text: 'Hello' } },
      ]);

      const resource = createManualTranslationResource(project, 'fr', 'French');

      expect(resource.strings['beat:beat_abc.parameters.text']).toBeDefined();
      expect(resource.strings['beat:beat_abc.parameters.text'].value).toBe('Hello');
    });

    it('should set RTL direction for Arabic', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'Hello' } },
      ]);

      const resource = createManualTranslationResource(project, 'ar', 'Arabic');

      expect(resource.direction).toBe('rtl');
    });

    it('should store source snapshot', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'Hello' } },
      ]);

      const resource = createManualTranslationResource(project, 'de', 'German');

      expect(Object.keys(resource._sourceSnapshot).length).toBeGreaterThan(0);
      expect(resource.sourceHash.length).toBeGreaterThan(0);
    });
  });

  describe('applyTranslationResource', () => {
    it('should apply translated strings to project data', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'Hello', buttonText: 'Continue' } },
        { id: 'b2', type: 'infoText', parameters: { text: 'World' } },
      ]);

      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'beat:b1.parameters.text': { value: 'Hallo', status: 'translated' },
        'beat:b1.parameters.buttonText': { value: 'Weiter', status: 'translated' },
        'beat:b2.parameters.text': { value: 'Welt', status: 'translated' },
      };

      const translated = applyTranslationResource(project, resource);

      expect(translated.project.story.beats[0].parameters.text).toBe('Hallo');
      expect(translated.project.story.beats[0].parameters.buttonText).toBe('Weiter');
      expect(translated.project.story.beats[1].parameters.text).toBe('Welt');
    });

    it('should not apply untranslated strings', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'Hello' } },
        { id: 'b2', type: 'infoText', parameters: { text: 'World' } },
      ]);

      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'beat:b1.parameters.text': { value: 'Hallo', status: 'translated' },
        'beat:b2.parameters.text': { value: 'World', status: 'untranslated' },
      };

      const translated = applyTranslationResource(project, resource);

      expect(translated.project.story.beats[0].parameters.text).toBe('Hallo');
      // Untranslated string should keep original value
      expect(translated.project.story.beats[1].parameters.text).toBe('World');
    });

    it('should not mutate the original project data', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'Hello' } },
      ]);

      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'beat:b1.parameters.text': { value: 'Hallo', status: 'translated' },
      };

      const translated = applyTranslationResource(project, resource);

      // Original unchanged
      expect(project.project.story.beats[0].parameters.text).toBe('Hello');
      // Translated clone changed
      expect(translated.project.story.beats[0].parameters.text).toBe('Hallo');
    });

    it('should apply stale strings (they still have a translation)', () => {
      const project = createProjectWithBeats([
        { id: 'b1', type: 'infoText', parameters: { text: 'Hello updated' } },
      ]);

      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'beat:b1.parameters.text': { value: 'Hallo', status: 'stale' },
      };

      const translated = applyTranslationResource(project, resource);

      // Stale translations are still applied
      expect(translated.project.story.beats[0].parameters.text).toBe('Hallo');
    });

    it('should handle non-beat strings (metadata, characters)', () => {
      const project = {
        project: {
          story: {
            metadata: { title: 'My Story' },
            characters: [{ name: 'Hero' }],
            beats: [],
          },
        },
      };

      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'project.story.metadata.title': { value: 'Meine Geschichte', status: 'translated' },
        'project.story.characters.0.name': { value: 'Held', status: 'translated' },
      };

      const translated = applyTranslationResource(project, resource);

      expect(translated.project.story.metadata.title).toBe('Meine Geschichte');
      expect(translated.project.story.characters[0].name).toBe('Held');
    });
  });

  describe('buildTranslationManifest', () => {
    it('should build manifest from resources', () => {
      const resource1 = createEmptyResource('de', 'German');
      resource1.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
      };

      const resource2 = createEmptyResource('fr', 'French');
      resource2.strings = {
        'beat:1.text': { value: 'Bonjour', status: 'translated' },
        'beat:2.text': { value: 'Monde', status: 'untranslated' },
      };

      const manifest = buildTranslationManifest([resource1, resource2], 'en');

      expect(manifest.sourceLanguage).toBe('en');
      expect(manifest.languages).toHaveLength(2);

      const deEntry = manifest.languages.find(l => l.languageCode === 'de');
      expect(deEntry?.completeness).toBe(100);

      const frEntry = manifest.languages.find(l => l.languageCode === 'fr');
      expect(frEntry?.completeness).toBe(50);
    });

    it('should handle empty resources array', () => {
      const manifest = buildTranslationManifest([]);

      expect(manifest.sourceLanguage).toBe('en');
      expect(manifest.languages).toHaveLength(0);
    });
  });
});
