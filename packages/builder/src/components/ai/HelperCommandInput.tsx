/**
 * Transformation Command Input Component
 *
 * Input field for bulk story transformation operations.
 * Basic commands (backgrounds, transitions, sounds) work without AI.
 * Complex commands (text transformations) use AI when configured.
 * Supports conversation-style clarification with the AI.
 * Integrates with command system for undo/redo support.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Wand2, Loader2, AlertCircle, ChevronDown, ChevronUp, X, Sparkles, History, Send, Bot, User } from 'lucide-react';
import { useAI } from '../../hooks/useAI';
import { useCommandManager } from '../../hooks/useCommandManager';
import { getAIService } from '../../services/AIService';
import { getHelperCommandFilter } from '../../services/HelperCommandFilter';
import { getHelperCommandExecutor } from '../../services/HelperCommandExecutor';
import { getDeterministicParser } from '../../services/DeterministicCommandParser';
import type { BeatStateMutations } from '../../commands/BeatCommands';
import type { Beat, Cluster, ContainerBeatPosition, BeatConfig } from '@asaps/core';
import { getAllPresetSounds } from '@asaps/core';
import { getVisibleBeatTypeIds, getInvisibleBeatTypeIds } from '../../services/beatSchemaVocabulary';
import type {
  HelperCommandContext,
  StructuredAction,
  ChangePreview,
  RecentCommand,
} from '../../types/helperCommand';
import { HelperCommandPreview } from './HelperCommandPreview';

// Example commands - items with noAI: true work without AI configured
const EXAMPLES = [
  {
    command: "Set all button sounds to 'Soft Click'",
    description: "Adds a click sound to every button",
    category: 'sound',
    noAI: true,
  },
  {
    command: "Set all transitions to fade 500ms",
    description: "Changes transition style on all visible beats",
    category: 'transition',
    noAI: true,
  },
  {
    command: "Set all backgrounds to forest.jpg",
    description: "Sets background for all visible beats",
    category: 'background',
    noAI: true,
  },
  {
    command: "Remove all meters from dialog beats",
    description: "Removes meter locations from dialog beats",
    category: 'remove',
    noAI: true,
  },
  {
    command: "Change 'Prince' to 'Princess' with correct pronouns",
    description: "AI-powered text transformation",
    category: 'text',
    noAI: false,
  },
  {
    command: "Change blacksmith to jeweler and adapt context",
    description: "AI adapts related terms (forge→workshop, etc.)",
    category: 'text',
    noAI: false,
  },
];

/** A message in the conversation */
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** If this is an assistant message, does it need clarification? */
  needsClarification?: boolean;
}

export interface HelperCommandInputProps {
  /** Whether the panel is open */
  isOpen: boolean;

  /** Close panel callback */
  onClose: () => void;

  /** Current beats */
  beats: Beat[];

  /** Current clusters */
  clusters: Cluster[];

  /** Container beat positions */
  containerBeatPositions: ContainerBeatPosition[];

  /** Available assets */
  assets: Array<{ id: string; name: string; type: string }>;

  /** Character names */
  characterNames: string[];

  /** Callback to update a beat (used for mutations) */
  onUpdateBeat: (beatId: string, updates: Partial<Beat>) => void;

  /** Callback to add a beat (used for mutations) */
  onAddBeat?: (beat: Beat) => void;

  /** Callback to delete a beat (used for mutations) */
  onDeleteBeat?: (beatId: string) => void;

  /** Callback when changes are applied - use to refresh UI */
  onChangesApplied?: (affectedBeatIds: string[]) => void;
}

export const HelperCommandInput: React.FC<HelperCommandInputProps> = ({
  isOpen,
  onClose,
  beats,
  clusters,
  containerBeatPositions,
  assets,
  characterNames,
  onUpdateBeat,
  onAddBeat,
  onDeleteBeat,
  onChangesApplied,
}) => {
  const { isConfigured, error: aiError } = useAI();
  const { execute: executeCommand } = useCommandManager();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [command, setCommand] = useState('');
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [parsedAction, setParsedAction] = useState<StructuredAction | null>(null);
  const [preview, setPreview] = useState<ChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [recentCommands, setRecentCommands] = useState<RecentCommand[]>(() => {
    try {
      const saved = localStorage.getItem('asaps_helper_commands_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Create mutations object for commands
  const mutations: BeatStateMutations = {
    addBeat: onAddBeat || (() => { console.warn('addBeat not provided'); }),
    updateBeat: (beatId: string, updates: Partial<BeatConfig>) => {
      onUpdateBeat(beatId, updates as Partial<Beat>);
    },
    deleteBeat: onDeleteBeat || (() => { console.warn('deleteBeat not provided'); }),
    moveBeat: () => { /* not used by AI commands */ },
  };

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll to bottom of messages when conversation updates
  useEffect(() => {
    if (messagesEndRef.current && conversation.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('asaps_helper_commands_history', JSON.stringify(recentCommands.slice(0, 10)));
    } catch {
      // Ignore storage errors
    }
  }, [recentCommands]);

  // Build context for AI interpretation
  const buildContext = useCallback((): HelperCommandContext => {
    const beatTypes = [...new Set(beats.map(b => b.type))];
    const clusterNames = clusters.map(c => c.name);
    const sampleBeatNames = beats.slice(0, 20).map(b => b.name);

    // Classify beat types as visible or invisible (schema-derived — the
    // previous hand lists were missing every beat type added after ~v0.9.5x)
    const visibleBeatTypes = getVisibleBeatTypeIds();
    const invisibleBeatTypes = getInvisibleBeatTypeIds();

    // Get preset sounds for the AI context
    const presetSounds = getAllPresetSounds().map(s => ({
      id: s.id,
      name: s.name,
      category: s.category,
    }));

    return {
      beatTypes,
      clusterNames,
      assets: assets.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type as 'background' | 'character' | 'prop' | 'sound',
      })),
      characterNames,
      sampleBeatNames,
      modifiableProperties: {
        beats: ['transition', 'sound', 'node', 'cluster', 'defaultTarget', 'defaultTargetDelay'],
        locations: ['x', 'y', 'width', 'height', 'scale', 'rotation', 'sound', 'assetId'],
        transitions: ['type', 'duration', 'direction', 'easing'],
      },
      presetSounds,
      visibleBeatTypes,
      invisibleBeatTypes,
    };
  }, [beats, clusters, assets, characterNames]);

  // Build conversation history for AI context
  const buildConversationHistory = useCallback((): string => {
    if (conversation.length === 0) return '';

    return conversation.map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    }).join('\n');
  }, [conversation]);

  // Interpret command (or continue conversation)
  const interpretCommand = useCallback(async () => {
    if (!command.trim()) return;

    const userMessage = command.trim();
    setCommand('');

    // Add user message to conversation
    setConversation(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    }]);

    setIsInterpreting(true);
    setError(null);
    setParsedAction(null);
    setPreview(null);

    try {
      const context = buildContext();
      const isFollowUp = conversation.length > 0;

      // Try deterministic parsing first (only for new commands, not follow-ups)
      let response = null;
      let usedDeterministic = false;

      if (!isFollowUp) {
        const parser = getDeterministicParser();
        response = parser.parse(userMessage, context);
        if (response) {
          usedDeterministic = true;
          console.log('[HelperCommand] Used deterministic parser');
        }
      }

      // Fall back to AI if:
      // - Deterministic parsing didn't match
      // - This is a follow-up conversation
      // - AI is configured
      if (!response) {
        if (!isConfigured) {
          // No AI configured and deterministic didn't work
          setError('Command not recognized. Please configure AI for complex commands, or try simpler patterns like "set all transitions to fade 500ms"');
          setConversation(prev => [...prev, {
            role: 'assistant',
            content: 'I couldn\'t recognize that command pattern. Try simpler commands like:\n• "set all backgrounds to forest.jpg"\n• "set all button sounds to Soft Click"\n• "set all transitions to fade 500ms"',
            timestamp: new Date(),
          }]);
          setIsInterpreting(false);
          return;
        }

        console.log('[HelperCommand] Using AI interpreter');
        const aiService = getAIService();

        // Include conversation history for follow-up messages
        const conversationHistory = buildConversationHistory();
        const fullCommand = conversationHistory
          ? `${conversationHistory}\nUser: ${userMessage}`
          : userMessage;

        response = await aiService.interpretHelperCommand({
          command: fullCommand,
          storyContext: context,
        });
      }

      // If AI needs clarification, add its question to the conversation
      if (!response.fullyUnderstood && response.clarificationQuestions?.length) {
        const clarificationMessage = response.clarificationQuestions.join('\n');
        setConversation(prev => [...prev, {
          role: 'assistant',
          content: clarificationMessage,
          timestamp: new Date(),
          needsClarification: true,
        }]);
        // Still show the partial action if available
        if (response.action) {
          setParsedAction(response.action);

          // Generate preview even for partial understanding
          const filter = getHelperCommandFilter();
          filter.setContext({ beats, clusters, containerBeatPositions });
          const filterResult = filter.query(
            response.action.targetSelector,
            response.action.exclusionSelector
          );
          const executor = getHelperCommandExecutor();
          const changePreview = await executor.generatePreview(response.action, filterResult);
          setPreview(changePreview);
        }
      } else {
        // Full understanding - show the interpretation
        setParsedAction(response.action);

        // Add success message to conversation (with indicator if deterministic)
        const prefix = usedDeterministic ? '⚡ ' : '';
        setConversation(prev => [...prev, {
          role: 'assistant',
          content: prefix + response.action.interpretation,
          timestamp: new Date(),
          needsClarification: false,
        }]);

        // Generate preview
        const filter = getHelperCommandFilter();
        filter.setContext({ beats, clusters, containerBeatPositions });

        const filterResult = filter.query(
          response.action.targetSelector,
          response.action.exclusionSelector
        );

        const executor = getHelperCommandExecutor();
        const changePreview = await executor.generatePreview(response.action, filterResult);
        setPreview(changePreview);
      }

    } catch (err) {
      console.error('Failed to interpret command:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to interpret command';
      setError(errorMessage);

      // Add error to conversation
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsInterpreting(false);
    }
  }, [command, isConfigured, buildContext, buildConversationHistory, beats, clusters, containerBeatPositions, conversation.length]);

  // Execute the helper command using the executor which properly handles all change types
  const applyChanges = useCallback(async () => {
    if (!parsedAction || !preview) return;

    const startTime = Date.now();
    const MIN_DISPLAY_TIME = 600; // Minimum time to show loading overlay (ms)

    setIsApplying(true);
    setError(null);

    try {
      // Use the executor to create the batch command
      // This properly handles text transformations, nested dialogTree changes, etc.
      const executor = getHelperCommandExecutor();
      executor.setMutations(mutations);

      // Re-run the filter to get the latest filter result
      const filter = getHelperCommandFilter();
      filter.setContext({ beats, clusters, containerBeatPositions });
      const filterResult = filter.query(
        parsedAction.targetSelector,
        parsedAction.exclusionSelector
      );

      // Collect affected beat IDs for refresh callback
      const affectedBeatIds = new Set<string>();
      filterResult.beats.forEach(b => affectedBeatIds.add(b.id));
      filterResult.locations.forEach(l => affectedBeatIds.add(l.beat.id));

      // Execute using the executor
      const batchCommand = await executor.execute(parsedAction, filterResult);

      if (!batchCommand) {
        setError('No changes to apply');
        setIsApplying(false);
        return;
      }

      await executeCommand(batchCommand);

      // Add to history
      setRecentCommands(prev => [{
        command: conversation.find(m => m.role === 'user')?.content || '',
        timestamp: new Date(),
        affectedCount: preview.totalAffected,
        success: true,
      }, ...prev.slice(0, 9)]);

      // Notify parent to refresh UI for affected beats
      if (onChangesApplied) {
        onChangesApplied(Array.from(affectedBeatIds));
      }

      // Ensure minimum display time for the loading overlay
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_DISPLAY_TIME) {
        await new Promise(resolve => setTimeout(resolve, MIN_DISPLAY_TIME - elapsed));
      }

      // Reset state and close
      setCommand('');
      setParsedAction(null);
      setPreview(null);
      setConversation([]);
      setIsApplying(false);
      onClose();

    } catch (err) {
      console.error('Failed to execute command:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute command');
      setIsApplying(false);

      // Add failed command to history
      setRecentCommands(prev => [{
        command: conversation.find(m => m.role === 'user')?.content || '',
        timestamp: new Date(),
        affectedCount: 0,
        success: false,
      }, ...prev.slice(0, 9)]);
    }
  }, [parsedAction, preview, beats, clusters, containerBeatPositions, conversation, mutations, executeCommand, onClose, onChangesApplied]);

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      interpretCommand();
    } else if (e.key === 'Escape') {
      if (parsedAction) {
        setParsedAction(null);
        setPreview(null);
      } else if (conversation.length > 0) {
        setConversation([]);
      } else {
        onClose();
      }
    }
  };

  // Use example
  const useExample = (example: typeof EXAMPLES[0]) => {
    setCommand(example.command);
    setShowExamples(false);
    setConversation([]);
    setParsedAction(null);
    setPreview(null);
  };

  // Use history item
  const useHistoryItem = (item: RecentCommand) => {
    setCommand(item.command);
    setShowHistory(false);
    setConversation([]);
    setParsedAction(null);
    setPreview(null);
  };

  // Start new conversation
  const startNewConversation = () => {
    setCommand('');
    setConversation([]);
    setParsedAction(null);
    setPreview(null);
    setError(null);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  const hasActiveConversation = conversation.length > 0;
  const lastAssistantMessage = [...conversation].reverse().find(m => m.role === 'assistant');
  const waitingForClarification = lastAssistantMessage?.needsClarification;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {/* Applying Changes Overlay */}
      {isApplying && (
        <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-purple-600 animate-spin mb-4" />
          <p className="text-lg font-medium text-gray-900">Applying changes...</p>
          <p className="text-sm text-gray-500 mt-1">
            {preview?.totalAffected || 0} element{preview?.totalAffected !== 1 ? 's' : ''} being updated
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex-shrink-0 p-4 pt-10 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Transformation Commands</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-600">
          Use natural language to make bulk changes to your story. Complex changes (e.g., context-aware text) require AI - smaller local models via Ollama work fine.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* AI Not Configured Info */}
        {!isConfigured && (
          <div className="m-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚡</span>
              <div>
                <p className="text-sm font-medium text-blue-900">Basic Commands Available</p>
                <p className="text-sm text-blue-700 mt-1">
                  Commands marked with ⚡ work without AI. Configure AI in settings for advanced features like text transformations.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display (only for actual errors, not clarifications) */}
        {(error || aiError) && (
          <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error || aiError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Conversation Messages */}
        {hasActiveConversation && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">Conversation</h3>
              <button
                onClick={startNewConversation}
                className="text-xs text-purple-600 hover:text-purple-700 hover:underline"
              >
                Start new
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {conversation.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-purple-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : msg.needsClarification
                        ? 'bg-amber-50 border border-amber-200 text-amber-900'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {msg.needsClarification && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 mb-1 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Clarification needed
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Command Input */}
        <div className="p-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                waitingForClarification
                  ? "Type your response..."
                  : hasActiveConversation
                  ? "Add more details or press Enter to continue..."
                  : isConfigured
                  ? "Type a command like 'Set all transitions to fade 500ms'..."
                  : "Basic commands work without AI (see examples with ⚡)..."
              }
              disabled={isInterpreting}
              className="w-full pl-4 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={interpretCommand}
              disabled={!command.trim() || isInterpreting}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-purple-600 hover:bg-purple-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={waitingForClarification ? "Send response (Enter)" : "Interpret (Enter)"}
            >
              {isInterpreting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : waitingForClarification ? (
                <Send className="w-5 h-5" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {waitingForClarification
              ? "Answer the question above, then press Enter"
              : "Press Enter to interpret, then confirm to apply"
            }
          </p>
        </div>

        {/* Examples & History Toggles (only show when no active conversation) */}
        {!hasActiveConversation && (
          <>
            <div className="px-4 flex gap-2">
              <button
                onClick={() => { setShowExamples(!showExamples); setShowHistory(false); }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {showExamples ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Examples
              </button>
              <button
                onClick={() => { setShowHistory(!showHistory); setShowExamples(false); }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <History className="w-4 h-4" />
                History
              </button>
            </div>

            {/* Examples Panel */}
            {showExamples && (
              <div className="mx-4 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-2">
                  <span className="text-amber-500">⚡</span> = Works without AI
                </p>
                <div className="space-y-2">
                  {EXAMPLES.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => useExample(example)}
                      className="w-full text-left p-2 hover:bg-white rounded transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        {example.noAI && <span className="text-amber-500" title="Works without AI">⚡</span>}
                        <p className="text-sm font-medium text-gray-800">{example.command}</p>
                      </div>
                      <p className="text-xs text-gray-500 ml-4">{example.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* History Panel */}
            {showHistory && (
              <div className="mx-4 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                {recentCommands.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">No recent commands</p>
                ) : (
                  <div className="space-y-2">
                    {recentCommands.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => useHistoryItem(item)}
                        className="w-full text-left p-2 hover:bg-white rounded transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-800 truncate flex-1">
                            {item.command}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            item.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {item.success ? `${item.affectedCount} changed` : 'failed'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Preview */}
        {parsedAction && preview && (
          <HelperCommandPreview
            action={parsedAction}
            preview={preview}
            onExecute={applyChanges}
            onCancel={() => {
              setParsedAction(null);
              setPreview(null);
            }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Beats: {beats.length} | Clusters: {clusters.length}</span>
          <span>Ctrl+Shift+K to toggle | Ctrl+Z to undo</span>
        </div>
      </div>
    </div>
  );
};

export default HelperCommandInput;
