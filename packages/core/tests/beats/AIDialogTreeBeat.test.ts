/**
 * Tests for AIDialogTreeBeat - NPC exit messages and dialog execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIDialogTreeBeat } from '../../src/beats/AIDialogTreeBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

// Mock renderer that tracks calls and allows simulated user choices
function createMockRenderer() {
  let renderDialogCalls: { speaker: string; text: string; emotion?: string }[] = [];
  let renderChoicesCalls: { choices: { id: string; text: string }[] }[] = [];
  let choiceQueue: string[] = [];
  const stateStore: Record<string, any> = {};

  const renderer: IRenderer = {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn().mockImplementation((key, value) => { stateStore[key] = value; }),
    getState: vi.fn().mockImplementation((key) => stateStore[key] ?? null),
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
    setAIService: (aiService: any) => { stateStore['aiService'] = aiService; },
    reset: () => {
      renderDialogCalls = [];
      renderChoicesCalls = [];
      choiceQueue = [];
    }
  };
}

// Create a mock AI service that returns a pre-defined dialog tree
function createMockAIService(tree: any, exitMessageResponse?: string) {
  const generateDialog = vi.fn().mockImplementation(async (request: any) => {
    // If format is 'text', this is an NPC exit message request
    if (request.format === 'text') {
      return exitMessageResponse || '';
    }
    // Return the dialog tree as JSON (routingPlan is a sibling of the tree fields)
    return JSON.stringify({
      routingPlan: 'Test routing plan',
      ...tree,
    });
  });

  return { generateDialog };
}

// Create a mock story for context.getStory()
function createMockStory() {
  return {
    getBeat: vi.fn().mockReturnValue({ name: 'Target Beat' }),
    getBeats: vi.fn().mockReturnValue([]),
  };
}

describe('AIDialogTreeBeat', () => {
  let context: StoryContext;
  let mockRenderer: ReturnType<typeof createMockRenderer>;

  beforeEach(() => {
    context = new StoryContext();
    // Set up a mock story so context.getStory() works
    context.setStory(createMockStory() as any);
    mockRenderer = createMockRenderer();
  });

  describe('layoutTemplate migration (v0.9.62 parity with DialogTreeBeat)', () => {
    it('migrates legacy presentationMode to layoutTemplate', () => {
      const positioned = new AIDialogTreeBeat({ id: 'a', type: 'aiDialogTree', parameters: { presentationMode: 'positioned' } as any });
      expect(positioned.layoutTemplate).toBe('stacked');
      const chat = new AIDialogTreeBeat({ id: 'b', type: 'aiDialogTree', parameters: { presentationMode: 'chat-bubble' } as any });
      expect(chat.layoutTemplate).toBe('chat-bubble');
    });

    it('defaults to stacked and round-trips layoutTemplate through getParameters', () => {
      const beat = new AIDialogTreeBeat({ id: 'a', type: 'aiDialogTree' });
      expect(beat.layoutTemplate).toBe('stacked');
      beat.updateParameters({ layoutTemplate: 'chat-scroll' });
      expect(beat.layoutTemplate).toBe('chat-scroll');
      expect(beat.getParameters().layoutTemplate).toBe('chat-scroll');
    });

    const simpleTree = {
      id: 'root', speaker: 'NPC', text: 'Hello.',
      choices: [{ id: 'bye', text: 'Bye', target: 'beat_end' }],
    };

    it('drives the renderer from layoutTemplate (chat-bubble → chat presentation)', async () => {
      mockRenderer.setAIService(createMockAIService(simpleTree));
      const beat = new AIDialogTreeBeat({
        id: 'a', type: 'aiDialogTree',
        parameters: { scenario: 's', npcName: 'NPC', layoutTemplate: 'chat-bubble', exitTargets: [{ id: 'beat_end', description: 'end' }] } as any,
      });
      mockRenderer.queueChoices(['bye']);
      await beat.execute(context, mockRenderer.renderer);
      expect(mockRenderer.renderer.setState).toHaveBeenCalledWith('layoutTemplate', 'chat-bubble');
      expect(mockRenderer.renderer.setState).toHaveBeenCalledWith('presentationMode', 'chat-bubble');
    });

    it('stacked layoutTemplate renders positioned (not chat)', async () => {
      mockRenderer.setAIService(createMockAIService(simpleTree));
      const beat = new AIDialogTreeBeat({
        id: 'a', type: 'aiDialogTree',
        parameters: { scenario: 's', npcName: 'NPC', layoutTemplate: 'stacked', exitTargets: [{ id: 'beat_end', description: 'end' }] } as any,
      });
      mockRenderer.queueChoices(['bye']);
      await beat.execute(context, mockRenderer.renderer);
      expect(mockRenderer.renderer.setState).toHaveBeenCalledWith('layoutTemplate', 'stacked');
      expect(mockRenderer.renderer.setState).toHaveBeenCalledWith('presentationMode', 'positioned');
    });
  });

  describe('NPC Exit Messages', () => {
    it('should generate and render NPC farewell when exit target has npcExitMessage', async () => {
      const dialogTree = {
        id: 'root',
        speaker: 'Shopkeeper',
        text: 'Welcome! What can I do for you?',
        choices: [
          {
            id: 'buy',
            text: 'Show me your wares',
            target: 'beat_shop',
          },
          {
            id: 'leave',
            text: 'Nothing, goodbye',
            target: 'beat_street',
          }
        ]
      };

      const aiService = createMockAIService(dialogTree, 'Safe travels, friend!');
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_dialog_test',
        name: 'Shop Dialog',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Player visits a shop',
          npcName: 'Shopkeeper',
          npcPersonality: 'Friendly merchant',
          exitTargets: [
            { id: 'beat_shop', description: 'Browse wares' },
            { id: 'beat_street', description: 'Leave shop', npcExitMessage: 'Say goodbye warmly' },
          ],
        },
      });

      // Player chooses to leave
      mockRenderer.queueChoice('leave');

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should exit to beat_street
      expect(result).toBe('beat_street');

      // Should have rendered: 1) NPC greeting, 2) NPC farewell
      const dialogs = mockRenderer.getDialogCalls();
      expect(dialogs.length).toBe(2);
      expect(dialogs[0].speaker).toBe('Shopkeeper');
      expect(dialogs[0].text).toBe('Welcome! What can I do for you?');
      expect(dialogs[1].speaker).toBe('Shopkeeper');
      expect(dialogs[1].text).toBe('Safe travels, friend!');

      // AI service should have been called twice: once for tree, once for farewell
      expect(aiService.generateDialog).toHaveBeenCalledTimes(2);

      // The farewell call should use format: 'text'
      const farewellCall = aiService.generateDialog.mock.calls[1][0];
      expect(farewellCall.format).toBe('text');
      expect(farewellCall.prompt).toContain('Say goodbye warmly');
    });

    it('should NOT generate farewell when exit target has no npcExitMessage', async () => {
      const dialogTree = {
        id: 'root',
        speaker: 'Guard',
        text: 'Halt! State your business.',
        choices: [
          {
            id: 'pass',
            text: 'Let me through',
            target: 'beat_gate',
          }
        ]
      };

      const aiService = createMockAIService(dialogTree);
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_guard',
        name: 'Guard Dialog',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Guard at the gate',
          npcName: 'Guard',
          exitTargets: [
            { id: 'beat_gate', description: 'Pass through gate' },
            // No npcExitMessage configured
          ],
        },
      });

      mockRenderer.queueChoice('pass');

      const result = await beat.execute(context, mockRenderer.renderer);

      expect(result).toBe('beat_gate');

      // Only 1 dialog rendered (the NPC text, no farewell)
      const dialogs = mockRenderer.getDialogCalls();
      expect(dialogs.length).toBe(1);

      // AI service called only once (for tree generation, no farewell)
      expect(aiService.generateDialog).toHaveBeenCalledTimes(1);
    });

    it('should handle farewell generation failure gracefully', async () => {
      const dialogTree = {
        id: 'root',
        speaker: 'Merchant',
        text: 'Good day!',
        choices: [
          {
            id: 'bye',
            text: 'Goodbye',
            target: 'beat_exit',
          }
        ]
      };

      const aiService = createMockAIService(dialogTree);
      // Make farewell generation fail
      aiService.generateDialog.mockImplementation(async (request: any) => {
        if (request.format === 'text') {
          throw new Error('AI service unavailable');
        }
        return JSON.stringify({
          routingPlan: 'Plan',
          dialogTree,
        });
      });
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_merchant',
        name: 'Merchant Dialog',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Meeting a merchant',
          npcName: 'Merchant',
          exitTargets: [
            { id: 'beat_exit', description: 'Leave', npcExitMessage: 'Say farewell' },
          ],
        },
      });

      mockRenderer.queueChoice('bye');

      // Should not throw — failure is handled gracefully
      const result = await beat.execute(context, mockRenderer.renderer);

      expect(result).toBe('beat_exit');

      // Only the initial dialog rendered (farewell failed silently)
      expect(mockRenderer.getDialogCalls().length).toBe(1);
    });

    it('should skip farewell when AI returns empty text', async () => {
      const dialogTree = {
        id: 'root',
        speaker: 'NPC',
        text: 'Hello there.',
        choices: [
          {
            id: 'go',
            text: 'I must go',
            target: 'beat_next',
          }
        ]
      };

      const aiService = createMockAIService(dialogTree, '   '); // whitespace-only response
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_npc',
        name: 'NPC Dialog',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Meeting an NPC',
          npcName: 'NPC',
          exitTargets: [
            { id: 'beat_next', description: 'Continue', npcExitMessage: 'Wave goodbye' },
          ],
        },
      });

      mockRenderer.queueChoice('go');

      const result = await beat.execute(context, mockRenderer.renderer);

      expect(result).toBe('beat_next');

      // Only initial dialog — empty farewell should be skipped
      expect(mockRenderer.getDialogCalls().length).toBe(1);
    });
  });

  describe('Dialog Execution', () => {
    it('should navigate through nested dialog nodes', async () => {
      const dialogTree = {
        id: 'root',
        speaker: 'Sage',
        text: 'What wisdom do you seek?',
        choices: [
          {
            id: 'ask_future',
            text: 'Tell me my future',
            dialogNode: {
              id: 'future_node',
              speaker: 'Sage',
              text: 'I see great adventures ahead...',
              choices: [
                {
                  id: 'thank',
                  text: 'Thank you, wise one',
                  target: 'beat_end',
                }
              ]
            }
          },
          {
            id: 'leave',
            text: 'Never mind',
            target: 'beat_end',
          }
        ]
      };

      const aiService = createMockAIService(dialogTree);
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_sage',
        name: 'Sage Dialog',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Consulting the sage',
          npcName: 'Sage',
          exitTargets: [
            { id: 'beat_end', description: 'End conversation' },
          ],
        },
      });

      // Navigate into nested dialog, then exit
      mockRenderer.queueChoices(['ask_future', 'thank']);

      const result = await beat.execute(context, mockRenderer.renderer);

      expect(result).toBe('beat_end');

      // Should render 2 dialog texts: root + nested
      const dialogs = mockRenderer.getDialogCalls();
      expect(dialogs.length).toBe(2);
      expect(dialogs[0].text).toBe('What wisdom do you seek?');
      expect(dialogs[1].text).toBe('I see great adventures ahead...');

      // Should render 2 choice sets
      expect(mockRenderer.getChoicesCalls().length).toBe(2);
    });

    it('should fall back to first exit target when choices are empty', async () => {
      // validateDialogTree adds a default "Continue" choice when choices are empty,
      // so the player gets a single exit choice pointing to the first exit target
      const dialogTree = {
        id: 'root',
        speaker: 'Ghost',
        text: 'Boo!',
        choices: [] // no choices — validateDialogTree will add default
      };

      const aiService = createMockAIService(dialogTree);
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_ghost',
        name: 'Ghost Dialog',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'A ghost appears',
          npcName: 'Ghost',
          exitTargets: [
            { id: 'beat_flee', description: 'Run away' },
          ],
        },
      });

      // validateDialogTree adds a default_exit choice
      mockRenderer.queueChoice('default_exit');

      const result = await beat.execute(context, mockRenderer.renderer);

      // Should exit to first exit target
      expect(result).toBe('beat_flee');

      // Dialog rendered, one choice shown (the default)
      expect(mockRenderer.getDialogCalls().length).toBe(1);
      expect(mockRenderer.getChoicesCalls().length).toBe(1);
    });

    it('should fall back gracefully when AI service is not available', async () => {
      // No AI service set on renderer

      const beat = new AIDialogTreeBeat({
        id: 'ai_no_service',
        name: 'No Service',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Test',
          npcName: 'NPC',
          exitTargets: [
            { id: 'beat_fallback', description: 'Continue' },
          ],
        },
      });

      const result = await beat.execute(context, mockRenderer.renderer);

      expect(result).toBe('beat_fallback');

      // Should have called renderText with a fallback message
      expect(mockRenderer.renderer.renderText).toHaveBeenCalled();
    });
  });

  describe('validateDialogTree', () => {
    it('should map exit targets to valid beat IDs', async () => {
      // AI generates a tree where a choice targets an invalid beat ID
      const dialogTree = {
        id: 'root',
        speaker: 'NPC',
        text: 'Hello',
        choices: [
          {
            id: 'c1',
            text: 'Go somewhere',
            target: 'invalid_beat_id', // not in exitTargets
          }
        ]
      };

      const aiService = createMockAIService(dialogTree);
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_validate',
        name: 'Validate Test',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Test',
          npcName: 'NPC',
          exitTargets: [
            { id: 'beat_valid', description: 'The only valid exit' },
          ],
        },
      });

      mockRenderer.queueChoice('c1');

      const result = await beat.execute(context, mockRenderer.renderer);

      // Invalid target should be remapped to first exit target
      expect(result).toBe('beat_valid');
    });

    it('should ensure choices without target or dialogNode get default exit', async () => {
      const dialogTree = {
        id: 'root',
        speaker: 'NPC',
        text: 'Hello',
        choices: [
          {
            id: 'c1',
            text: 'Dangling choice',
            // No target, no dialogNode
          }
        ]
      };

      const aiService = createMockAIService(dialogTree);
      mockRenderer.setAIService(aiService);

      const beat = new AIDialogTreeBeat({
        id: 'ai_dangling',
        name: 'Dangling Test',
        type: 'aiDialogTree',
        parameters: {
          scenario: 'Test',
          npcName: 'NPC',
          exitTargets: [
            { id: 'beat_default', description: 'Default exit' },
          ],
        },
      });

      mockRenderer.queueChoice('c1');

      const result = await beat.execute(context, mockRenderer.renderer);

      // Dangling choice should be patched with default exit target
      expect(result).toBe('beat_default');
    });
  });
});
