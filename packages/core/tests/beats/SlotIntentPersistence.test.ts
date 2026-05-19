import { describe, it, expect } from 'vitest';
import { EndScreenBeat } from '../../src/beats/EndScreenBeat';
import { AISummaryBeat } from '../../src/beats/AISummaryBeat';
import { OnlineContentBeat } from '../../src/beats/OnlineContentBeat';
import { AIInfoTextBeat } from '../../src/beats/AIInfoTextBeat';

// A representative slotIntent map (the shape SlotFlowView consumes).
const SI = {
  title: { preferredLines: 2 },
  action: { anchor: { h: 'center', v: 'bottom', relativeTo: 'stage' }, gap: 24 },
};
const SI2 = { title: { preferredLines: 1 } };

const ctors: Array<[string, (params: any) => any]> = [
  ['EndScreenBeat', (parameters) => new EndScreenBeat({ id: 'b', name: 'b', type: 'endScreen', parameters } as any)],
  ['AISummaryBeat', (parameters) => new AISummaryBeat({ id: 'b', name: 'b', type: 'aiSummary', parameters } as any)],
  ['OnlineContentBeat', (parameters) => new OnlineContentBeat({ id: 'b', name: 'b', type: 'onlineContent', parameters } as any)],
  ['AIInfoTextBeat', (parameters) => new AIInfoTextBeat({ id: 'b', name: 'b', type: 'aiInfoText', parameters } as any)],
];

describe('slotIntent persistence (3d-0)', () => {
  for (const [name, make] of ctors) {
    describe(name, () => {
      it('round-trips slotIntent through getParameters', () => {
        const beat = make({ slotIntent: SI });
        expect(beat.getParameters().slotIntent).toEqual(SI);
      });

      it('serializes slotIntent via toJSON().parameters', () => {
        const beat = make({ slotIntent: SI });
        expect(beat.toJSON().parameters.slotIntent).toEqual(SI);
      });

      it('updateParameters updates slotIntent', () => {
        const beat = make({ slotIntent: SI });
        beat.updateParameters({ slotIntent: SI2 });
        expect(beat.getParameters().slotIntent).toEqual(SI2);
      });

      it('absent slotIntent is undefined (pure flow)', () => {
        const beat = make({});
        expect(beat.getParameters().slotIntent).toBeUndefined();
      });

      it('THE invariant: slotIntent is a PARAM, never bakes locations[]', () => {
        const beat = make({ slotIntent: SI });
        // authorPositioned (builder/renderer) = beat.locations.size > 0.
        // Carrying slotIntent must NOT create any location → stays slot-mode.
        expect(beat.locations.size).toBe(0);
      });
    });
  }
});
