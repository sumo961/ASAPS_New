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
  findDialogLinesWithoutExit,
  describeLineWithoutExit,
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

  it('a choice shown only under conditions, or a requirement, gates the beat too', () => {
    const choiceGate = validateStoryLogic(story([
      { id: 'mc', name: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'c', text: 'Unlock', target: 'gated', conditions: [{ type: 'inventory', item: 'key', operator: '==' }] },
      ] } },
      info('gated', 'You have the key now.'),
    ]));
    expect(choiceGate.issues.some((i) => i.beatId === 'gated')).toBe(false);
    const requirement = validateStoryLogic(story([
      info('a', 'Open the chest.', 'gated'),
      { ...info('gated', 'You have the key now.'), requires: [{ condition: { type: 'inventory', item: 'key' }, fallbackTarget: 'a' }] },
    ]));
    expect(requirement.issues.some((i) => i.beatId === 'gated')).toBe(false);
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

// RED: A Modern Tale — Grandma's last line had no replies and no exit link,
// so the scene ended on it the moment it was drawn. It is now reported.
describe('Dialog Tree lines nothing follows', () => {
  const tree = (lastLine: Record<string, unknown>) => ({
    id: 'wisdom', name: 'Heart to Heart', type: 'dialogTree',
    connections: [{ targetId: 'reflection' }],
    parameters: { dialogTree: {
      id: 'n0', speaker: 'Grandma', text: 'Listen, Riley.',
      choices: [{ id: 'c', text: '', continue: true, dialogNode: { id: 'n1', speaker: 'Grandma', text: 'Be brave enough to be yourself.', ...lastLine } }],
    } },
  });
  const reflection = { id: 'reflection', name: 'Reflection', type: 'infoText', parameters: {} };

  it('reports a closing line with no replies and no exit link, naming where the scene goes', () => {
    const lines = findDialogLinesWithoutExit([tree({}), reflection]);
    expect(lines).toEqual([expect.objectContaining({ beatId: 'wisdom', nodeId: 'n1', fallbackTo: 'Reflection' })]);
    const issue = validateStoryLogic({ beats: [tree({}), reflection] }).issues.find((i) => i.category === 'dialog_line_without_exit');
    expect(issue?.message).toBe('In "Heart to Heart", the line "Be brave enough to be yourself." has no replies and no exit link: the scene ends there and goes on by the beat\'s own link to "Reflection".');
  });

  it('says so when the beat has no link either', () => {
    const lonely = { ...tree({}), connections: [] };
    expect(describeLineWithoutExit(findDialogLinesWithoutExit([lonely])[0])).toMatch(/the beat has no link, so the story stops/);
  });

  it('accepts a line with an exit link, with replies, or with an old `next`', () => {
    expect(findDialogLinesWithoutExit([tree({ target: 'reflection' }), reflection])).toEqual([]);
    expect(findDialogLinesWithoutExit([tree({ choices: [{ id: 'r', text: 'Thanks', target: 'reflection' }] }), reflection])).toEqual([]);
    expect(findDialogLinesWithoutExit([tree({ next: 'reflection' }), reflection])).toEqual([]);
  });
});
