/**
 * An aiConversation's exit lives in fallbackExitTarget. Older builds could
 * store a plain link instead, invisible in the Inspector; on load it moves
 * into the field when that changes nothing about how the story plays.
 */
import { describe, it, expect } from 'vitest';
import { deserializeBeats, migrateHiddenSoleLinks } from '../projectDeserializer';

const conv = (parameters: any, connections: any[]) =>
  deserializeBeats([{ id: 'c1', name: 'Talk', type: 'aiConversation', parameters: { npcName: 'Ana', ...parameters }, connections }])[0] as any;

describe('migrateHiddenSoleLinks', () => {
  it('moves a lone bare plain link into the empty exit field', () => {
    const b = conv({}, [{ targetId: 'next', label: 'To Next' }]);
    expect(migrateHiddenSoleLinks([b])).toBe(1);
    expect(b.getParameters().fallbackExitTarget).toBe('next');
    expect(b.connections).toEqual([]);
    expect(b.getConnections().map((c: any) => c.targetId)).toEqual(['next']);
  });

  it('drops a plain link that repeats the filled exit field', () => {
    const b = conv({ fallbackExitTarget: 'next' }, [{ targetId: 'next' }]);
    expect(migrateHiddenSoleLinks([b])).toBe(1);
    expect(b.connections).toEqual([]);
  });

  it('leaves links it cannot move without changing the story', () => {
    const withCondition = conv({}, [{ targetId: 'a', condition: { type: 'variable', variable: 'x', operator: '==', value: true } }]);
    const withEffects = conv({}, [{ targetId: 'a', effects: [{ type: 'setVariable', variable: 'x', value: true }] }]);
    const several = conv({}, [{ targetId: 'a' }, { targetId: 'b' }]);
    const otherTarget = conv({ fallbackExitTarget: 'next' }, [{ targetId: 'elsewhere' }]);
    expect(migrateHiddenSoleLinks([withCondition, withEffects, several, otherTarget])).toBe(0);
    for (const b of [withCondition, withEffects, several]) expect(b.getParameters().fallbackExitTarget).toBeFalsy();
    expect(several.connections).toHaveLength(2);
    expect(otherTarget.connections).toHaveLength(1);
  });

  it('ignores beat types whose links are ordinary', () => {
    const [b] = deserializeBeats([{ id: 't', name: 'T', type: 'infoText', parameters: { text: 'hi' }, connections: [{ targetId: 'n' }] }]) as any[];
    expect(migrateHiddenSoleLinks([b])).toBe(0);
    expect(b.connections).toHaveLength(1);
  });
});
