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
  CornerDownRight
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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  const [editingNode, setEditingNode] = useState<{node: DialogNode, path: string[]} | null>(null);
  const [showConditions, setShowConditions] = useState(false);
  const [showEffects, setShowEffects] = useState(false);

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

  // Update node at path
  const updateNodeAtPath = (tree: DialogNode, path: string[], updates: Partial<DialogNode>): DialogNode => {
    const newTree = cloneNode(tree);
    
    let current: any = newTree;
    const pathToParent = path.slice(0, -1);
    const lastKey = path[path.length - 1];
    
    // Navigate to parent
    for (let i = 0; i < pathToParent.length; i++) {
      const key = pathToParent[i];
      if (key.startsWith('choice_')) {
        const choiceIndex = parseInt(key.split('_')[1]);
        if (current.choices && current.choices[choiceIndex]) {
          if (typeof current.choices[choiceIndex].target === 'object') {
            current = current.choices[choiceIndex].target;
          }
        }
      }
    }
    
    // Update the target node
    if (lastKey === 'root') {
      Object.assign(newTree, updates);
    } else if (lastKey.startsWith('choice_')) {
      const choiceIndex = parseInt(lastKey.split('_')[1]);
      if (current.choices && current.choices[choiceIndex]) {
        if (typeof current.choices[choiceIndex].target === 'object') {
          Object.assign(current.choices[choiceIndex].target, updates);
        }
      }
    }
    
    return newTree;
  };

  // Add choice at any level
  const addChoiceAtPath = (path: string[]) => {
    const newTree = cloneNode(dialogTree);
    
    let current: any = newTree;
    
    // Navigate to the node
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (key === 'root') {
        // We're at root
      } else if (key.startsWith('choice_')) {
        const choiceIndex = parseInt(key.split('_')[1]);
        if (current.choices && current.choices[choiceIndex]) {
          if (typeof current.choices[choiceIndex].target === 'object') {
            current = current.choices[choiceIndex].target;
          }
        }
      }
    }
    
    // Add choice to current node
    if (!current.choices) current.choices = [];
    current.choices.push({
      id: `choice_${Date.now()}`,
      text: 'Player response...',
      visible: true
    });
    
    onChange(newTree);
  };

  // Update choice at path
  const updateChoiceAtPath = (path: string[], choiceIndex: number, updates: Partial<DialogChoice>) => {
    const newTree = cloneNode(dialogTree);
    
    let current: any = newTree;
    
    // Navigate to the node
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (key === 'root') {
        // We're at root
      } else if (key.startsWith('choice_')) {
        const idx = parseInt(key.split('_')[1]);
        if (current.choices && current.choices[idx]) {
          if (typeof current.choices[idx].target === 'object') {
            current = current.choices[idx].target;
          }
        }
      }
    }
    
    // Update the choice
    if (current.choices && current.choices[choiceIndex]) {
      Object.assign(current.choices[choiceIndex], updates);
    }
    
    onChange(newTree);
  };

  // Create nested dialog
  const createNestedDialog = (path: string[], choiceIndex: number) => {
    // Navigate to the parent node to inherit its speaker
    let parentNode: any = dialogTree;
    for (const key of path) {
      if (key === 'root') continue;
      if (key.startsWith('choice_')) {
        const idx = parseInt(key.split('_')[1]);
        if (parentNode.choices?.[idx]?.target && typeof parentNode.choices[idx].target === 'object') {
          parentNode = parentNode.choices[idx].target;
        }
      }
    }

    const newNode: DialogNode = {
      id: `node_${Date.now()}`,
      speaker: parentNode?.speaker || characters[0],
      text: 'NPC response...',
      emotion: 'neutral'
    };

    updateChoiceAtPath(path, choiceIndex, { target: newNode });
    
    // Expand the parent node
    const nodeId = path.join('.');
    setExpandedNodes(new Set([...expandedNodes, nodeId]));
  };

  // Remove choice
  const removeChoiceAtPath = (path: string[], choiceIndex: number) => {
    const newTree = cloneNode(dialogTree);
    
    let current: any = newTree;
    
    // Navigate to the node
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (key === 'root') {
        // We're at root
      } else if (key.startsWith('choice_')) {
        const idx = parseInt(key.split('_')[1]);
        if (current.choices && current.choices[idx]) {
          if (typeof current.choices[idx].target === 'object') {
            current = current.choices[idx].target;
          }
        }
      }
    }
    
    // Remove the choice
    if (current.choices) {
      current.choices.splice(choiceIndex, 1);
    }
    
    onChange(newTree);
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

  // Render dialog node recursively with unlimited depth
  const renderDialogNode = (node: DialogNode, path: string[] = ['root'], depth: number = 0): JSX.Element => {
    const nodeId = path.join('.');
    const isExpanded = expandedNodes.has(nodeId);
    const isNPC = depth % 2 === 0; // Even depths are NPC, odd are player
    const emotionData = emotions.find(e => e.value === node.emotion) || emotions[0];
    
    return (
      <div key={nodeId} className={`${depth > 0 ? 'ml-6' : ''}`}>
        {/* Node Header */}
        <div className={`flex items-start gap-2 p-2 rounded-lg mb-2 ${
          isNPC ? 'bg-blue-50 border border-blue-200' : ''
        }`}>
          {/* Expand/Collapse for nodes with choices */}
          {node.choices && node.choices.length > 0 && (
            <button
              onClick={() => toggleNodeExpansion(nodeId)}
              className="p-0.5 hover:bg-gray-100 rounded mt-0.5"
            >
              {isExpanded ? 
                <ChevronDown className="w-4 h-4" /> : 
                <ChevronRight className="w-4 h-4" />
              }
            </button>
          )}
          
          {/* Node Content */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isNPC ? <Users className="w-4 h-4 text-blue-600" /> : <User className="w-4 h-4 text-orange-600" />}
              <span className="font-medium text-sm">{node.speaker}</span>
              {isNPC && <span className="text-lg">{emotionData.emoji}</span>}
            </div>
            <p className="text-sm text-gray-700">{node.text}</p>
          </div>
          
          {/* Edit button for NPC nodes */}
          {isNPC && (
            <button
              onClick={() => setEditingNode({ node, path })}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          )}
        </div>
        
        {/* Choices (Player responses) */}
        {isExpanded && node.choices && (
          <div className="ml-4">
            {node.choices.map((choice, index) => (
              <div key={choice.id} className="mb-2">
                <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                  <CornerDownRight className="w-4 h-4 text-orange-500 mt-0.5" />
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3 h-3 text-orange-600" />
                      <span className="text-xs font-medium text-orange-700">Player says:</span>
                    </div>
                    <input
                      type="text"
                      value={choice.text}
                      onChange={(e) => updateChoiceAtPath(path, index, { text: e.target.value })}
                      className="w-full px-2 py-1 text-sm border rounded"
                      placeholder="Player response..."
                    />
                    
                    {/* Target selection or nested dialog */}
                    <div className="mt-2">
                      {typeof choice.target === 'object' && choice.target ? (
                        // Has nested dialog - render it recursively
                        <div className="mt-2">
                          {renderDialogNode(choice.target, [...path, `choice_${index}`], depth + 1)}
                        </div>
                      ) : (
                        // Target selection
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-gray-600">→</span>
                          <select
                            value={typeof choice.target === 'string' ? choice.target : ''}
                            onChange={(e) => {
                              if (e.target.value === '__nested__') {
                                createNestedDialog(path, index);
                              } else {
                                updateChoiceAtPath(path, index, { target: e.target.value });
                              }
                            }}
                            className="flex-1 px-2 py-1 text-xs border rounded"
                          >
                            <option value="">Select action...</option>
                            <option value="__nested__">➕ Add NPC response...</option>
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
                  </div>
                  
                  <button
                    onClick={() => removeChoiceAtPath(path, index)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            
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
    const emotionData = emotions.find(e => e.value === node.emotion) || emotions[0];
    
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
            
            {/* Emotion */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Emotion</label>
              <div className="flex items-center gap-2">
                <select
                  value={node.emotion}
                  onChange={(e) => {
                    const updated = { ...node, emotion: e.target.value };
                    setEditingNode({ node: updated, path });
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
                  if (path[0] === 'root' && path.length === 1) {
                    // Update root
                    onChange({ ...dialogTree, ...editingNode.node });
                  } else {
                    // Update nested node
                    const updated = updateNodeAtPath(dialogTree, path, editingNode.node);
                    onChange(updated);
                  }
                  setEditingNode(null);
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
      <div className="border rounded-lg p-3 bg-gray-50 max-h-96 overflow-y-auto">
        {renderDialogNode(dialogTree)}
      </div>
      
      {/* Edit Modal */}
      {renderEditModal()}
      
      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1 p-3 bg-gray-50 rounded">
        <p>👤 <strong>NPCs speak</strong> (blue) → Players respond (orange)</p>
        <p>🔄 <strong>Unlimited depth</strong> - Build complex conversations</p>
        <p>🎯 <strong>Every choice leads somewhere</strong> - NPC response or beat connection</p>
        <p>📁 <strong>Click arrows</strong> to expand/collapse branches</p>
      </div>
    </div>
  );
};
