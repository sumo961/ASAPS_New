/**
 * Tests for storyLogicValidator — narrative-consistency analysis over a
 * generated story: hub-beat detection (multiple incoming paths), text that
 * assumes player state without a conditionBeat gate, and pickProp items that
 * don't lead to a describing infoText.
 *
 * Pure logic, no deps. Fixtures use the same connection shapes the validator
 * reads: single beats via parameters.connection.target, conditionBeats via
 * true/falseConnection.target, pickProp via parameters.props[].target.
 */
import { describe, it, expect } from 'vitest';
import {
  validateStoryLogic,
  formatLogicValidationResult,
} from '../storyLogicValidator';

const info = (id: string, text: string, target?: string) => ({
  id,
  name: id,
  type: 'infoText',
  parameters: { text, ...(target ? { connection: { target } } : {}) },
});
const story = (beats: any[]) => ({ beats });

describe('guard', () => {
  it('returns a valid empty result for a story with no beats array', () => {
    for (const s of [undefined, null, {}, { beats: 'nope' }]) {
      const r = validateStoryLogic(s as any);
      expect(r.valid).toBe(true);
      expect(r.issues).toEqual([]);
      expect(r.hubBeats).toEqual([]);
    }
  });
});

describe('hub-beat detection', () => {
  it('flags a beat reached from more than one path as a hub', () => {
    const r = validateStoryLogic(
      story([
        info('a', 'Go left.', 'hub'),
        info('b', 'Go right.', 'hub'),
        info('hub', 'You arrive at the clearing.'),
      ]),
    );
    expect(r.hubBeats).toContain('hub');
  });

  it('does not flag a linear chain as a hub', () => {
    const r = validateStoryLogic(story([info('a', 'One.', 'b'), info('b', 'Two.')]));
    expect(r.hubBeats).toEqual([]);
  });
});

describe('state-assumption text', () => {
  it('warns when a HUB beat assumes state without a condition gate', () => {
    const r = validateStoryLogic(
      story([
        info('a', 'Search the study.', 'hub'),
        info('b', 'Search the library.', 'hub'),
        info('hub', "You've gathered enough evidence to confront the suspect."),
      ]),
    );
    const issue = r.issues.find((i) => i.category === 'hub_state_assumption');
    expect(issue).toBeDefined();
    expect(issue!.type).toBe('warning');
    expect(issue!.beatId).toBe('hub');
    expect(issue!.incomingPaths).toBe(2);
  });

  it('emits an info (not warning) for an ungated state reference on a non-hub beat', () => {
    const r = validateStoryLogic(story([info('a', 'Open the chest.', 'b'), info('b', 'You have the key now.')]));
    const issue = r.issues.find((i) => i.category === 'ungated_state_reference');
    expect(issue).toBeDefined();
    expect(issue!.type).toBe('info');
    expect(r.issues.some((i) => i.category === 'hub_state_assumption')).toBe(false);
  });

  it('suppresses the warning when a conditionBeat gates the state-assuming beat', () => {
    const cond = {
      id: 'c',
      name: 'check evidence',
      type: 'conditionBeat',
      parameters: {
        condition: { type: 'counter', variable: 'clues', operator: '>=', value: 3 },
        trueConnection: { target: 'gated' },
        falseConnection: { target: 'a' },
      },
    };
    const r = validateStoryLogic(
      story([cond, info('a', 'Not yet.'), info('gated', "You've gathered enough evidence to proceed.")]),
    );
    expect(r.issues.some((i) => i.beatId === 'gated')).toBe(false);
  });

  it('does not flag plain text with no state assumptions', () => {
    const r = validateStoryLogic(story([info('a', 'The rain taps the window.', 'b'), info('b', 'He says nothing.')]));
    expect(r.issues).toEqual([]);
  });
});

describe('pickProp item descriptions', () => {
  const pickProp = (id: string, propName: string, target: string) => ({
    id,
    name: id,
    type: 'pickProp',
    parameters: { question: 'What do you examine?', props: [{ id: 'p', name: propName, target }] },
  });

  it('warns when a picked item leads straight to a non-describing beat', () => {
    const r = validateStoryLogic(
      story([pickProp('pp', 'Mysterious Letter', 'choice'), { id: 'choice', name: 'choice', type: 'multiChoice', parameters: {} }]),
    );
    const issue = r.issues.find((i) => i.category === 'undescribed_item');
    expect(issue).toBeDefined();
    expect(issue!.itemName).toBe('Mysterious Letter');
    expect(issue!.targetBeatType).toBe('multiChoice');
  });

  it('does not warn when the item leads to an infoText description', () => {
    const r = validateStoryLogic(story([pickProp('pp', 'Letter', 'desc'), info('desc', 'The letter reads: flee at dawn.')]));
    expect(r.issues.some((i) => i.category === 'undescribed_item')).toBe(false);
  });
});

describe('formatLogicValidationResult', () => {
  it('reports the all-clear when there are no issues', () => {
    const out = formatLogicValidationResult(validateStoryLogic(story([info('a', 'Hello.')])));
    expect(out).toContain('Story Logic Validation');
    expect(out).toContain('No narrative logic issues detected');
  });

  it('lists hub beats and renders warnings with their message', () => {
    const r = validateStoryLogic(
      story([
        info('a', 'Search the study.', 'hub'),
        info('b', 'Search the library.', 'hub'),
        info('hub', "You've gathered enough clues."),
      ]),
    );
    const out = formatLogicValidationResult(r);
    expect(out).toMatch(/Hub Beats.*: 1/);
    expect(out).toMatch(/Warnings \(1\)/);
    expect(out).toContain('[hub]');
  });
});
