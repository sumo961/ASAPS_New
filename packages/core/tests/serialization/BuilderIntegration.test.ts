/**
 * Builder Integration Tests - Simulates complete save/load workflow
 *
 * These tests simulate what happens when a user:
 * 1. Creates beats in the builder
 * 2. Edits parameters via Inspector
 * 3. Saves the project (Story.toJSON())
 * 4. Loads the project back (deserializeBeats + Story.fromJSON)
 */

import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { Story } from '../../src/engine/Story';

describe('Builder Integration - Complete Save/Load Cycle', () => {
  it('should preserve InfoTextBeat text after edit → save → load', () => {
    const registry = BeatTypeRegistry.getInstance();

    // 1. User creates an InfoTextBeat in builder
    const beat = registry.createBeat('infoText', {
      id: 'test-intro',
      name: 'My Intro',
      type: 'infoText',
      parameters: {
        text: 'Initial text',
        buttonText: 'Start'
      }
    });

    // 2. User edits the text in Inspector (simulates Inspector's handleParameterChange)
    beat.updateParameters({
      text: 'Updated text after editing',
      buttonText: 'Continue'
    });

    // Verify the beat has the updated values
    const params = beat.getParameters();
    expect(params.text).toBe('Updated text after editing');
    expect(params.buttonText).toBe('Continue');

    // 3. User saves the project (simulates Story.toJSON())
    const serialized = beat.toJSON();
    console.log('[Integration Test] Serialized beat:', JSON.stringify(serialized, null, 2));

    // Verify serialized data has the updated text
    expect(serialized.parameters.text).toBe('Updated text after editing');
    expect(serialized.parameters.buttonText).toBe('Continue');

    // 4. Project is loaded back (simulates deserializeBeats)
    const restored = registry.createBeat('infoText', {
      id: serialized.id,
      name: serialized.name,
      type: serialized.type,
      x: serialized.x,
      y: serialized.y,
      parameters: serialized.parameters
    });

    // Apply parameters (this is what deserializeBeats does)
    restored.updateParameters(serialized.parameters);

    // 5. Verify the restored beat has the correct text
    const restoredParams = restored.getParameters();
    console.log('[Integration Test] Restored params:', restoredParams);

    expect(restoredParams.text).toBe('Updated text after editing');
    expect(restoredParams.buttonText).toBe('Continue');
  });

  it('should preserve background node (asset) after edit → save → load', () => {
    const registry = BeatTypeRegistry.getInstance();

    // 1. User creates an InfoTextBeat with background
    const beat = registry.createBeat('infoText', {
      id: 'test-bg',
      name: 'Beat with Background',
      type: 'infoText',
      node: 'asset-forest-bg',
      parameters: {
        text: 'You are in a forest',
        node: 'asset-forest-bg'
      }
    });

    // 2. User changes the background in Inspector
    beat.updateParameters({
      node: 'asset-castle-bg'
    });

    // Verify the beat has the updated background
    const params = beat.getParameters();
    expect(params.node).toBe('asset-castle-bg');
    expect((beat as any).node).toBe('asset-castle-bg');

    // 3. Save
    const serialized = beat.toJSON();
    console.log('[Integration Test] Serialized with background:', JSON.stringify(serialized, null, 2));

    // Verify serialized data has the background at both levels
    expect(serialized.node).toBe('asset-castle-bg');
    expect(serialized.parameters.node).toBe('asset-castle-bg');

    // 4. Load
    const restored = registry.createBeat('infoText', {
      id: serialized.id,
      name: serialized.name,
      type: serialized.type,
      node: serialized.node,
      parameters: serialized.parameters
    });
    restored.updateParameters(serialized.parameters);

    // 5. Verify
    const restoredParams = restored.getParameters();
    expect(restoredParams.node).toBe('asset-castle-bg');
    expect((restored as any).node).toBe('asset-castle-bg');
  });

  it('should preserve DialogTreeBeat speaker after edit → save → load', () => {
    const registry = BeatTypeRegistry.getInstance();

    // 1. Create DialogTreeBeat
    const beat = registry.createBeat('dialogTree', {
      id: 'test-dialog',
      name: 'Dialog',
      type: 'dialogTree',
      parameters: {
        speaker: 'Wizard',
        dialogTree: {
          id: 'root',
          text: 'Hello adventurer!',
          emotion: 'happy'
        }
      }
    });

    // 2. User edits speaker and dialog in Inspector
    beat.updateParameters({
      speaker: 'Gandalf the Grey',
      dialogTree: {
        id: 'root',
        text: 'You shall not pass!',
        emotion: 'angry'
      }
    });

    // Verify - speaker is stored inside dialogTree, not at top level
    const params = beat.getParameters();
    expect(params.dialogTree.speaker).toBe('Gandalf the Grey');
    expect(params.dialogTree.text).toBe('You shall not pass!');

    // 3. Save
    const serialized = beat.toJSON();
    console.log('[Integration Test] Serialized dialog:', JSON.stringify(serialized, null, 2));

    // Speaker is stored inside dialogTree, not at top level
    expect(serialized.parameters.dialogTree.speaker).toBe('Gandalf the Grey');
    expect(serialized.parameters.dialogTree.text).toBe('You shall not pass!');

    // 4. Load
    const restored = registry.createBeat('dialogTree', {
      id: serialized.id,
      name: serialized.name,
      type: serialized.type,
      parameters: serialized.parameters
    });
    restored.updateParameters(serialized.parameters);

    // 5. Verify - speaker is stored inside dialogTree, not at top level
    const restoredParams = restored.getParameters();
    expect(restoredParams.dialogTree.speaker).toBe('Gandalf the Grey');
    expect(restoredParams.dialogTree.text).toBe('You shall not pass!');
  });

  it('should preserve all properties with multiple beats save/load', () => {
    const registry = BeatTypeRegistry.getInstance();

    // 1. Create multiple beats
    const beat1 = registry.createBeat('titleScreen', {
      id: 'beat-1',
      name: 'Title',
      type: 'titleScreen',
      x: 100,
      y: 100,
      parameters: {
        title: 'My Epic Adventure',
        author: 'John Doe',
        buttonText: 'Begin'
      }
    });

    const beat2 = registry.createBeat('infoText', {
      id: 'beat-2',
      name: 'Intro',
      type: 'infoText',
      x: 300,
      y: 100,
      node: 'bg-forest',
      parameters: {
        text: 'You wake up in a mysterious forest...',
        buttonText: 'Continue',
        node: 'bg-forest'
      }
    });

    // 2. Serialize all beats (simulate Story save)
    const serializedBeats = [beat1.toJSON(), beat2.toJSON()];
    console.log('[Integration Test] Serialized beats:', serializedBeats.length);

    // Verify beats are serialized correctly
    expect(serializedBeats).toHaveLength(2);
    expect(serializedBeats[0].parameters.title).toBe('My Epic Adventure');
    expect(serializedBeats[1].parameters.text).toBe('You wake up in a mysterious forest...');
    expect(serializedBeats[1].node).toBe('bg-forest');

    // 3. Load the beats back (simulate deserializeBeats)
    const restoredBeats = serializedBeats.map((beatData: any) => {
      const beat = registry.createBeat(beatData.type, {
        id: beatData.id,
        name: beatData.name,
        type: beatData.type,
        x: beatData.x,
        y: beatData.y,
        node: beatData.node,
        parameters: beatData.parameters
      });
      beat.updateParameters(beatData.parameters);
      return beat;
    });

    // 4. Verify all properties are restored
    expect(restoredBeats).toHaveLength(2);

    const restored1Params = restoredBeats[0].getParameters();
    expect(restored1Params.title).toBe('My Epic Adventure');
    expect(restored1Params.author).toBe('John Doe');

    const restored2Params = restoredBeats[1].getParameters();
    expect(restored2Params.text).toBe('You wake up in a mysterious forest...');
    expect(restored2Params.node).toBe('bg-forest');
    expect((restoredBeats[1] as any).node).toBe('bg-forest');
  });
});
