import React, { useState, useCallback, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  User,
  Users,
  AlertCircle,
  Zap,
  GitBranch,
  Edit3,
  Save,
  X,
  Link2,
  ArrowRight,
  CornerDownRight,
  Minimize2,
  Maximize2,
  Sparkles,
  Loader2
} from 'lucide-react';
import type { Beat, Effect } from '@asaps/core';
import { useAI } from '../hooks/useAI';
import { CharacterRefField } from '../components/characters/CharacterRefField';
import type { DialogGenerationRequest } from '../types/ai';
import { ChoiceEffectsEditor } from './ChoiceEffectsEditor';
import { TextFieldWithVariables } from './TextFieldWithVariables';
import type { AvailableCounter, AvailableVariable, AvailableInventoryItem } from '../hooks/useAvailableCountersAndVariables';
import { dialogTreePhaseCount } from '../utils/dialogTreePhases';

interface DialogNode {
  id: string;
  speaker: string;
  /** Optional Character.id reference (Layer 2 of the rich-character roadmap).
   * When set and resolvable, takes precedence over `speaker` for stable identity. */
  characterRef?: string;
  text: string;
  emotion?: string;
  conditions?: Condition[];
  choices: DialogChoice[];  // Required - always followed by player choices
  effects?: Effect[];
  target?: string;  // Beat ID for NPC-initiated exit (auto-advance, no choices needed)
}

interface DialogChoice {
  id: string;
  text: string;
  target?: string;  // Beat ID to exit dialog
  dialogNode?: DialogNode;  // Nested dialog (NPC responds)
  conditions?: Condition[];
  effects?: Effect[];
  visible?: boolean;
  soundEffect?: string;  // Sound to play when choice is selected
}

interface Condition {
  type: 'variable' | 'counter' | 'inventory' | 'visitedBeat';
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  left: string;
  right: any;
}

interface CounterOption {
  name: string;
  displayName: string;  // Counter display name like "Health"
  characterName: string;  // Character name like "Red" or "Wolf"
}

interface DialogTreeEditorProps {
  dialogTree: DialogNode;
  onChange: (tree: DialogNode) => void;
  characters?: string[];
  /** Full Character records — used by the per-node speaker combobox so dropdowns
   * can show colors / display names / proper id-keyed routing. When omitted, the
   * combobox falls back to the simple string list in `characters`. */
  characterObjects?: Array<{ id: string; name: string; displayName?: string; color?: string; role?: string }>;
  variables?: string[];
  counters?: (string | CounterOption)[];  // Can be string (backward compat) or object
  availableCounters?: AvailableCounter[];
  availableVariables?: AvailableVariable[];
  availableInventoryItems?: AvailableInventoryItem[];
  allBeats?: Beat[];
  expanded?: boolean;
  /** Resolve speaker names to translated display names (for active translation language) */
  speakerNameResolver?: (name: string) => string;
  /** Called when the user clicks "Define '<name>' as a Character" in the
   * per-node speaker combobox. Parent typically opens the Character Manager. */
  onDefineAsCharacter?: (name: string) => void;
  /** Project emotion palette — passed to ChoiceEffectsEditor so the
   *  fireEmotion / addSentiment emotion fields offer combobox auto-complete. */
  emotionPalette?: ReadonlyArray<import('@asaps/core').EmotionDefinition>;
  /** P3-3c-15 — true when the parent beat has baked locations[]. Spatial
   * hotspots only fire when the beat composes through SpatialFlowView,
   * which requires no baked locations in a FIXED project. In responsive
   * projects the runtime ignores baked positions for spatial routing, so
   * this flag is only inactive when both conditions hold (see Inspector). */
  beatHasAuthorLocations?: boolean;
  /** True when the project is in responsive layout mode. Used to suppress
   * the "Inactive — clear baked positions" advisory because spatial fires
   * regardless of baked positions in responsive projects. */
  projectIsResponsive?: boolean;
}

// Speaker color palette - consistent colors for each speaker
const SPEAKER_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', accent: 'bg-blue-500' },
  { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', accent: 'bg-purple-500' },
  { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', accent: 'bg-green-500' },
  { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', accent: 'bg-amber-500' },
  { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700', accent: 'bg-pink-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-700', accent: 'bg-cyan-500' },
  { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700', accent: 'bg-indigo-500' },
  { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700', accent: 'bg-teal-500' },
];

// Get consistent color for a speaker based on name hash
const getSpeakerColor = (speaker: string): typeof SPEAKER_COLORS[0] => {
  if (!speaker) return SPEAKER_COLORS[0];
  // Simple hash function for consistent color assignment
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = ((hash << 5) - hash) + speaker.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
};

export const DialogTreeEditor: React.FC<DialogTreeEditorProps> = ({
  dialogTree,
  onChange,
  characters = ['Narrator', 'NPC'],
  characterObjects,
  variables = [],
  counters = [],
  availableCounters: availableCountersProp,
  availableVariables: availableVariablesProp,
  availableInventoryItems: availableInventoryItemsProp,
  allBeats = [],
  projectIsResponsive = false,
  expanded = false,
  speakerNameResolver,
  onDefineAsCharacter,
  emotionPalette,
  beatHasAuthorLocations = false,
}) => {
  // Custom speaker input state
  const [customSpeakerValue, setCustomSpeakerValue] = useState<string>('');
  // AI hook
  const { isConfigured, isGenerating, error: aiError, generateDialog, clearError } = useAI();

  // Track expanded state for each node by its path - always start with root expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Always include root in initial expanded state
    return new Set(['root']);
  });
  const [expandedChoices, setExpandedChoices] = useState<Set<string>>(new Set());

  // P3-3c-14 — the dialog node currently focused on the canvas (via
  // walker). Set by an `asaps:dialogTreeWalkChanged` event dispatched
  // from VisualWorkspace whenever the canvas's dialogTreeNodePath
  // changes. Used to highlight the matching node header so the author
  // can see where the canvas is at a glance.
  const [canvasFocusedNodeId, setCanvasFocusedNodeId] = useState<string>('root');
  const [editingNode, setEditingNode] = useState<{node: DialogNode, path: string[]} | null>(null);
  const [showConditions, setShowConditions] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [globalExpanded, setGlobalExpanded] = useState(true);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiScene, setAiScene] = useState('');
  const [aiCharacter, setAiCharacter] = useState('');
  const [aiGoal, setAiGoal] = useState('');
  const [aiBranchingFactor, setAiBranchingFactor] = useState(2);

  // Normalize counters to CounterOption format for consistent handling
  const availableCounters: CounterOption[] = counters.length > 0
    ? counters.map(c => typeof c === 'string'
        ? { name: c, displayName: c, characterName: '' }
        : c)
    : [];

  // Build AvailableCounter[] from legacy props if new props not provided
  const effectCounters: AvailableCounter[] = availableCountersProp || availableCounters.map(c => ({
    name: c.name,
    displayName: c.displayName,
    characterId: '',
    characterName: c.characterName,
    fullName: c.characterName ? `${c.characterName}: ${c.displayName}` : c.displayName,
  }));

  const effectVariables: AvailableVariable[] = availableVariablesProp || variables.map(v => ({
    name: v,
    type: 'string' as const,
  }));

  const effectInventoryItems: AvailableInventoryItem[] = availableInventoryItemsProp || [];

  // Deep clone helper
  const cloneNode = (node: DialogNode): DialogNode => {
    return JSON.parse(JSON.stringify(node));
  };

  // P3-3c-14 — translate between the canvas walker's path (sequence of
  // choice.id values) and the inspector's path (sequence of
  // `choice_${index}` segments rooted at 'root'). The two coordinate
  // systems differ because the canvas writes ids while the inspector
  // expansion is keyed by index.
  const inspectorPathToCanvasPath = (insp: string[]): string[] => {
    const out: string[] = [];
    let cur: any = dialogTree;
    for (let i = 1; i < insp.length; i++) {
      const m = insp[i].match(/^choice_(\d+)$/);
      if (!m || !cur) break;
      const idx = parseInt(m[1], 10);
      const choice = cur.choices?.[idx];
      if (!choice) break;
      out.push(choice.id);
      cur = choice.dialogNode ?? null;
    }
    return out;
  };
  const canvasPathToInspectorPath = (canv: string[]): string[] => {
    const out: string[] = ['root'];
    let cur: any = dialogTree;
    for (const choiceId of canv) {
      const idx = (cur?.choices ?? []).findIndex((c: any) => c?.id === choiceId);
      if (idx < 0 || !cur) break;
      out.push(`choice_${idx}`);
      cur = cur.choices[idx].dialogNode ?? null;
    }
    return out;
  };

  // P3-3c-14 — listen for canvas walker changes. Expand every node /
  // choice along the path so the matching node header is visible, and
  // remember which one is canvas-focused for header highlighting.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { path?: string[] } | undefined;
      if (!detail || !Array.isArray(detail.path)) return;
      const insp = canvasPathToInspectorPath(detail.path);
      // All partial node ids: 'root', 'root.choice_0', etc. — used as
      // both node-expansion keys AND choice-expansion keys.
      const partials: string[] = [];
      for (let i = 1; i <= insp.length; i++) partials.push(insp.slice(0, i).join('.'));
      setExpandedNodes(prev => {
        const next = new Set(prev);
        partials.forEach(id => next.add(id));
        return next;
      });
      setExpandedChoices(prev => {
        const next = new Set(prev);
        // Skip the root partial (no choice expansion for root itself).
        partials.slice(1).forEach(id => next.add(id));
        return next;
      });
      setCanvasFocusedNodeId(partials[partials.length - 1] ?? 'root');
    };
    window.addEventListener('asaps:dialogTreeWalkChanged', handler);
    return () => window.removeEventListener('asaps:dialogTreeWalkChanged', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogTree]);

  // Navigate to node at path
  const getNodeAtPath = (tree: DialogNode, path: string[]): DialogNode | null => {
    let current: any = tree;

    for (let i = 1; i < path.length; i++) { // Skip 'root'
      const key = path[i];
      if (key.startsWith('choice_')) {
        const choiceIndex = parseInt(key.split('_')[1]);
        if (current.choices && current.choices[choiceIndex]) {
          // Use dialogNode for nested dialog (new format)
          const nestedNode = current.choices[choiceIndex].dialogNode;
          if (nestedNode) {
            current = nestedNode;
          } else {
            return null;
          }
        } else {
          return null;
        }
      }
    }

    return current;
  };

  // Update node at path
  const updateNodeAtPath = (tree: DialogNode, path: string[], updates: Partial<DialogNode>): DialogNode => {
    const newTree = cloneNode(tree);

    if (path.length === 1 && path[0] === 'root') {
      // Updating root node
      Object.assign(newTree, updates);
      return newTree;
    }

    // Navigate to the target node
    let current: any = newTree;
    for (let i = 1; i < path.length; i++) { // Skip 'root'
      const key = path[i];
      if (key.startsWith('choice_')) {
        const choiceIndex = parseInt(key.split('_')[1]);
        if (current.choices && current.choices[choiceIndex]) {
          // Use dialogNode for nested dialog (new format)
          const nestedNode = current.choices[choiceIndex].dialogNode;
          if (nestedNode) {
            if (i === path.length - 1) {
              // This is the target to update
              Object.assign(current.choices[choiceIndex].dialogNode, updates);
            } else {
              current = current.choices[choiceIndex].dialogNode;
            }
          }
        }
      }
    }

    return newTree;
  };

  // Add choice at any level
  const addChoiceAtPath = (path: string[]) => {
    const node = getNodeAtPath(dialogTree, path);
    if (!node) return;
    
    const updates: Partial<DialogNode> = {
      choices: [
        ...(node.choices || []),
        {
          id: `choice_${Date.now()}`,
          text: 'Player response...',
          visible: true
        }
      ]
    };
    
    const updated = updateNodeAtPath(dialogTree, path, updates);
    onChange(updated);
    
    // Auto-expand the node to show the new choice
    const nodeId = path.join('.');
    if (!expandedNodes.has(nodeId)) {
      setExpandedNodes(new Set([...expandedNodes, nodeId]));
    }
  };

  // Update choice at path
  const updateChoiceAtPath = (path: string[], choiceIndex: number, updates: Partial<DialogChoice>) => {
    const node = getNodeAtPath(dialogTree, path);
    if (!node || !node.choices || !node.choices[choiceIndex]) return;
    
    const newChoices = [...node.choices];
    newChoices[choiceIndex] = { ...newChoices[choiceIndex], ...updates };
    
    const updated = updateNodeAtPath(dialogTree, path, { choices: newChoices });
    onChange(updated);
  };

  // Create nested dialog
  const createNestedDialog = (path: string[], choiceIndex: number) => {
    // Inherit the parent node's speaker instead of defaulting to characters[0]
    const parentNode = getNodeAtPath(dialogTree, path);
    const newNode: DialogNode = {
      id: `node_${Date.now()}`,
      speaker: parentNode?.speaker || characters[0],
      text: 'NPC response...',
      choices: []  // Start with empty choices array
    };

    // Use dialogNode for nested dialog (new format)
    updateChoiceAtPath(path, choiceIndex, { dialogNode: newNode, target: undefined });

    // Auto-expand the choice to show the new nested dialog
    const choiceId = `${path.join('.')}.choice_${choiceIndex}`;
    setExpandedChoices(new Set([...expandedChoices, choiceId]));
  };

  // Remove choice
  const removeChoiceAtPath = (path: string[], choiceIndex: number) => {
    const node = getNodeAtPath(dialogTree, path);
    if (!node || !node.choices) return;

    const newChoices = node.choices.filter((_, i) => i !== choiceIndex);
    const updated = updateNodeAtPath(dialogTree, path, { choices: newChoices });
    onChange(updated);
  };

  // Remove just the NPC response that hangs off a player choice. The
  // *parent* player choice (the one this X button visually attaches to)
  // stays — its onward target is cleared so the user can pick a new
  // destination from the dropdown. Any player choices that were *nested
  // inside* the NPC response disappear along with it (they're children of
  // the dialogNode being deleted, so the data structure can't orphan them).
  // For the collapsible "[Continue] → NPC → exit" pattern we preserve that
  // exit target on the parent choice so the conversation still flows
  // somewhere obvious.
  const removeNestedDialogAtPath = (path: string[], choiceIndex: number) => {
    const node = getNodeAtPath(dialogTree, path);
    if (!node || !node.choices) return;
    const choice = node.choices[choiceIndex];
    if (!choice?.dialogNode) return;

    // Preserve a sensible target if one was buried in a collapsible pattern
    const collapsedTarget = choice.dialogNode.choices?.length === 1
      ? choice.dialogNode.choices[0].target
      : undefined;

    updateChoiceAtPath(path, choiceIndex, {
      dialogNode: undefined,
      target: choice.target ?? collapsedTarget ?? undefined,
    });
  };

  // Toggle node expansion (for nodes with choices)
  const toggleNodeExpansion = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Toggle choice expansion (for individual choice threads)
  const toggleChoiceExpansion = (choiceId: string) => {
    const newExpanded = new Set(expandedChoices);
    if (newExpanded.has(choiceId)) {
      newExpanded.delete(choiceId);
    } else {
      newExpanded.add(choiceId);
    }
    setExpandedChoices(newExpanded);
  };

  // Expand/Collapse all
  const toggleAllExpanded = () => {
    if (globalExpanded) {
      // Collapse all (but keep root expanded to show "Add Player Response")
      setExpandedNodes(new Set(['root']));
      setExpandedChoices(new Set());
    } else {
      // Expand all - need to traverse tree to find all nodes
      const allNodeIds = new Set<string>(['root']); // Always include root
      const allChoiceIds = new Set<string>();

      const traverse = (node: DialogNode, path: string[]) => {
        const nodeId = path.join('.');
        // Add all nodes, even those without choices (for NPC nodes)
        allNodeIds.add(nodeId);
        if (node.choices) {
          node.choices.forEach((choice, index) => {
            const choiceId = `${nodeId}.choice_${index}`;
            // Use dialogNode for nested dialog (new format)
            if (choice.dialogNode) {
              allChoiceIds.add(choiceId);
              traverse(choice.dialogNode, [...path, `choice_${index}`]);
            }
          });
        }
      };

      traverse(dialogTree, ['root']);
      setExpandedNodes(allNodeIds);
      setExpandedChoices(allChoiceIds);
    }
    setGlobalExpanded(!globalExpanded);
  };

  // Handle AI dialog generation
  const handleAIGenerate = async () => {
    if (!aiScene.trim()) {
      return;
    }

    clearError();

    const request: DialogGenerationRequest = {
      scene: aiScene.trim(),
      character: aiCharacter || undefined,
      goal: aiGoal || undefined,
      branchingFactor: aiBranchingFactor,
    };

    const result = await generateDialog(request);

    if (result && result.dialogTree) {
      // Replace the current dialog tree with AI-generated one
      // Cast AI DialogNode to local DialogNode format
      onChange(result.dialogTree as any as DialogNode);
      setShowAIDialog(false);
      // Reset form
      setAiScene('');
      setAiCharacter('');
      setAiGoal('');
      setAiBranchingFactor(2);
    }
  };

  // Render dialog node recursively with unlimited depth
  const renderDialogNode = (
    node: DialogNode,
    path: string[] = ['root'],
    depth: number = 0,
    /** When provided, the NPC bubble shows a remove button next to the edit
     * pencil. Used by nested NPC responses to delete themselves from the
     * parent player choice without losing their edit affordance. */
    onRemoveSelf?: () => void,
  ): JSX.Element => {
    const nodeId = path.join('.');
    const isExpanded = expandedNodes.has(nodeId);
    const isNPC = depth % 2 === 0; // Even depths are NPC, odd are player
    const hasChoices = node.choices && node.choices.length > 0;
    // For root node or nodes without choices, always show as expanded to display "Add Player Response"
    // For nested nodes (depth > 0), always show content since parent choice was already expanded to get here
    const shouldShowContent = isExpanded || depth > 0 || (!hasChoices && isNPC);

    // Get speaker color for visual distinction
    const speakerColor = isNPC ? getSpeakerColor(node.speaker) : null;

    const isCanvasFocused = nodeId === canvasFocusedNodeId;
    return (
      <div key={nodeId} className={`${depth > 0 ? (expanded ? 'ml-8' : 'ml-4') : ''}`}>
        {/* Node Header */}
        <div className={`flex items-start gap-2 p-2 rounded-lg mb-1 border ${
          isNPC && speakerColor
            ? `${speakerColor.bg} ${speakerColor.border}`
            : 'bg-gray-50 border-gray-200'
        } ${isCanvasFocused ? 'ring-2 ring-blue-500' : ''}`}>
          {/* Expand/Collapse for nodes with choices - only for root level (depth 0) */}
          {hasChoices && depth === 0 ? (
            <button
              onClick={() => toggleNodeExpansion(nodeId)}
              className="p-0.5 hover:bg-gray-200 rounded mt-0.5"
              title={isExpanded ? "Collapse choices" : "Expand choices"}
            >
              {isExpanded ?
                <ChevronDown className="w-4 h-4" /> :
                <ChevronRight className="w-4 h-4" />
              }
            </button>
          ) : (
            <div className="w-5" />  // Keep spacing consistent
          )}

          {/* Node Content.
              Bug 23 — NPC nodes used to display speaker + text as
              read-only spans, requiring a click on a pencil to open a
              modal for editing. Player choices were already inline-
              editable; designer feedback flagged the asymmetry. Now
              NPC speaker (CharacterRefField combobox) and text
              (TextFieldWithVariables) edit inline directly in the
              row. The modal still opens via the pencil but is now
              reserved for the less-common NPC auto-exit target. */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {/* Speaker color indicator */}
              {isNPC && speakerColor && (
                <div className={`w-1.5 h-4 rounded-full ${speakerColor.accent}`} />
              )}
              {isNPC ? <Users className={`w-4 h-4 ${speakerColor?.text || 'text-blue-600'}`} /> : <User className="w-4 h-4 text-orange-600" />}
              {isNPC ? (
                <div className="flex-1 max-w-xs">
                  <CharacterRefField
                    value={{ characterRef: node.characterRef, freeText: node.speaker }}
                    onChange={(next) => {
                      const updates: Partial<DialogNode> = {
                        speaker: next.freeText ?? '',
                        ...(next.characterRef
                          ? { characterRef: next.characterRef }
                          : { characterRef: undefined }),
                      };
                      onChange(updateNodeAtPath(dialogTree, path, updates));
                    }}
                    characters={(characterObjects && characterObjects.length > 0
                      ? characterObjects
                      : characters.map((s) => ({
                          id: s, name: s, displayName: s, role: 'npc',
                          visual: { type: 'static' }, states: [], defaultState: '',
                          counters: [], inventory: [], createdAt: '', updatedAt: '',
                        }))
                    ) as any}
                    onDefineAsCharacter={onDefineAsCharacter}
                    placeholder="NPC speaker…"
                  />
                </div>
              ) : (
                <span className={`font-medium text-sm ${isNPC && speakerColor ? speakerColor.text : ''}`}>
                  {speakerNameResolver ? speakerNameResolver(node.speaker) : node.speaker}
                </span>
              )}
              {/* Only show choice count for root node where collapse/expand is available */}
              {hasChoices && depth === 0 && (
                <span className="text-xs text-gray-500">
                  ({node.choices?.length} choice{node.choices?.length !== 1 ? 's' : ''})
                </span>
              )}
              {/* NPC exit badge */}
              {node.target && (
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />
                  {node.target === '__self__' ? 'Loop to start' : (allBeats?.find(b => b.id === node.target)?.name || node.target)}
                </span>
              )}
            </div>
            {isNPC ? (
              <TextFieldWithVariables
                value={node.text}
                onChange={(val) => {
                  onChange(updateNodeAtPath(dialogTree, path, { text: val }));
                }}
                availableVariables={effectVariables}
                className="w-full px-2 py-1 border border-gray-200 rounded text-sm bg-white/60 focus:bg-white focus:border-blue-400"
                multiline
                rows={2}
                placeholder="What does the NPC say?"
              />
            ) : (
              <p className="text-sm text-gray-700 break-words whitespace-pre-wrap">{node.text}</p>
            )}
          </div>
          
          {/* P3-3c-14 — walk the canvas preview to this node. NPC nodes
              only (player-choice rows have their own "Step in" badge on
              the canvas hotspot). Dispatches `asaps:dialogTreeWalkRequest`;
              VisualWorkspace's listener sets dialogTreeNodePath. */}
          {isNPC && (
            <button
              onClick={() => {
                const canvasPath = inspectorPathToCanvasPath(path);
                window.dispatchEvent(new CustomEvent('asaps:dialogTreeWalkRequest', {
                  detail: { path: canvasPath },
                }));
              }}
              className="p-1 hover:bg-blue-100 rounded text-blue-600"
              title="Walk the canvas preview to this node"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          )}

          {/* Edit button for NPC nodes */}
          {isNPC && (
            <button
              onClick={() => {
                // Get the actual node from the tree at this path
                const actualNode = getNodeAtPath(dialogTree, path);
                if (actualNode) {
                  setEditingNode({ node: actualNode, path });
                }
              }}
              className="p-1 hover:bg-gray-200 rounded"
              title="Edit dialog"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          )}
          {/* Remove-self button — only present for nested NPC responses
              (passed in via onRemoveSelf by the parent player choice). */}
          {isNPC && onRemoveSelf && (
            <button
              onClick={onRemoveSelf}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
              title="Remove NPC response and any nested player choices below it. The parent player choice stays — pick a new onward target for it from its dropdown."
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        
        {/* Choices (Player responses) - show if expanded OR if it's an NPC without choices */}
        {/* Hide choices when NPC auto-exit is set (they are unreachable) */}
        {(shouldShowContent) && !node.target && (
          <div className={`${expanded ? 'ml-10 pl-3' : 'ml-6 pl-2'} border-l-2 border-gray-200`}>
            {node.choices && node.choices.map((choice, index) => {
              const choiceId = `${nodeId}.choice_${index}`;
              const isChoiceExpanded = expandedChoices.has(choiceId);
              // Use dialogNode for nested dialog (new format)
              const hasNestedDialog = !!choice.dialogNode;

              // Check if text is a placeholder that should be collapsed
              const isPlaceholderText = (text: string | undefined): boolean => {
                if (!text) return false;
                return text === '[Continue]' || text === 'auto_continue' || (text.startsWith('[') && text.endsWith(']'));
              };

              // Detect collapsible pattern: [Continue] → dialogNode → single choice with target
              // This pattern should be displayed as the final choice, not the [Continue]
              const isCollapsible = isPlaceholderText(choice.text) &&
                choice.dialogNode &&
                choice.dialogNode.choices?.length === 1 &&
                choice.dialogNode.choices[0].target;

              // For collapsible patterns, use the nested choice's text and target
              const finalChoice = isCollapsible ? choice.dialogNode!.choices[0] : choice;
              const displayText = finalChoice.text;
              const displayTarget = finalChoice.target;
              const needsTextReplacement = isPlaceholderText(displayText);

              // For collapsible patterns, show the NPC response as expandable
              // For regular nested dialogs, show as expandable
              const hasExpandableContent = hasNestedDialog;

              // Get speaker color for nested dialog nodes
              const nestedSpeakerColor = choice.dialogNode ? getSpeakerColor(choice.dialogNode.speaker || 'NPC') : null;

              return (
                <div key={choice.id} className="mb-2">
                  {/* For collapsible patterns, show the NPC response above the player's exit choice */}
                  {isCollapsible && choice.dialogNode && nestedSpeakerColor && (
                    <div className={`mb-1 p-2 ${nestedSpeakerColor.bg} border ${nestedSpeakerColor.border} rounded-lg overflow-hidden relative`}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-1 h-3 rounded-full ${nestedSpeakerColor.accent}`} />
                        <Users className={`w-3 h-3 ${nestedSpeakerColor.text} flex-shrink-0`} />
                        <span className={`text-xs font-medium ${nestedSpeakerColor.text} truncate`}>
                          {choice.dialogNode.speaker || 'NPC'} responds:
                        </span>
                        <button
                          onClick={() => removeNestedDialogAtPath(path, index)}
                          className="ml-auto p-0.5 text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                          title="Remove NPC response and any nested player choices below it. The parent player choice stays — pick a new onward target for it from its dropdown."
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 break-words whitespace-pre-wrap">{choice.dialogNode.text}</p>
                    </div>
                  )}
                  <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg overflow-hidden">
                    {/* Expand/collapse for choice with nested dialog - but NOT for collapsible patterns */}
                    {hasNestedDialog && !isCollapsible && (
                      <button
                        onClick={() => toggleChoiceExpansion(choiceId)}
                        className="p-0.5 hover:bg-orange-100 rounded mt-0.5"
                        title={isChoiceExpanded ? "Collapse thread" : "Expand thread"}
                      >
                        {isChoiceExpanded ?
                          <ChevronDown className="w-3 h-3" /> :
                          <ChevronRight className="w-3 h-3" />
                        }
                      </button>
                    )}
                    {(!hasNestedDialog || isCollapsible) && <div className="w-4" />}

                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <User className="w-3 h-3 text-orange-600 flex-shrink-0" />
                        <span className="text-xs font-medium text-orange-700 flex-shrink-0">Player says:</span>
                        {/* Show target badge for direct targets or collapsible patterns */}
                        {displayTarget && (
                          <span
                            className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded flex items-center gap-1 max-w-[100px] flex-shrink"
                            title={`→ ${displayTarget}`}
                          >
                            <ArrowRight className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{displayTarget}</span>
                          </span>
                        )}
                        {/* Show "Has response" for complex nested dialog when collapsed - NOT for collapsible patterns */}
                        {hasNestedDialog && !isCollapsible && !isChoiceExpanded && (
                          <span className="text-xs text-blue-600 bg-blue-100 px-1 rounded whitespace-nowrap flex-shrink-0">
                            Has response →
                          </span>
                        )}
                      </div>
                      <TextFieldWithVariables
                        value={displayText}
                        onChange={(val) => {
                          if (isCollapsible) {
                            // Update the nested choice's text
                            const updatedDialogNode = {
                              ...choice.dialogNode!,
                              choices: [{
                                ...choice.dialogNode!.choices[0],
                                text: val
                              }]
                            };
                            updateChoiceAtPath(path, index, { dialogNode: updatedDialogNode });
                          } else {
                            updateChoiceAtPath(path, index, { text: val });
                          }
                        }}
                        availableVariables={effectVariables}
                        multiline
                        rows={2}
                        className={`w-full px-2 py-1 text-sm border rounded resize-y min-h-[36px] ${
                          needsTextReplacement
                            ? 'bg-yellow-50 border-yellow-400'
                            : 'bg-white'
                        }`}
                        placeholder="What does the player say?"
                      />
                      {needsTextReplacement && (
                        <p className="text-xs text-yellow-600 mt-1">
                          ⚠️ Replace with actual player dialogue
                        </p>
                      )}

                      {/* Effects editor (counters, variables, inventory) */}
                      <div className="mt-2">
                        <span className="text-xs text-gray-600">Effects:</span>
                        <ChoiceEffectsEditor
                          effects={choice.effects || []}
                          onChange={(newEffects) => updateChoiceAtPath(path, index, { effects: newEffects })}
                          availableCounters={effectCounters}
                          availableVariables={effectVariables}
                          availableInventoryItems={effectInventoryItems}
                          availableCharacters={characterObjects}
                          emotionPalette={emotionPalette}
                          compact
                        />
                      </div>

                      {/* Sound effect control */}
                      <div className="mt-2 flex gap-1.5 items-center">
                        <span className="text-xs text-gray-600 flex-shrink-0">🔊</span>
                        <input
                          type="text"
                          value={choice.soundEffect || ''}
                          onChange={(e) => updateChoiceAtPath(path, index, {
                            soundEffect: e.target.value || undefined
                          })}
                          placeholder="Sound file (optional)"
                          className="flex-1 min-w-0 px-2 py-1 text-xs border rounded"
                        />
                      </div>

                      {/* P3-3c-10 — spatial hotspot per choice. When EVERY
                          visible choice on a dialog node has a hotspot, that
                          node composes through SpatialFlowView at runtime
                          (image + speaker/text slots + hotspot regions). */}
                      {(() => {
                        const sp = (choice as any).hotspot;
                        const stagger = (index % 4) * 0.18;
                        return (
                          <div className="mt-2">
                          <div className="flex items-center gap-2 px-2 py-1 bg-blue-50/60 border border-blue-200 rounded">
                            <span className="text-[11px] text-gray-700">Spatial hotspot:</span>
                            {sp ? (
                              <>
                                <select
                                  value={sp.shape || 'rect'}
                                  onChange={(e) =>
                                    updateChoiceAtPath(path, index, {
                                      hotspot: { ...sp, shape: e.target.value as 'rect' | 'ellipse' },
                                    } as any)
                                  }
                                  className="text-xs px-1 py-0.5 border rounded bg-white"
                                >
                                  <option value="rect">Rectangle</option>
                                  <option value="ellipse">Ellipse</option>
                                </select>
                                <span className="text-[10px] text-gray-500 ml-auto">
                                  {Math.round(sp.x * 100)}%, {Math.round(sp.y * 100)}% · {Math.round(sp.width * 100)}×{Math.round(sp.height * 100)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateChoiceAtPath(path, index, { hotspot: undefined } as any)
                                  }
                                  className="text-xs px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-red-50 hover:border-red-300 text-red-600"
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  updateChoiceAtPath(path, index, {
                                    hotspot: {
                                      x: 0.1 + stagger,
                                      y: 0.4,
                                      width: 0.18,
                                      height: 0.18,
                                      shape: 'rect',
                                    },
                                  } as any)
                                }
                                className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 ml-auto"
                              >
                                Add hotspot
                              </button>
                            )}
                          </div>
                          {sp && beatHasAuthorLocations && !projectIsResponsive && (
                            <p className="text-[10px] text-amber-700 mt-0.5 leading-snug">
                              ⚠ Inactive — this project is in fixed-layout mode and the beat has baked positions, so the absolute layout runs and the hotspot isn't fired. Either clear the baked positions, or switch the project to Responsive layout (header → Responsive layout).
                            </p>
                          )}
                          </div>
                        );
                      })()}

                      {/* Target selection - show for choices without nested dialog OR collapsible patterns */}
                      {(!hasNestedDialog || isCollapsible) && (
                        <div className="mt-2 flex gap-1.5 items-center">
                          <span className="text-xs text-gray-600 flex-shrink-0">→</span>
                          <select
                            value={displayTarget || ''}
                            onChange={(e) => {
                              if (e.target.value === '__nested__') {
                                createNestedDialog(path, index);
                              } else if (isCollapsible) {
                                // Update the nested choice's target
                                const updatedDialogNode = {
                                  ...choice.dialogNode!,
                                  choices: [{
                                    ...choice.dialogNode!.choices[0],
                                    target: e.target.value || undefined
                                  }]
                                };
                                updateChoiceAtPath(path, index, { dialogNode: updatedDialogNode });
                              } else {
                                updateChoiceAtPath(path, index, { target: e.target.value || undefined });
                              }
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-xs border rounded bg-white"
                          >
                            <option value="">Select action...</option>
                            {!isCollapsible && (
                              <option value="__nested__">➕ Add NPC response...</option>
                            )}
                            <option value="__self__">↩ Return to initial choices</option>
                            <optgroup label="Connect to beat">
                              {allBeats?.map(beat => (
                                <option key={beat.id} value={beat.id}>
                                  → {beat.name} ({beat.id})
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => removeChoiceAtPath(path, index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="Remove choice"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Nested dialog (rendered recursively). The remove-NPC-
                      response control rides INSIDE the nested bubble (next to
                      its edit pencil) so both affordances stay accessible —
                      previously the absolute-positioned overlay X covered the
                      edit button. */}
                  {isChoiceExpanded && hasNestedDialog && choice.dialogNode && (
                    <div className="mt-1">
                      {/* Increment depth by 2 to account for player choice layer */}
                      {renderDialogNode(
                        choice.dialogNode,
                        [...path, `choice_${index}`],
                        depth + 2,
                        () => removeNestedDialogAtPath(path, index),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Add choice button for NPC nodes */}
            {isNPC && (
              <button
                onClick={() => addChoiceAtPath(path)}
                className="mt-2 px-3 py-1 bg-orange-100 text-orange-700 rounded text-sm hover:bg-orange-200 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Player Response
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Edit node modal
  const renderEditModal = () => {
    if (!editingNode) return null;
    
    const { node, path } = editingNode;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 className="text-lg font-medium mb-4">Edit NPC Dialog</h3>
          
          <div className="space-y-3">
            {/* Speaker — combobox stores both characterRef (canonical id) and free-text */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">NPC Speaker</label>
              <CharacterRefField
                value={{ characterRef: node.characterRef, freeText: node.speaker }}
                onChange={(next) => {
                  const updated: DialogNode = {
                    ...node,
                    speaker: next.freeText ?? '',
                    // Strip the field when not linked, so persisted JSON stays clean.
                    ...(next.characterRef ? { characterRef: next.characterRef } : { characterRef: undefined }),
                  };
                  setEditingNode({ node: updated, path });
                }}
                characters={(characterObjects && characterObjects.length > 0
                  ? characterObjects
                  : characters.map((s) => ({
                      id: s, name: s, displayName: s, role: 'npc',
                      visual: { type: 'static' }, states: [], defaultState: '',
                      counters: [], inventory: [], createdAt: '', updatedAt: '',
                    }))
                ) as any}
                onDefineAsCharacter={onDefineAsCharacter}
                placeholder="Type or pick a speaker…"
              />
            </div>
            
            {/* Text */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dialog Text</label>
              <TextFieldWithVariables
                value={node.text}
                onChange={(val) => {
                  const updated = { ...node, text: val };
                  setEditingNode({ node: updated, path });
                }}
                availableVariables={effectVariables}
                className="w-full px-2 py-1 border rounded text-sm"
                multiline
                rows={4}
                placeholder="What does the NPC say?"
              />
            </div>
            
            {/* NPC Exit Target */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                NPC Auto-Exit <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <p className="text-xs text-gray-500 mb-1">
                If set and no choices exist, the NPC delivers this message and auto-advances.
              </p>
              <select
                value={node.target || ''}
                onChange={(e) => {
                  const updated = { ...node, target: e.target.value || undefined };
                  setEditingNode({ node: updated, path });
                }}
                className="w-full px-2 py-1 border rounded text-sm"
              >
                <option value="">None (player must click a choice)</option>
                <option value="__self__">↩ Return to initial choices</option>
                <optgroup label="Connect to beat">
                  {allBeats?.map(beat => (
                    <option key={beat.id} value={beat.id}>→ {beat.name} ({beat.id})</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setEditingNode(null)}
                className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editingNode) {
                    // Create a partial update with only the fields we're editing
                    // When NPC exit target is set, clear choices (they're unreachable)
                    const updates: Partial<DialogNode> = {
                      speaker: editingNode.node.speaker,
                      text: editingNode.node.text,
                      target: editingNode.node.target,
                      ...(editingNode.node.target ? { choices: [] } : {}),
                    };
                    const updated = updateNodeAtPath(dialogTree, editingNode.path, updates);
                    onChange(updated);
                    setEditingNode(null);
                  }
                }}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Dialog Tree Editor
          {/* Same count the flowchart node's dot strip shows — the graph says
              "there is more inside here"; this is where the more lives. */}
          {(() => {
            const phases = dialogTreePhaseCount(dialogTree);
            return phases > 1 ? (
              <span
                className="text-[11px] font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5"
                title="Exchanges the conversation moves through inside this one beat — the flowchart node shows these as a stacked edge with dots"
              >
                {phases} phases
              </span>
            ) : null;
          })()}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setShowAIDialog(true)}
            className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded hover:from-purple-600 hover:to-pink-600 transition-colors flex items-center gap-1 text-xs font-medium"
            title="Generate dialog with AI"
          >
            <Sparkles className="w-3 h-3" />
            AI Generate
          </button>
          <button
            onClick={toggleAllExpanded}
            className="p-1 hover:bg-gray-100 rounded"
            title={globalExpanded ? "Collapse all" : "Expand all"}
          >
            {globalExpanded ?
              <Minimize2 className="w-4 h-4" /> :
              <Maximize2 className="w-4 h-4" />
            }
          </button>
          <button
            onClick={() => setShowConditions(!showConditions)}
            className={`p-1 rounded ${showConditions ? 'bg-yellow-100' : 'hover:bg-gray-100'}`}
            title="Toggle Conditions"
          >
            <AlertCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowEffects(!showEffects)}
            className={`p-1 rounded ${showEffects ? 'bg-purple-100' : 'hover:bg-gray-100'}`}
            title="Toggle Effects"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Dialog Tree — in expanded (modal) mode the box grows to the modal
          body instead of the inspector's 500px cap (finding 10) */}
      <div className={`border rounded-lg p-3 bg-gray-50 overflow-y-auto ${expanded ? 'max-h-[calc(83vh-140px)]' : 'max-h-[500px]'}`}>
        {renderDialogNode(dialogTree)}
      </div>
      
      {/* Edit Modal */}
      {renderEditModal()}

      {/* AI Dialog Generation Modal */}
      {showAIDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Generate Dialog with AI</h2>
                  <p className="text-sm text-gray-500">Create a branching conversation</p>
                </div>
              </div>
              <button
                onClick={() => setShowAIDialog(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Configuration Warning */}
              {!isConfigured && (
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900">AI Not Configured</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Please configure your AI provider in the AI menu before generating dialogs.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {aiError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">Generation Failed</p>
                    <p className="text-sm text-red-700 mt-1">{aiError}</p>
                  </div>
                </div>
              )}

              {/* Scene Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scene Context <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={aiScene}
                  onChange={(e) => setAiScene(e.target.value)}
                  placeholder="Describe the scene... (e.g., 'The player meets a suspicious merchant in a dark alley')"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                  rows={3}
                  disabled={isGenerating}
                />
              </div>

              {/* Character */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Main Character (Optional)
                </label>
                <select
                  value={aiCharacter}
                  onChange={(e) => setAiCharacter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  disabled={isGenerating}
                >
                  <option value="">Auto-select from scene</option>
                  {characters.map(char => (
                    <option key={char} value={char}>{char}</option>
                  ))}
                </select>
              </div>

              {/* Goal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Conversation Goal (Optional)
                </label>
                <input
                  type="text"
                  value={aiGoal}
                  onChange={(e) => setAiGoal(e.target.value)}
                  placeholder="e.g., 'Get information about the murder'"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  disabled={isGenerating}
                />
              </div>

              {/* Branching Factor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Player Choices
                </label>
                <select
                  value={aiBranchingFactor}
                  onChange={(e) => setAiBranchingFactor(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  disabled={isGenerating}
                >
                  <option value="2">2 choices</option>
                  <option value="3">3 choices</option>
                  <option value="4">4 choices</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-600">
                This will replace the current dialog tree
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAIDialog(false)}
                  disabled={isGenerating}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAIGenerate}
                  disabled={!isConfigured || !aiScene.trim() || isGenerating}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1 p-3 bg-gray-50 rounded">
        <p>👤 <strong>NPCs speak</strong> (blue) → Players respond (orange) → NPCs reply...</p>
        <p>🔄 <strong>Unlimited depth</strong> - Build complex branching conversations</p>
        <p>📁 <strong>Click arrows</strong> to expand/collapse individual threads or choices</p>
        <p>✏️ <strong>Click edit icon</strong> on NPC dialogs to modify speaker and text</p>
        <p>⚡ <strong>Counter effects</strong> - Each choice can modify counters (courage, health, etc.)</p>
        <p>🎯 <strong>Every choice leads somewhere</strong> - Add NPC response or connect to another beat</p>
      </div>
    </div>
  );
};