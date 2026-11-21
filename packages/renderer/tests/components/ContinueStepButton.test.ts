/**
 * A Dialog Tree's continue step ("then another character speaks") has no
 * words of its own. Players see a Continue button; the fixed canvas of the
 * Visual Editor drew its default button empty.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setUIStrings } from '@asaps/core';
import { createPositionedElementData } from '../../src/components/PositionedBeatView';

const button = { kind: 'button', name: 'Choice 1', x: 0, y: 0, width: 300, height: 50 } as any;

describe('a continue step drawn as a button', () => {
  afterEach(() => setUIStrings(undefined));

  it('says Continue', () => {
    const [el] = createPositionedElementData([button], { text: 'A line', choices: [{ id: 'c1', continue: true, dialogNode: { speaker: 'Tomas' } }] }, 'dialogTree');
    expect(el.content).toBe('Continue');
  });

  it('says it in the language shown', () => {
    setUIStrings({ continue: 'Weiter' });
    const [el] = createPositionedElementData([button], { text: 'A line', choices: [{ id: 'c1', continue: true }] }, 'dialogTree');
    expect(el.content).toBe('Weiter');
  });

  it('leaves a reply as written', () => {
    const [el] = createPositionedElementData([button], { text: 'A line', choices: [{ id: 'c1', text: 'Turn back.' }] }, 'dialogTree');
    expect(el.content).toBe('Turn back.');
  });
});
