import { describe, it, expect } from 'vitest';
import { flowchartLinkCount } from '../storyLinks';

const beat = (b: any) => ({ connections: [], parameters: {}, ...b, getConnections: () => b.connections ?? [], getParameters: () => b.parameters ?? {} });

describe('flowchartLinkCount', () => {
  it('counts the restart link an end screen draws', () => {
    const beats = [
      beat({ id: 't', type: 'titleScreen', connections: [{ targetId: 'i' }] }),
      beat({ id: 'i', type: 'infoText', connections: [{ targetId: 'e' }] }),
      beat({ id: 'e', type: 'endScreen', parameters: { showRestart: true }, connections: [{ targetId: 't', role: 'restart' }] }),
    ];
    expect(flowchartLinkCount(beats)).toBe(3);
  });
  it('skips links to missing beats and default targets that cannot fire', () => {
    const beats = [
      beat({ id: 'a', type: 'infoText', connections: [{ targetId: 'b' }, { targetId: 'gone' }], defaultTarget: 'c' }),
      beat({ id: 'b', type: 'infoText' }),
      beat({ id: 'c', type: 'infoText' }),
    ];
    expect(flowchartLinkCount(beats)).toBe(1);
  });
});
