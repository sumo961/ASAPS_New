import React, { useState, useEffect } from 'react';
import { Beat } from '@asaps/core';
import { X, Save, Trash2, Copy, Info, Plus, Link, Unlink, MapPin, Package, Settings, AlertCircle, MessageSquare, Image, Palette, Music, Volume2 } from 'lucide-react';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';
import { DialogTreeEditor } from '../editors/DialogTreeEditor';
import { VisualBeatEditor, VisualElement } from './visual/VisualBeatEditor';
import { AssetSelector } from './assets/AssetSelector';
import { AssetSelectionModal } from './assets/AssetSelectionModal';
import type { Asset } from './assets/AssetManager';

interface InspectorProps {
  beat: Beat | null;
  onUpdate: (beatId: string, updates: Partial<Beat>) => void;
  onDelete: (beatId: string) => void;
  allBeats?: Beat[];
  onConnect?: (sourceBeatId: string, targetBeatId: string) => void;
  onDisconnect?: (sourceBeatId: string, targetBeatId: string) => void;
  expanded?: boolean;
  assets?: Asset[];
  onAssetAdd?: (asset: Asset) => void;
  onAssetRemove?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: Partial<Asset>) => void;
  onOpenAssetManager?: () => void;
}

export const Inspector: React.FC<InspectorProps> = ({
  beat,
  onUpdate,
  onDelete,
  allBeats = [],
  onConnect,
  onDisconnect,
  expanded = false,
  assets = [],
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  onOpenAssetManager,
}) => {
  const [localBeat, setLocalBeat] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'properties' | 'visual'>('properties');
  const [visualElements, setVisualElements] = useState<VisualElement[]>([]);
  
  // Asset selection modal state
  const [assetSelectionModal, setAssetSelectionModal] = useState<{
    isOpen: boolean;
    type: 'background' | 'character' | 'prop' | 'sound' | null;
    callback: ((asset: Asset) => void) | null;
  }>({ isOpen: false, type: null, callback: null });

  // Get beat definition from schema
  const getBeatDefinition = (beatType: string) => {
    return beatDefinitions.beatTypes[beatType as keyof typeof beatDefinitions.beatTypes];
  };

  // Get available characters - NPCs who can speak
  const getAvailableCharacters = () => {
    return ['Old Wizard', 'Merchant', 'Guard', 'Innkeeper', 'Mysterious Stranger', 'Village Elder', 'Narrator'];
  };

  // Check if beat type supports visual editor - ALL visible beats now support it
  const supportsVisualEditor = (beatType: string) => {
    const visualBeatTypes = [
      'titleScreen',
      'introText',
      'durScreen',
      'pickProp',
      'movementChoice',
      'dialogTree',
      'conversationChoice',
      'videoBeat',
      'swfBeat'
    ];
    return visualBeatTypes.includes(beatType);
  };

  // Handle visual elements change
  const handleVisualElementsChange = (elements: VisualElement[]) => {
    setVisualElements(elements);
    setHasChanges(true);
  };

  // Handle asset selection with callback
  const handleAssetSelection = (
    assetType: 'background' | 'character' | 'prop' | 'sound',
    callback: (asset: Asset) => void
  ) => {
    setAssetSelectionModal({
      isOpen: true,
      type: assetType,
      callback
    });
  };

  // Handle asset selection from modal
  const handleAssetSelected = (asset: Asset) => {
    if (assetSelectionModal.callback) {
      assetSelectionModal.callback(asset);
    }
    setAssetSelectionModal({ isOpen: false, type: null, callback: null });
  };

  // Get beat content for visual editor
  const getBeatContent = () => {
    if (!localBeat || !localBeat.parameters) return undefined;
    
    const params = localBeat.parameters;
    
    switch (beat?.type) {
      case 'titleScreen':
        return {
          text: `${params.title || 'Untitled'}\nby ${params.author || 'Unknown'}`,
        };
      case 'introText':
      case 'durScreen':
        return {
          text: params.text || '',
        };
      case 'dialogTree':
        return {
          text: params.dialogTree?.text || params.text || '',
          speaker: params.dialogTree?.speaker || params.speaker,
          choices: params.dialogTree?.choices?.map((c: any) => ({ text: c.text })) || []
        };
      case 'movementChoice':
        return {
          text: params.question || 'Where do you want to go?',
          choices: params.choices || []
        };
      case 'pickProp':
        return {
          text: params.question || 'What do you want to pick up?',
          choices: params.props?.map((p: any) => ({ text: p.name })) || []
        };
      case 'conversationChoice':
        return {
          text: params.question || '',
          choices: params.choices || []
        };
      default:
        return undefined;
    }
  };

  useEffect(() => {
    if (beat) {
      const beatData = beat.toJSON();
      
      const connections = beat.getConnections ? beat.getConnections() : [];
      const uniqueConnections = Array.from(
        new Map(connections.map(c => [`${c.targetId}-${c.label}`, c])).values()
      );
      beatData.connections = uniqueConnections;
      
      beatData.parameters = beat.getParameters ? beat.getParameters() : {};
      
      // Initialize visual elements and sound properties
      if (!beatData.parameters.visualElements) {
        beatData.parameters.visualElements = [];
      }
      if (!beatData.parameters.backgroundSound) {
        beatData.parameters.backgroundSound = '';
      }
      
      const beatDef = getBeatDefinition(beat.type);
      if (beatDef?.connectionType === 'multiple') {
        if (beat.type === 'movementChoice' && !beatData.parameters.choices) {
          beatData.parameters.choices = [];
        } else if (beat.type === 'pickProp' && !beatData.parameters.props) {
          beatData.parameters.props = [];
        } else if (beat.type === 'dialogTree' && !beatData.parameters.dialogTree) {
          const npcCharacters = getAvailableCharacters();
          beatData.parameters.dialogTree = {
            id: 'root',
            speaker: beatData.parameters.speaker || npcCharacters[0],
            text: beatData.parameters.text || 'Greetings, traveler...',
            emotion: beatData.parameters.emotion || 'neutral'
          };
        }
      }
      
      setLocalBeat(beatData);
      setHasChanges(false);
      setValidationErrors([]);
      
      // Load visual elements from beat parameters
      const savedVisualElements = beatData.parameters?.visualElements || [];
      setVisualElements(savedVisualElements);
      
      // Set default tab based on beat type
      if (supportsVisualEditor(beat.type)) {
        setActiveTab('properties');
      }
    }
  }, [beat?.id, beat?.name]);

  if (!beat || !localBeat) {
    return (
      <div className={`${expanded ? 'w-[640px]' : 'w-80'} h-full bg-white border-l border-gray-200 flex flex-col`}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-gray-500">
            <Info className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Select a beat to view its properties</p>
          </div>
        </div>
      </div>
    );
  }

  const beatDef = getBeatDefinition(beat.type);
  const connectionType = beatDef?.connectionType || 'single';

  const validateBeat = (): string[] => {
    const errors: string[] = [];
    
    switch (beat.type) {
      case 'titleScreen':
        if (!localBeat.parameters?.title) errors.push('Title is required');
        break;
      case 'introText':
        if (!localBeat.parameters?.text) errors.push('Text content is required');
        break;
      case 'dialogTree':
        if (!localBeat.parameters?.dialogTree) {
          errors.push('Dialog tree is required');
        } else {
          if (!localBeat.parameters.dialogTree.speaker) errors.push('Speaker is required');
          if (!localBeat.parameters.dialogTree.text) errors.push('Dialog text is required');
        }
        break;
      case 'movementChoice':
        if (!localBeat.parameters?.choices?.length) {
          errors.push('At least one choice is required');
        } else {
          localBeat.parameters.choices.forEach((choice: any, i: number) => {
            if (!choice.target) errors.push(`Choice ${i + 1} needs a target`);
          });
        }
        break;
      case 'pickProp':
        if (!localBeat.parameters?.props?.length) {
          errors.push('At least one prop is required');
        } else {
          localBeat.parameters.props.forEach((prop: any, i: number) => {
            if (!prop.target) errors.push(`Prop ${i + 1} needs a target`);
          });
        }
        break;
      case 'conditionBeat':
        if (!localBeat.parameters?.condition) errors.push('Condition is required');
        const conns = localBeat.connections || [];
        const hasTrue = conns.some((c: any) => c.label === 'true');
        if (!hasTrue) errors.push('True connection is required');
        break;
    }
    
    if (connectionType === 'single' && beat.type !== 'endScreen' && beat.type !== 'dialogTree') {
      if (!localBeat.connections?.length) {
        errors.push('Connection is required');
      }
    }
    
    return errors;
  };

  const handleChange = (field: string, value: any) => {
    setLocalBeat((prev: any) => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const handleParameterChange = (param: string, value: any) => {
    setLocalBeat((prev: any) => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        [param]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const errors = validateBeat();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    if (beat) {
      beat.name = localBeat.name;
      beat.cluster = localBeat.cluster;
      beat.defaultTarget = localBeat.defaultTarget || undefined;
      beat.transition = localBeat.transition;
      beat.sound = localBeat.sound;
      
      if (localBeat.parameters && beat.updateParameters) {
        // Include visual elements and sound in parameters
        const parameters = { ...localBeat.parameters };
        if (supportsVisualEditor(beat.type)) {
          parameters.visualElements = visualElements;
        }
        beat.updateParameters(parameters);
      }
      
      // Handle connections...
      const beatAny = beat as any;
      if (typeof beatAny.clearConnections === 'function') {
        beatAny.clearConnections();
      } else {
        beat.connections = [];
      }
      
      // Add connections based on beat type
      if (beat.type === 'dialogTree') {
        // Handle dialog tree connections
        const extractConnections = (node: any): any[] => {
          const connections: any[] = [];
          
          if (node.choices) {
            node.choices.forEach((choice: any) => {
              if (typeof choice.target === 'string' && choice.target) {
                connections.push({
                  targetId: choice.target,
                  label: choice.text
                });
              } else if (typeof choice.target === 'object' && choice.target) {
                connections.push(...extractConnections(choice.target));
              }
            });
          }
          
          if (typeof node.next === 'string' && node.next) {
            connections.push({
              targetId: node.next,
              label: 'Continue'
            });
          } else if (typeof node.next === 'object' && node.next) {
            connections.push(...extractConnections(node.next));
          }
          
          return connections;
        };
        
        const dialogConnections = extractConnections(localBeat.parameters.dialogTree);
        
        if (localBeat.connections?.length > 0) {
          const defaultConn = localBeat.connections.find((c: any) => !c.label || c.label === 'Continue');
          if (defaultConn) {
            dialogConnections.push(defaultConn);
          }
        }
        
        const uniqueConns = Array.from(
          new Map(dialogConnections.map(c => [`${c.targetId}-${c.label}`, c])).values()
        );
        uniqueConns.forEach(conn => beat.addConnection(conn));
        
      } else if (connectionType === 'single' && localBeat.connections.length > 0) {
        beat.addConnection(localBeat.connections[0]);
      } else if (connectionType === 'multiple') {
        // Handle multiple connections for choice beats
        if (beat.type === 'movementChoice' && localBeat.parameters?.choices) {
          localBeat.parameters.choices.forEach((choice: any) => {
            if (choice.target) {
              beat.addConnection({
                targetId: choice.target,
                label: choice.text
              });
            }
          });
        } else if (beat.type === 'pickProp' && localBeat.parameters?.props) {
          localBeat.parameters.props.forEach((prop: any) => {
            if (prop.target) {
              beat.addConnection({
                targetId: prop.target,
                label: prop.name
              });
            }
          });
        }
      } else if (connectionType === 'conditional') {
        localBeat.connections.forEach((conn: any) => beat.addConnection(conn));
      } else {
        localBeat.connections.forEach((conn: any) => beat.addConnection(conn));
      }
      
      onUpdate(beat.id, beat);
      setHasChanges(false);
      setValidationErrors([]);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${beat.name}"?`)) {
      onDelete(beat.id);
    }
  };

  const availableTargets = allBeats.filter(b => b.id !== beat.id);
  const inspectorWidthClass = expanded ? 'w-[640px]' : 'w-80';

  return (
    <>
      <div className={`${inspectorWidthClass} h-full bg-white border-l border-gray-200 flex flex-col`}>
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">Properties</h2>
            {hasChanges && (
              <span className="text-xs text-orange-500 font-medium">Unsaved changes</span>
            )}
          </div>
          <div className="text-sm text-gray-500">
            {beat.type} • ID: {beat.id}
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="flex-shrink-0 p-3 bg-red-50 border-b border-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
              <div className="text-sm text-red-700">
                <div className="font-medium mb-1">Please fix the following:</div>
                {validationErrors.map((error, i) => (
                  <div key={i} className="text-xs">• {error}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation for beats with visual editor */}
        {supportsVisualEditor(beat.type) && (
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('properties')}
              className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'properties'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Properties
            </button>
            <button
              onClick={() => setActiveTab('visual')}
              className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'visual'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Palette className="w-4 h-4 inline mr-2" />
              Visual Editor
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {/* Properties Tab */}
          {(!supportsVisualEditor(beat.type) || activeTab === 'properties') && (
            <div className="h-full overflow-y-auto p-4">
              <div className="space-y-4">
                {/* Basic Properties */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={localBeat.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Background Sound for ALL beats */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Music className="w-4 h-4 inline mr-1" />
                    Background Sound
                  </label>
                  <button
                    onClick={() => handleAssetSelection('sound', (asset) => {
                      handleParameterChange('backgroundSound', asset.id);
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    {localBeat.parameters?.backgroundSound ? 'Change Sound' : 'Add Background Sound'}
                  </button>
                  {localBeat.parameters?.backgroundSound && (
                    <button
                      onClick={() => handleParameterChange('backgroundSound', '')}
                      className="mt-1 text-xs text-red-600 hover:text-red-800"
                    >
                      Remove Sound
                    </button>
                  )}
                </div>

                {/* Beat-specific Parameters */}
                {beat.type === 'titleScreen' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input
                        type="text"
                        value={localBeat.parameters?.title || ''}
                        onChange={(e) => handleParameterChange('title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                      <input
                        type="text"
                        value={localBeat.parameters?.author || ''}
                        onChange={(e) => handleParameterChange('author', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
                      <input
                        type="text"
                        value={localBeat.parameters?.buttonText || 'Start'}
                        onChange={(e) => handleParameterChange('buttonText', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </>
                )}

                {beat.type === 'introText' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Text Content</label>
                    <textarea
                      value={localBeat.parameters?.text || ''}
                      onChange={(e) => handleParameterChange('text', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                )}

                {/* Add other beat type specific fields here... */}
                
              </div>
            </div>
          )}

          {/* Visual Editor Tab */}
          {supportsVisualEditor(beat.type) && activeTab === 'visual' && (
            <div className="h-full">
              <VisualBeatEditor
                backgroundAssetId={localBeat.parameters?.backgroundAssetId}
                backgroundSound={localBeat.parameters?.backgroundSound}
                elements={visualElements}
                onElementsChange={handleVisualElementsChange}
                assets={assets}
                onSelectAsset={handleAssetSelection}
                beatContent={getBeatContent()}
                beatType={beat.type}
              />
            </div>
          )}
        </div>

        {/* Fixed Footer Actions */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
          <div className="space-y-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                hasChanges
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>

            <button
              onClick={handleDelete}
              className="w-full py-2 px-4 border border-red-300 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Beat
            </button>
          </div>
        </div>
      </div>

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        isOpen={assetSelectionModal.isOpen}
        onClose={() => setAssetSelectionModal({ isOpen: false, type: null, callback: null })}
        onSelect={handleAssetSelected}
        assets={assets}
        onAssetAdd={onAssetAdd!}
        onAssetRemove={onAssetRemove!}
        onAssetUpdate={onAssetUpdate!}
        assetType={assetSelectionModal.type === 'sound' ? 'audio' : 'image'}
        assetSubType={assetSelectionModal.type === 'background' ? 'background' : 
                     assetSelectionModal.type === 'character' ? 'character' :
                     assetSelectionModal.type === 'prop' ? 'prop' : undefined}
        title={`Select ${assetSelectionModal.type || 'Asset'}`}
      />
    </>
  );
};
