import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Beat } from '@asaps/core';
import { X, Save, Trash2, Copy, Info, Plus, Link, Unlink, MapPin, Package, Settings, AlertCircle, MessageSquare, Image, Palette, Music, Volume2, Timer, Variable, Box, StickyNote, ChevronDown, ChevronRight } from 'lucide-react';
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
import type { Character } from '../types/character';
import { useAvailableCounters, useAvailableVariables, useAvailableInventoryItems } from '../hooks/useAvailableCountersAndVariables';
import { ChoiceEffectsEditor } from '../editors/ChoiceEffectsEditor';
import { SmartNameDropdown } from '../editors/SmartNameDropdown';
import { TextFieldWithVariables } from '../editors/TextFieldWithVariables';

// Type definitions
interface ChoiceWithCounter {
  id: string;
  text: string;
  location?: string;
  locationName?: string;  // References a hotspot/prop from beat.locations by name
  target?: string;
  effects?: any[];
  soundEffect?: string;
}

interface PropWithEffect {
  id: string;
  name: string;
  description: string;
  target?: string;
  effects?: any[];
  soundEffect?: string;
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
  // For counter/variable dropdowns
  characters?: Character[];
  globalSettings?: {
    variables?: { name: string; type: 'string' | 'number' | 'boolean'; defaultValue?: any; description?: string }[];
    hudOverlays?: { countdownMeter?: { showByDefault?: boolean } };
  };
  // Width control
  width?: number;
  onWidthChange?: (width: number) => void;
}

// Constants for resizable panel
const MIN_INSPECTOR_WIDTH = 280;
const DEFAULT_INSPECTOR_WIDTH = 320;
const INSPECTOR_WIDTH_STORAGE_KEY = 'asaps-inspector-width';

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
  characters = [],
  globalSettings,
  width: externalWidth,
  onWidthChange,
}) => {
  const [localBeat, setLocalBeat] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'properties' | 'visual'>('properties');

  // Resize state
  const [internalWidth, setInternalWidth] = useState<number>(() => {
    // Load from localStorage on initial mount
    const stored = localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_INSPECTOR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Use external width if provided, otherwise internal
  const inspectorWidth = externalWidth ?? internalWidth;
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 600;

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.min(maxWidth, Math.max(MIN_INSPECTOR_WIDTH, newWidth));

      if (onWidthChange) {
        onWidthChange(clampedWidth);
      } else {
        setInternalWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Save to localStorage
      const currentWidth = externalWidth ?? internalWidth;
      localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(currentWidth));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, maxWidth, onWidthChange, externalWidth, internalWidth]);

  // Get available counters, variables, and inventory items for dropdowns
  const availableCounters = useAvailableCounters(characters);
  const availableVariables = useAvailableVariables(globalSettings || null);
  const availableInventoryItems = useAvailableInventoryItems(characters);

  // Force re-render trigger for when we modify beat.locations directly
  const [locationUpdateTrigger, setLocationUpdateTrigger] = useState(0);

  // Get available hotspots and props from beat.locations for MovementChoice/PickProp association
  // Dependencies include locations.size and activeTab to refresh when locations change or tab switches
  const availableLocations = useMemo(() => {
    if (!beat || !beat.locations) return { hotspots: [], props: [] };

    const locations = Array.from(beat.locations.values());
    const hotspots = locations.filter(loc => loc.kind === 'hotspot');
    const props = locations.filter(loc => loc.kind === 'prop');

    return { hotspots, props };
  }, [beat, beat?.locations?.size, locationUpdateTrigger, activeTab]);

  // Asset selection modal state
  const [assetSelectionModal, setAssetSelectionModal] = useState<{
    isOpen: boolean;
    type: 'background' | 'character' | 'prop' | 'sound' | null;
    callback: ((asset: Asset) => void) | null;
  }>({ isOpen: false, type: null, callback: null });

  // Map alias beat types to their canonical schema types
  const BEAT_TYPE_ALIASES: Record<string, string> = {
    'variable': 'setVariable',
    'counter': 'setVariable',
    'setCounter': 'setVariable',
    'setGlobal': 'setVariable',
    'condition': 'conditionBeat',
    'conditionCheck': 'conditionBeat',
    'addInventory': 'addRemoveInventory',
    'removeInventory': 'addRemoveInventory',
  };

  // Get beat definition from schema (with alias support)
  const getBeatDefinition = (beatType: string): BeatDefinition => {
    const canonicalType = BEAT_TYPE_ALIASES[beatType] || beatType;
    const beatDef = beatDefinitions.beatTypes[canonicalType as keyof typeof beatDefinitions.beatTypes];
    return beatDef as BeatDefinition;
  };

  // Get the canonical beat type (resolving aliases)
  const getCanonicalBeatType = (beatType: string): string => {
    return BEAT_TYPE_ALIASES[beatType] || beatType;
  };

  // Get available characters - NPCs who can speak
  const getAvailableCharacters = (): string[] => {
    // Filter to NPCs only (exclude player characters)
    const npcCharacters = characters
      .filter(c => c.role !== 'player')
      .map(c => c.displayName || c.name)
      .filter(name => name && name.trim() !== '');

    // If we have NPC characters from Character Manager, use them
    if (npcCharacters.length > 0) {
      return npcCharacters;
    }

    // Fallback to defaults if no characters are defined
    return ['Narrator', 'NPC'];
  };

  // Check if beat type supports visual editor
  const supportsVisualEditor = (beatType: string) => {
    const visualBeatTypes = [
      'titleScreen',
      'infoText',
      'durScreen',
      'pickProp',
      'movementChoice',
      'dialogTree',
      'endScreen',
      'videoBeat',
      'inputText',
      'hyperText',
      'onlineContent',
      'aiDialogTree',
      'aiSummary',
      'aiInfoText',
      'aiDurScreen',
      'keypad'
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

  // Create a new hotspot for a MovementChoice option
  const handleCreateHotspotForChoice = (choiceIndex: number) => {
    if (!beat || !onUpdate) return;

    const choice = localBeat.parameters?.choices?.[choiceIndex];
    if (!choice) return;

    // Generate a unique hotspot name based on choice text
    const hotspotName = choice.text || choice.location || `Hotspot ${choiceIndex + 1}`;

    // Check if a hotspot with this name already exists
    const existingNames = new Set(
      Array.from(beat.locations?.values() || []).map(loc => loc.name)
    );
    let finalName = hotspotName;
    let counter = 1;
    while (existingNames.has(finalName)) {
      finalName = `${hotspotName} (${counter})`;
      counter++;
    }

    // Create a new hotspot location
    const newHotspot = {
      kind: 'hotspot' as const,
      name: finalName,
      x: 100 + (choiceIndex * 50), // Stagger positions
      y: 300 + (choiceIndex * 60),
      width: 150,
      height: 50,
      zIndex: 10 + choiceIndex,
    };

    // Directly add to the beat's locations Map
    beat.locations.set(finalName, newHotspot as any);

    // Update the choice's locationName to reference this new hotspot
    const newChoices = [...(localBeat.parameters?.choices || [])];
    newChoices[choiceIndex] = {
      ...newChoices[choiceIndex],
      locationName: finalName
    };

    // Update local state with the new choices
    const updatedBeat = {
      ...localBeat,
      parameters: {
        ...localBeat.parameters,
        choices: newChoices
      }
    };
    setLocalBeat(updatedBeat);

    // Trigger re-render to update availableLocations
    setLocationUpdateTrigger(prev => prev + 1);

    // Use rebuildConnectionsAndUpdate to persist the changes
    rebuildConnectionsAndUpdate(updatedBeat);
  };

  // Helper functions for Pick Prop
  const handleAddProp = () => {
    // Generate a unique prop name (New Prop 1, New Prop 2, etc.)
    const existingProps = localBeat.parameters?.props || [];
    let propNumber = existingProps.length + 1;
    let propName = `New Prop ${propNumber}`;

    // Ensure the name is unique
    const existingNames = new Set(existingProps.map((p: any) => p.name));
    while (existingNames.has(propName)) {
      propNumber++;
      propName = `New Prop ${propNumber}`;
    }

    const newProp: PropWithEffect = {
      id: `prop_${Date.now()}`,
      name: propName,
      description: '',
      target: ''
    };
    handleParameterChange('props', [...existingProps, newProp]);
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

  // Create a new hotspot for a PickProp option (similar to handleCreateHotspotForChoice)
  const handleCreateHotspotForProp = (propIndex: number) => {
    if (!beat || !onUpdate) return;

    const prop = localBeat.parameters?.props?.[propIndex];
    if (!prop) return;

    // Generate a unique hotspot name based on prop name
    const hotspotName = prop.name || `Prop ${propIndex + 1}`;

    // Check if a hotspot with this name already exists
    const existingNames = new Set(
      Array.from(beat.locations?.values() || []).map(loc => loc.name)
    );
    let finalName = hotspotName;
    let counter = 1;
    while (existingNames.has(finalName)) {
      finalName = `${hotspotName} (${counter})`;
      counter++;
    }

    // Create a new hotspot location
    const newHotspot = {
      kind: 'hotspot' as const,
      name: finalName,
      x: 100 + (propIndex * 50), // Stagger positions
      y: 300 + (propIndex * 60),
      width: 150,
      height: 50,
      zIndex: 10 + propIndex,
    };

    // Directly add to the beat's locations Map
    beat.locations.set(finalName, newHotspot as any);

    // Update the prop's locationName to reference this new hotspot
    const newProps = [...(localBeat.parameters?.props || [])];
    newProps[propIndex] = {
      ...newProps[propIndex],
      locationName: finalName
    };

    // Update local state with the new props
    const updatedBeat = {
      ...localBeat,
      parameters: {
        ...localBeat.parameters,
        props: newProps
      }
    };
    setLocalBeat(updatedBeat);

    // Trigger re-render to update availableLocations
    setLocationUpdateTrigger(prev => prev + 1);

    // Use rebuildConnectionsAndUpdate to persist the changes
    rebuildConnectionsAndUpdate(updatedBeat);
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
      case 'infoText':
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
      // Initialize backgroundSound from beat.sound (prefer assetId over file)
      if (!beatData.parameters.backgroundSound) {
        beatData.parameters.backgroundSound = beatData.sound?.assetId || beatData.sound?.file || '';
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
      
      
      // SetTimer parameter mapping - ensure consistency with beat's internal state
      if (beat.type === 'setTimer' && beatData.parameters) {
        const beatParams = beat.getParameters ? beat.getParameters() : {};

        // Always sync from beat's canonical state
        if (!beatData.parameters.timerName) {
          beatData.parameters.timerName = beatParams.timerName || '';
        }
        if (!beatData.parameters.timerTarget) {
          beatData.parameters.timerTarget = beatParams.timerTarget || '';
        }
        if (beatData.parameters.value === undefined) {
          beatData.parameters.value = beatParams.value ?? 60;
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
  // Note: We need to re-sync when beat parameters change (e.g., after merging dialog trees).
  // The _version field is incremented in updateParameters() to trigger re-sync.
  }, [beat?.id, beat?.name, (beat as any)?._version]);

  if (!beat || !localBeat) {
    return (
      <div
        className="h-full bg-white border-l border-gray-200 flex flex-col relative"
        style={{ width: inspectorWidth }}
      >
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
      case 'infoText':
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
      case 'condition':
      case 'conditionCheck':
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
        if ((localBeat.parameters?.value ?? 60) !== 0 && !localBeat.parameters?.timerTarget) errors.push('Timer target is required');
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

    // For fields that affect graph visualization or need immediate persistence, update immediately
    if (field === 'defaultTarget' || field === 'defaultTargetDelay' || field === 'showTimer' || field === 'name' || field === 'notes' || field === 'timeDisplayMode' || field === 'timeDisplayText' || field === 'overrideCountdownMeter') {
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
    beat.defaultTargetDelay = beatToUpdate.defaultTargetDelay;
    beat.showTimer = beatToUpdate.showTimer;
    beat.transition = beatToUpdate.transition;

    // Convert backgroundSound from parameters to proper Sound object
    const backgroundSoundId = beatToUpdate.parameters?.backgroundSound;
    if (backgroundSoundId) {
      beat.sound = {
        file: backgroundSoundId,  // For compatibility
        assetId: backgroundSoundId,  // Preferred reference
        volume: beatToUpdate.sound?.volume ?? 1.0,
        loop: beatToUpdate.sound?.loop ?? false,
      };
    } else {
      beat.sound = undefined;
    }

    // Update parameters
    if (beatToUpdate.parameters && beat.updateParameters) {
      const parameters = { ...beatToUpdate.parameters };

      // Ensure button text is saved for applicable beats
      if (['titleScreen', 'infoText', 'durScreen', 'endScreen'].includes(beat.type)) {
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

    } else if (beat.type === 'aiDialogTree') {
      // AI Dialog Tree connections from exitTargets
      const exitTargets = beatToUpdate.parameters?.exitTargets || [];
      exitTargets.forEach((target: any) => {
        if (target.id) {
          beat.addConnection({
            targetId: target.id,
            label: target.description ? target.description.substring(0, 30) + (target.description.length > 30 ? '...' : '') : 'Exit'
          });
        }
      });

    } else if (beat.type === 'aiCondition') {
      // AI Condition connections from categories + fallback
      const categories = beatToUpdate.parameters?.categories || [];
      categories.forEach((category: any) => {
        if (category.targetId) {
          beat.addConnection({
            targetId: category.targetId,
            label: category.name || 'Category'
          });
        }
      });
      // Add fallback target
      if (beatToUpdate.parameters?.fallbackTarget) {
        beat.addConnection({
          targetId: beatToUpdate.parameters.fallbackTarget,
          label: 'Fallback'
        });
      }

    } else if (beat.type === 'setTimer') {
      // Timer target connection (from parameters)
      if (beatToUpdate.parameters?.timerTarget) {
        beat.addConnection({
          targetId: beatToUpdate.parameters.timerTarget,
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
          if (choice.target && choice.target !== '__self__') {
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
      beat.defaultTargetDelay = localBeat.defaultTargetDelay;
      beat.showTimer = localBeat.showTimer;
      beat.transition = localBeat.transition;
      beat.notes = localBeat.notes;

      // Convert backgroundSound from parameters to proper Sound object
      const bgSoundId = localBeat.parameters?.backgroundSound;
      if (bgSoundId) {
        beat.sound = {
          file: bgSoundId,
          assetId: bgSoundId,
          volume: localBeat.sound?.volume ?? 1.0,
          loop: localBeat.sound?.loop ?? false,
        };
      } else {
        beat.sound = undefined;
      }

      if (localBeat.parameters && beat.updateParameters) {
        const parameters = { ...localBeat.parameters };

        // Ensure button text is saved for applicable beats
        if (['titleScreen', 'infoText', 'durScreen', 'endScreen'].includes(beat.type)) {
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

      } else if (beat.type === 'aiDialogTree') {
        // AI Dialog Tree connections from exitTargets
        const exitTargets = localBeat.parameters?.exitTargets || [];
        exitTargets.forEach((target: any) => {
          if (target.id) {
            beat.addConnection({
              targetId: target.id,
              label: target.description ? target.description.substring(0, 30) + (target.description.length > 30 ? '...' : '') : 'Exit'
            });
          }
        });

      } else if (beat.type === 'aiCondition') {
        // AI Condition connections from categories + fallback
        const categories = localBeat.parameters?.categories || [];
        categories.forEach((category: any) => {
          if (category.targetId) {
            beat.addConnection({
              targetId: category.targetId,
              label: category.name || 'Category'
            });
          }
        });
        // Add fallback target
        if (localBeat.parameters?.fallbackTarget) {
          beat.addConnection({
            targetId: localBeat.parameters.fallbackTarget,
            label: 'Fallback'
          });
        }

      } else if (beat.type === 'setTimer') {
        // Timer target connection (from parameters)
        if (localBeat.parameters?.timerTarget) {
          beat.addConnection({
            targetId: localBeat.parameters.timerTarget,
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
            if (choice.target && choice.target !== '__self__') {
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
  const useVisualEditorWidth = activeTab === 'visual' && supportsVisualEditor(beat.type);

  return (
    <>
      <div
        className={`h-full bg-white border-l border-gray-200 flex flex-col relative ${useVisualEditorWidth ? 'w-full max-w-7xl' : ''}`}
        style={useVisualEditorWidth ? undefined : { width: inspectorWidth }}
      >
        {/* Resize Handle */}
        {!useVisualEditorWidth && (
          <div
            ref={resizeHandleRef}
            onMouseDown={handleResizeStart}
            className={`absolute left-0 top-0 w-1 h-full cursor-ew-resize hover:bg-blue-500 transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-400'}`}
            style={{ zIndex: 50 }}
          />
        )}
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
                    title="A descriptive name for this beat. This name appears in the graph editor and helps you identify beats in your story."
                  />
                </div>

                {/* Background Sound for ALL beats */}
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    title="Play a sound or music when this beat starts. The sound will loop until the player leaves this beat."
                  >
                    <Music className="w-4 h-4 inline mr-1" />
                    Background Sound
                  </label>
                  {localBeat.parameters?.backgroundSound ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm truncate">
                        {assets?.find(a => a.id === localBeat.parameters?.backgroundSound)?.name ||
                         localBeat.parameters.backgroundSound.substring(0, 8) + '...'}
                      </div>
                      <button
                        onClick={() => handleAssetSelection('sound', (asset) => {
                          handleParameterChange('backgroundSound', asset.id);
                        })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                        title="Change sound"
                      >
                        Change
                      </button>
                      <button
                        onClick={() => handleParameterChange('backgroundSound', '')}
                        className="px-2 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
                        title="Remove sound"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAssetSelection('sound', (asset) => {
                        handleParameterChange('backgroundSound', asset.id);
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                    >
                      Add Background Sound
                    </button>
                  )}
                </div>

                {/* BEAT-SPECIFIC PARAMETERS - SCHEMA DRIVEN */}

                {/* Schema-driven simple parameters */}
                {/* Exclude beat types that have custom hardcoded editors */}
                {beat.type !== 'dialogTree' && beat.type !== 'movementChoice' &&
                 beat.type !== 'pickProp' && getCanonicalBeatType(beat.type) !== 'conditionBeat' &&
                 beat.type !== 'setTimer' && beat.type !== 'randomTarget' &&
                 beat.type !== 'hyperText' && beat.type !== 'keypad' && (
                  <SchemaFormGenerator
                    beatType={beat.type}
                    beatDefinition={getBeatDefinition(beat.type)}
                    parameters={localBeat.parameters}
                    onParameterChange={handleParameterChange}
                    availableTargets={availableTargets}
                    characters={getAvailableCharacters()}
                    availableCounters={availableCounters}
                    availableVariables={availableVariables}
                  />
                )}

                {/* Condition Beat */}
                {getCanonicalBeatType(beat.type) === 'conditionBeat' && (
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
                        <option value="fictionalTime">Fictional Time</option>
                      </select>
                    </div>
                    
                    {/* Counter Condition */}
                    {localBeat.parameters?.conditionType === 'counter' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Counter Name
                          </label>
                          <SmartNameDropdown
                            value={localBeat.parameters?.variableName || localBeat.parameters?.left || ''}
                            onChange={(val) => handleParameterChange('variableName', val || '')}
                            options={availableCounters.map(c => ({
                              name: c.name,
                              displayName: c.displayName,
                              characterName: c.characterName,
                            }))}
                            placeholder="e.g., courage"
                            newItemLabel="+ New counter..."
                            noSelectionLabel="Select counter..."
                            className="w-full"
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
                          <SmartNameDropdown
                            value={localBeat.parameters?.counter1 || ''}
                            onChange={(val) => handleParameterChange('counter1', val || '')}
                            options={availableCounters.map(c => ({
                              name: c.name,
                              displayName: c.displayName,
                              characterName: c.characterName,
                            }))}
                            placeholder="e.g., courage"
                            newItemLabel="+ New counter..."
                            noSelectionLabel="Select counter..."
                            className="w-full"
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
                          <SmartNameDropdown
                            value={localBeat.parameters?.counter2 || ''}
                            onChange={(val) => handleParameterChange('counter2', val || '')}
                            options={availableCounters.map(c => ({
                              name: c.name,
                              displayName: c.displayName,
                              characterName: c.characterName,
                            }))}
                            placeholder="e.g., wisdom"
                            newItemLabel="+ New counter..."
                            noSelectionLabel="Select counter..."
                            className="w-full"
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
                          <SmartNameDropdown
                            value={localBeat.parameters?.variableName || localBeat.parameters?.variable || localBeat.parameters?.left || ''}
                            onChange={(val) => handleParameterChange('variableName', val || '')}
                            options={availableVariables.map(v => ({
                              name: v.name,
                              displayName: v.description ? `${v.name} (${v.description})` : v.name,
                            }))}
                            placeholder="e.g., playerName"
                            newItemLabel="+ New variable..."
                            noSelectionLabel="Select variable..."
                            className="w-full"
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
                          <SmartNameDropdown
                            value={localBeat.parameters?.item || ''}
                            onChange={(val) => handleParameterChange('item', val || '')}
                            options={availableInventoryItems.map(i => ({
                              name: i.name,
                              displayName: i.displayName,
                              characterName: i.characterName,
                            }))}
                            placeholder="e.g., magic_key"
                            newItemLabel="+ New item..."
                            noSelectionLabel="Select item..."
                            className="w-full"
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
                            <option value="quantity">Check Quantity</option>
                          </select>
                        </div>
                        {/* Quantity check fields - shown when checkType is 'quantity' */}
                        {localBeat.parameters?.checkType === 'quantity' && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Compare What
                                <span className="text-xs text-gray-500 block">
                                  What value to check
                                </span>
                              </label>
                              <select
                                value={localBeat.parameters?.compareSource || 'inventory'}
                                onChange={(e) => handleParameterChange('compareSource', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="inventory">Item Quantity in Inventory</option>
                                <option value="variable">Variable/Counter Value</option>
                              </select>
                            </div>
                            {localBeat.parameters?.compareSource === 'variable' && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Variable to Check
                                  <span className="text-xs text-gray-500 block">
                                    e.g., goldOffer (without $)
                                  </span>
                                </label>
                                <input
                                  type="text"
                                  value={localBeat.parameters?.compareVariable || ''}
                                  onChange={(e) => handleParameterChange('compareVariable', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                  placeholder="e.g., goldOffer"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Comparison
                              </label>
                              <select
                                value={localBeat.parameters?.quantityOperator || '>='}
                                onChange={(e) => handleParameterChange('quantityOperator', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value=">=">At Least (≥)</option>
                                <option value=">">More Than (&gt;)</option>
                                <option value="==">Exactly (=)</option>
                                <option value="<">Less Than (&lt;)</option>
                                <option value="<=">At Most (≤)</option>
                                <option value="!=">Not Equal (≠)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Threshold Value
                                <span className="text-xs text-gray-500 block">
                                  Number or $variableName
                                </span>
                              </label>
                              <input
                                type="text"
                                value={localBeat.parameters?.quantityValue ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  // If it's a pure number, convert it
                                  const numVal = parseFloat(val);
                                  handleParameterChange('quantityValue',
                                    !isNaN(numVal) && !val.startsWith('$') ? numVal : val
                                  );
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="e.g., 50 or $requiredAmount"
                              />
                            </div>
                            {/* Preview of what the comparison evaluates to */}
                            <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
                              <strong>Evaluates:</strong>{' '}
                              {localBeat.parameters?.compareSource === 'variable'
                                ? `$${localBeat.parameters?.compareVariable || 'variable'}`
                                : `${localBeat.parameters?.item || 'Item'} quantity`
                              }
                              {' '}{localBeat.parameters?.quantityOperator || '>='}{' '}
                              {localBeat.parameters?.quantityValue || 'threshold'}
                            </div>
                          </>
                        )}
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

                    {/* Fictional Time Condition */}
                    {localBeat.parameters?.conditionType === 'fictionalTime' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Operator
                          </label>
                          <select
                            value={localBeat.parameters?.operator || '>'}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="<">Before</option>
                            <option value=">">After</option>
                            <option value="==">Exactly</option>
                            <option value="!=">Not</option>
                            <option value=">=">At or After</option>
                            <option value="<=">At or Before</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Compare Against Date</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={localBeat.parameters?.timeDay ?? 1}
                              onChange={(e) => handleParameterChange('timeDay', Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                              min={1} max={31}
                              title="Day"
                            />
                            <select
                              value={localBeat.parameters?.timeMonth ?? 1}
                              onChange={(e) => handleParameterChange('timeMonth', parseInt(e.target.value))}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => (
                                <option key={i + 1} value={i + 1}>{name}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={localBeat.parameters?.timeYear ?? 2024}
                              onChange={(e) => handleParameterChange('timeYear', parseInt(e.target.value) || 2024)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                              title="Year"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Compare Against Time</label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              value={localBeat.parameters?.timeHour ?? 0}
                              onChange={(e) => handleParameterChange('timeHour', Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                              min={0} max={23}
                              title="Hour (0-23)"
                            />
                            <span className="text-gray-500">:</span>
                            <input
                              type="number"
                              value={localBeat.parameters?.timeMinute ?? 0}
                              onChange={(e) => handleParameterChange('timeMinute', Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                              min={0} max={59}
                              title="Minute (0-59)"
                            />
                          </div>
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
                        <span className="text-xs text-gray-500 block">
                          Set to 0 to clear an existing timer
                        </span>
                      </label>
                      <input
                        type="number"
                        value={localBeat.parameters?.value ?? 60}
                        onChange={(e) => handleParameterChange('value', parseInt(e.target.value) || 0)}
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className={`${(localBeat.parameters?.value ?? 60) === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Timer Target Beat {(localBeat.parameters?.value ?? 60) !== 0 && <span className="text-red-500">*</span>}
                        <span className="text-xs text-gray-500 block">
                          {(localBeat.parameters?.value ?? 60) === 0 ? 'Not needed when clearing a timer' : 'Beat to jump to when timer expires'}
                        </span>
                      </label>
                      <select
                        value={localBeat.parameters?.timerTarget || ''}
                        onChange={(e) => {
                          const targetId = e.target.value;
                          handleParameterChange('timerTarget', targetId);
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
                    {/* Timer HUD override */}
                    <div className="border-t pt-3 mt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localBeat.parameters?.showTimerHud || false}
                          onChange={(e) => handleParameterChange('showTimerHud', e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Show Timer HUD</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        Enable the timer HUD display for this timer, even if disabled globally.
                      </p>
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

                {/* Add/Remove Inventory Beat - handled by SchemaFormGenerator */}

                {/* HyperText Editor */}
                {beat.type === 'hyperText' && (
                  <div className="space-y-3">
                    <HyperTextEditor
                      text={localBeat.parameters?.text || ''}
                      hyperlinks={localBeat.parameters?.hyperlinks || []}
                      onChange={(text, hyperlinks) => {
                        // HyperTextEditor now uses word-based format directly
                        handleParameterChange('text', text);
                        handleParameterChange('hyperlinks', hyperlinks);
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

                {/* Keypad Beat Editor */}
                {beat.type === 'keypad' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prompt Text
                      </label>
                      <TextFieldWithVariables
                        value={localBeat.parameters?.prompt || ''}
                        onChange={(val) => handleParameterChange('prompt', val)}
                        placeholder="Enter the code..."
                        availableVariables={availableVariables}
                        multiline
                        rows={2}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Layout
                      </label>
                      <select
                        value={localBeat.parameters?.layout || 'numeric'}
                        onChange={(e) => handleParameterChange('layout', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="numeric">Numeric (1-9, ←, 0, ✓)</option>
                        <option value="phone">Phone (1-9, *, 0, #)</option>
                        <option value="pin">PIN (1-9, C, 0, ✓)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Digits
                        </label>
                        <input
                          type="number"
                          value={localBeat.parameters?.minDigits ?? 1}
                          onChange={(e) => handleParameterChange('minDigits', parseInt(e.target.value) || 1)}
                          min="1"
                          max="20"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Max Digits
                        </label>
                        <input
                          type="number"
                          value={localBeat.parameters?.maxDigits ?? 4}
                          onChange={(e) => handleParameterChange('maxDigits', parseInt(e.target.value) || 4)}
                          min="1"
                          max="20"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Correct Code
                        <span className="text-xs text-gray-500 ml-1">(leave empty to accept any)</span>
                      </label>
                      <input
                        type="text"
                        value={localBeat.parameters?.correctCode || ''}
                        onChange={(e) => handleParameterChange('correctCode', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="e.g., 1234"
                      />
                    </div>

                    {localBeat.parameters?.correctCode && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Max Attempts
                            <span className="text-xs text-gray-500 ml-1">(0 = unlimited)</span>
                          </label>
                          <input
                            type="number"
                            value={localBeat.parameters?.maxAttempts ?? 0}
                            onChange={(e) => handleParameterChange('maxAttempts', parseInt(e.target.value) || 0)}
                            min="0"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Fail Target Beat
                            <span className="text-xs text-gray-500 block">
                              Beat to go to when max attempts reached
                            </span>
                          </label>
                          <select
                            value={localBeat.parameters?.failTarget || ''}
                            onChange={(e) => handleParameterChange('failTarget', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">None (stay on keypad)</option>
                            {availableTargets.map(target => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="keypadMaskInput"
                        checked={localBeat.parameters?.maskInput ?? true}
                        onChange={(e) => handleParameterChange('maskInput', e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="keypadMaskInput" className="text-sm text-gray-700">
                        Mask Input (show • instead of digits)
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="keypadShowDisplay"
                        checked={localBeat.parameters?.showDisplay ?? true}
                        onChange={(e) => handleParameterChange('showDisplay', e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="keypadShowDisplay" className="text-sm text-gray-700">
                        Show Digit Display
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Submit Button Text
                        </label>
                        <input
                          type="text"
                          value={localBeat.parameters?.buttonText || 'Submit'}
                          onChange={(e) => handleParameterChange('buttonText', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Clear Button Text
                        </label>
                        <input
                          type="text"
                          value={localBeat.parameters?.clearButtonText || 'Clear'}
                          onChange={(e) => handleParameterChange('clearButtonText', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    {/* Save-to controls */}
                    <div className="border-t pt-3 mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Save Input To
                      </label>
                      <select
                        value={localBeat.parameters?.saveToType || 'variable'}
                        onChange={(e) => handleParameterChange('saveToType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="variable">Variable</option>
                        <option value="counter">Counter</option>
                      </select>
                    </div>

                    {localBeat.parameters?.saveToType === 'counter' ? (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Counter
                          </label>
                          <SmartNameDropdown
                            value={localBeat.parameters?.counter || ''}
                            onChange={(val) => handleParameterChange('counter', val)}
                            options={availableCounters.map(c => ({ name: c.name, displayName: c.displayName, characterName: c.characterName }))}
                            placeholder="Select or type counter name..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Operation
                          </label>
                          <select
                            value={localBeat.parameters?.counterOperation || 'set'}
                            onChange={(e) => handleParameterChange('counterOperation', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="set">Set to entered value</option>
                            <option value="change">Add entered value</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Variable Name
                        </label>
                        <SmartNameDropdown
                          value={localBeat.parameters?.variable || ''}
                          onChange={(val) => handleParameterChange('variable', val)}
                          options={availableVariables.map(v => ({ name: v.name, displayName: v.name }))}
                          placeholder="Select or type variable name..."
                        />
                      </div>
                    )}
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
                      counters={availableCounters.map(c => ({ name: c.name, displayName: c.displayName, characterName: c.characterName }))}
                      variables={availableVariables.map(v => v.name)}
                      availableCounters={availableCounters}
                      availableVariables={availableVariables}
                      availableInventoryItems={availableInventoryItems}
                    />

                    {showAdvanced && (
                      <div className="border-t pt-3 space-y-3">
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
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="markVisited-dialog"
                            checked={localBeat.parameters?.markVisited || false}
                            onChange={(e) => handleParameterChange('markVisited', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor="markVisited-dialog" className="text-sm text-gray-700">
                            Mark already visited choices
                            <span className="text-xs text-gray-500 block">
                              Dim choices leading to previously visited beats
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Movement Choice */}
                {beat.type === 'movementChoice' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                      <TextFieldWithVariables
                        value={localBeat.parameters?.question || 'Where do you want to go?'}
                        onChange={(val) => handleParameterChange('question', val)}
                        availableVariables={availableVariables}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    {showAdvanced && (
                      <div className="space-y-3">
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
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="markVisited-movement"
                            checked={localBeat.parameters?.markVisited || false}
                            onChange={(e) => handleParameterChange('markVisited', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor="markVisited-movement" className="text-sm text-gray-700">
                            Mark already visited choices
                            <span className="text-xs text-gray-500 block">
                              Dim choices leading to previously visited beats
                            </span>
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="showTextOnHover-movement"
                            checked={localBeat.parameters?.showTextOnHover || false}
                            onChange={(e) => handleParameterChange('showTextOnHover', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor="showTextOnHover-movement" className="text-sm text-gray-700">
                            Show text on hover only
                            <span className="text-xs text-gray-500 block">
                              Hotspot text appears when cursor hovers over it
                            </span>
                          </label>
                        </div>
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

                          {/* Hotspot/Prop Association */}
                          <div className="flex gap-2">
                            <select
                              value={choice.locationName || ''}
                              onChange={(e) => handleUpdateChoice(index, 'locationName', e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border rounded"
                              title="Associate this choice with a hotspot or prop from the Visual Editor"
                            >
                              <option value="">Auto-create hotspot</option>
                              {availableLocations.hotspots.length > 0 && (
                                <optgroup label="Hotspots">
                                  {availableLocations.hotspots.map((loc) => (
                                    <option key={`hotspot-${loc.name}`} value={loc.name}>
                                      🎯 {loc.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {availableLocations.props.length > 0 && (
                                <optgroup label="Props">
                                  {availableLocations.props.map((loc) => (
                                    <option key={`prop-${loc.name}`} value={loc.name}>
                                      📦 {loc.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleCreateHotspotForChoice(index)}
                              className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-1"
                              title="Create a new hotspot in the Visual Editor for this choice"
                            >
                              <MapPin className="w-3 h-3" />
                              New
                            </button>
                          </div>

                          <select
                            value={choice.target || ''}
                            onChange={(e) => handleUpdateChoice(index, 'target', e.target.value)}
                            className="w-full px-2 py-1 text-sm border rounded"
                          >
                            <option value="">Select target beat...</option>
                            <option value="__self__">↩ Return to initial choices</option>
                            {availableTargets.map(target => (
                              <option key={target.id} value={target.id}>
                                {target.name} ({target.id})
                              </option>
                            ))}
                          </select>
                          
                          {showAdvanced && (
                            <div className="p-2 bg-blue-50 rounded space-y-2">
                              <div className="text-xs font-medium text-blue-700">Effects (Optional)</div>
                              <ChoiceEffectsEditor
                                effects={choice.effects || []}
                                onChange={(newEffects) => handleUpdateChoice(index, 'effects', newEffects)}
                                availableCounters={availableCounters}
                                availableVariables={availableVariables}
                                availableInventoryItems={availableInventoryItems}
                                compact
                              />
                              <div className="mt-2 pt-2 border-t border-blue-200">
                                <div className="text-xs font-medium text-blue-700 mb-1">Sound Effect (Optional)</div>
                                <input
                                  type="text"
                                  value={choice.soundEffect || ''}
                                  onChange={(e) => handleUpdateChoice(index, 'soundEffect', e.target.value)}
                                  placeholder="Sound file (e.g., click.mp3)"
                                  className="w-full px-2 py-1 text-xs border rounded"
                                />
                              </div>
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
                      <TextFieldWithVariables
                        value={localBeat.parameters?.question || 'What do you want to pick up?'}
                        onChange={(val) => handleParameterChange('question', val)}
                        availableVariables={availableVariables}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    {showAdvanced && (
                      <div className="space-y-3">
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
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="markVisited-pickprop"
                            checked={localBeat.parameters?.markVisited || false}
                            onChange={(e) => handleParameterChange('markVisited', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor="markVisited-pickprop" className="text-sm text-gray-700">
                            Mark already visited choices
                            <span className="text-xs text-gray-500 block">
                              Dim choices leading to previously visited beats
                            </span>
                          </label>
                        </div>
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

                          {/* Visual Element Association - like movementChoice */}
                          <div className="flex gap-2">
                            <select
                              value={(prop as any).locationName || ''}
                              onChange={(e) => handleUpdateProp(index, 'locationName', e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border rounded"
                              title="Associate this prop with a hotspot or prop from the Visual Editor"
                            >
                              <option value="">Auto-create hotspot</option>
                              {availableLocations.hotspots.length > 0 && (
                                <optgroup label="Hotspots">
                                  {availableLocations.hotspots.map((loc) => (
                                    <option key={`hotspot-${loc.name}`} value={loc.name}>
                                      🎯 {loc.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {availableLocations.props.length > 0 && (
                                <optgroup label="Props">
                                  {availableLocations.props.map((loc) => (
                                    <option key={`prop-${loc.name}`} value={loc.name}>
                                      📦 {loc.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleCreateHotspotForProp(index)}
                              className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-1"
                              title="Create a new hotspot in the Visual Editor for this prop"
                            >
                              <MapPin className="w-3 h-3" />
                              New
                            </button>
                          </div>

                          {/* Inventory Name Override - allows different name in inventory than displayed */}
                          <div>
                            <label className="text-xs text-gray-600 mb-1 block">
                              Inventory Name (overrides display name)
                            </label>
                            <input
                              type="text"
                              value={(prop as any).inventoryName || ''}
                              onChange={(e) => handleUpdateProp(index, 'inventoryName', e.target.value)}
                              placeholder={(prop as any).locationName || prop.name || 'Same as prop name'}
                              className="w-full px-2 py-1 text-sm border rounded"
                            />
                            <span className="text-xs text-gray-400">
                              Name added to inventory when picked. Leave empty to use "{(prop as any).locationName || prop.name || 'prop name'}"
                            </span>
                          </div>

                          {/* Prop Graphic Asset Selector */}
                          <div>
                            <label className="text-xs text-gray-600 mb-1 block">Prop Graphic (optional)</label>
                            <select
                              value={(prop as any).assetId || ''}
                              onChange={(e) => handleUpdateProp(index, 'assetId', e.target.value || undefined)}
                              className="w-full px-2 py-1 text-sm border rounded"
                            >
                              <option value="">None (use button)</option>
                              {assets.filter(a => a.type === 'image').map(asset => (
                                <option key={asset.id} value={asset.id}>{asset.name}</option>
                              ))}
                            </select>
                            <span className="text-xs text-gray-400">
                              Select an image to display as clickable prop
                            </span>
                          </div>

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
                          
                          {/* Effects (counter/variable only — inventory handled inherently by pickProp) */}
                          <div className="p-2 bg-blue-50 rounded space-y-2">
                            <div className="text-xs font-medium text-blue-700">Effects (Optional)</div>
                            <ChoiceEffectsEditor
                              effects={prop.effects || []}
                              onChange={(newEffects) => handleUpdateProp(index, 'effects', newEffects)}
                              availableCounters={availableCounters}
                              availableVariables={availableVariables}
                              availableInventoryItems={availableInventoryItems}
                              hideInventory
                              compact
                            />
                            <div className="mt-2 pt-2 border-t border-blue-200">
                              <div className="text-xs font-medium text-blue-700 mb-1">Sound Effect (Optional)</div>
                              <input
                                type="text"
                                value={prop.soundEffect || ''}
                                onChange={(e) => handleUpdateProp(index, 'soundEffect', e.target.value)}
                                placeholder="Sound file (e.g., pickup.mp3)"
                                className="w-full px-2 py-1 text-xs border rounded"
                              />
                            </div>
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
                    {connectionType === 'conditional' && getCanonicalBeatType(beat.type) === 'conditionBeat' && (
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

                {/* Auto-Advance / Timer Settings - shown when advanced is toggled, only for visible beats */}
                {showAdvanced && !['conditionBeat', 'setVariable', 'randomTarget', 'setTimer', 'addRemoveInventory', 'aiCondition'].includes(getCanonicalBeatType(beat.type)) && (
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

                    {/* Time Display Override (for Timer HUD) */}
                    <div className="border-t pt-3 mt-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Time Display</h4>
                      <select
                        value={localBeat.timeDisplayMode || 'fictionalTime'}
                        onChange={(e) => {
                          const mode = e.target.value;
                          handleChange('timeDisplayMode', mode);
                          // Clear manual text when switching away from manual
                          if (mode !== 'manual') {
                            handleChange('timeDisplayText', '');
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="fictionalTime">Fictional Time (default)</option>
                        <option value="manual">Manual text</option>
                        <option value="none">None (hide on this beat)</option>
                      </select>
                      {localBeat.timeDisplayMode === 'manual' && (
                        <input
                          type="text"
                          value={localBeat.timeDisplayText || ''}
                          onChange={(e) => handleChange('timeDisplayText', e.target.value)}
                          placeholder="e.g. Meanwhile..., 2h later"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                        />
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Controls what the Timer HUD shows on this beat.
                      </p>
                    </div>

                    {/* Override Countdown Meter Visibility */}
                    <div className="border-t pt-3 mt-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localBeat.overrideCountdownMeter || false}
                          onChange={(e) => handleChange('overrideCountdownMeter', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span>{globalSettings?.hudOverlays?.countdownMeter?.showByDefault !== false
                          ? 'Hide countdown meter'
                          : 'Show countdown meter'}</span>
                      </label>
                      <p className="text-xs text-gray-500 ml-6 mt-1">
                        {globalSettings?.hudOverlays?.countdownMeter?.showByDefault !== false
                          ? 'Hide the countdown meter HUD on this beat (e.g. for title screens or cutscenes).'
                          : 'Show the countdown meter HUD on this beat (overrides the global "hide by default" setting).'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Notes Section - Collapsible */}
                <div className="border-t pt-4">
                  <button
                    onClick={() => setShowNotes(!showNotes)}
                    className="w-full py-2 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 rounded-lg"
                  >
                    {showNotes ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <StickyNote className="w-4 h-4" />
                    Notes
                    {localBeat.notes && (
                      <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        Has notes
                      </span>
                    )}
                  </button>

                  {showNotes && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={localBeat.notes || ''}
                        onChange={(e) => handleChange('notes', e.target.value)}
                        placeholder="Add author notes (not shown to player)..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y min-h-[80px] max-h-[200px]"
                        rows={3}
                      />
                      <p className="text-xs text-gray-500">
                        These notes are for authors only and will not be displayed to players.
                      </p>
                    </div>
                  )}
                </div>

                {/* Advanced Settings Toggle - only for visible beats (not logic/invisible beats) */}
                {!['conditionBeat', 'setVariable', 'randomTarget', 'setTimer', 'addRemoveInventory', 'aiCondition'].includes(getCanonicalBeatType(beat.type)) && (
                <div className="border-t pt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                  </button>
                </div>
                )}

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