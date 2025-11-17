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
  EyeOff
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
}

export const DialogTreeEditor: React.FC<DialogTreeEditorProps> = ({
  dialogTree,
  onChange,
  characters = ['Player', 'NPC', 'Narrator'],
  variables = [],
  counters = [],
  allBeats = []
}) => {
  const [selectedNode, setSelectedNode] = useState<DialogNode | null>(dialogTree);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([dialogTree.id]));
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
    { value: 'disgusted', emoji: '🤢' },
    { value: 'confident', emoji: '😎' },
    { value: 'confused', emoji: '😕' },
    { value: 'excited', emoji: '🤩' }
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

  //Update a specific node in the tree

  // const updateNode = (tree: DialogNode, nodeId: string, updates: Partial<DialogNode>): DialogNode => {
  //   const newTree = cloneNode(tree);
    
  //   const updateRecursive = (node: DialogNode): void => {
  //     if (node.id === nodeId) {
  //       Object.assign(node, updates);
  //       return;
  //     }
  const updateNode = (
  tree: DialogNode,
  nodeId: string,
  updater: (old: DialogNode) => DialogNode | void   // ⬅ function
  ): DialogNode => {
  const newTree = cloneNode(tree);

  const updateRecursive = (node: DialogNode): void => {
    if (node.id === nodeId) {
      const result = updater(node);
      if (result) Object.assign(node, result);   // use returned value if provided
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



  // Add a new dialog node
  const addDialogNode = (parentId: string, type: 'choice' | 'next') => {
    const newNode: DialogNode = {
      id: `node_${Date.now()}`,
      speaker: 'Character',
      text: 'New dialog...',
      emotion: 'neutral'
    };

    const updatedTree = updateNode(dialogTree, parentId, (parent) => {
      if (type === 'next') {
        parent.next = newNode;
      } else {
        if (!parent.choices) parent.choices = [];
        parent.choices.push({
          id: `choice_${Date.now()}`,
          text: 'New choice',
          target: newNode
        });
      }
      return parent;
    });

    onChange(updatedTree);
    setSelectedNode(newNode);
    setEditingNode(newNode.id);
  };

  // Add a choice to a node
  const addChoice = (nodeId: string) => {
    const updatedTree = updateNode(dialogTree, nodeId, (node: DialogNode) => {
      if (!node.choices) node.choices = [];
      node.choices.push({
        id: `choice_${Date.now()}`,
        text: 'New choice option',
        visible: true
      });
      return node;
    });
    
    onChange(updatedTree);
  };

  // Remove a choice
  const removeChoice = (nodeId: string, choiceIndex: number) => {
    const updatedTree = updateNode(dialogTree, nodeId, (node: DialogNode) => {
      if (node.choices) {
        node.choices.splice(choiceIndex, 1);
      }
      return node;
    });
    
    onChange(updatedTree);
  };

  // Update a choice
  const updateChoice = (nodeId: string, choiceIndex: number, updates: Partial<DialogChoice>) => {
    const updatedTree = updateNode(dialogTree, nodeId, (node: DialogNode) => {
      if (node.choices && node.choices[choiceIndex]) {
        Object.assign(node.choices[choiceIndex], updates);
      }
      return node;
    });
    
    onChange(updatedTree);
  };

  // Add a condition to a node
  const addCondition = (nodeId: string) => {
    const condition: Condition = {
      type: 'variable',
      operator: '==',
      left: '',
      right: ''
    };

    const updatedTree = updateNode(dialogTree, nodeId, (node: DialogNode) => {
      if (!node.conditions) node.conditions = [];
      node.conditions.push(condition);
      return node;
    });
    
    onChange(updatedTree);
  };

  // Add an effect to a node
  const addEffect = (nodeId: string) => {
    const effect: Effect = {
      type: 'setVariable',
      target: '',
      value: ''
    };

    const updatedTree = updateNode(dialogTree, nodeId, (node: DialogNode) => {
      if (!node.effects) node.effects = [];
      node.effects.push(effect);
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

  // Render a dialog node and its children
  const renderDialogNode = (node: DialogNode, depth: number = 0): JSX.Element => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode?.id === node.id;
    const isEditing = editingNode === node.id;
    const emotionData = emotions.find(e => e.value === node.emotion) || emotions[0];
    
    return (
      <div key={node.id} className="mb-2">
        {/* Node Header */}
        <div
          className={`
            flex items-start gap-2 p-3 rounded-lg cursor-pointer transition-all
            ${isSelected ? 'bg-blue-100 border-2 border-blue-400' : 'bg-white border border-gray-200'}
            hover:shadow-md
          `}
          style={{ marginLeft: `${depth * 24}px` }}
          onClick={() => setSelectedNode(node)}
        >
          {/* Expand/Collapse Icon */}
          {(node.choices?.length || node.next) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNodeExpansion(node.id);
              }}
              className="p-1 hover:bg-gray-100 rounded"
            >
              {isExpanded ? 
                <ChevronDown className="w-4 h-4" /> : 
                <ChevronRight className="w-4 h-4" />
              }
            </button>
          )}
          
          {/* Node Content */}
          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                {/* Speaker Input */}
                <div className="flex gap-2">
                  <select
                    value={node.speaker}
                    onChange={(e) => {
                     // const updated = updateNode(dialogTree, node.id, (node) => ({ speaker: e.target.value }));
                      const updated = updateNode(dialogTree, node.id, (node) => {node.speaker = e.target.value;});
                      onChange(updated);
                    }}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    {characters.map(char => (
                      <option key={char} value={char}>{char}</option>
                    ))}
                    <option value="custom">Custom...</option>
                  </select>
                  
                  <select
                    value={node.emotion}
                    onChange={(e) => {
                      //const updated = updateNode(dialogTree, node.id, (node) => ({ emotion: e.target.value }));
                      const updated = updateNode(dialogTree, node.id, (node) => {node.emotion = e.target.value;});
                      onChange(updated);
                    }}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    {emotions.map(emotion => (
                      <option key={emotion.value} value={emotion.value}>
                        {emotion.emoji} {emotion.value}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Text Input */}
                <textarea
                  value={node.text}
                  onChange={(e) => {
                    //const updated = updateNode(dialogTree, node.id, (node) => ({ text: e.target.value }));
                    const updated = updateNode(dialogTree, node.id, (node) => {node.text = e.target.value;});
                    onChange(updated);
                  }}
                  className="w-full px-2 py-1 border rounded text-sm"
                  rows={3}
                  placeholder="Dialog text..."
                />
                
                {/* Save/Cancel */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingNode(null)}
                    className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                  >
                    <Save className="w-3 h-3 inline mr-1" />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNode(null)}
                    className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-sm">{node.speaker}</span>
                  <span className="text-lg">{emotionData.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{node.text}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingNode(node.id);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          
          {/* Node Actions */}
          {!isEditing && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {node.conditions && node.conditions.length > 0 && (
                <span className="px-1 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                  {node.conditions.length} cond
                </span>
              )}
              {node.effects && node.effects.length > 0 && (
                <span className="px-1 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                  {node.effects.length} fx
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Choices and Next Nodes */}
        {isExpanded && (
          <div className="mt-2">
            {/* Render Choices */}
            {node.choices && node.choices.map((choice, index) => (
              <div key={choice.id} className="flex items-start gap-2 mt-1" style={{ marginLeft: `${(depth + 1) * 24}px` }}>
                <GitBranch className="w-4 h-4 text-orange-500 mt-2" />
                <div className="flex-1 bg-orange-50 border border-orange-200 rounded p-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      value={choice.text}
                      onChange={(e) => updateChoice(node.id, index, { text: e.target.value })}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                      placeholder="Choice text..."
                    />
                    <button
                      onClick={() => removeChoice(node.id, index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  
                  {/* Choice conditions/effects */}
                  <div className="flex gap-2 mt-1">
                    {choice.conditions && choice.conditions.length > 0 && (
                      <span className="text-xs bg-yellow-100 px-1 rounded">
                        {choice.conditions.length} conditions
                      </span>
                    )}
                    {choice.effects && choice.effects.length > 0 && (
                      <span className="text-xs bg-purple-100 px-1 rounded">
                        {choice.effects.length} effects
                      </span>
                    )}
                  </div>
                  
                  {/* Nested dialog for this choice */}
                  {typeof choice.target === 'object' && choice.target && (
                    <div className="mt-2">
                      {renderDialogNode(choice.target, depth + 2)}
                    </div>
                  )}
                  
                  {/* Target selector if no nested dialog */}
                  {!choice.target && (
                    <div className="mt-2 flex gap-2">
                      <select
                        value={typeof choice.target === 'string' ? choice.target : ''}
                        onChange={(e) => updateChoice(node.id, index, { 
                          target: e.target.value === 'new' ? {
                            id: `node_${Date.now()}`,
                            speaker: 'Character',
                            text: 'Response...',
                            emotion: 'neutral'
                          } : e.target.value
                        })}
                        className="flex-1 px-2 py-1 text-xs border rounded"
                      >
                        <option value="">End dialog here</option>
                        <option value="new">+ Create nested dialog</option>
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
              </div>
            ))}
            
            {/* Add Choice Button */}
            <button
              onClick={() => addChoice(node.id)}
              style={{ marginLeft: `${(depth + 1) * 24}px` }}
              className="mt-2 px-3 py-1 bg-orange-100 text-orange-700 rounded text-sm hover:bg-orange-200 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Choice
            </button>
            
            {/* Render Next Node */}
            {node.next && typeof node.next === 'object' && (
              <div className="mt-2">
                <div className="flex items-center gap-2" style={{ marginLeft: `${(depth + 1) * 24}px` }}>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Then:</span>
                </div>
                {renderDialogNode(node.next, depth + 1)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Conditions Panel
  const renderConditionsPanel = () => {
    if (!selectedNode) return null;
    
    return (
      <div className="p-3 bg-yellow-50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-yellow-800">Conditions</h4>
          <button
            onClick={() => addCondition(selectedNode.id)}
            className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs hover:bg-yellow-300"
          >
            <Plus className="w-3 h-3 inline" /> Add
          </button>
        </div>
        
        {selectedNode.conditions?.map((condition, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <select
              value={condition.type}
              onChange={(e) => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.conditions) {
                    node.conditions[index].type = e.target.value as any;
                  }
                  return node;
                });
                onChange(updated);
              }}
              className="px-2 py-1 text-xs border rounded"
            >
              <option value="variable">Variable</option>
              <option value="counter">Counter</option>
              <option value="inventory">Inventory</option>
              <option value="visitedBeat">Visited Beat</option>
            </select>
            
            <input
              type="text"
              value={condition.left}
              onChange={(e) => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.conditions) {
                    node.conditions[index].left = e.target.value;
                  }
                  return node;
                });
                onChange(updated);
              }}
              placeholder="Name"
              className="flex-1 px-2 py-1 text-xs border rounded"
            />
            
            <select
              value={condition.operator}
              onChange={(e) => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.conditions) {
                    node.conditions[index].operator = e.target.value as any;
                  }
                  return node;
                });
                onChange(updated);
              }}
              className="px-2 py-1 text-xs border rounded"
            >
              <option value="==">==</option>
              <option value="!=">!=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
            
            <input
              type="text"
              value={condition.right}
              onChange={(e) => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.conditions) {
                    node.conditions[index].right = e.target.value;
                  }
                  return node;
                });
                onChange(updated);
              }}
              placeholder="Value"
              className="w-20 px-2 py-1 text-xs border rounded"
            />
            
            <button
              onClick={() => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.conditions) {
                    node.conditions.splice(index, 1);
                  }
                  return node;
                });
                onChange(updated);
              }}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  // Effects Panel
  const renderEffectsPanel = () => {
    if (!selectedNode) return null;
    
    return (
      <div className="p-3 bg-purple-50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-purple-800">Effects</h4>
          <button
            onClick={() => addEffect(selectedNode.id)}
            className="px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs hover:bg-purple-300"
          >
            <Plus className="w-3 h-3 inline" /> Add
          </button>
        </div>
        
        {selectedNode.effects?.map((effect, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <select
              value={effect.type}
              onChange={(e) => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.effects) {
                    node.effects[index].type = e.target.value as any;
                  }
                  return node;
                });
                onChange(updated);
              }}
              className="px-2 py-1 text-xs border rounded"
            >
              <option value="setVariable">Set Variable</option>
              <option value="setCounter">Set Counter</option>
              <option value="addInventory">Add to Inventory</option>
              <option value="removeInventory">Remove from Inventory</option>
            </select>
            
            <input
              type="text"
              value={effect.target}
              onChange={(e) => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.effects) {
                    node.effects[index].target = e.target.value;
                  }
                  return node;
                });
                onChange(updated);
              }}
              placeholder="Target"
              className="flex-1 px-2 py-1 text-xs border rounded"
            />
            
            {effect.type === 'setCounter' && (
              <select
                value={effect.operation || 'set'}
                onChange={(e) => {
                  const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                    if (node.effects) {
                      node.effects[index].operation = e.target.value as any;
                    }
                    return node;
                  });
                  onChange(updated);
                }}
                className="px-2 py-1 text-xs border rounded"
              >
                <option value="set">Set</option>
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
              </select>
            )}
            
            {(effect.type === 'setVariable' || effect.type === 'setCounter') && (
              <input
                type="text"
                value={effect.value}
                onChange={(e) => {
                  const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                    if (node.effects) {
                      node.effects[index].value = e.target.value;
                    }
                    return node;
                  });
                  onChange(updated);
                }}
                placeholder="Value"
                className="w-20 px-2 py-1 text-xs border rounded"
              />
            )}
            
            <button
              onClick={() => {
                const updated = updateNode(dialogTree, selectedNode.id, (node: DialogNode) => {
                  if (node.effects) {
                    node.effects.splice(index, 1);
                  }
                  return node;
                });
                onChange(updated);
              }}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
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
      
      {/* Tree View */}
      <div className="max-h-96 overflow-y-auto border rounded-lg p-3 bg-gray-50">
        {renderDialogNode(dialogTree)}
      </div>
      
      {/* Conditions Panel */}
      {showConditions && renderConditionsPanel()}
      
      {/* Effects Panel */}
      {showEffects && renderEffectsPanel()}
      
      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• Click a node to select it, then edit its properties</p>
        <p>• Add choices to create branching conversations</p>
        <p>• Use conditions to show/hide dialog based on game state</p>
        <p>• Use effects to modify variables when dialog is shown</p>
      </div>
    </div>
  );
};
