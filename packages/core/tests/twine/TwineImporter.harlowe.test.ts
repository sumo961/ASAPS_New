/**
 * Tests for Harlowe format import fixes
 */

import { describe, it, expect } from 'vitest';
import { TwineImporter } from '../../src/twine/TwineImporter';

const harloweTestHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Harlowe Test Story</title>
</head>
<body>
<tw-storydata name="The Principal's Office" startnode="1" creator="Twine" creator-version="2.9.2" format="Harlowe" format-version="3.3.9" ifid="test-story-uuid">
<tw-passagedata pid="1" name="Start" tags="" position="100,100">Welcome to the story.

[[Enter the office|Office]]</tw-passagedata>

<tw-passagedata pid="2" name="Office" tags="" position="200,100">You enter the principal's office.

[[Look at Tom]]
[[Look at the desk]]</tw-passagedata>

<tw-passagedata pid="3" name="Look at Tom" tags="" position="300,100">(set: $betrayedTom to true)Tom glares at you angrily.

(if: $betrayedTom is true)["The truth is," you begin, "that Tom here is the victim of bullying." Everyone stares at you in surprise as you continue your heartfelt speech about the injustice Tom has faced.
[[Tell the truth|Ending #1]]]
(else:)[You stammer, unable to face Tom after what you did. The guilt weighs heavily on your conscience as you search for words that won't come.
[[Lie about it|Ending #2]]]</tw-passagedata>

<tw-passagedata pid="4" name="Look at the desk" tags="" position="300,200">(set: $foundEvidence to true)You find incriminating documents on the desk.

[[Return to office|Office]]</tw-passagedata>

<tw-passagedata pid="5" name="Ending #1" tags="ending" position="400,100">You told the truth. Tom forgives you.

THE END</tw-passagedata>

<tw-passagedata pid="6" name="Ending #2" tags="ending" position="400,200">You lied. Tom never trusted you again.

THE END</tw-passagedata>

<tw-passagedata pid="7" name="StoryInit" tags="story-init" position="0,0">(set: $betrayedTom to false)
(set: $foundEvidence to false)</tw-passagedata>
</tw-storydata>
</body>
</html>`;

describe('TwineImporter - Harlowe format', () => {
  it('should parse StoryInit variables with correct boolean values', () => {
    const importer = new TwineImporter();
    const result = importer.import(harloweTestHtml);

    const setVarBeats = result.beats.filter(b => b.type === 'setVariable');

    // Should have 2 init beats (betrayedTom, foundEvidence)
    // Note: "Look at Tom" and "Look at the desk" also have set operations but become main beats
    expect(setVarBeats.length).toBeGreaterThanOrEqual(2);

    // Find the init beats
    const initBeats = setVarBeats.filter(b => b.name.startsWith('Init:'));
    expect(initBeats.length).toBe(2);

    // Check that values are parsed correctly (false, not "false" or the variable name)
    for (const beat of initBeats) {
      const params = beat.getParameters();
      expect(params.value).toBe(false);
      expect(typeof params.value).toBe('boolean');
    }
  });

  it('should make first init beat the story start', () => {
    const importer = new TwineImporter();
    const result = importer.import(harloweTestHtml);

    const initBeats = result.beats.filter(b => b.name.startsWith('Init:'));
    expect(initBeats.length).toBeGreaterThan(0);

    // First beat should be an init beat
    expect(result.firstBeatId).toBe(initBeats[0].id);
  });

  it('should chain init beats and connect to start passage', () => {
    const importer = new TwineImporter();
    const result = importer.import(harloweTestHtml);

    const initBeats = result.beats.filter(b => b.name.startsWith('Init:'));
    expect(initBeats.length).toBe(2);

    // First init beat should point to second
    expect(initBeats[0].defaultTarget).toBe(initBeats[1].id);

    // Last init beat should point to Start passage
    const startBeat = result.beats.find(b => b.name === 'Start');
    expect(startBeat).toBeDefined();
    expect(initBeats[1].defaultTarget).toBe(startBeat!.id);
  });

  it('should create ConditionBeat with proper connections', () => {
    const importer = new TwineImporter();
    const result = importer.import(harloweTestHtml);

    // "Look at Tom" should become a conditionBeat
    const lookAtTom = result.beats.find(b => b.name === 'Look at Tom');
    expect(lookAtTom).toBeDefined();
    expect(lookAtTom!.type).toBe('conditionBeat');

    // Should have connections with conditions
    expect(lookAtTom!.connections.length).toBeGreaterThan(0);

    // Find the conditional connection
    const conditionalConn = lookAtTom!.connections.find(c => c.condition);
    expect(conditionalConn).toBeDefined();
    expect(conditionalConn!.condition!.variableName).toBe('betrayedTom');
    expect(conditionalConn!.condition!.operator).toBe('==');
    expect(conditionalConn!.condition!.value).toBe(true);  // Actual boolean, not string

    // Should have an else connection
    const elseConn = lookAtTom!.connections.find(c => !c.condition);
    expect(elseConn).toBeDefined();

    // Check that beat parameters are set (not just connections)
    const params = lookAtTom!.getParameters();
    expect(params.conditionType).toBe('variable');
    expect(params.variableName).toBe('betrayedTom');
    expect(params.operator).toBe('==');
    expect(params.value).toBe(true);  // Actual boolean, not string
    expect(params.trueTarget).toBeDefined();
    expect(params.falseTarget).toBeDefined();
  });

  it('should detect EndScreen beats by tag', () => {
    const importer = new TwineImporter();
    const result = importer.import(harloweTestHtml);

    const endBeats = result.beats.filter(b => b.type === 'endScreen');
    expect(endBeats.length).toBe(2);

    const beatNames = endBeats.map(b => b.name);
    expect(beatNames).toContain('Ending #1');
    expect(beatNames).toContain('Ending #2');
  });

  it('should create intermediate IntroText beats for conditional content', () => {
    const importer = new TwineImporter();
    const result = importer.import(harloweTestHtml);

    // Should have intermediate beats for "Look at Tom" conditional content
    const trueBeat = result.beats.find(b => b.name === 'Look at Tom (True)');
    const falseBeat = result.beats.find(b => b.name === 'Look at Tom (False)');

    expect(trueBeat).toBeDefined();
    expect(falseBeat).toBeDefined();

    // Check true beat has the conditional text
    const trueParams = trueBeat!.getParameters();
    expect(trueParams.text).toContain('The truth is');
    expect(trueBeat!.type).toBe('introText');

    // Check false beat has the conditional text
    const falseParams = falseBeat!.getParameters();
    expect(falseParams.text).toContain('You stammer');
    expect(falseBeat!.type).toBe('introText');

    // The conditionBeat should point to these intermediate beats
    const lookAtTom = result.beats.find(b => b.name === 'Look at Tom');
    const params = lookAtTom!.getParameters();
    expect(params.trueTarget).toBe(trueBeat!.id);
    expect(params.falseTarget).toBe(falseBeat!.id);

    // And the intermediate beats should point to the endings
    const ending1 = result.beats.find(b => b.name === 'Ending #1');
    const ending2 = result.beats.find(b => b.name === 'Ending #2');
    expect(trueBeat!.defaultTarget).toBe(ending1!.id);
    expect(falseBeat!.defaultTarget).toBe(ending2!.id);
  });

  it('should not have orphan beats', () => {
    const importer = new TwineImporter();
    const result = importer.import(harloweTestHtml);

    // Collect all targets
    const allTargets = new Set<string>();
    for (const beat of result.beats) {
      if (beat.defaultTarget) allTargets.add(beat.defaultTarget);
      for (const conn of beat.connections || []) {
        allTargets.add(conn.targetId);
      }
    }
    // First beat has incoming from story start
    allTargets.add(result.firstBeatId);

    // Find orphans
    const orphans = result.beats.filter(b => !allTargets.has(b.id));

    // Should have no orphans
    expect(orphans.map(b => b.name)).toEqual([]);
  });
});
