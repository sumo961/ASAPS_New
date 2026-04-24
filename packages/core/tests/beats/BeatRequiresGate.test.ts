/**
 * Tests for the runtime `requires[]` gate on Beat.execute().
 *
 * When a beat declares state prerequisites, the engine must evaluate them
 * before performAction(). If any fail and declare a fallbackTarget, execute()
 * must return that target without running the beat's action or marking it
 * visited. Requirements with no fallbackTarget emit a warning but don't block.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import type { IRenderer } from '../../src/types';

function createMockRenderer(): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(''),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(''),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

describe('Beat requires-gate', () => {
  let context: StoryContext;
  let renderer: IRenderer;
  let story: Story;

  beforeEach(() => {
    story = new Story({ firstBeatId: 'start' });
    context = new StoryContext({}, story);
    renderer = createMockRenderer();
  });

  it('redirects to fallbackTarget when an inventory requirement is unmet', async () => {
    const gated = new InfoTextBeat({
      id: 'crypt',
      name: 'The Crypt',
      type: 'infoText',
      text: 'You step into the crypt.',
      connections: [{ targetId: 'proceed' }],
      requires: [
        {
          condition: { type: 'inventory', operator: '==', item: 'Lantern', value: true } as any,
          explanation: 'Player must have the Lantern.',
          fallbackTarget: 'hall',
        },
      ],
    } as any);

    const nextBeat = await gated.execute(context, renderer);

    expect(nextBeat).toBe('hall');
    // Should NOT have rendered — performAction is skipped when the gate redirects
    expect(renderer.renderText).not.toHaveBeenCalled();
    // And it should NOT have been marked visited
    expect(context.getVisitedBeats()).not.toContain('crypt');
  });

  it('runs normally when all requirements are satisfied', async () => {
    context.addToInventory('Lantern');

    const gated = new InfoTextBeat({
      id: 'crypt',
      name: 'The Crypt',
      type: 'infoText',
      text: 'You step into the crypt.',
      connections: [{ targetId: 'proceed' }],
      requires: [
        {
          condition: { type: 'inventory', operator: '==', item: 'Lantern', value: true } as any,
          explanation: 'Player must have the Lantern.',
          fallbackTarget: 'hall',
        },
      ],
    } as any);

    const nextBeat = await gated.execute(context, renderer);

    // With the requirement met, normal flow continues — render runs and the
    // first connection is returned as the next beat.
    expect(renderer.renderText).toHaveBeenCalled();
    expect(nextBeat).toBe('proceed');
  });

  it('annotation-only mode: warns but does not block when no fallbackTarget is set', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const gated = new InfoTextBeat({
      id: 'crypt',
      name: 'The Crypt',
      type: 'infoText',
      text: 'Unprotected entry.',
      connections: [{ targetId: 'proceed' }],
      requires: [
        {
          condition: { type: 'inventory', operator: '==', item: 'Lantern', value: true } as any,
          explanation: 'Analyzer-only annotation.',
          // no fallbackTarget — pure annotation
        },
      ],
    } as any);

    const nextBeat = await gated.execute(context, renderer);

    expect(nextBeat).toBe('proceed'); // still proceeded
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('OR mode: passes when at least one requirement is met', async () => {
    context.addToInventory('Torch'); // satisfies 2nd requirement only

    const gated = new InfoTextBeat({
      id: 'darkroom',
      name: 'Dark Room',
      type: 'infoText',
      text: 'You need light to proceed.',
      connections: [{ targetId: 'proceed' }],
      requiresMode: 'any',
      requires: [
        {
          condition: { type: 'inventory', operator: '==', item: 'Lantern', value: true } as any,
          explanation: 'Has Lantern.',
          fallbackTarget: 'hall',
        },
        {
          condition: { type: 'inventory', operator: '==', item: 'Torch', value: true } as any,
          explanation: 'Has Torch.',
          fallbackTarget: 'hall',
        },
      ],
    } as any);

    const nextBeat = await gated.execute(context, renderer);
    expect(nextBeat).toBe('proceed');
    expect(renderer.renderText).toHaveBeenCalled();
  });

  it('OR mode: redirects only when ALL requirements fail', async () => {
    // No lantern, no torch — both fail.
    const gated = new InfoTextBeat({
      id: 'darkroom',
      name: 'Dark Room',
      type: 'infoText',
      text: 'You need light.',
      connections: [{ targetId: 'proceed' }],
      requiresMode: 'any',
      requires: [
        {
          condition: { type: 'inventory', operator: '==', item: 'Lantern', value: true } as any,
          explanation: 'Has Lantern.',
          fallbackTarget: 'hall',
        },
        {
          condition: { type: 'inventory', operator: '==', item: 'Torch', value: true } as any,
          explanation: 'Has Torch.',
          fallbackTarget: 'hall',
        },
      ],
    } as any);

    const nextBeat = await gated.execute(context, renderer);
    expect(nextBeat).toBe('hall');
    expect(renderer.renderText).not.toHaveBeenCalled();
  });

  it('honours the first unmet requirement when multiple are declared', async () => {
    context.setCounter('courage', 1); // satisfies the 2nd requirement

    const gated = new InfoTextBeat({
      id: 'boss',
      name: 'Boss Fight',
      type: 'infoText',
      text: 'You face the boss.',
      connections: [{ targetId: 'win' }],
      requires: [
        {
          condition: { type: 'inventory', operator: '==', item: 'Sword', value: true } as any,
          explanation: 'Need a Sword.',
          fallbackTarget: 'armory',
        },
        {
          condition: { type: 'counter', operator: '>=', variableName: 'courage', value: 1 } as any,
          explanation: 'Need some courage.',
          fallbackTarget: 'tavern',
        },
      ],
    } as any);

    const nextBeat = await gated.execute(context, renderer);

    // First unmet requirement (Sword) takes precedence over the satisfied 2nd one
    expect(nextBeat).toBe('armory');
  });
});
