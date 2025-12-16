import React, { useState, useCallback } from 'react';
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
import type { Beat } from '@asaps/core';
import { useAI } from '../hooks/useAI';
import type { DialogGenerationRequest } from '../types/ai';

interface DialogNode {
  id: string;
  speaker: string;
  text: string;
  emotion?: string;
  conditions?: Condition[];
  choices: DialogChoice[];  // Required - always followed by player choices
  effects?: Effect[];
}

interface DialogChoice {
  id: string;
  text: string;
  target?: string;  // Beat ID to exit dialog
  dialogNode?: DialogNode;  // Nested dialog (NPC responds)
  conditions?: Condition[];
  effects?: Effect[];
  visible?: boolean;
  counter?: string;
  counterOperation?: 'change' | 'set';
  counterValue?: number;
}

interface Condition {
  type: 'variable' | 'counter' | 'inventory' | 'visitedBeat';
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  left: string;
  right: any;
}

interface Effect {
  type: 'setVariable' | 'setCounter' | 'addInventory' | 'removeInventory';
  target: string;
  value: any;
  operation?: 'add' | 'subtract' | 'set';
}

interface DialogTreeEditorProps {
  dialogTree: DialogNode;
  onChange: (tree: DialogNode) => void;
  characters?: string[];
  variables?: string[];
  counters?: string[];
  allBeats?: Beat[];
  expanded?: boolean;
}

export const DialogTreeEditor: React.FC<DialogTreeEditorProps> = ({
  dialogTree,
  onChange,
  characters = ['Old Wizard', 'Merchant', 'Guard', 'Innkeeper', 'Mysterious Stranger', 'Village Elder', 'Narrator'],
  variables = [],
  counters = [],
  allBeats = [],
  expanded = false
}) => {
  // AI hook
  const { isConfigured, isGenerating, error: aiError, generateDialog, clearError } = useAI();

  // Track expanded state for each node by its path - always start with root expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Always include root in initial expanded state
    return new Set(['root']);
  });
  const [expandedChoices, setExpandedChoices] = useState<Set<string>>(new Set());
  const [editingNode, setEditingNode] = useState<{node: DialogNode, path: string[]} | null>(null);
  const [showConditions, setShowConditions] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [globalExpanded, setGlobalExpanded] = useState(true);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiScene, setAiScene] = useState('');
  const [aiCharacter, setAiCharacter] = useState('');
  const [aiGoal, setAiGoal] = useState('');
  const [aiBranchingFactor, setAiBranchingFactor] = useState(2);

  // Get available counters from characters or use defaults
  const availableCounters = counters.length > 0 ? counters : ['health', 'courage', 'gold', 'experience', 'reputation'];

  // Deep clone helper
  const cloneNode = (node: DialogNode): DialogNode => {
    return JSON.parse(JSON.stringify(node));
  };

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
    const newNode: DialogNode = {
      id: `node_${Date.now()}`,
      speaker: characters[0],
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
  const renderDialogNode = (node: DialogNode, path: string[] = ['root'], depth: number = 0): JSX.Element => {
    const nodeId = path.join('.');
    const isExpanded = expandedNodes.has(nodeId);
    const isNPC = depth % 2 === 0; // Even depths are NPC, odd are player
    const hasChoices = node.choices && node.choices.length > 0;
    // For root node or nodes without choices, always show as expanded to display "Add Player Response"
    // For nested nodes (depth > 0), always show content since parent choice was already expanded to get here
    const shouldShowContent = isExpanded || depth > 0 || (!hasChoices && isNPC);
    
    return (
      <div key={nodeId} className={`${depth > 0 ? 'ml-4' : ''}`}>
        {/* Node Header */}
        <div className={`flex items-start gap-2 p-2 rounded-lg mb-1 ${
          isNPC ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
        }`}>
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
          
          {/* Node Content */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isNPC ? <Users className="w-4 h-4 text-blue-600" /> : <User className="w-4 h-4 text-orange-600" />}
              <span className="font-medium text-sm">{node.speaker}</span>
              {/* Only show choice count for root node where collapse/expand is available */}
              {hasChoices && depth === 0 && (
                <span className="text-xs text-gray-500">
                  ({node.choices?.length} choice{node.choices?.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700">{node.text}</p>
          </div>
          
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
        </div>
        
        {/* Choices (Player responses) - show if expanded OR if it's an NPC without choices */}
        {(shouldShowContent) && (
          <div className="ml-6 border-l-2 border-gray-200 pl-2">
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

              return (
                <div key={choice.id} className="mb-2">
                  {/* For collapsible patterns, show the NPC response above the player's exit choice */}
                  {isCollapsible && choice.dialogNode && (
                    <div className="mb-1 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-3 h-3 text-blue-600" />
                        <span className="text-xs font-medium text-blue-700">
                          {choice.dialogNode.speaker || 'NPC'} responds:
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{choice.dialogNode.text}</p>
                    </div>
                  )}
                  <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
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

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <User className="w-3 h-3 text-orange-600" />
                        <span className="text-xs font-medium text-orange-700">Player says:</span>
                        {/* Show target badge for direct targets or collapsible patterns */}
                        {displayTarget && (
                          <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" />
                            {displayTarget}
                          </span>
                        )}
                        {/* Show "Has response" for complex nested dialog when collapsed - NOT for collapsible patterns */}
                        {hasNestedDialog && !isCollapsible && !isChoiceExpanded && (
                          <span className="text-xs text-blue-600 bg-blue-100 px-1 rounded">
                            Has response →
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={displayText}
                        onChange={(e) => {
                          if (isCollapsible) {
                            // Update the nested choice's text
                            const updatedDialogNode = {
                              ...choice.dialogNode!,
                              choices: [{
                                ...choice.dialogNode!.choices[0],
                                text: e.target.value
                              }]
                            };
                            updateChoiceAtPath(path, index, { dialogNode: updatedDialogNode });
                          } else {
                            updateChoiceAtPath(path, index, { text: e.target.value });
                          }
                        }}
                        className={`w-full px-2 py-1 text-sm border rounded ${
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

                      {/* Counter effect controls */}
                      <div className="mt-2 flex gap-2 items-center">
                        <span className="text-xs text-gray-600">Counter:</span>
                        <input
                          type="text"
                          list={`counters-${path.join('-')}-${index}`}
                          value={choice.counter || ''}
                          onChange={(e) => updateChoiceAtPath(path, index, {
                            counter: e.target.value || undefined,
                            counterOperation: e.target.value ? (choice.counterOperation || 'change') : undefined,
                            counterValue: e.target.value ? (choice.counterValue ?? 0) : undefined
                          })}
                          placeholder="e.g., courage"
                          className="flex-1 px-2 py-1 text-xs border rounded"
                        />
                        <datalist id={`counters-${path.join('-')}-${index}`}>
                          {availableCounters.map(counter => (
                            <option key={counter} value={counter} />
                          ))}
                        </datalist>
                        {choice.counter && (
                          <>
                            <select
                              value={choice.counterOperation || 'change'}
                              onChange={(e) => updateChoiceAtPath(path, index, {
                                counterOperation: e.target.value as 'change' | 'set'
                              })}
                              className="px-2 py-1 text-xs border rounded"
                            >
                              <option value="change">Change</option>
                              <option value="set">Set to</option>
                            </select>
                            <input
                              type="number"
                              value={choice.counterValue || 0}
                              onChange={(e) => updateChoiceAtPath(path, index, {
                                counterValue: parseInt(e.target.value) || 0
                              })}
                              className="w-20 px-2 py-1 text-xs border rounded"
                              placeholder="0"
                            />
                          </>
                        )}
                      </div>

                      {/* Target selection - show for choices without nested dialog OR collapsible patterns */}
                      {(!hasNestedDialog || isCollapsible) && (
                        <div className="mt-2 flex gap-2 items-center">
                          <span className="text-xs text-gray-600">→</span>
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
                            className="flex-1 px-2 py-1 text-xs border rounded"
                          >
                            <option value="">Select action...</option>
                            {!isCollapsible && (
                              <option value="__nested__">➕ Add NPC response...</option>
                            )}
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

                  {/* Nested dialog (rendered recursively) */}
                  {isChoiceExpanded && hasNestedDialog && choice.dialogNode && (
                    <div className="mt-1">
                      {/* Increment depth by 2 to account for player choice layer */}
                      {renderDialogNode(choice.dialogNode, [...path, `choice_${index}`], depth + 2)}
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
            {/* Speaker */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">NPC Speaker</label>
              <select
                value={node.speaker}
                onChange={(e) => {
                  const updated = { ...node, speaker: e.target.value };
                  setEditingNode({ node: updated, path });
                }}
                className="w-full px-2 py-1 border rounded text-sm"
              >
                {characters.map(char => (
                  <option key={char} value={char}>{char}</option>
                ))}
              </select>
            </div>
            
            {/* Text */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dialog Text</label>
              <textarea
                value={node.text}
                onChange={(e) => {
                  const updated = { ...node, text: e.target.value };
                  setEditingNode({ node: updated, path });
                }}
                className="w-full px-2 py-1 border rounded text-sm"
                rows={4}
                placeholder="What does the NPC say?"
              />
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
                    const updates: Partial<DialogNode> = {
                      speaker: editingNode.node.speaker,
                      text: editingNode.node.text
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
      
      {/* Dialog Tree */}
      <div className="border rounded-lg p-3 bg-gray-50 max-h-[500px] overflow-y-auto">
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