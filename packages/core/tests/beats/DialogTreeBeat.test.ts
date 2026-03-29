/**
 * Tests for DialogTreeBeat nested dialog playback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

// Mock renderer that tracks calls and allows simulated user choices
function createMockRenderer() {
  let renderDialogCalls: { speaker: string; text: string; emotion?: string }[] = [];
  let renderChoicesCalls: { choices: { id: string; text: string }[] }[] = [];
  let choiceQueue: string[] = [];

  const renderer: IRenderer = {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockImplementation(async (speaker, text, emotion) => {
      renderDialogCalls.push({ speaker, text, emotion });
    }),
    renderChoices: vi.fn().mockImplementation(async (choices) => {
      renderChoicesCalls.push({ choices });
      const choiceId = choiceQueue.shift();
      if (!choiceId) {
        throw new Error('No choice queued for renderChoices - test needs to queue a choice');
      }
      return choiceId;
    }),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  };

  return {
    renderer,
    queueChoice: (choiceId: string) => choiceQueue.push(choiceId),
    queueChoices: (choiceIds: string[]) => choiceQueue.push(...choiceIds),
    getDialogCalls: () => renderDialogCalls,
    getChoicesCalls: () => renderChoicesCalls,
    reset: () => {
      renderDialogCalls = [];
      renderChoicesCalls = [];
      choiceQueue = [];
    }
  };
}

describe('DialogTreeBeat', () => {
  let context: StoryContext;
  let mockRenderer: ReturnType<typeof createMockRenderer>;

  beforeEach(() => {
    context = new StoryContext();
    mockRenderer = createMockRenderer();
  });

  describe('Nested Dialog Playback', () => {
    it('should navigate through nested dialog nodes', async () => {
      // Create a DialogTreeBeat with nested dialogs
      const beat = new DialogTreeBeat({
        id: 'dialog_test',
        name: 'Test Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'Wizard',
          text: 'What would you like to know?',
          choices: [
            {
              id: 'choice_magic',
              text: 'Tell me about magic',
              dialogNode: {
                id: 'node_magic',
                speaker: 'Wizard',
                text: 'Magic is wonderful!',
                choices: [
                  {
                    id: 'choice_thanks',
                    text: 'Thank you!',
                    target: 'beat_end'
                  }
                ]
              }
            },
            {
              id: 'choice_goodbye',
              text: 'Goodbye',
              target: 'beat_end'
            }
          ]
        }
      });

      // Queue choices: first select nested dialog path, then exit
      mockRenderer.queueChoices(['choice_magic', 'choice_thanks']);

      // Execute the beat
      const result = await beat.execute(context, mockRenderer.renderer);

      // Should have rendered dialog twice (root + nested)
      const dialogCalls = mockRenderer.getDialogCalls();
      expect(dialogCalls.length).toBe(2);
      expect(dialogCalls[0].speaker).toBe('Wizard');
      expect(dialogCalls[0].text).toBe('What would you like to know?');
      expect(dialogCalls[1].speaker).toBe('Wizard');
      expect(dialogCalls[1].text).toBe('Magic is wonderful!');

      // Should have rendered choices twice
      const choicesCalls = mockRenderer.getChoicesCalls();
      expect(choicesCalls.length).toBe(2);
      expect(choicesCalls[0].choices.length).toBe(2); // root has 2 choices
      expect(choicesCalls[1].choices.length).toBe(1); // nested has 1 choice

      // Should exit to the target beat
      expect(result).toBe('beat_end');
    });

    it('should exit directly when choosing a choice with target (no nested dialog)', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_test',
        name: 'Test Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'Guard',
          text: 'Halt! Who goes there?',
          choices: [
            {
              id: 'choice_friend',
              text: 'A friend',
              target: 'beat_enter'
            },
            {
              id: 'choice_enemy',
              text: 'Your enemy',
              target: 'beat_fight'
            }
          ]
        }
      });

      // Choose direct exit
      mockRenderer.queueChoice('choice_friend');

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should only render dialog once (root)
      expect(mockRenderer.getDialogCalls().length).toBe(1);
      expect(mockRenderer.getChoicesCalls().length).toBe(1);
      expect(result).toBe('beat_enter');
    });

    it('should handle deeply nested dialogs (3+ levels)', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_deep',
        name: 'Deep Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC1',
          text: 'Level 1',
          choices: [
            {
              id: 'c1',
              text: 'Go deeper',
              dialogNode: {
                id: 'n2',
                speaker: 'NPC2',
                text: 'Level 2',
                choices: [
                  {
                    id: 'c2',
                    text: 'Even deeper',
                    dialogNode: {
                      id: 'n3',
                      speaker: 'NPC3',
                      text: 'Level 3',
                      choices: [
                        {
                          id: 'c3',
                          text: 'Exit',
                          target: 'beat_end'
                        }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      });

      mockRenderer.queueChoices(['c1', 'c2', 'c3']);

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should have 3 dialog renders
      const dialogCalls = mockRenderer.getDialogCalls();
      expect(dialogCalls.length).toBe(3);
      expect(dialogCalls[0].text).toBe('Level 1');
      expect(dialogCalls[1].text).toBe('Level 2');
      expect(dialogCalls[2].text).toBe('Level 3');

      expect(result).toBe('beat_end');
    });

    it('should navigate mixed paths - some nested, some direct exit', async () => {
      // Test navigating a dialog tree where we first go into nested dialog,
      // then exit, simulating a real conversation
      const beat = new DialogTreeBeat({
        id: 'dialog_mixed',
        name: 'Mixed Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'Merchant',
          text: 'Would you like to buy something?',
          choices: [
            {
              id: 'choice_buy',
              text: 'Yes, the sword',
              dialogNode: {
                id: 'node_bought',
                speaker: 'Merchant',
                text: 'Excellent choice! That will be 100 gold.',
                choices: [
                  {
                    id: 'choice_pay',
                    text: 'Here you go',
                    target: 'beat_paid'
                  },
                  {
                    id: 'choice_nevermind',
                    text: 'Never mind',
                    target: 'beat_cancel'
                  }
                ]
              }
            },
            {
              id: 'choice_browse',
              text: 'Just browsing',
              target: 'beat_exit'
            }
          ]
        }
      });

      mockRenderer.queueChoices(['choice_buy', 'choice_pay']);

      const result = await beat.execute(context, mockRenderer.renderer);

      // Verify the navigation
      expect(result).toBe('beat_paid');
      expect(mockRenderer.getDialogCalls().length).toBe(2);
      expect(mockRenderer.getDialogCalls()[0].text).toBe('Would you like to buy something?');
      expect(mockRenderer.getDialogCalls()[1].text).toBe('Excellent choice! That will be 100 gold.');
    });

    it('should handle empty choices array gracefully', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_empty',
        name: 'Empty Choices Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'Ghost',
          text: 'I have nothing to say...',
          choices: [] // Empty choices - dialog should end
        }
      });

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should render dialog once, then exit (no choices)
      expect(mockRenderer.getDialogCalls().length).toBe(1);
      expect(mockRenderer.getChoicesCalls().length).toBe(0);
      // Result should be null (no target specified)
      expect(result).toBeNull();
    });

    it('should filter out choices with visible=false', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_visible',
        name: 'Visible Choices Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Choose wisely',
          choices: [
            { id: 'c1', text: 'Visible choice', target: 'beat_a' },
            { id: 'c2', text: 'Hidden choice', target: 'beat_b', visible: false },
            { id: 'c3', text: 'Another visible', target: 'beat_c' }
          ]
        }
      });

      mockRenderer.queueChoice('c1');

      await beat.execute(context, mockRenderer.renderer);

      // Should only show 2 visible choices
      const choicesCalls = mockRenderer.getChoicesCalls();
      expect(choicesCalls.length).toBe(1);
      expect(choicesCalls[0].choices.length).toBe(2);
      expect(choicesCalls[0].choices.map(c => c.id)).toEqual(['root_c1', 'root_c3']);
    });
  });

  describe('getConnections', () => {
    it('should extract all connections from nested dialog tree', () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_conn',
        name: 'Connection Test',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Root',
          choices: [
            { id: 'c1', text: 'To A', target: 'beat_a' },
            {
              id: 'c2',
              text: 'Nested',
              dialogNode: {
                id: 'n1',
                speaker: 'NPC',
                text: 'Nested node',
                choices: [
                  { id: 'c3', text: 'To B', target: 'beat_b' },
                  { id: 'c4', text: 'To C', target: 'beat_c' }
                ]
              }
            }
          ]
        }
      });

      const connections = beat.getConnections();

      // Should find all 3 unique targets
      const targetIds = connections.map(c => c.targetId);
      expect(targetIds).toContain('beat_a');
      expect(targetIds).toContain('beat_b');
      expect(targetIds).toContain('beat_c');
    });

    it('should extract node-level NPC exit targets', () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_npc_exit_conn',
        name: 'NPC Exit Connection Test',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Root',
          choices: [
            {
              id: 'c1',
              text: 'Ask question',
              dialogNode: {
                id: 'n1',
                speaker: 'NPC',
                text: 'Goodbye, I have nothing more to say.',
                choices: [],
                target: 'beat_farewell'
              }
            },
            { id: 'c2', text: 'Leave', target: 'beat_exit' }
          ]
        }
      });

      const connections = beat.getConnections();
      const targetIds = connections.map(c => c.targetId);
      expect(targetIds).toContain('beat_farewell');
      expect(targetIds).toContain('beat_exit');

      // NPC exit should have a label containing [NPC exit]
      const npcExitConn = connections.find(c => c.targetId === 'beat_farewell');
      expect(npcExitConn?.label).toContain('[NPC exit]');
    });
  });

  describe('NPC Exit Nodes', () => {
    it('should auto-advance when node has target and no choices', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_npc_exit',
        name: 'NPC Exit Dialog',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'Guard',
          text: 'Go away! I do not want to talk to you.',
          choices: [],
          target: 'beat_kicked_out'
        }
      });

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should render dialog once, no choices
      expect(mockRenderer.getDialogCalls().length).toBe(1);
      expect(mockRenderer.getDialogCalls()[0].text).toBe('Go away! I do not want to talk to you.');
      expect(mockRenderer.getChoicesCalls().length).toBe(0);
      expect(result).toBe('beat_kicked_out');
    });

    it('should auto-advance to NPC exit after nested dialog', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_nested_npc_exit',
        name: 'Nested NPC Exit',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'Wizard',
          text: 'What do you want?',
          choices: [
            {
              id: 'c1',
              text: 'Insult the wizard',
              dialogNode: {
                id: 'n1',
                speaker: 'Wizard',
                text: 'How dare you! Leave my tower at once!',
                choices: [],
                target: 'beat_expelled'
              }
            },
            {
              id: 'c2',
              text: 'Ask politely',
              target: 'beat_continue'
            }
          ]
        }
      });

      // Choose the path leading to NPC exit
      mockRenderer.queueChoice('c1');

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should render root dialog + choices, then NPC exit dialog (no choices for exit node)
      expect(mockRenderer.getDialogCalls().length).toBe(2);
      expect(mockRenderer.getDialogCalls()[1].text).toBe('How dare you! Leave my tower at once!');
      expect(mockRenderer.getChoicesCalls().length).toBe(1); // Only root choices
      expect(result).toBe('beat_expelled');
    });

    it('should fall back to node target when all choices are filtered', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_filtered',
        name: 'Filtered Choices',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Hmm, there is nothing I can offer you.',
          choices: [
            {
              id: 'c1',
              text: 'Hidden option',
              target: 'beat_hidden',
              visible: false
            }
          ],
          target: 'beat_fallback'
        }
      });

      const result = await beat.execute(context, mockRenderer.renderer);

      // All choices filtered → should use node-level target
      expect(mockRenderer.getDialogCalls().length).toBe(1);
      expect(mockRenderer.getChoicesCalls().length).toBe(0);
      expect(result).toBe('beat_fallback');
    });

    it('should auto-advance via NPC exit target even when choices exist', async () => {
      // When a node has target set, it auto-advances (choices are unreachable)
      const beat = new DialogTreeBeat({
        id: 'dialog_both',
        name: 'Target With Choices',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'I have made up my mind!',
          choices: [
            { id: 'c1', text: 'Option A', target: 'beat_a' },
            { id: 'c2', text: 'Option B', target: 'beat_b' }
          ],
          target: 'beat_fallback' // NPC exit takes priority over choices
        }
      });

      const result = await beat.execute(context, mockRenderer.renderer);

      // NPC exit target takes priority — no choices shown
      expect(mockRenderer.getChoicesCalls().length).toBe(0);
      expect(result).toBe('beat_fallback');
    });

    it('should handle __self__ target on NPC exit node (loop to root)', async () => {
      const beat = new DialogTreeBeat({
        id: 'dialog_self_loop',
        name: 'Self Loop',
        type: 'dialogTree',
        dialogTree: {
          id: 'root',
          speaker: 'NPC',
          text: 'Choose wisely',
          choices: [
            {
              id: 'c1',
              text: 'Ask something',
              dialogNode: {
                id: 'n1',
                speaker: 'NPC',
                text: 'Let me think... Actually, ask me again.',
                choices: [],
                target: '__self__'
              }
            },
            {
              id: 'c2',
              text: 'Leave',
              target: 'beat_exit'
            }
          ]
        }
      });

      // First loop: ask something → NPC loops back → then leave
      mockRenderer.queueChoices(['c1', 'c2']);

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should render: root dialog, NPC loop-back dialog, root dialog again
      expect(mockRenderer.getDialogCalls().length).toBe(3);
      expect(mockRenderer.getDialogCalls()[0].text).toBe('Choose wisely');
      expect(mockRenderer.getDialogCalls()[1].text).toBe('Let me think... Actually, ask me again.');
      expect(mockRenderer.getDialogCalls()[2].text).toBe('Choose wisely');
      expect(result).toBe('beat_exit');
    });
  });
});
