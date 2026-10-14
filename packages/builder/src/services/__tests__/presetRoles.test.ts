/**
 * "Start as if…" presets keep castings apart: a beat whose text says
 * ${@confidant} plays differently after siding with Ingrid than with Tomas.
 */
import { describe, it, expect } from 'vitest';
import { generatePathPresets } from '../PathBasedPresetGenerator';
import { Story, BeatTypeRegistry } from '@asaps/core';


const beat = (id: string, type: string, parameters: any, connections: any[] = []) =>
  BeatTypeRegistry.getInstance().createBeat(type, { id, name: id, type, parameters, connections } as any);

describe('presets and roles', () => {
  it('one start state per casting the beat ahead can tell apart', () => {
    const story = new Story({ title: 't', author: 'a', firstBeatId: 'side' });
    story.setCharacters([{ id: 'char_ingrid', name: 'ingrid' }, { id: 'char_tomas', name: 'tomas' }] as any);
    story.setSettings({ roles: [{ id: 'confidant', candidates: ['char_ingrid', 'char_tomas'] }] });
    story.addBeat(beat('side', 'multiChoice', { question: 'q', choices: [
      { id: 'i', text: 'Side with Ingrid', target: 'talk', effects: [{ type: 'castRole', target: 'confidant', character: 'char_ingrid' }] },
      { id: 't', text: 'Side with Tomas', target: 'talk', effects: [{ type: 'castRole', target: 'confidant', character: 'char_tomas' }] },
    ] }));
    story.addBeat(beat('talk', 'infoText', { text: '${@confidant} leans closer.' }, [{ targetId: 'end' }]));
    story.addBeat(beat('end', 'endScreen', { message: 'e', showRestart: false }));
    const result = generatePathPresets(story, 'talk');
    expect(result.presets.map((p) => p.preset.name).sort()).toEqual(
      expect.arrayContaining([expect.stringContaining('Ingrid'), expect.stringContaining('Tomas')]),
    );
    expect(result.presets).toHaveLength(2);
  });
});
