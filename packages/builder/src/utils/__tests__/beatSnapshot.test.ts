import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '@asaps/core';
import { deserializeBeats } from '../projectDeserializer';
import { beatSnapshot } from '../beatSnapshot';
import { UpdateBeatCommand } from '../../commands/BeatCommands';

BeatTypeRegistry.getInstance();

/** The store's updateBeat, as it applies an undo step. */
function applyTo(beat: any) {
  return {
    updateBeat: (_id: string, incoming: any) => {
      const { parameters, ...rest } = incoming;
      if (parameters) beat.updateParameters(parameters);
      Object.assign(beat, rest);
    },
  } as any;
}

describe('beatSnapshot — undo of a Properties edit', () => {
  it('brings back parameters the panel already wrote onto the beat', () => {
    const [beat]: any[] = deserializeBeats([
      { id: 'b1', type: 'multiChoice', name: 'Fork', parameters: { question: 'Which way?', choices: [{ id: 'c1', text: 'Left', target: 'x' }] } },
    ]);
    const before = beatSnapshot(beat);

    // What Inspector.rebuildConnectionsAndUpdate does: edit in place first.
    beat.updateParameters({ ...beat.getParameters(), question: 'Which way now?', choices: [{ id: 'c1', text: 'Right', target: 'y' }] });
    const after = beatSnapshot(beat);
    const cmd = new UpdateBeatCommand('b1', before, after, applyTo(beat));

    cmd.undo();
    expect(beat.getParameters().question).toBe('Which way?');
    expect(beat.getParameters().choices[0].text).toBe('Left');
    expect(beat.getConnections().map((c: any) => c.targetId)).toEqual(['x']);

    cmd.execute();
    expect(beat.getParameters().question).toBe('Which way now?');
    expect(beat.getConnections().map((c: any) => c.targetId)).toEqual(['y']);
  });

  it('copies, so a later edit cannot change the snapshot', () => {
    const [beat]: any[] = deserializeBeats([{ id: 'b2', type: 'infoText', name: 'Hi', parameters: { text: 'Hello' } }]);
    const before = beatSnapshot(beat);
    beat.updateParameters({ text: 'Bye' });
    expect(before.parameters.text).toBe('Hello');
    expect('_version' in before).toBe(false);
  });
});
