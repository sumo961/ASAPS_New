import React, { useState, useEffect, useMemo } from 'react';
import { Beat } from '@asaps/core';
import { X, Save, Trash2, Copy, Info, Plus, Link, Unlink, MapPin, Package, Settings, AlertCircle, MessageSquare, Image, Palette, Music, Volume2, Timer, Variable, Box } from 'lucide-react';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';
import { DialogTreeEditor } from '../editors/DialogTreeEditor';
import { HyperTextEditor } from '../editors/HyperTextEditor';
import { VisualBeatEditor, VisualElement } from './visual/VisualBeatEditor';
import { AssetSelector } from './assets/AssetSelector';
import { AssetSelectionModal } from './assets/AssetSelectionModal';
import { SchemaFormGenerator } from './SchemaFormGenerator';
import { BeatSuggestions } from './ai/BeatSuggestions';
import type { BeatDefinition } from './SchemaFormGenerator';
import type { Asset } from './assets/AssetManager';

// Type definitions
interface ChoiceWithCounter {
  id: string;
  text: string;
  location?: string;
  target?: string;
  counter?: string;
  counterOperation?: string;
  counterValue?: number;
}

interface PropWithEffect {
  id: string;
  name: string;
  description: string;
  target?: string;
  counter?: string;
  counterOperation?: string;
  counterValue?: number;
  effect?: {
    type: string;
    name: string;
  };
}

interface InspectorProps {
  beat: Beat | null;
  onUpdate: (beatId: string, updates: Partial<Beat>) => void;
  onDelete: (beatId: string) => void;
  allBeats?: Beat[];
  onConnect?: (sourceBeatId: string, targetBeatId: string) => void;
  onDisconnect?: (sourceBeatId: string, targetBeatId: string) => void;
  onBeatAdd?: (type: string, position?: { x: number; y: number }) => Beat;
  expanded?: boolean;
  assets?: Asset[];
  onAssetAdd?: (asset: Asset) => Promise<boolean>;
  onAssetRemove?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: Partial<Asset>) => void;
  onOpenAssetManager?: () => void;
  onAssetSelect?: (type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  onOpenCharacterManager?: (callback?: (character: any) => void) => void;
}

export const Inspector: React.FC<InspectorProps> = ({
  beat,
  onUpdate,
  onDelete,
  allBeats = [],
  onConnect,
  onDisconnect,
  onBeatAdd,
  expanded = false,
  assets = [],
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  onOpenAssetManager,
  onAssetSelect,
  onOpenCharacterManager,
}) => {
  const [localBeat, setLocalBeat] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'properties' | 'visual'>('properties');

  // Asset selection modal state
  const [assetSelectionModal, setAssetSelectionModal] = useState<{
    isOpen: boolean;
    type: 'background' | 'character' | 'prop' | 'sound' | null;
    callback: ((asset: Asset) => void) | null;
  }>({ isOpen: false, type: null, callback: null });

  // Get beat definition from schema
  const getBeatDefinition = (beatType: string): BeatDefinition => {
    const beatDef = beatDefinitions.beatTypes[beatType as keyof typeof beatDefinitions.beatTypes];
    return beatDef as BeatDefinition;
  };

  // Get available characters - NPCs who can speak
  const getAvailableCharacters = () => {
    return ['Old Wizard', 'Merchant', 'Guard', 'Innkeeper', 'Mysterious Stranger', 'Village Elder', 'Narrator'];
  };

  // Check if beat type supports visual editor
  const supportsVisualEditor = (beatType: string) => {
    const visualBeatTypes = [
      'titleScreen',
      'introText',
      'durScreen',
      'pickProp',
      'movementChoice',
      'dialogTree',
      'endScreen',
      'videoBeat'
    ];
    return visualBeatTypes.includes(beatType);
  };


  // Handle asset selection with callback
  const handleAssetSelection = (
    assetType: 'background' | 'character' | 'prop' | 'sound',
    callback: (asset: Asset) => void
  ) => {
    console.log('Opening asset modal with', assets.length, 'assets');
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

  // Helper functions for Dialog Tree
  const handleDialogTreeChange = (newDialogTree: any) => {
    handleParameterChange('dialogTree', newDialogTree);

    // Rebuild connections immediately when dialog tree changes
    const updatedBeat = {
      ...localBeat,
      parameters: {
        ...localBeat.parameters,
        dialogTree: newDialogTree
      }
    };
    rebuildConnectionsAndUpdate(updatedBeat);
  };

  const handleAddConnection = (targetId: string, label?: string) => {
    setLocalBeat((prev: any) => ({
      ...prev,
      connections: [{ targetId, label: label || '' }]
    }));
    setHasChanges(true);
  };

  // Helper functions for Movement Choice
  const handleAddChoice = () => {
    const newChoice: ChoiceWithCounter = {
      id: `choice_${Date.now()}`,
      text: 'New Choice',
      location: '',
      target: ''
    };
    handleParameterChange('choices', [...(localBeat.parameters?.choices || []), newChoice]);
  };

  const handleRemoveChoice = (index: number) => {
    const newChoices = localBeat.parameters?.choices?.filter((_: any, i: number) => i !== index) || [];
    handleParameterChange('choices', newChoices);
  };

  const handleUpdateChoice = (index: number, field: string, value: any) => {
    const newChoices = [...(localBeat.parameters?.choices || [])];
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      newChoices[index] = {
        ...newChoices[index],
        [parent]: {
          ...newChoices[index][parent],
          [child]: value
        }
      };
    } else {
      newChoices[index] = {
        ...newChoices[index],
        [field]: value
      };
    }
    handleParameterChange('choices', newChoices);

    // If target changed, rebuild connections immediately
    if (field === 'target') {
      const updatedBeat = {
        ...localBeat,
        parameters: {
          ...localBeat.parameters,
          choices: newChoices
        }
      };
      rebuildConnectionsAndUpdate(updatedBeat);
    }
  };

  // Helper functions for Pick Prop
  const handleAddProp = () => {
    const newProp: PropWithEffect = {
      id: `prop_${Date.now()}`,
      name: 'New Prop',
      description: '',
      target: ''
    };
    handleParameterChange('props', [...(localBeat.parameters?.props || []), newProp]);
  };

  const handleRemoveProp = (index: number) => {
    const newProps = localBeat.parameters?.props?.filter((_: any, i: number) => i !== index) || [];
    handleParameterChange('props', newProps);
  };

  const handleUpdateProp = (index: number, field: string, value: any) => {
    const newProps = [...(localBeat.parameters?.props || [])];
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      newProps[index] = {
        ...newProps[index],
        [parent]: {
          ...newProps[index][parent],
          [child]: value
        }
      };
    } else {
      newProps[index] = {
        ...newProps[index],
        [field]: value
      };
    }
    handleParameterChange('props', newProps);

    // If target changed, rebuild connections immediately
    if (field === 'target') {
      const updatedBeat = {
        ...localBeat,
        parameters: {
          ...localBeat.parameters,
          props: newProps
        }
      };
      rebuildConnectionsAndUpdate(updatedBeat);
    }
  };

  // Get beat content for visual editor
  const getBeatContent = () => {
    if (!localBeat || !localBeat.parameters) return undefined;
    
    const params = localBeat.parameters;
    
    switch (beat?.type) {
      case 'titleScreen':
        return {
          title: params.title || 'Untitled',
          author: params.author || 'Unknown Author',
          buttonText: params.buttonText || 'Start',
        };
      case 'introText':
      case 'durScreen':
        return {
          text: params.text || '',
          buttonText: params.buttonText || 'Continue',
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
      case 'endScreen':
        return {
          text: params.message || 'The End',
          buttonText: params.buttonText || 'Play Again',
        };
      default:
        return undefined;
    }
  };

  useEffect(() => {
    if (!beat) return;
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
      
      // Initialize randomTarget choices if not present
      if (beat.type === 'randomTarget' && !beatData.parameters.choices) {
        beatData.parameters.choices = [];
      }
      
      
      // FIXED: SetTimer parameter mapping - ensure consistency
      if (beat.type === 'setTimer' && beatData.parameters) {
        // Get parameters from beat's getParameters() method for consistency
        const beatParams = beat.getParameters ? beat.getParameters() : {};
        
        // Ensure both timerName and name are set
        if (!beatData.parameters.timerName) {
          beatData.parameters.timerName = beatParams.timerName || beatParams.name || '';
        }
        if (!beatData.parameters.name) {
          beatData.parameters.name = beatData.parameters.timerName;
        }
        
        // Ensure both target and timerTarget are set
        if (!beatData.parameters.target) {
          beatData.parameters.target = beatParams.target || beatParams.timerTarget || '';
        }
        if (!beatData.parameters.timerTarget) {
          beatData.parameters.timerTarget = beatData.parameters.target;
        }
        
        // Ensure value is set
        if (beatData.parameters.value === undefined) {
          beatData.parameters.value = beatParams.value || 60;
        }
      }
      //}
      
      setLocalBeat(beatData);
      setHasChanges(false);
      setValidationErrors([]);
      
      
      // Set default tab based on beat type
      if (supportsVisualEditor(beat.type)) {
        setActiveTab('properties');
      }
    //}
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
        if (!localBeat.parameters?.conditionType) errors.push('Condition type is required');
        
        // Check required fields based on condition type
        if (localBeat.parameters?.conditionType === 'timer') {
          if (!localBeat.parameters?.timer) errors.push('Timer name is required');
        }
        if (localBeat.parameters?.conditionType === 'inventory') {
          if (!localBeat.parameters?.character) errors.push('Character is required for inventory check');
        }
        
        const conns = localBeat.connections || [];
        const hasTrue = conns.some((c: any) => c.label === 'true');
        if (!hasTrue) errors.push('True target is required');
        break;
      case 'setTimer':
        if (!localBeat.parameters?.timerName) errors.push('Timer name is required');
        if (!localBeat.parameters?.target) errors.push('Timer target is required');
        const normalConnection = localBeat.connections?.find((c: any) => c.label !== 'Timer Target');
        if (!normalConnection) errors.push('Continue connection is required');
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
    const updatedBeat = {
      ...localBeat,
      [field]: value,
    };
    setLocalBeat(updatedBeat);
    setHasChanges(true);

    // For fields that affect graph visualization, update immediately
    if (field === 'defaultTarget' || field === 'defaultTargetDelay' || field === 'showTimer' || field === 'name') {
      if (onUpdate && beat) {
        onUpdate(beat.id, { [field]: value });
      }
    }
  };

  const handleParameterChange = (param: string, value: any) => {
    const updatedBeat = {
      ...localBeat,
      parameters: {
        ...localBeat.parameters,
        [param]: value,
      },
    };
    setLocalBeat(updatedBeat);
    setHasChanges(true);

    // Immediately save parameter changes like we do for connections
    rebuildConnectionsAndUpdate(updatedBeat);
  };

  // Helper function to rebuild connections from local state and immediately update
  const rebuildConnectionsAndUpdate = (updatedLocalBeat?: any) => {
    if (!beat || !onUpdate) return;

    const beatToUpdate = updatedLocalBeat || localBeat;
    const beatAny = beat as any;

    // Clear existing connections
    if (typeof beatAny.clearConnections === 'function') {
      beatAny.clearConnections();
    } else {
      beat.connections = [];
    }

    // Apply all basic properties from local state
    beat.name = beatToUpdate.name;
    beat.cluster = beatToUpdate.cluster;
    beat.defaultTarget = beatToUpdate.defaultTarget || undefined;
    beat.transition = beatToUpdate.transition;
    beat.sound = beatToUpdate.sound;

    // Update parameters
    if (beatToUpdate.parameters && beat.updateParameters) {
      const parameters = { ...beatToUpdate.parameters };

      // Ensure button text is saved for applicable beats
      if (['titleScreen', 'introText', 'durScreen', 'endScreen'].includes(beat.type)) {
        parameters.buttonText = beatToUpdate.parameters.buttonText ||
          (beat.type === 'titleScreen' ? 'Start' :
           beat.type === 'endScreen' ? 'Play Again' :
           'Continue');
      }

      beat.updateParameters(parameters);
    }

    // Use the connection type from the component scope
    const beatDef = getBeatDefinition(beat.type);
    const connectionType = beatDef?.connectionType || 'single';

    // Rebuild connections based on beat type
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

      const dialogConnections = extractConnections(beatToUpdate.parameters.dialogTree);

      if (beatToUpdate.connections?.length > 0) {
        const defaultConn = beatToUpdate.connections.find((c: any) => !c.label || c.label === 'Continue');
        if (defaultConn) {
          dialogConnections.push(defaultConn);
        }
      }

      const uniqueConns = Array.from(
        new Map(dialogConnections.map(c => [`${c.targetId}-${c.label}`, c])).values()
      );
      uniqueConns.forEach(conn => beat.addConnection(conn));

    } else if (beat.type === 'setTimer') {
      // Timer target connection (from parameters)
      if (beatToUpdate.parameters?.target) {
        beat.addConnection({
          targetId: beatToUpdate.parameters.target,
          label: 'Timer Target'
        });
      }
      // Normal connection (where to continue immediately)
      const normalConn = beatToUpdate.connections?.find((c: any) => c.label !== 'Timer Target');
      if (normalConn) {
        beat.addConnection(normalConn);
      }

    } else if (beat.type === 'randomTarget') {
      // Random target connections
      const choices = beatToUpdate.parameters?.choices || [];
      choices.forEach((choice: any, index: number) => {
        if (choice && choice.trim() !== '') {
          beat.addConnection({
            targetId: choice,
            label: `Random ${index + 1}`
          });
        }
      });

    } else if (connectionType === 'single' && beatToUpdate.connections?.length > 0) {
      beat.addConnection(beatToUpdate.connections[0]);

    } else if (connectionType === 'multiple') {
      // Handle multiple connections for choice beats
      if (beat.type === 'movementChoice' && beatToUpdate.parameters?.choices) {
        beatToUpdate.parameters.choices.forEach((choice: any) => {
          if (choice.target) {
            beat.addConnection({
              targetId: choice.target,
              label: choice.text
            });
          }
        });
      } else if (beat.type === 'pickProp' && beatToUpdate.parameters?.props) {
        beatToUpdate.parameters.props.forEach((prop: any) => {
          if (prop.target) {
            beat.addConnection({
              targetId: prop.target,
              label: prop.name
            });
          }
        });
      }

    } else if (connectionType === 'conditional') {
      beatToUpdate.connections.forEach((conn: any) => beat.addConnection(conn));

    } else {
      beatToUpdate.connections.forEach((conn: any) => beat.addConnection(conn));
    }

    // Call onUpdate with the updated beat and connections
    const updatedConnections = beat.getConnections ? beat.getConnections() : [];
    onUpdate(beat.id, {
      ...beat,
      connections: updatedConnections
    });

    // Reset hasChanges since we just saved
    setHasChanges(false);
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
        const parameters = { ...localBeat.parameters };
        
        // Ensure button text is saved for applicable beats
        if (['titleScreen', 'introText', 'durScreen', 'endScreen'].includes(beat.type)) {
          parameters.buttonText = localBeat.parameters.buttonText || 
            (beat.type === 'titleScreen' ? 'Start' :
             beat.type === 'endScreen' ? 'Play Again' :
             'Continue');
        }
        
        // Include visual elements and sound in parameters
        if (supportsVisualEditor(beat.type)) {
          // parameters.visualElements = visualElements; // Not defined in this version
        }

        beat.updateParameters(parameters);
      }
      
      // Handle connections
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
        
      } else if (beat.type === 'setTimer') {
        // Timer target connection (from parameters)
        if (localBeat.parameters?.target) {
          beat.addConnection({
            targetId: localBeat.parameters.target,
            label: 'Timer Target'
          });
        }
        // Normal connection (where to continue immediately)
        const normalConn = localBeat.connections?.find((c: any) => c.label !== 'Timer Target');
        if (normalConn) {
          beat.addConnection(normalConn);
        }
      } else if (beat.type === 'randomTarget') {
        // Random target connections
        const choices = localBeat.parameters?.choices || [];
        // Only add connections for non-empty choices
        choices.forEach((choice: any, index: number) => {
          if (choice && choice.trim() !== '') {
            beat.addConnection({
              targetId: choice,
              label: `Random ${index + 1}`
            });
          }
        });
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

      // CRITICAL FIX: Extract connections and include them in the update to force React re-render
      const updatedConnections = beat.getConnections ? beat.getConnections() : [];

      onUpdate(beat.id, {
        ...beat,
        connections: updatedConnections
      });
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
  
  // Dynamic width for visual editor
  const inspectorWidthClass = activeTab === 'visual' && supportsVisualEditor(beat.type) 
    ? 'w-full max-w-7xl' 
    : expanded ? 'w-[640px]' : 'w-80';

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

        {/* Content Area - Single Properties tab for all beats */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            {/* Schema-based Properties */}
            <div className="p-4 space-y-4">
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

                {/* BEAT-SPECIFIC PARAMETERS - SCHEMA DRIVEN */}

                {/* Schema-driven simple parameters */}
                {beat.type !== 'dialogTree' && beat.type !== 'movementChoice' &&
                 beat.type !== 'pickProp' && beat.type !== 'conditionBeat' &&
                 beat.type !== 'setTimer' && beat.type !== 'randomTarget' &&
                 beat.type !== 'hyperText' && (
                  <SchemaFormGenerator
                    beatType={beat.type}
                    beatDefinition={getBeatDefinition(beat.type)}
                    parameters={localBeat.parameters}
                    onParameterChange={handleParameterChange}
                    availableTargets={availableTargets}
                    characters={getAvailableCharacters()}
                  />
                )}

                {/* Condition Beat */}
                {beat.type === 'conditionBeat' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Condition Type
                      </label>
                      <select
                        value={localBeat.parameters?.conditionType || 'counter'}
                        onChange={(e) => handleParameterChange('conditionType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="counter">Counter</option>
                        <option value="counterCompare">Counter Compare</option>
                        <option value="timer">Timer</option>
                        <option value="inventory">Inventory</option>
                        <option value="variable">Variable</option>
                      </select>
                    </div>
                    
                    {/* Counter Condition */}
                    {localBeat.parameters?.conditionType === 'counter' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Counter Name
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.variableName || localBeat.parameters?.left || ''}
                            onChange={(e) => handleParameterChange('variableName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., courage"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Operator
                          </label>
                          <select
                            value={localBeat.parameters?.operator || '=='}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value=">">Greater Than (&gt;)</option>
                            <option value=">=">Greater Than or Equal (≥)</option>
                            <option value="<">Less Than (&lt;)</option>
                            <option value="<=">Less Than or Equal (≤)</option>
                            <option value="==">Equal (=)</option>
                            <option value="!=">Not Equal (≠)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Value
                          </label>
                          <input
                            type="number"
                            value={localBeat.parameters?.value ?? localBeat.parameters?.val ?? 0}
                            onChange={(e) => handleParameterChange('value', parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </>
                    )}
                    
                    {/* Counter Compare Condition */}
                    {localBeat.parameters?.conditionType === 'counterCompare' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            First Counter
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.counter1 || ''}
                            onChange={(e) => handleParameterChange('counter1', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., courage"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Operator
                          </label>
                          <select
                            value={localBeat.parameters?.operator || '=='}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value=">">Greater Than (&gt;)</option>
                            <option value=">=">Greater Than or Equal (≥)</option>
                            <option value="<">Less Than (&lt;)</option>
                            <option value="<=">Less Than or Equal (≤)</option>
                            <option value="==">Equal (=)</option>
                            <option value="!=">Not Equal (≠)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Second Counter
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.counter2 || ''}
                            onChange={(e) => handleParameterChange('counter2', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., wisdom"
                          />
                        </div>
                      </>
                    )}
                    
                    {/* Timer Condition */}
                    {localBeat.parameters?.conditionType === 'timer' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Timer Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.timer || ''}
                            onChange={(e) => handleParameterChange('timer', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., countdown"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Check Type
                          </label>
                          <select
                            value={localBeat.parameters?.operator || '>'}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value=">">Time Remaining &gt; Value</option>
                            <option value="<">Time Remaining &lt; Value</option>
                            <option value="==">Time Remaining = Value</option>
                            <option value="expired">Timer Expired</option>
                          </select>
                        </div>
                        {localBeat.parameters?.operator !== 'expired' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Value (seconds)
                            </label>
                            <input
                              type="number"
                              value={localBeat.parameters?.value ?? localBeat.parameters?.val ?? 0}
                              onChange={(e) => handleParameterChange('value', parseInt(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Variable Condition */}
                    {localBeat.parameters?.conditionType === 'variable' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <Variable className="w-4 h-4 inline mr-1" />
                            Variable Name
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.variableName || localBeat.parameters?.variable || localBeat.parameters?.left || ''}
                            onChange={(e) => handleParameterChange('variableName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., playerName"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Operator
                          </label>
                          <select
                            value={localBeat.parameters?.operator || '=='}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="==">Equals (=)</option>
                            <option value="!=">Not Equal (≠)</option>
                            <option value="contains">Contains</option>
                            <option value="exists">Exists</option>
                            <option value="notExists">Does Not Exist</option>
                          </select>
                        </div>
                        {localBeat.parameters?.operator !== 'exists' && localBeat.parameters?.operator !== 'notExists' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Value
                            </label>
                            <input
                              type="text"
                              value={localBeat.parameters?.value ?? localBeat.parameters?.val ?? ''}
                              onChange={(e) => handleParameterChange('value', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              placeholder="Variable value to check"
                            />
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Inventory Condition */}
                    {localBeat.parameters?.conditionType === 'inventory' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <Box className="w-4 h-4 inline mr-1" />
                            Item Name
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.item || ''}
                            onChange={(e) => handleParameterChange('item', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., magic_key"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Check Type
                          </label>
                          <select
                            value={localBeat.parameters?.checkType || 'has'}
                            onChange={(e) => handleParameterChange('checkType', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="has">Has Item</option>
                            <option value="notHas">Does Not Have Item</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Character <span className="text-red-500">*</span>
                            <span className="text-xs text-gray-500 block">
                              Required - defaults to "player"
                            </span>
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.character || 'player'}
                            onChange={(e) => handleParameterChange('character', e.target.value || 'player')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="player"
                            required
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Set Timer Beat */}
                {beat.type === 'setTimer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Timer className="w-4 h-4 inline mr-1" />
                        Timer Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={localBeat.parameters?.timerName || ''}
                        onChange={(e) => handleParameterChange('timerName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="e.g., countdown"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Duration (seconds)
                      </label>
                      <input
                        type="number"
                        value={localBeat.parameters?.value || 60}
                        onChange={(e) => handleParameterChange('value', parseInt(e.target.value))}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Timer Target Beat <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-500 block">
                          Beat to jump to when timer expires
                        </span>
                      </label>
                      <select
                        value={localBeat.parameters?.target || ''}
                        //onChange={(e) => handleParameterChange('target', e.target.value)}
                        onChange={(e) => {
                          const targetId = e.target.value;
                          handleParameterChange('target', targetId);          // ← keep param in sync
                          //const timerConn = localBeat.connections?.find((c) => c.label === 'Timer Target');
                         // const timerConn = localBeat.connections?.find((c: any) => c.label === 'Timer Target');
                          const timerConn = localBeat.connections?.find((c: { label?: string }) => c.label === 'Timer Target');
                          const newConnections: { targetId: string; label: string }[] = [];
                          if (timerConn) newConnections.push(timerConn);      // preserve existing timer conn
                          if (targetId) newConnections.push({ targetId, label: '' }); // continue conn
                          const updatedBeat = { ...localBeat, connections: newConnections };
                          setLocalBeat(updatedBeat);
                          setHasChanges(true);

                          // Rebuild connections immediately when timer target changes
                          rebuildConnectionsAndUpdate(updatedBeat);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >

                        <option value="">Select target beat...</option>
                        {availableTargets.map(target => (
                          <option key={target.id} value={target.id}>
                            {target.name} ({target.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="border-t pt-3 mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Continue To Beat <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-500 block">
                          Beat to continue to immediately (timer runs in background)
                        </span>
                      </label>
                      <select
                        value={localBeat.connections?.find((c: any) => c.label !== 'Timer Target')?.targetId || ''}
                        onChange={(e) => {
                          const targetId = e.target.value;

                          const timerConn = localBeat.connections?.find((c: any) => c.label === 'Timer Target');
                          // const newConnections = [];
                          const newConnections: { targetId: string; label: string }[] = [];
                          if (timerConn) newConnections.push(timerConn);
                          if (targetId) {
                            newConnections.push({ targetId, label: '' });
                          }
                          const updatedBeat = { ...localBeat, connections: newConnections };
                          setLocalBeat(updatedBeat);
                          setHasChanges(true);

                          // Rebuild connections immediately when continue target changes
                          rebuildConnectionsAndUpdate(updatedBeat);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Select next beat...</option>
                        {availableTargets.map(target => (
                          <option key={target.id} value={target.id}>
                            {target.name} ({target.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Random Target Beat */}
                {beat.type === 'randomTarget' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Random Target Beats
                      </label>
                      <button
                        onClick={() => {
                          const currentChoices = localBeat.parameters?.choices || [];
                          handleParameterChange('choices', [...currentChoices, '']);
                        }}
                        className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Target
                      </button>
                    </div>
                    
                    {localBeat.parameters?.choices?.length === 0 && (
                      <div className="text-sm text-gray-500 italic py-2">
                        No random targets. Click "Add Target" to add one.
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      {(localBeat.parameters?.choices || []).map((choice: string, index: number) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-600 mb-1">
                              Target {index + 1}
                            </label>
                            <select
                              value={choice || ''}
                              onChange={(e) => {
                                const newChoices = [...(localBeat.parameters?.choices || [])];
                                newChoices[index] = e.target.value;
                                handleParameterChange('choices', newChoices);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="">Select target beat...</option>
                              {availableTargets.map(target => (
                                <option key={target.id} value={target.id}>
                                  {target.name} ({target.type})
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => {
                              const newChoices = (localBeat.parameters?.choices || []).filter((_: any, i: number) => i !== index);
                              handleParameterChange('choices', newChoices);
                            }}
                            className="mt-5 p-2 text-red-500 hover:bg-red-50 rounded"
                            title="Remove target"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    {localBeat.parameters?.choices?.length > 0 && (
                      <div className="text-xs text-gray-500 mt-2">
                        The beat will randomly select one of these targets.
                      </div>
                    )}
                  </div>
                )}

                {/* Add/Remove Inventory Beat */}
                {beat.type === 'addRemoveInventory' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Box className="w-4 h-4 inline mr-1" />
                        Action
                      </label>
                      <select
                        value={localBeat.parameters?.action || 'add'}
                        onChange={(e) => handleParameterChange('action', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="add">Add to Inventory</option>
                        <option value="remove">Remove from Inventory</option>
                        <option value="transfer">Transfer Between Characters</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Item Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={localBeat.parameters?.item || ''}
                        onChange={(e) => handleParameterChange('item', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="e.g., magic_key"
                      />
                    </div>
                    
                    {localBeat.parameters?.action === 'transfer' ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            From Character <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.fromChar || 'player'}
                            onChange={(e) => handleParameterChange('fromChar', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="player"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            To Character <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.toChar || ''}
                            onChange={(e) => handleParameterChange('toChar', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="e.g., wolf"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Character
                        </label>
                        <input
                          type="text"
                          value={localBeat.parameters?.character || 'player'}
                          onChange={(e) => handleParameterChange('character', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="Default: player"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* HyperText Editor */}
                {beat.type === 'hyperText' && (
                  <div className="space-y-3">
                    <HyperTextEditor
                      text={localBeat.parameters?.text || ''}
                      hyperlinks={localBeat.parameters?._rawHyperlinks || []}
                      onChange={(text, hyperlinks) => {
                        // Convert hyperlinks format for beat parameters (renderer format)
                        const links = hyperlinks.map(link => ({
                          word: text.substring(link.start, link.end),
                          targetBeatId: link.targetBeatId,
                          style: {
                            color: link.style.color,
                            hoverColor: localBeat.parameters?.hoverColor || '#003366',
                            underline: link.style.underline,
                            bold: false
                          }
                        }));
                        handleParameterChange('text', text);
                        handleParameterChange('links', links);
                        // Store raw hyperlinks for editor to use (with start/end positions)
                        handleParameterChange('_rawHyperlinks', hyperlinks);
                      }}
                      availableBeats={availableTargets}
                    />

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="allowMultiple"
                        checked={localBeat.parameters?.allowMultiple || false}
                        onChange={(e) => handleParameterChange('allowMultiple', e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="allowMultiple" className="text-sm text-gray-700">
                        Allow Multiple Clicks
                        <span className="text-xs text-gray-500 block">
                          Whether user can click multiple links
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Highlight Color
                        </label>
                        <input
                          type="color"
                          value={localBeat.parameters?.highlightColor || '#0066cc'}
                          onChange={(e) => handleParameterChange('highlightColor', e.target.value)}
                          className="w-full h-10 rounded border border-gray-300"
                        />
                        <span className="text-xs text-gray-500">Color for hyperlinked text</span>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Hover Color
                        </label>
                        <input
                          type="color"
                          value={localBeat.parameters?.hoverColor || '#003366'}
                          onChange={(e) => handleParameterChange('hoverColor', e.target.value)}
                          className="w-full h-10 rounded border border-gray-300"
                        />
                        <span className="text-xs text-gray-500">Color when hovering</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dialog Tree Editor */}
                {beat.type === 'dialogTree' && (
                  <div className="space-y-3">
                    <DialogTreeEditor
                      dialogTree={localBeat.parameters?.dialogTree || {
                        id: 'root',
                        speaker: 'Character',
                        text: 'Hello...',
                        emotion: 'neutral'
                      }}
                      onChange={handleDialogTreeChange}
                      characters={getAvailableCharacters()}
                      allBeats={availableTargets}
                    />

                    {showAdvanced && (
                      <div className="border-t pt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Choice Delay (seconds)
                          <span className="text-xs text-gray-500 block font-normal">
                            Time before choices appear (optional)
                          </span>
                        </label>
                        <input
                          type="number"
                          value={localBeat.parameters?.choiceDelay || 0}
                          onChange={(e) => handleParameterChange('choiceDelay', parseFloat(e.target.value))}
                          min="0"
                          step="0.5"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    )}

                  </div>
                )}

                {/* Movement Choice */}
                {beat.type === 'movementChoice' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                      <input
                        type="text"
                        value={localBeat.parameters?.question || 'Where do you want to go?'}
                        onChange={(e) => handleParameterChange('question', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    {showAdvanced && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Choice Delay (seconds)
                          <span className="text-xs text-gray-500 block font-normal">
                            Time before choices appear (optional)
                          </span>
                        </label>
                        <input
                          type="number"
                          value={localBeat.parameters?.choiceDelay || 0}
                          onChange={(e) => handleParameterChange('choiceDelay', parseFloat(e.target.value))}
                          min="0"
                          step="0.5"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Choices</span>
                        <button
                          onClick={handleAddChoice}
                          className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                        >
                          <Plus className="w-3 h-3 inline" /> Add
                        </button>
                      </div>
                      
                      {localBeat.parameters?.choices?.map((choice: ChoiceWithCounter, index: number) => (
                        <div key={choice.id} className="p-3 bg-gray-50 rounded-lg space-y-2 mb-2">
                          <div className="flex justify-between">
                            <span className="text-xs font-medium">Choice {index + 1}</span>
                            <button
                              onClick={() => handleRemoveChoice(index)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <input
                            type="text"
                            value={choice.text}
                            onChange={(e) => handleUpdateChoice(index, 'text', e.target.value)}
                            placeholder="Choice text"
                            className="w-full px-2 py-1 text-sm border rounded"
                          />
                          
                          <input
                            type="text"
                            value={choice.location || ''}
                            onChange={(e) => handleUpdateChoice(index, 'location', e.target.value)}
                            placeholder="Location description"
                            className="w-full px-2 py-1 text-sm border rounded"
                          />
                          
                          <select
                            value={choice.target || ''}
                            onChange={(e) => handleUpdateChoice(index, 'target', e.target.value)}
                            className="w-full px-2 py-1 text-sm border rounded"
                          >
                            <option value="">Select target beat...</option>
                            {availableTargets.map(target => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.id})
                              </option>
                            ))}
                          </select>
                          
                          {showAdvanced && (
                            <div className="p-2 bg-blue-50 rounded space-y-2">
                              <div className="text-xs font-medium text-blue-700">Counter Effect (Optional)</div>
                              <input
                                type="text"
                                value={choice.counter || ''}
                                onChange={(e) => handleUpdateChoice(index, 'counter', e.target.value)}
                                placeholder="Counter name (e.g., courage)"
                                className="w-full px-2 py-1 text-xs border rounded"
                              />
                              <div className="flex gap-2">
                                <select
                                  value={choice.counterOperation || 'change'}
                                  onChange={(e) => handleUpdateChoice(index, 'counterOperation', e.target.value)}
                                  className="flex-1 px-2 py-1 text-xs border rounded"
                                >
                                  <option value="change">Change by</option>
                                  <option value="set">Set to</option>
                                </select>
                                <input
                                  type="number"
                                  value={choice.counterValue || 0}
                                  onChange={(e) => handleUpdateChoice(index, 'counterValue', parseInt(e.target.value))}
                                  placeholder="Value"
                                  className="w-20 px-2 py-1 text-xs border rounded"
                                />
                              </div>
                              {choice.counterOperation === 'change' && (
                                <div className="text-xs text-gray-600">
                                  Use negative values to decrease
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pick Prop */}
                {beat.type === 'pickProp' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                      <input
                        type="text"
                        value={localBeat.parameters?.question || 'What do you want to pick up?'}
                        onChange={(e) => handleParameterChange('question', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    {showAdvanced && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Choice Delay (seconds)
                          <span className="text-xs text-gray-500 block font-normal">
                            Time before choices appear (optional)
                          </span>
                        </label>
                        <input
                          type="number"
                          value={localBeat.parameters?.choiceDelay || 0}
                          onChange={(e) => handleParameterChange('choiceDelay', parseFloat(e.target.value))}
                          min="0"
                          step="0.5"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Props</span>
                        <button
                          onClick={handleAddProp}
                          className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                        >
                          <Plus className="w-3 h-3 inline" /> Add
                        </button>
                      </div>
                      
                      {localBeat.parameters?.props?.map((prop: PropWithEffect, index: number) => (
                        <div key={prop.id} className="p-3 bg-gray-50 rounded-lg space-y-2 mb-2">
                          <div className="flex justify-between">
                            <span className="text-xs font-medium">Prop {index + 1}</span>
                            <button
                              onClick={() => handleRemoveProp(index)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <input
                            type="text"
                            value={prop.name}
                            onChange={(e) => handleUpdateProp(index, 'name', e.target.value)}
                            placeholder="Prop name"
                            className="w-full px-2 py-1 text-sm border rounded"
                          />
                          
                          <input
                            type="text"
                            value={prop.description}
                            onChange={(e) => handleUpdateProp(index, 'description', e.target.value)}
                            placeholder="Description"
                            className="w-full px-2 py-1 text-sm border rounded"
                          />
                          
                          <select
                            value={prop.target || ''}
                            onChange={(e) => handleUpdateProp(index, 'target', e.target.value)}
                            className="w-full px-2 py-1 text-sm border rounded"
                          >
                            <option value="">Select target beat...</option>
                            {availableTargets.map(target => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.id})
                              </option>
                            ))}
                          </select>
                          
                          {/* Counter Effect */}
                          <div className="p-2 bg-blue-50 rounded space-y-2">
                            <div className="text-xs font-medium text-blue-700">Counter Effect (Optional)</div>
                            <input
                              type="text"
                              value={prop.counter || ''}
                              onChange={(e) => handleUpdateProp(index, 'counter', e.target.value)}
                              placeholder="Counter name (e.g., courage)"
                              className="w-full px-2 py-1 text-sm border rounded"
                            />
                            {prop.counter && (
                              <>
                                <div className="flex gap-2">
                                  <select
                                    value={prop.counterOperation || 'change'}
                                    onChange={(e) => handleUpdateProp(index, 'counterOperation', e.target.value)}
                                    className="flex-1 px-2 py-1 text-sm border rounded"
                                  >
                                    <option value="change">Change by</option>
                                    <option value="set">Set to</option>
                                  </select>
                                  <input
                                    type="number"
                                    value={prop.counterValue || 0}
                                    onChange={(e) => handleUpdateProp(index, 'counterValue', parseInt(e.target.value))}
                                    placeholder="Value"
                                    className="w-20 px-2 py-1 text-sm border rounded"
                                  />
                                </div>
                                {prop.counterOperation === 'change' && (
                                  <div className="text-xs text-gray-600">
                                    Use negative values to decrease
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          
                          {/* Note: Picking a prop automatically adds it to inventory */}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CONNECTION SETTINGS - RESTORED AND FIXED */}
                {beat.type !== 'dialogTree' && beat.type !== 'movementChoice' && 
                 beat.type !== 'pickProp' && beat.type !== 'setTimer' && 
                 beat.type !== 'randomTarget' && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Connections</h4>
                    
                    {/* Single Connection Beats */}
                    {/* {connectionType === 'single' && beat.type !== 'endScreen' && (*/}
                    {connectionType === 'single' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            Target Beat {beat.type === 'setTimer' ? '(Timer Expiry)' : '(Required)'}
                          </label>
                          <select
                            value={localBeat.connections?.[0]?.targetId || localBeat.defaultTarget || ''}
                            onChange={(e) => {
                              const targetId = e.target.value;
                              const updatedBeat = {
                                ...localBeat,
                                connections: targetId ? [{ targetId, label: '' }] : [],
                                defaultTarget: targetId || undefined
                              };
                              setLocalBeat(updatedBeat);
                              setHasChanges(true);

                              // Rebuild connections immediately when target changes
                              rebuildConnectionsAndUpdate(updatedBeat);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">Select target beat...</option>
                            {availableTargets.map(target => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Conditional Connection Beats */}
                    {/* ConditionBeat stores targets in parameters (trueTarget/falseTarget), not in connections array */}
                    {connectionType === 'conditional' && beat.type === 'conditionBeat' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            True Target <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={localBeat.parameters?.trueTarget || localBeat.connections?.find((c: any) => c.label === 'true')?.targetId || ''}
                            onChange={(e) => {
                              const targetId = e.target.value;
                              // Update both parameters and connections for consistency
                              const otherConns = localBeat.connections?.filter((c: any) => c.label !== 'true') || [];
                              const updatedBeat = {
                                ...localBeat,
                                parameters: {
                                  ...localBeat.parameters,
                                  trueTarget: targetId || undefined
                                },
                                connections: targetId
                                  ? [...otherConns, { targetId, label: 'true' }]
                                  : otherConns
                              };
                              setLocalBeat(updatedBeat);
                              setHasChanges(true);

                              // Rebuild connections immediately when true target changes
                              rebuildConnectionsAndUpdate(updatedBeat);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">Select target...</option>
                            {availableTargets.map(target => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.type})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            False Target{localBeat.parameters?.conditionType === 'timer' ? <span className="text-red-500"> *</span> : ' (Optional)'}
                          </label>
                          <select
                            value={localBeat.parameters?.falseTarget || localBeat.connections?.find((c: any) => c.label === 'false')?.targetId || ''}
                            onChange={(e) => {
                              const targetId = e.target.value;
                              // Update both parameters and connections for consistency
                              const otherConns = localBeat.connections?.filter((c: any) => c.label !== 'false') || [];
                              const updatedBeat = {
                                ...localBeat,
                                parameters: {
                                  ...localBeat.parameters,
                                  falseTarget: targetId || undefined
                                },
                                connections: targetId
                                  ? [...otherConns, { targetId, label: 'false' }]
                                  : otherConns
                              };
                              setLocalBeat(updatedBeat);
                              setHasChanges(true);

                              // Rebuild connections immediately when false target changes
                              rebuildConnectionsAndUpdate(updatedBeat);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">Select target...</option>
                            {availableTargets.map(target => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Auto-Advance / Timer Settings - shown when advanced is toggled */}
                {showAdvanced && (
                  <div className="border-t pt-4 space-y-3">
                    <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <Timer className="w-4 h-4" />
                      Auto-Advance Settings
                    </h4>
                    <p className="text-xs text-gray-600">
                      Configure automatic progression to create pressure or self-running stories
                    </p>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default Target Beat
                        <span className="text-xs text-gray-500 block font-normal">
                          Beat to automatically advance to after delay
                        </span>
                      </label>
                      <select
                        value={localBeat.defaultTarget || ''}
                        onChange={(e) => handleChange('defaultTarget', e.target.value || undefined)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">No auto-advance</option>
                        {availableTargets.map(target => (
                          <option key={target.id} value={target.id}>
                            {target.name} ({target.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {localBeat.defaultTarget && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Auto-Advance Delay (seconds)
                            <span className="text-xs text-gray-500 block font-normal">
                              Time before auto-advancing to default target
                            </span>
                          </label>
                          <input
                            type="number"
                            value={localBeat.defaultTargetDelay || 5}
                            onChange={(e) => handleChange('defaultTargetDelay', parseInt(e.target.value))}
                            min="1"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={localBeat.showTimer || false}
                              onChange={(e) => handleChange('showTimer', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <span>Show countdown timer to player</span>
                          </label>
                          <p className="text-xs text-gray-500 ml-6 mt-1">
                            Display a visible timer showing time remaining
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Advanced Settings Toggle */}
                <div className="border-t pt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                  </button>
                </div>

              </div>
            </div>
        </div>

        {/* Fixed Footer Actions - Delete button only (Save is handled by central Save button in header) */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white">
          {/* AI Beat Suggestions */}
          <div className="p-4 border-b border-gray-200">
            <BeatSuggestions
              currentBeat={beat as any}
              allBeats={allBeats as any}
              storyMetadata={{
                title: 'Current Story',
                genre: beatDef?.category || 'adventure',
              }}
              onAddBeat={(suggestion) => {
                if (!onBeatAdd) {
                  console.warn('[Inspector] onBeatAdd not provided');
                  return;
                }

                // Create beat from AI suggestion
                // Position it to the right of current beat
                const position = beat ? {
                  x: (beat.x || 0) + 300,
                  y: (beat.y || 0)
                } : undefined;

                const newBeat = onBeatAdd(suggestion.beatType, position);

                // If suggestion has parameters, update the beat
                if (suggestion.parameters && Object.keys(suggestion.parameters).length > 0) {
                  onUpdate(newBeat.id, { ...suggestion.parameters });
                }

                // Auto-connect if we have a source beat
                if (beat && onConnect) {
                  onConnect(beat.id, newBeat.id);
                }
              }}
              count={3}
            />
          </div>

          <div className="p-4 space-y-2">
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
        assetType={assetSelectionModal.type === 'sound' ? 'audio' : 
                  (assetSelectionModal.type as 'image' | 'audio' | 'video' | 'font' | undefined)}
        assetSubType={assetSelectionModal.type === 'background' ? 'background' : 
                     assetSelectionModal.type === 'character' ? 'character' :
                     assetSelectionModal.type === 'prop' ? 'prop' : 
                     assetSelectionModal.type === 'sound' ? 'sfx' : undefined}
        title={`Select ${assetSelectionModal.type || 'Asset'}`}
      />
    </>
  );
};