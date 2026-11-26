import { describe, it, expect } from 'vitest';
import { flowchartLineCount } from '../graphBuild';

const beat = (b: any) => ({ connections: [], parameters: {}, ...b, getConnections: () => b.connections ?? [], getParameters: () => b.parameters ?? {} });

describe('flowchartLineCount (the header\'s Connections)', () => {
  it('counts the restart link an end screen draws', () => {
    const beats = [
      beat({ id: 't', type: 'titleScreen', connections: [{ targetId: 'i' }] }),
      beat({ id: 'i', type: 'infoText', connections: [{ targetId: 'e' }] }),
      beat({ id: 'e', type: 'endScreen', parameters: { showRestart: true }, connections: [{ targetId: 't', role: 'restart' }] }),
    ];
    expect(flowchartLineCount(beats as any)).toBe(3);
  });
  it('counts two lines between the same two beats as two', () => {
    const beats = [
      beat({ id: 'q', type: 'conditionBeat', parameters: { trueTarget: 'x', falseTarget: 'x' }, connections: [{ targetId: 'x', label: 'true' }, { targetId: 'x', label: 'false' }] }),
      beat({ id: 'x', type: 'infoText' }),
    ];
    expect(flowchartLineCount(beats as any)).toBe(2);
  });
  it('counts several choices to one beat as the one line they share', () => {
    const beats = [
      beat({ id: 'm', type: 'multiChoice', parameters: { choices: [{ text: 'A', target: 'x' }, { text: 'B', target: 'x' }] }, connections: [{ targetId: 'x', label: 'A' }, { targetId: 'x', label: 'B' }] }),
      beat({ id: 'x', type: 'infoText' }),
    ];
    expect(flowchartLineCount(beats as any)).toBe(1);
  });
  it('skips links to missing beats and default targets that cannot fire', () => {
    const beats = [
      beat({ id: 'a', type: 'infoText', connections: [{ targetId: 'b' }, { targetId: 'gone' }], defaultTarget: 'c' }),
      beat({ id: 'b', type: 'infoText' }),
      beat({ id: 'c', type: 'infoText' }),
    ];
    expect(flowchartLineCount(beats as any)).toBe(1);
  });
});
