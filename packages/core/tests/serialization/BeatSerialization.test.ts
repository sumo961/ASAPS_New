/**
 * Comprehensive Beat Serialization Tests
 *
 * Tests that all beat properties, parameters, and assets are correctly
 * serialized (toJSON) and deserialized (from config) for all beat types.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import type { Beat } from '../../src/beats/Beat';

describe('Beat Serialization', () => {
  let registry: BeatTypeRegistry;

  beforeEach(() => {
    registry = BeatTypeRegistry.getInstance();
  });

  describe('IntroTextBeat Serialization', () => {
    it('should serialize and deserialize text parameter', () => {
      // Create beat with text
      const beat = registry.createBeat('introText', {
        id: 'test-1',
        name: 'Test Intro',
        type: 'introText',
        parameters: {
          text: 'This is my intro text',
          buttonText: 'Continue'
        }
      });

      // Serialize
      const serialized = beat.toJSON();
      console.log('[IntroText] Serialized:', JSON.stringify(serialized, null, 2));

      // Check serialized data includes text
      expect(serialized.parameters.text).toBe('This is my intro text');
      expect(serialized.parameters.buttonText).toBe('Continue');

      // Deserialize
      const restored = registry.createBeat('introText', {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        parameters: serialized.parameters
      });

      restored.updateParameters(serialized.parameters);

      // Check restored beat has correct text
      const restoredParams = restored.getParameters();
      expect(restoredParams.text).toBe('This is my intro text');
      expect(restoredParams.buttonText).toBe('Continue');
    });

    it('should serialize and deserialize background node', () => {
      const beat = registry.createBeat('introText', {
        id: 'test-2',
        name: 'Test Intro with Background',
        type: 'introText',
        node: 'background-asset-123',
        parameters: {
          text: 'Text with background',
          node: 'background-asset-123'
        }
      });

      // Serialize
      const serialized = beat.toJSON();
      console.log('[IntroText Background] Serialized:', JSON.stringify(serialized, null, 2));

      // Check node is serialized at top level AND in parameters
      expect(serialized.node).toBe('background-asset-123');
      expect(serialized.parameters.node).toBe('background-asset-123');

      // Deserialize
      const restored = registry.createBeat('introText', {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        node: serialized.node,
        parameters: serialized.parameters
      });

      restored.updateParameters(serialized.parameters);

      // Check restored beat has background
      expect((restored as any).node).toBe('background-asset-123');
      expect(restored.getParameters().node).toBe('background-asset-123');
    });

    it('should serialize and deserialize locations', () => {
      const beat = registry.createBeat('introText', {
        id: 'test-3',
        name: 'Test with Locations',
        type: 'introText',
        locations: [
          { kind: 'text', name: 'mainText', x: 100, y: 200, width: 400, height: 100 },
          { kind: 'button', name: 'continueBtn', x: 300, y: 500, width: 200, height: 50 }
        ],
        parameters: {
          text: 'Text with visual elements'
        }
      });

      // Serialize
      const serialized = beat.toJSON();
      console.log('[IntroText Locations] Serialized:', JSON.stringify(serialized, null, 2));

      // Check locations are serialized
      expect(serialized.locations).toHaveLength(2);
      expect(serialized.locations[0].kind).toBe('text');
      expect(serialized.locations[0].name).toBe('mainText');
      expect(serialized.locations[1].kind).toBe('button');

      // Deserialize
      const restored = registry.createBeat('introText', {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        locations: serialized.locations,
        parameters: serialized.parameters
      });

      // Check restored beat has locations
      const locations = Array.from((restored as any).locations.values());
      expect(locations).toHaveLength(2);
      expect(locations[0].name).toBe('mainText');
      expect(locations[1].name).toBe('continueBtn');
    });
  });

  describe('TitleScreenBeat Serialization', () => {
    it('should serialize and deserialize all properties', () => {
      const beat = registry.createBeat('titleScreen', {
        id: 'title-1',
        name: 'Title',
        type: 'titleScreen',
        parameters: {
          title: 'My Amazing Story',
          author: 'John Doe',
          buttonText: 'Begin'
        }
      });

      const serialized = beat.toJSON();
      console.log('[TitleScreen] Serialized:', JSON.stringify(serialized, null, 2));

      expect(serialized.parameters.title).toBe('My Amazing Story');
      expect(serialized.parameters.author).toBe('John Doe');
      expect(serialized.parameters.buttonText).toBe('Begin');

      const restored = registry.createBeat('titleScreen', {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        parameters: serialized.parameters
      });
      restored.updateParameters(serialized.parameters);

      const restoredParams = restored.getParameters();
      expect(restoredParams.title).toBe('My Amazing Story');
      expect(restoredParams.author).toBe('John Doe');
    });
  });

  describe('DefaultTarget Serialization', () => {
    it('should serialize and deserialize defaultTarget properties', () => {
      const beat = registry.createBeat('titleScreen', {
        id: 'title-2',
        name: 'Title with Timer',
        type: 'titleScreen',
        defaultTarget: 'beat-next',
        defaultTargetDelay: 10,
        showTimer: true,
        parameters: {
          title: 'Timed Title'
        }
      });

      const serialized = beat.toJSON();
      console.log('[DefaultTarget] Serialized:', JSON.stringify(serialized, null, 2));

      expect(serialized.defaultTarget).toBe('beat-next');
      expect(serialized.defaultTargetDelay).toBe(10);
      expect(serialized.showTimer).toBe(true);

      const restored = registry.createBeat('titleScreen', {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        defaultTarget: serialized.defaultTarget,
        defaultTargetDelay: serialized.defaultTargetDelay,
        showTimer: serialized.showTimer,
        parameters: serialized.parameters
      });

      expect((restored as any).defaultTarget).toBe('beat-next');
      expect((restored as any).defaultTargetDelay).toBe(10);
      expect((restored as any).showTimer).toBe(true);
    });
  });

  describe('DialogTreeBeat Serialization', () => {
    it('should serialize and deserialize dialog tree and choiceDelay', () => {
      const dialogTree = {
        id: 'root',
        text: 'Hello there!',
        emotion: 'happy',
        choices: [
          { text: 'Option 1', next: 'choice1' },
          { text: 'Option 2', next: 'choice2' }
        ]
      };

      const beat = registry.createBeat('dialogTree', {
        id: 'dialog-1',
        name: 'Dialog Beat',
        type: 'dialogTree',
        parameters: {
          speaker: 'NPC',
          dialogTree,
          choiceDelay: 2.5
        }
      });

      const serialized = beat.toJSON();
      console.log('[DialogTree] Serialized:', JSON.stringify(serialized, null, 2));

      // Speaker is stored inside dialogTree, not at top level
      expect(serialized.parameters.dialogTree.speaker).toBe('NPC');
      expect(serialized.parameters.dialogTree.text).toBe('Hello there!');
      expect(serialized.parameters.choiceDelay).toBe(2.5);

      const restored = registry.createBeat('dialogTree', {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        parameters: serialized.parameters
      });
      restored.updateParameters(serialized.parameters);

      const restoredParams = restored.getParameters();
      // Speaker is stored inside dialogTree, not at top level
      expect(restoredParams.dialogTree.speaker).toBe('NPC');
      expect(restoredParams.dialogTree.text).toBe('Hello there!');
      expect(restoredParams.choiceDelay).toBe(2.5);
    });
  });

  describe('MovementChoiceBeat Serialization', () => {
    it('should serialize and deserialize choices with choiceDelay', () => {
      const choices = [
        { id: 'c1', text: 'Go left', location: 'left', target: 'beat-left' },
        { id: 'c2', text: 'Go right', location: 'right', target: 'beat-right' }
      ];

      const beat = registry.createBeat('movementChoice', {
        id: 'move-1',
        name: 'Movement',
        type: 'movementChoice',
        parameters: {
          question: 'Which way?',
          choices,
          choiceDelay: 1.5
        }
      });

      const serialized = beat.toJSON();
      console.log('[MovementChoice] Serialized:', JSON.stringify(serialized, null, 2));

      expect(serialized.parameters.question).toBe('Which way?');
      expect(serialized.parameters.choices).toEqual(choices);
      expect(serialized.parameters.choiceDelay).toBe(1.5);

      const restored = registry.createBeat('movementChoice', {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        parameters: serialized.parameters
      });
      restored.updateParameters(serialized.parameters);

      const restoredParams = restored.getParameters();
      expect(restoredParams.choices).toEqual(choices);
      expect(restoredParams.choiceDelay).toBe(1.5);
    });
  });

  describe('Complete Serialization Round-Trip', () => {
    it('should preserve all data through complete save/load cycle', () => {
      // Create a beat with EVERYTHING
      const beat = registry.createBeat('introText', {
        id: 'complete-1',
        name: 'Complete Beat',
        type: 'introText',
        x: 150,
        y: 250,
        cluster: 'chapter1',
        node: 'bg-forest',
        defaultTarget: 'next-beat',
        defaultTargetDelay: 5,
        showTimer: true,
        transition: { type: 'fade', duration: 1000 },
        sound: { id: 'ambient', volume: 0.5 },
        connections: [
          { targetId: 'next-beat', label: 'Continue' }
        ],
        locations: [
          { kind: 'text', name: 'mainText', x: 100, y: 200, width: 600, height: 150 },
          { kind: 'button', name: 'btn', x: 350, y: 500, width: 150, height: 60 }
        ],
        parameters: {
          text: 'Welcome to the forest!',
          buttonText: 'Continue Adventure',
          node: 'bg-forest',
          backgroundSound: 'forest-ambience'
        }
      });

      // Serialize
      const serialized = beat.toJSON();
      console.log('[Complete] Serialized:', JSON.stringify(serialized, null, 2));

      // Verify ALL properties are serialized
      expect(serialized.id).toBe('complete-1');
      expect(serialized.name).toBe('Complete Beat');
      expect(serialized.type).toBe('introText');
      expect(serialized.x).toBe(150);
      expect(serialized.y).toBe(250);
      expect(serialized.cluster).toBe('chapter1');
      expect(serialized.node).toBe('bg-forest');
      expect(serialized.defaultTarget).toBe('next-beat');
      expect(serialized.defaultTargetDelay).toBe(5);
      expect(serialized.showTimer).toBe(true);
      expect(serialized.transition).toEqual({ type: 'fade', duration: 1000 });
      expect(serialized.sound).toEqual({ id: 'ambient', volume: 0.5 });
      expect(serialized.connections).toHaveLength(1);
      expect(serialized.locations).toHaveLength(2);
      expect(serialized.parameters.text).toBe('Welcome to the forest!');
      expect(serialized.parameters.buttonText).toBe('Continue Adventure');
      expect(serialized.parameters.node).toBe('bg-forest');

      // Deserialize (simulate what projectDeserializer does)
      const config = {
        id: serialized.id,
        name: serialized.name,
        type: serialized.type,
        x: serialized.x,
        y: serialized.y,
        cluster: serialized.cluster,
        node: serialized.node,
        defaultTarget: serialized.defaultTarget,
        defaultTargetDelay: serialized.defaultTargetDelay,
        showTimer: serialized.showTimer,
        transition: serialized.transition,
        sound: serialized.sound,
        connections: serialized.connections,
        locations: serialized.locations,
        parameters: serialized.parameters
      };

      const restored = registry.createBeat(serialized.type, config);
      restored.updateParameters(serialized.parameters);

      // Verify ALL properties are restored
      expect((restored as any).id).toBe('complete-1');
      expect((restored as any).name).toBe('Complete Beat');
      expect((restored as any).x).toBe(150);
      expect((restored as any).y).toBe(250);
      expect((restored as any).cluster).toBe('chapter1');
      expect((restored as any).node).toBe('bg-forest');
      expect((restored as any).defaultTarget).toBe('next-beat');
      expect((restored as any).defaultTargetDelay).toBe(5);
      expect((restored as any).showTimer).toBe(true);
      expect((restored as any).transition).toEqual({ type: 'fade', duration: 1000 });
      expect((restored as any).sound).toEqual({ id: 'ambient', volume: 0.5 });

      const restoredParams = restored.getParameters();
      expect(restoredParams.text).toBe('Welcome to the forest!');
      expect(restoredParams.buttonText).toBe('Continue Adventure');
      expect(restoredParams.node).toBe('bg-forest');

      const locations = Array.from((restored as any).locations.values());
      expect(locations).toHaveLength(2);
      expect(locations[0].name).toBe('mainText');
      expect(locations[1].name).toBe('btn');
    });
  });
});
