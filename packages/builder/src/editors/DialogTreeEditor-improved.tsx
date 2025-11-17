import React, { useState, useCallback } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  User, 
  Smile, 
  AlertCircle,
  Zap,
  GitBranch,
  Edit3,
  Save,
  X,
  Copy,
  Settings,
  Eye,
  EyeOff,
  Target,
  Link2,
  Users
} from 'lucide-react';
import type { Beat } from '@asaps/core';

interface DialogNode {
  id: string;
  speaker: string;
  text: string;
  emotion?: string;
  conditions?: Condition[];
  choices?: DialogChoice[];
  next?: string | DialogNode;
  effects?: Effect[];
  collapsed?: boolean; // For UI state
}

interface DialogChoice {
  id: string;
  text: string;
  target?: string | DialogNode;
  conditions?: Condition[];
  effects?: Effect[];
  visible?: boolean;
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
  const [selectedNode, setSelectedNode] = useState<DialogNode | null>(dialogTree);
  const [selectedChoice, setSelectedChoice] = useState<{nodeId: string, choiceIndex: number} | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([dialogTree.id]));
  const [showConditions, setShowConditions] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [editingNestedNode, setEditingNestedNode] = useState<{parentId: string, choiceIndex: number, node: DialogNode} | null>(null);

  // Emotion options
  const emotions = [
    { value: 'neutral', emoji: '😐' },
    { value: 'happy', emoji: '😊' },
    { value: 'sad', emoji: '😢' },
    { value: 'angry', emoji: '😠' },
    { value: 'surprised', emoji: '😮' },
    { value: 'fearful', emoji: '😨' },
    { value: 'serious', emoji: '🧐' },
    { value: 'confident', emoji: '😎' },
    { value: 'confused', emoji: '😕' },
    { value: 'excited', emoji: '🤩' },
    { value: 'thoughtful', emoji: '🤔' },
    { value: 'mysterious', emoji: '🤫' }
  ];

  // Deep clone helper
  const cloneNode = (node: DialogNode): DialogNode => {
    return JSON.parse(JSON.stringify(node));
  };

  // Find node by ID in the tree
  const findNode = (tree: DialogNode, nodeId: string): DialogNode | null => {
    if (tree.id === nodeId) return tree;
    
    if (tree.choices) {
      for (const choice of tree.choices) {
        if (typeof choice.target === 'object' && choice.target) {
          const found = findNode(choice.target, nodeId);
          if (found) return found;
        }
      }
    }
    
    if (typeof tree.next === 'object' && tree.next) {
      return findNode(tree.next, nodeId);
    }
    
    return null;
  };

  // Update a specific node in the tree
  const updateNode = (tree: DialogNode, nodeId: string, updates: Partial<DialogNode> | ((node: DialogNode) => DialogNode)): DialogNode => {
    const newTree = cloneNode(tree);
    
    const updateRecursive = (node: DialogNode): void => {
      if (node.id === nodeId) {
        if (typeof updates === 'function') {
          const updated = updates(node);
          Object.assign(node, updated);
        } else {
          Object.assign(node, updates);
        }
        return;
      }
      
      if (node.choices) {
        for (const choice of node.choices) {
          if (typeof choice.target === 'object' && choice.target) {
            updateRecursive(choice.target);
          }
        }
      }
      
      if (typeof node.next === 'object' && node.next) {
        updateRecursive(node.next);
      }
    };
    
    updateRecursive(newTree);
    return newTree;
  };

  // Add a choice to a node
  const addChoice = (nodeId: string) => {
    const updatedTree = updateNode(dialogTree, nodeId, (node) => {
      if (!node.choices) node.choices = [];
      node.choices.push({
        id: `choice_${Date.now()}`,
        text: 'Player response...',
        visible: true
      });
      return node;
    });
    
    onChange(updatedTree);
  };

  // Remove a choice
  const removeChoice = (nodeId: string, choiceIndex: number) => {
    const updatedTree = updateNode(dialogTree, nodeId, (node) => {
      if (node.choices) {
        node.choices.splice(choiceIndex, 1);
      }
      return node;
    });
    
    onChange(updatedTree);
  };

  // Update a choice
  const updateChoice = (nodeId: string, choiceIndex: number, updates: Partial<DialogChoice>) => {
    const updatedTree = updateNode(dialogTree, nodeId, (node) => {
      if (node.choices && node.choices[choiceIndex]) {
        Object.assign(node.choices[choiceIndex], updates);
      }
      return node;
    });
    
    onChange(updatedTree);
  };

  // Create nested dialog for a choice
  const createNestedDialog = (nodeId: string, choiceIndex: number) => {
    const newNode: DialogNode = {
      id: `node_${Date.now()}`,
      speaker: characters[0], // Default to first NPC
      text: 'NPC response...',
      emotion: 'neutral'
    };

    const updatedTree = updateNode(dialogTree, nodeId, (node) => {
      if (node.choices && node.choices[choiceIndex]) {
        node.choices[choiceIndex].target = newNode;
      }
      return node;
    });
    
    onChange(updatedTree);
    setExpandedNodes(new Set([...expandedNodes, nodeId]));
    // Open editor for the new nested node
    setEditingNestedNode({ parentId: nodeId, choiceIndex, node: newNode });
  };

  // Update nested dialog
  const updateNestedDialog = (parentId: string, choiceIndex: number, updates: Partial<DialogNode>) => {
    const updatedTree = updateNode(dialogTree, parentId, (node) => {
      if (node.choices && node.choices[choiceIndex] && typeof node.choices[choiceIndex].target === 'object') {
        Object.assign(node.choices[choiceIndex].target as DialogNode, updates);
      }
      return node;
    });
    
    onChange(updatedTree);
  };

  // Toggle node expansion
  const toggleNodeExpansion = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Render root node editor
  const renderRootEditor = () => {
    const emotionData = emotions.find(e => e.value === dialogTree.emotion) || emotions[0];
    
    return (
      <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200 mb-4">
        <h4 className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          NPC Dialog (Speaking to Player)
        </h4>
        
        <div className={`${expanded ? 'grid grid-cols-3 gap-3' : 'space-y-3'}`}>
          {/* Speaker */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">NPC Speaker</label>
            <select
              value={dialogTree.speaker}
              onChange={(e) => onChange({ ...dialogTree, speaker: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            >
              {characters.map(char => (
                <option key={char} value={char}>{char}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>
          
          {/* Emotion */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Emotion</label>
            <select
              value={dialogTree.emotion}
              onChange={(e) => onChange({ ...dialogTree, emotion: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            >
              {emotions.map(emotion => (
                <option key={emotion.value} value={emotion.value}>
                  {emotion.emoji} {emotion.value}
                </option>
              ))}
            </select>
          </div>
          
          {/* Current emotion display */}
          <div className="flex items-end justify-center">
            <div className="text-center">
              <div className="text-4xl mb-1">{emotionData.emoji}</div>
              <div className="text-xs text-gray-600">{emotionData.value}</div>
            </div>
          </div>
        </div>
        
        {/* Text - full width */}
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">What the NPC says:</label>
          <textarea
            value={dialogTree.text}
            onChange={(e) => onChange({ ...dialogTree, text: e.target.value })}
            className="w-full px-2 py-1 border rounded text-sm"
            rows={expanded ? 4 : 3}
            placeholder="NPC dialog text..."
          />
        </div>
      </div>
    );
  };

  // Render nested node editor modal
  const renderNestedNodeEditor = () => {
    if (!editingNestedNode) return null;
    
    const { node } = editingNestedNode;
    const emotionData = emotions.find(e => e.value === node.emotion) || emotions[0];
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 className="text-lg font-medium mb-4">Edit NPC Response</h3>
          
          <div className="space-y-3">
            {/* Speaker */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">NPC Speaker</label>
              <select
                value={node.speaker}
                onChange={(e) => {
                  const updated = { ...node, speaker: e.target.value };
                  setEditingNestedNode({ ...editingNestedNode, node: updated });
                }}
                className="w-full px-2 py-1 border rounded text-sm"
              >
                {characters.map(char => (
                  <option key={char} value={char}>{char}</option>
                ))}
              </select>
            </div>
            
            {/* Emotion */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Emotion</label>
              <div className="flex items-center gap-2">
                <select
                  value={node.emotion}
                  onChange={(e) => {
                    const updated = { ...node, emotion: e.target.value };
                    setEditingNestedNode({ ...editingNestedNode, node: updated });
                  }}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                >
                  {emotions.map(emotion => (
                    <option key={emotion.value} value={emotion.value}>
                      {emotion.emoji} {emotion.value}
                    </option>
                  ))}
                </select>
                <div className="text-2xl">{emotionData.emoji}</div>
              </div>
            </div>
            
            {/* Text */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">NPC Response</label>
              <textarea
                value={node.text}
                onChange={(e) => {
                  const updated = { ...node, text: e.target.value };
                  setEditingNestedNode({ ...editingNestedNode, node: updated });
                }}
                className="w-full px-2 py-1 border rounded text-sm"
                rows={4}
                placeholder="What does the NPC say in response?"
              />
            </div>
            
            {/* Buttons */}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setEditingNestedNode(null)}
                className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateNestedDialog(
                    editingNestedNode.parentId, 
                    editingNestedNode.choiceIndex, 
                    editingNestedNode.node
                  );
                  setEditingNestedNode(null);
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

  // Render choices editor with better layout for expanded view
  const renderChoicesEditor = () => {
    if (!dialogTree.choices || dialogTree.choices.length === 0) {
      return (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 mb-2">No player responses yet</p>
          <button
            onClick={() => addChoice(dialogTree.id)}
            className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Player Response
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Player Responses</h4>
          <button
            onClick={() => addChoice(dialogTree.id)}
            className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600"
          >
            <Plus className="w-3 h-3 inline" /> Add
          </button>
        </div>
        
        <div className={expanded ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
          {dialogTree.choices.map((choice, index) => (
            <div 
              key={choice.id} 
              className={`p-3 bg-orange-50 border rounded-lg ${
                selectedChoice?.nodeId === dialogTree.id && selectedChoice?.choiceIndex === index
                  ? 'border-orange-400 border-2'
                  : 'border-orange-200'
              }`}
              onClick={() => setSelectedChoice({ nodeId: dialogTree.id, choiceIndex: index })}
            >
              <div className="flex items-start gap-2 mb-2">
                <GitBranch className="w-4 h-4 text-orange-500 mt-1" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Player says:</label>
                  <input
                    type="text"
                    value={choice.text}
                    onChange={(e) => updateChoice(dialogTree.id, index, { text: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded"
                    placeholder="Player response text..."
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChoice(dialogTree.id, index);
                  }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              
              {/* Target selection */}
              <div className="ml-6">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  NPC responds with:
                </label>
                
                {typeof choice.target === 'object' && choice.target ? (
                  // Has nested dialog
                  <div className="p-2 bg-white rounded border border-orange-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">NPC Response</span>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingNestedNode({ 
                              parentId: dialogTree.id, 
                              choiceIndex: index, 
                              node: choice.target as DialogNode 
                            });
                          }}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateChoice(dialogTree.id, index, { target: undefined });
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">{choice.target.speaker}:</span>
                      <span className="ml-1 text-gray-700">
                        {choice.target.text.substring(0, expanded ? 100 : 50)}...
                      </span>
                    </div>
                    
                    {/* Show if this nested dialog has further choices */}
                    {choice.target.choices && choice.target.choices.length > 0 && (
                      <div className="mt-1 text-xs text-gray-500">
                        → Has {choice.target.choices.length} player response(s)
                      </div>
                    )}
                  </div>
                ) : (
                  // Target selection dropdown
                  <div className="flex gap-2">
                    <select
                      value={typeof choice.target === 'string' ? choice.target : ''}
                      onChange={(e) => {
                        if (e.target.value === '__nested__') {
                          createNestedDialog(dialogTree.id, index);
                        } else {
                          updateChoice(dialogTree.id, index, { target: e.target.value });
                        }
                      }}
                      className="flex-1 px-2 py-1 text-xs border rounded"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">Continue to next beat</option>
                      <option value="__nested__">➕ Create NPC response...</option>
                      <optgroup label="Jump to beat">
                        {allBeats?.map(beat => (
                          <option key={beat.id} value={beat.id}>
                            {beat.name} ({beat.id})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>
              
              {/* Choice conditions/effects indicators */}
              {(choice.conditions?.length || choice.effects?.length) ? (
                <div className="flex gap-2 mt-2 ml-6">
                  {choice.conditions && choice.conditions.length > 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                      {choice.conditions.length} conditions
                    </span>
                  )}
                  {choice.effects && choice.effects.length > 0 && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                      {choice.effects.length} effects
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ))}
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
      
      {/* Root Node Editor */}
      {renderRootEditor()}
      
      {/* Choices Editor */}
      {renderChoicesEditor()}
      
      {/* Nested Node Editor Modal */}
      {renderNestedNodeEditor()}
      
      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1 p-3 bg-gray-50 rounded">
        <p>👤 <strong>NPC speaks first</strong> - Edit their dialog above</p>
        <p>💬 <strong>Add player responses</strong> - What can the player say?</p>
        <p>🔀 <strong>Create NPC responses</strong> - How does the NPC reply?</p>
        <p>🎯 <strong>Chain conversations</strong> - Build complex dialog trees</p>
      </div>
    </div>
  );
};
