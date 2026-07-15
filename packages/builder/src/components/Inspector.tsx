import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Beat, synthesizeEffectsFromLegacyParams, suggestDurationSeconds } from '@asaps/core';
import { X, Save, Trash2, Copy, Info, Plus, Link, Unlink, MapPin, Package, Settings, AlertCircle, MessageSquare, Image, Palette, Music, Volume2, Timer, Variable, Box, StickyNote, ChevronDown, ChevronRight, Globe, ShieldCheck } from 'lucide-react';
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
import { resolveLayoutMode } from '../utils/projectLayoutMode';
import { extractStoryStateReferences } from '../utils/storyStateExtraction';
import { resolveTranslatedSpeakerName } from '../utils/speakerUtils';
import { useUsedNames } from './characters/useUsedNames';
import { ChoiceEffectsEditor } from '../editors/ChoiceEffectsEditor';
import { XRLocationsEditor, type XRLocationEntry } from '../editors/XRLocationsEditor';
import { RequirementsEditor } from '../editors/RequirementsEditor';
import { AsapsQRGenerator } from './inspector/AsapsQRGenerator';
import { SmartNameDropdown } from '../editors/SmartNameDropdown';
import { CounterOwnerPicker } from './CounterOwnerPicker';
import {
  groupConditionTemplates,
  findConditionTemplate,
  conditionToFlatParams,
} from '../editors/conditionTemplates';
import { SpatialPositionEditor, type SpatialPosition } from '../editors/SpatialPositionEditor';
import { TextFieldWithVariables } from '../editors/TextFieldWithVariables';
import { useTranslationState, useTranslationActions } from '../contexts/TranslationContext';
import { getAllTranslationEntriesForBeat } from '../export/StoryTranslator';
import { useVCSStatus } from '../vcs/VCSStatusProvider';

// Helper to set a value at a dot-separated path in a nested object/array.
// e.g. setNestedValue(obj, "choices.0.text", "hello") sets obj.choices[0].text = "hello"
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? parseInt(parts[i]) : parts[i];
    if (current[key] === undefined || current[key] === null) return;
    current = current[key];
  }
  const lastKey = /^\d+$/.test(parts[parts.length - 1])
    ? parseInt(parts[parts.length - 1])
    : parts[parts.length - 1];
  current[lastKey] = value;
}

// Walk two dialog trees and update translation entries for any text/speaker changes.
function diffDialogTreeTranslations(
  oldTree: any, newTree: any, pathPrefix: string,
  resource: any, translationActions: any, langCode: string
): void {
  if (!oldTree || !newTree) return;

  // Check speaker and text fields on this node
  if (newTree.speaker !== oldTree.speaker) {
    const key = `${pathPrefix}.speaker`;
    if (resource.strings[key]) {
      translationActions.updateTranslation(langCode, key, newTree.speaker);
    }
  }
  if (newTree.text !== oldTree.text) {
    const key = `${pathPrefix}.text`;
    if (resource.strings[key]) {
      translationActions.updateTranslation(langCode, key, newTree.text);
    }
  }

  // Walk choices
  if (Array.isArray(oldTree.choices) && Array.isArray(newTree.choices)) {
    const len = Math.min(oldTree.choices.length, newTree.choices.length);
    for (let i = 0; i < len; i++) {
      const oldChoice = oldTree.choices[i];
      const newChoice = newTree.choices[i];
      if (newChoice.text !== oldChoice.text) {
        const key = `${pathPrefix}.choices.${i}.text`;
        if (resource.strings[key]) {
          translationActions.updateTranslation(langCode, key, newChoice.text);
        }
      }
      // Recurse into nested dialog nodes
      if (oldChoice.dialogNode && newChoice.dialogNode) {
        diffDialogTreeTranslations(
          oldChoice.dialogNode, newChoice.dialogNode,
          `${pathPrefix}.choices.${i}.dialogNode`,
          resource, translationActions, langCode
        );
      }
    }
  }
}

// Type definitions
interface ChoiceWithCounter {
  id: string;
  text: string;
  displayText?: string;  // Translated label for display
  location?: string;
  locationName?: string;  // References a hotspot/prop from beat.locations by name
  target?: string;
  effects?: any[];
  soundEffect?: string;
}

interface PropWithEffect {
  id: string;
  name: string;
  displayName?: string;  // Translated name for display
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
  /** Real story title for AI context (beat suggestions) */
  storyTitle?: string;
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
  /** Sync NPC name/personality back to character definitions. Creates new NPC if not found. */
  onCharacterSync?: (npcName: string, updates: { description?: string }) => void;
  // For counter/variable dropdowns
  characters?: Character[];
  /** Project emotion palette — passed down to ChoiceEffectsEditor so the
   *  fireEmotion / addSentiment emotion fields can offer combobox
   *  auto-complete from the project's authored palette. */
  emotionPalette?: ReadonlyArray<import('@asaps/core').EmotionDefinition>;
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
  storyTitle,
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
  onCharacterSync,
  characters = [],
  emotionPalette,
  globalSettings,
  width: externalWidth,
  onWidthChange,
}) => {
  const [localBeat, setLocalBeat] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'properties' | 'visual'>('properties');

  // P3-3c-15 — spatial hotspots only fire at runtime when the beat
  // composes through SpatialFlowView. In FIXED projects that needs
  // baked locations to be absent — otherwise the absolute path wins
  // and any choice.hotspot is inert. In RESPONSIVE projects the
  // runtime now treats hotspots as authoritative even with leftover
  // baked positions (see commit ee44c110), so the warning is stale
  // there.
  const beatHasAuthorLocations = !!beat && (beat.locations?.size ?? 0) > 0;
  const projectIsResponsive =
    resolveLayoutMode(globalSettings as any, allBeats as any) === 'responsive';
  // Show the "Inactive" warning only when the runtime would actually
  // skip the hotspot — i.e. fixed project AND baked positions exist.
  const hotspotIsInactive = beatHasAuthorLocations && !projectIsResponsive;

  // P3-3c-7 — bidirectional hotspot hover link. Canvas dispatches
  // `asaps:hotspotHover` with the hovered choice id (or null on leave);
  // we mirror it into local state so the matching choice card lights
  // up. The choice card below dispatches `asaps:choiceHover` so the
  // canvas hotspot highlights in reverse.
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string | null } | undefined;
      setHoveredHotspotId(detail?.id ?? null);
    };
    window.addEventListener('asaps:hotspotHover', handler);
    return () => window.removeEventListener('asaps:hotspotHover', handler);
  }, []);
  const dispatchChoiceHover = (id: string | null) => {
    window.dispatchEvent(new CustomEvent('asaps:choiceHover', { detail: { id } }));
  };

  // Translation state
  const translationState = useTranslationState();
  const translationActions = useTranslationActions();
  // VCS status — for advisory editing lock warnings
  const vcs = useVCSStatus();
  const editingUser = beat && vcs?.initialized && vcs.type !== 'none' ? vcs.getLockedBy(beat.id) : null;
  // Stores source (untranslated) parameter values when in translation mode,
  // so we can show them as dimmed reference below the editable fields.
  const sourceParametersRef = useRef<Record<string, any>>({});
  // durScreen: once the author manually edits the duration field, stop
  // auto-recalculating it from the text. Resets per selected beat.
  const durationManualRef = useRef(false);

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

  // Get available counters, variables, and inventory items for dropdowns.
  // These are the declared sets (from characters + globalSettings).
  const availableCounters = useAvailableCounters(characters);
  const availableVariables = useAvailableVariables(globalSettings || null);
  const availableInventoryItems = useAvailableInventoryItems(characters);

  // Many stories (including AI-generated ones) reference items/counters/variables
  // without declaring them up-front on a character or in global settings. Scan
  // every beat so dropdowns show the actual working set; we union this with the
  // declared sets below.
  const storyStateRefs = useMemo(
    () => extractStoryStateReferences(allBeats as any),
    [allBeats],
  );

  // Free-text speaker / character names used elsewhere in the project — feeds
  // the "Used names" section of the new <CharacterRefField> combobox.
  const usedNames = useUsedNames(allBeats as any, characters as any);

  // Bridge from <CharacterRefField>'s "Define '<name>' as a Character" link to
  // the existing onOpenCharacterManager prop. Opens the Character Manager;
  // the user fills in details and saves there.
  const onDefineAsCharacter = useCallback((name: string) => {
    if (typeof onOpenCharacterManager === 'function') {
      // Pre-fill with the typed name. The Character Manager's create flow can
      // read the name and prepopulate the new-character form.
      (window as any).__asapsPrefillCharacterName = name;
      onOpenCharacterManager();
    }
  }, [onOpenCharacterManager]);

  // Force re-render trigger for when we modify beat.locations directly
  const [locationUpdateTrigger, setLocationUpdateTrigger] = useState(0);

  // Get available hotspots and props from beat.locations for MovementChoice/PickProp association
  // Dependencies include locations.size and activeTab to refresh when locations change or tab switches
  // Recompute on every render — beat.locations is a Map mutated externally by the VE,
  // so useMemo with reference-based deps can never reliably detect changes.
  const availableLocations = (() => {
    if (!beat || !beat.locations) return { hotspots: [] as any[], props: [] as any[], characters: [] as any[] };

    const locations = Array.from(beat.locations.values());
    const hotspots = locations.filter(loc => loc.kind === 'hotspot');
    const props = locations.filter(loc => loc.kind === 'prop');
    const characters = locations.filter(loc => loc.kind === 'character');

    return { hotspots, props, characters };
  })();

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

  // Get the player character's display name (if any)
  const playerCharacterName = useMemo(() => {
    const pc = characters.find(c => c.role === 'player');
    return pc ? (pc.displayName || pc.name) : undefined;
  }, [characters]);

  // Resolve speaker names to translated display names when a translation language is active
  const speakerNameResolver = useMemo(() => {
    if (!translationState.activeLanguage || !characters.length) return undefined;
    return (name: string) => resolveTranslatedSpeakerName(name, characters, translationState.activeLanguage) || name;
  }, [translationState.activeLanguage, characters]);

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
    // In translation mode, route text/speaker changes to the translation resource
    // while keeping the source beat data unchanged.
    if (translationState.activeLanguage && beat) {
      const resource = translationState.translations.find(
        t => t.languageCode === translationState.activeLanguage
      );
      if (resource) {
        // Walk both the old (translated) tree and new tree to find text/speaker changes
        const prefix = `beat:${beat.id}.parameters.dialogTree`;
        diffDialogTreeTranslations(
          localBeat.parameters?.dialogTree, newDialogTree, prefix,
          resource, translationActions, translationState.activeLanguage
        );
        // Update local display state with the edited tree.
        // Translation edits are saved immediately, so don't mark as unsaved.
        setLocalBeat((prev: any) => ({
          ...prev,
          parameters: { ...prev.parameters, dialogTree: newDialogTree }
        }));
        setHasChanges(false);

        // Still rebuild connections (targets are structural, not translatable)
        const sourceTree = sourceParametersRef.current?.dialogTree;
        if (sourceTree) {
          // Rebuild connections from the source tree (targets don't change with translations)
          const updatedBeat = {
            ...localBeat,
            parameters: { ...localBeat.parameters, dialogTree: sourceTree }
          };
          rebuildConnectionsAndUpdate(updatedBeat);
        }
        return;
      }
    }

    handleParameterChange('dialogTree', newDialogTree);
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
    // QA-flagged: every new choice used to be named "New Choice" — they
    // collided when more than one was added, and SchemaLocationInitializer
    // (which mints the auto-generated location/hotspot from choice.text)
    // would assign overlapping names. Iterate uniquely, mirroring
    // handleAddProp's "New Prop N" pattern.
    const existingChoices = localBeat.parameters?.choices || [];
    const existingTexts = new Set(existingChoices.map((c: any) => c.text));
    let choiceNumber = existingChoices.length + 1;
    let choiceText = `New Choice ${choiceNumber}`;
    while (existingTexts.has(choiceText)) {
      choiceNumber++;
      choiceText = `New Choice ${choiceNumber}`;
    }
    const newChoice: ChoiceWithCounter = {
      id: `choice_${Date.now()}`,
      text: choiceText,
      location: '',
      target: ''
    };
    handleParameterChange('choices', [...existingChoices, newChoice]);
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

    // Notify VE to add the element to its live state
    window.dispatchEvent(new CustomEvent('asaps:addElementToStage', {
      detail: { beatId: beat.id, location: newHotspot }
    }));

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

  // P3-3c-4 — spatial-hotspot controls (NEW path, distinct from the
  // legacy beat.locations pixel-hotspot). Lives on `choice.hotspot` as
  // normalized 0–1 against the spatial image rect. When every choice
  // has one (and the beat has no baked locations), MovementChoiceBeat
  // composes through SpatialFlowView automatically (P3-3c-2 routing).
  const handleAddSpatialHotspot = (choiceIndex: number) => {
    if (!beat || !onUpdate) return;
    const choices = [...(localBeat.parameters?.choices || [])];
    if (!choices[choiceIndex]) return;
    // Stagger defaults so multiple new hotspots don't stack invisibly.
    const stagger = (choiceIndex % 4) * 0.18;
    choices[choiceIndex] = {
      ...choices[choiceIndex],
      hotspot: {
        x: 0.1 + stagger,
        y: 0.4,
        width: 0.18,
        height: 0.18,
        shape: 'rect',
      },
    };
    const updated = { ...localBeat, parameters: { ...localBeat.parameters, choices } };
    setLocalBeat(updated);
    onUpdate(beat.id, updated as any);
  };

  const handleRemoveSpatialHotspot = (choiceIndex: number) => {
    if (!beat || !onUpdate) return;
    const choices = [...(localBeat.parameters?.choices || [])];
    if (!choices[choiceIndex]) return;
    const { hotspot, ...rest } = choices[choiceIndex] as any;
    void hotspot;
    choices[choiceIndex] = rest;
    const updated = { ...localBeat, parameters: { ...localBeat.parameters, choices } };
    setLocalBeat(updated);
    onUpdate(beat.id, updated as any);
  };

  const handleSetSpatialHotspotShape = (choiceIndex: number, shape: 'rect' | 'ellipse') => {
    if (!beat || !onUpdate) return;
    const choices = [...(localBeat.parameters?.choices || [])];
    const cur = choices[choiceIndex] as any;
    if (!cur?.hotspot) return;
    choices[choiceIndex] = { ...cur, hotspot: { ...cur.hotspot, shape } };
    const updated = { ...localBeat, parameters: { ...localBeat.parameters, choices } };
    setLocalBeat(updated);
    onUpdate(beat.id, updated as any);
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

    // Notify VE to add the element to its live state
    window.dispatchEvent(new CustomEvent('asaps:addElementToStage', {
      detail: { beatId: beat.id, location: newHotspot }
    }));

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

  // Update a field on a panorama hotspot (mirrors handleUpdateChoice for hotspots array)
  const handleUpdateHotspot = (index: number, field: string, value: any) => {
    const newHotspots = [...(localBeat.parameters?.hotspots || [])];
    newHotspots[index] = {
      ...newHotspots[index],
      [field]: value
    };
    handleParameterChange('hotspots', newHotspots);

    // If target changed, rebuild connections immediately
    if (field === 'target') {
      const updatedBeat = {
        ...localBeat,
        parameters: {
          ...localBeat.parameters,
          hotspots: newHotspots
        }
      };
      rebuildConnectionsAndUpdate(updatedBeat);
    }
  };

  // Create a new hotspot VE element for a panorama hotspot (mirrors handleCreateHotspotForChoice)
  const handleCreateHotspotForPanorama = (hotspotIndex: number) => {
    if (!beat || !onUpdate) return;

    const hotspot = localBeat.parameters?.hotspots?.[hotspotIndex];
    if (!hotspot) return;

    // Generate a unique hotspot name based on hotspot text
    const hotspotName = hotspot.text || `Hotspot ${hotspotIndex + 1}`;

    // Check if a location with this name already exists
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
    const newLocation = {
      kind: 'hotspot' as const,
      name: finalName,
      x: 100 + (hotspotIndex * 50),
      y: 300 + (hotspotIndex * 60),
      width: 150,
      height: 50,
      zIndex: 10 + hotspotIndex,
    };

    // Directly add to the beat's locations Map
    beat.locations.set(finalName, newLocation as any);

    // Notify VE to add the element to its live state
    window.dispatchEvent(new CustomEvent('asaps:addElementToStage', {
      detail: { beatId: beat.id, location: newLocation }
    }));

    // Update the hotspot's locationName to reference this new location
    const newHotspots = [...(localBeat.parameters?.hotspots || [])];
    newHotspots[hotspotIndex] = {
      ...newHotspots[hotspotIndex],
      locationName: finalName
    };

    // Update local state with the new hotspots
    const updatedBeat = {
      ...localBeat,
      parameters: {
        ...localBeat.parameters,
        hotspots: newHotspots
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
      case 'multiChoice':
        return {
          text: params.question || 'What do you say?',
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
      // New beat selected — duration starts in auto-track mode again.
      durationManualRef.current = false;
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
      // v0.9.48+ — mirror beat.sound.spatialPosition into the parameters
      // bag so SpatialPositionEditor (which reads from
      // parameters.backgroundSoundSpatial) shows the persisted value.
      // Without this, switching beats or re-syncing reverts the editor to
      // "Off" even though the data lives correctly on beat.sound.
      if (beatData.sound?.spatialPosition && !beatData.parameters.backgroundSoundSpatial) {
        beatData.parameters.backgroundSoundSpatial = beatData.sound.spatialPosition;
      }
      
      const beatDef = getBeatDefinition(beat.type);
      if (beatDef?.connectionType === 'multiple') {
        if (beat.type === 'movementChoice' && !beatData.parameters.choices) {
          beatData.parameters.choices = [];
        } else if (beat.type === 'multiChoice' && !beatData.parameters.choices) {
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
        // Sync continueTarget so the Inspector form reflects the beat's actual continue
        // connection (the constructor now derives this from connections if params lack it)
        if (!beatData.parameters.continueTarget) {
          beatData.parameters.continueTarget = beatParams.continueTarget || '';
        }
      }
      //}

      // Translation overlay: when a language is active, overlay translated values
      // onto the parameters so form fields show translated text.
      if (translationState.activeLanguage && beat) {
        const resource = translationState.translations.find(
          t => t.languageCode === translationState.activeLanguage
        );
        if (resource) {
          // Store source parameters BEFORE overlay (for reference display)
          sourceParametersRef.current = { ...beatData.parameters };
          // Deep-clone dialogTree source so it's not affected by overlay
          if (beatData.parameters.dialogTree) {
            sourceParametersRef.current.dialogTree = JSON.parse(JSON.stringify(beatData.parameters.dialogTree));
          }

          const entries = getAllTranslationEntriesForBeat(resource, beat.id);
          for (const entry of entries) {
            if (!entry.path.includes('.')) {
              // Simple top-level string params — overlay directly
              beatData.parameters[entry.path] = entry.value;
            }
          }

          // Overlay nested translations for dialogTree structures
          if (beatData.parameters.dialogTree) {
            const translatedTree = JSON.parse(JSON.stringify(beatData.parameters.dialogTree));
            for (const entry of entries) {
              if (entry.path.startsWith('dialogTree.') && entry.status === 'translated') {
                const subPath = entry.path.substring('dialogTree.'.length);
                setNestedValue(translatedTree, subPath, entry.value);
              }
            }
            beatData.parameters.dialogTree = translatedTree;
          }

          // Overlay nested translations for movementChoice choices
          if (beatData.parameters.choices && Array.isArray(beatData.parameters.choices)) {
            const translatedChoices = JSON.parse(JSON.stringify(beatData.parameters.choices));
            for (const entry of entries) {
              if (entry.path.startsWith('choices.') && entry.status === 'translated') {
                const subPath = entry.path.substring('choices.'.length);
                setNestedValue(translatedChoices, subPath, entry.value);
              }
            }
            beatData.parameters.choices = translatedChoices;
          }

          // Overlay nested translations for pickProp props
          if (beatData.parameters.props && Array.isArray(beatData.parameters.props)) {
            const translatedProps = JSON.parse(JSON.stringify(beatData.parameters.props));
            for (const entry of entries) {
              if (entry.path.startsWith('props.') && entry.status === 'translated') {
                const subPath = entry.path.substring('props.'.length);
                setNestedValue(translatedProps, subPath, entry.value);
              }
            }
            beatData.parameters.props = translatedProps;
          }

          // Overlay nested translations for hyperText hyperlinks
          if (beatData.parameters.hyperlinks && Array.isArray(beatData.parameters.hyperlinks)) {
            const translatedLinks = JSON.parse(JSON.stringify(beatData.parameters.hyperlinks));
            for (const entry of entries) {
              if (entry.path.startsWith('hyperlinks.') && entry.status === 'translated') {
                const subPath = entry.path.substring('hyperlinks.'.length);
                setNestedValue(translatedLinks, subPath, entry.value);
              }
            }
            beatData.parameters.hyperlinks = translatedLinks;
          }

          // Overlay nested translations for panorama hotspots
          if (beatData.parameters.hotspots && Array.isArray(beatData.parameters.hotspots)) {
            const translatedHotspots = JSON.parse(JSON.stringify(beatData.parameters.hotspots));
            for (const entry of entries) {
              if (entry.path.startsWith('hotspots.') && entry.status === 'translated') {
                const subPath = entry.path.substring('hotspots.'.length);
                setNestedValue(translatedHotspots, subPath, entry.value);
              }
            }
            beatData.parameters.hotspots = translatedHotspots;
          }

          // Overlay nested translations for textVariations
          if (beatData.parameters.textVariations && Array.isArray(beatData.parameters.textVariations)) {
            for (const entry of entries) {
              if (entry.path.startsWith('textVariations.') && entry.status === 'translated') {
                const idx = parseInt(entry.path.substring('textVariations.'.length));
                if (!isNaN(idx) && idx < beatData.parameters.textVariations.length) {
                  beatData.parameters.textVariations[idx] = entry.value;
                }
              }
            }
          }
        } else {
          sourceParametersRef.current = {};
        }
      } else {
        sourceParametersRef.current = {};
      }

      // Migrate legacy "Interactor" speaker value to actual player character name
      if (beatData.speaker === 'Interactor' && playerCharacterName) {
        beatData.speaker = playerCharacterName;
        if (onUpdate && beat) {
          onUpdate(beat.id, { speaker: playerCharacterName });
        }
      }

      // Auto-enable showSpeaker for beats with a non-default speaker assigned
      if (beatData.speaker && beatData.showSpeaker == null) {
        beatData.showSpeaker = true;
        if (onUpdate && beat) {
          onUpdate(beat.id, { showSpeaker: true });
        }
      }

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
  // Also re-sync when translation language changes to overlay/remove translations.
  }, [beat?.id, beat?.name, (beat as any)?._version, translationState.activeLanguage]);

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
      case 'multiChoice':
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
    if (field === 'defaultTarget' || field === 'defaultTargetDelay' || field === 'showTimer' || field === 'name' || field === 'notes' || field === 'speaker' || field === 'showSpeaker' || field === 'timeDisplayMode' || field === 'timeDisplayText' || field === 'overrideCountdownMeter' || field === 'requires' || field === 'requiresMode') {
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

    // In translation mode, route translatable string edits to the translation resource
    // instead of modifying the source beat data.
    if (translationState.activeLanguage && beat && typeof value === 'string') {
      const resource = translationState.translations.find(
        t => t.languageCode === translationState.activeLanguage
      );
      if (resource) {
        const translationKey = `beat:${beat.id}.parameters.${param}`;
        if (resource.strings[translationKey]) {
          // This is a translatable parameter — update translation resource, not source beat.
          // Translation edits are saved immediately, so clear the unsaved indicator.
          translationActions.updateTranslation(translationState.activeLanguage, translationKey, value);
          setHasChanges(false);
          return;
        }
      }
    }

    // Normal mode or non-translatable param — update source beat
    rebuildConnectionsAndUpdate(updatedBeat);

    // Sync translations: mark stale any translations for this beat
    if (translationState.translations.length > 0 && beat) {
      translationActions.syncBeatTranslations(beat.id, updatedBeat);
    }
  };

  /**
   * Atomically update several parameters in one state write. Calling
   * handleParameterChange twice in the same tick is unsafe — each call
   * closes over the same stale `localBeat`, so the second clobbers the
   * first. The CounterOwnerPicker sets name + owner together; it must use
   * this.
   */
  const handleParametersChange = (patch: Record<string, any>) => {
    const updatedBeat = {
      ...localBeat,
      parameters: { ...localBeat.parameters, ...patch },
    };
    setLocalBeat(updatedBeat);
    setHasChanges(true);
    rebuildConnectionsAndUpdate(updatedBeat);
    if (translationState.translations.length > 0 && beat) {
      translationActions.syncBeatTranslations(beat.id, updatedBeat);
    }
  };

  /**
   * durScreen-aware parameter change. As the author types the text, the
   * duration auto-recalculates from word count (via the shared
   * suggestDurationSeconds model) so a timed screen is never accidentally
   * too short to read. Auto-tracking stops the moment the author manually
   * edits the duration field (durationManualRef) — an intentional custom
   * duration is then preserved. Resets to auto-track per selected beat.
   */
  const handleDurScreenParameterChange = (param: string, value: any) => {
    if (param === 'duration') {
      // A user edit of the duration field takes control away from auto-track.
      durationManualRef.current = true;
      handleParameterChange('duration', value);
      return;
    }
    if (param === 'text') {
      // QA-flagged: calling handleParameterChange twice in the same tick
      // each closes over the same stale localBeat — the second update
      // clobbers the first, so typing into the text field appeared dead.
      // Use the atomic handleParametersChange to commit both fields in
      // one state write. durationManualRef gates whether the duration
      // resync runs (manual edit → don't auto-resync).
      if (durationManualRef.current) {
        handleParameterChange('text', value);
      } else {
        handleParametersChange({
          text: value,
          duration: suggestDurationSeconds(String(value ?? '')),
        });
      }
      return;
    }
    handleParameterChange(param, value);
  };

  // Helper function to rebuild connections from local state and immediately update
  const rebuildConnectionsAndUpdate = (updatedLocalBeat?: any) => {
    if (!beat || !onUpdate) return;

    const beatToUpdate = updatedLocalBeat || localBeat;

    // When a translation language is active, localBeat.parameters contains
    // translated text overlays. We must restore source text before updating
    // the actual beat, so translations don't leak into source parameters.
    let parametersForUpdate = beatToUpdate.parameters;
    if (translationState.activeLanguage && sourceParametersRef.current
        && Object.keys(sourceParametersRef.current).length > 0) {
      parametersForUpdate = { ...beatToUpdate.parameters };
      const resource = translationState.translations.find(
        t => t.languageCode === translationState.activeLanguage
      );
      if (resource) {
        const entries = getAllTranslationEntriesForBeat(resource, beat.id);
        for (const entry of entries) {
          // Restore source value for each translated top-level field
          if (!entry.path.includes('.') && sourceParametersRef.current[entry.path] !== undefined) {
            parametersForUpdate[entry.path] = sourceParametersRef.current[entry.path];
          }
        }
        // Restore complex structures that may have nested translation overlays
        if (sourceParametersRef.current.dialogTree) {
          parametersForUpdate.dialogTree = sourceParametersRef.current.dialogTree;
        }
        if (sourceParametersRef.current.choices) {
          parametersForUpdate.choices = sourceParametersRef.current.choices;
        }
        if (sourceParametersRef.current.props) {
          parametersForUpdate.props = sourceParametersRef.current.props;
        }
        if (sourceParametersRef.current.hyperlinks) {
          parametersForUpdate.hyperlinks = sourceParametersRef.current.hyperlinks;
        }
        if (sourceParametersRef.current.hotspots) {
          parametersForUpdate.hotspots = sourceParametersRef.current.hotspots;
        }
        if (sourceParametersRef.current.textVariations) {
          parametersForUpdate.textVariations = sourceParametersRef.current.textVariations;
        }
      }
    }

    // Apply all basic properties from local state
    beat.name = beatToUpdate.name;
    beat.cluster = beatToUpdate.cluster;
    beat.defaultTarget = beatToUpdate.defaultTarget || undefined;
    beat.defaultTargetDelay = beatToUpdate.defaultTargetDelay;
    beat.showTimer = beatToUpdate.showTimer;
    beat.transition = beatToUpdate.transition;

    // Convert backgroundSound from parameters to proper Sound object.
    // v0.9.48+ — also propagate spatialPosition (from the
    // SpatialPositionEditor) onto the Sound so the renderer's spatial
    // path (BaseRenderer.playSound → AudioManager.playSpatialSound)
    // picks it up.
    const backgroundSoundId = parametersForUpdate?.backgroundSound;
    if (backgroundSoundId) {
      const spatial = parametersForUpdate?.backgroundSoundSpatial;
      beat.sound = {
        file: backgroundSoundId,  // For compatibility
        assetId: backgroundSoundId,  // Preferred reference
        volume: beatToUpdate.sound?.volume ?? 1.0,
        loop: beatToUpdate.sound?.loop ?? false,
        ...(spatial ? { spatialPosition: spatial } : {}),
      };
    } else {
      beat.sound = undefined;
    }

    // Update parameters (using cleaned parameters without translation overlays)
    if (parametersForUpdate && beat.updateParameters) {
      const parameters = { ...parametersForUpdate };

      // Ensure button text is saved for applicable beats
      if (['titleScreen', 'infoText', 'durScreen', 'endScreen'].includes(beat.type)) {
        parameters.buttonText = parametersForUpdate.buttonText ||
          (beat.type === 'titleScreen' ? 'Start' :
           beat.type === 'endScreen' ? 'Play Again' :
           'Continue');
      }

      beat.updateParameters(parameters);
    }

    // Handle connections
    // Most beat types rebuild connections from parameters in updateParameters().
    // For simple beats (single target, conditional), we set connections from local state.
    const parameterDerivedTypes = new Set([
      'dialogTree', 'pickProp', 'movementChoice',
      'aiDialogTree', 'aiCondition', 'setTimer', 'randomTarget',
    ]);

    if (!parameterDerivedTypes.has(beat.type)) {
      const beatAny = beat as any;
      if (typeof beatAny.clearConnections === 'function') {
        beatAny.clearConnections();
      } else {
        beat.connections = [];
      }

      const beatDef = getBeatDefinition(beat.type);
      const connectionType = beatDef?.connectionType || 'single';

      if (connectionType === 'single' && beatToUpdate.connections?.length > 0) {
        beat.addConnection(beatToUpdate.connections[0]);
      } else if (connectionType === 'conditional') {
        beatToUpdate.connections.forEach((conn: any) => beat.addConnection(conn));
      } else {
        beatToUpdate.connections.forEach((conn: any) => beat.addConnection(conn));
      }
    }

    // For parameter-derived types, exclude connections from the update —
    // they are derived by getConnections() and must not be written into
    // beat.connections (Object.assign in the store would persist them).
    if (parameterDerivedTypes.has(beat.type)) {
      const { connections: _ignored, ...beatWithoutConnections } = beat as any;
      onUpdate(beat.id, beatWithoutConnections);
    } else {
      const updatedConnections = beat.getConnections ? beat.getConnections() : [];
      onUpdate(beat.id, { ...beat, connections: updatedConnections });
    }

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
      beat.speaker = localBeat.speaker || '';
      beat.showSpeaker = localBeat.showSpeaker ?? undefined;
      // State requirements (gate the beat behind prior story state)
      beat.requires = (localBeat.requires && localBeat.requires.length > 0)
        ? localBeat.requires
        : undefined;
      beat.requiresMode = localBeat.requiresMode || 'all';

      // Update sound: preserve existing properties, only update assetId and editable fields
      const bgSoundId = localBeat.parameters?.backgroundSound;
      if (bgSoundId) {
        beat.sound = {
          ...beat.sound,            // preserve fadeIn, fadeOut, etc.
          file: beat.sound?.file || bgSoundId,
          assetId: bgSoundId,
          volume: localBeat.sound?.volume ?? beat.sound?.volume ?? 1.0,
          loop: localBeat.sound?.loop ?? beat.sound?.loop ?? false,
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
      // Most beat types rebuild connections from parameters in updateParameters().
      // For simple beats (single target, conditional), we set connections from local state.
      const parameterDerivedTypes = new Set([
        'dialogTree', 'pickProp', 'movementChoice',
        'aiDialogTree', 'aiCondition', 'setTimer', 'randomTarget',
      ]);

      if (!parameterDerivedTypes.has(beat.type)) {
        const beatAny = beat as any;
        if (typeof beatAny.clearConnections === 'function') {
          beatAny.clearConnections();
        } else {
          beat.connections = [];
        }

        if (connectionType === 'single' && localBeat.connections.length > 0) {
          beat.addConnection(localBeat.connections[0]);
        } else if (connectionType === 'conditional') {
          localBeat.connections.forEach((conn: any) => beat.addConnection(conn));
        } else {
          localBeat.connections.forEach((conn: any) => beat.addConnection(conn));
        }
      }

      // For parameter-derived types, exclude connections from the update —
      // they are derived by getConnections() and must not be written into
      // beat.connections (Object.assign in the store would persist them).
      if (parameterDerivedTypes.has(beat.type)) {
        const { connections: _ignored, ...beatWithoutConnections } = beat as any;
        onUpdate(beat.id, beatWithoutConnections);
      } else {
        const updatedConnections = beat.getConnections ? beat.getConnections() : [];
        onUpdate(beat.id, { ...beat, connections: updatedConnections });
      }
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
  // Lightweight beat list for the QR generator panel. Includes self so
  // an author can build a "scan this to come back here" loop in
  // playtesting; the generator's UI is otherwise generic.
  const allBeatsForQR = allBeats.map((b: any) => ({
    id: b.id,
    name: b.name,
    type: b.type,
  }));

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

        {/* Advisory editing lock warning */}
        {editingUser && (
          <div className="flex-shrink-0 px-3 py-2 bg-purple-50 border-b border-purple-200 text-sm text-purple-700">
            <strong>{editingUser}</strong> is currently editing this beat
          </div>
        )}

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

        {/* Translation mode indicator — compact bar */}
        {translationState.activeLanguage && beat && (() => {
          const resource = translationState.translations.find(
            t => t.languageCode === translationState.activeLanguage
          );
          if (!resource) return null;
          const entries = getAllTranslationEntriesForBeat(resource, beat.id);
          if (entries.length === 0) return null;

          const translatedCount = entries.filter(e => e.status === 'translated').length;

          return (
            <div className="flex-shrink-0 border-b border-blue-200 bg-blue-50 px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-blue-700">
              <Globe className="w-3.5 h-3.5" />
              <span>Editing {resource.languageName} — {translatedCount}/{entries.length} translated</span>
            </div>
          );
        })()}

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
                  {/* v0.9.48 / S4+ — directional positioning for the background
                      sound. Stored at parameters.backgroundSoundSpatial; the
                      Sound-conversion path below picks it up and threads it
                      onto beat.sound.spatialPosition. Only shown when there's
                      an actual sound configured — no point editing spatial
                      data for a non-existent sound. */}
                  {localBeat.parameters?.backgroundSound && (
                    <SpatialPositionEditor
                      value={localBeat.parameters?.backgroundSoundSpatial as SpatialPosition | undefined}
                      onChange={(next) => handleParameterChange('backgroundSoundSpatial', next)}
                      defaultGeoSeed={(() => {
                        const loc = (globalSettings as any)?.location;
                        if (loc?.originLat !== undefined && loc?.originLng !== undefined) {
                          return { lat: loc.originLat, lng: loc.originLng };
                        }
                        return undefined;
                      })()}
                    />
                  )}
                </div>

                {/* BEAT-SPECIFIC PARAMETERS - SCHEMA DRIVEN */}

                {/* Schema-driven simple parameters */}
                {/* Exclude beat types that have custom hardcoded editors */}
                {beat.type !== 'dialogTree' && beat.type !== 'movementChoice' &&
                 beat.type !== 'pickProp' && getCanonicalBeatType(beat.type) !== 'conditionBeat' &&
                 beat.type !== 'setTimer' && beat.type !== 'randomTarget' &&
                 beat.type !== 'hyperText' && beat.type !== 'keypad' &&
                 beat.type !== 'panorama' && beat.type !== 'updateAffect' &&
                 beat.type !== 'gpsLocation' && beat.type !== 'indoorLocation' && (
                  <SchemaFormGenerator
                    beatType={beat.type}
                    beatDefinition={getBeatDefinition(beat.type)}
                    parameters={localBeat.parameters}
                    onParameterChange={beat.type === 'durScreen' ? handleDurScreenParameterChange : handleParameterChange}
                    onParametersChange={handleParametersChange}
                    availableTargets={availableTargets}
                    characters={getAvailableCharacters()}
                    playerCharacterName={playerCharacterName}
                    availableCounters={availableCounters}
                    availableVariables={availableVariables}
                    characterObjects={characters}
                    onCharacterSync={onCharacterSync}
                    translationSourceHints={
                      translationState.activeLanguage ? sourceParametersRef.current : undefined
                    }
                    beatProperties={localBeat}
                    onBeatPropertyChange={handleChange}
                    usedNames={usedNames}
                    onDefineAsCharacter={onDefineAsCharacter}
                  />
                )}

                {/* Speaker group for beat types excluded from full SchemaFormGenerator */}
                {['dialogTree', 'movementChoice', 'pickProp', 'hyperText', 'keypad', 'panorama'].includes(beat.type) && (() => {
                  const def = getBeatDefinition(beat.type);
                  if (!def) return null;
                  const speakerParams = Object.fromEntries(
                    Object.entries(def.parameters).filter(([, p]) => (p as any).ui?.group === 'Speaker')
                  );
                  if (Object.keys(speakerParams).length === 0) return null;
                  return (
                    <SchemaFormGenerator
                      beatType={beat.type}
                      beatDefinition={{ ...def, parameters: speakerParams }}
                      parameters={localBeat.parameters}
                      onParameterChange={handleParameterChange}
                      onParametersChange={handleParametersChange}
                      characters={getAvailableCharacters()}
                      playerCharacterName={playerCharacterName}
                      beatProperties={localBeat}
                      onBeatPropertyChange={handleChange}
                      usedNames={usedNames}
                      onDefineAsCharacter={onDefineAsCharacter}
                    />
                  );
                })()}

                {/* Condition Beat */}
                {getCanonicalBeatType(beat.type) === 'conditionBeat' && (
                  <>
                    {/* Template chooser (v0.9.45) — preset condition shapes
                        ("trust toward player has formed", "mood improved
                        since start", etc.). Picking a template seeds every
                        condition field at once; authors fine-tune from
                        there. The select intentionally resets to the empty
                        sentinel after each apply so the same template can
                        be picked twice if the author tweaks and wants the
                        defaults back. */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 space-y-1">
                      <label className="block text-xs font-medium text-blue-800">
                        Apply a template (presets the fields below)
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          const tmplId = e.target.value;
                          if (!tmplId) return;
                          const tmpl = findConditionTemplate(tmplId);
                          if (!tmpl) return;
                          const targetChar = (localBeat.parameters?.character as string) || '';
                          const cond = tmpl.forge({ target: targetChar, playerRef: 'player' });
                          const flat = conditionToFlatParams(cond);
                          for (const [k, v] of Object.entries(flat)) {
                            handleParameterChange(k, v);
                          }
                          // Reset the select so the same template can fire again.
                          e.target.value = '';
                        }}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-xs bg-white"
                      >
                        <option value="">— pick a template —</option>
                        {groupConditionTemplates().map((g) => (
                          <optgroup key={g.category} label={g.label}>
                            {g.members.map((t) => (
                              <option key={t.id} value={t.id} title={t.description}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

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
                        <optgroup label="Character affect">
                          <option value="mood">Mood (axis ≷ value)</option>
                          <option value="emotion">Emotion intensity ≷ value</option>
                          <option value="trait">Trait ≷ value</option>
                          <option value="sentiment">Sentiment toward target ≷ value</option>
                          <option value="goal">Goal status</option>
                          <option value="characterVariant">Active variant</option>
                        </optgroup>
                        <optgroup label="XR / sensors">
                          <option value="gpsProximity">GPS proximity (within / outside radius)</option>
                          <option value="indoorProximity">Indoor proximity (beacon RSSI)</option>
                          <option value="permissionGranted">Permission granted</option>
                        </optgroup>
                      </select>
                    </div>
                    
                    {/* Counter Condition */}
                    {localBeat.parameters?.conditionType === 'counter' && (
                      <>
                        <CounterOwnerPicker
                          label="Counter"
                          counters={availableCounters}
                          characters={(characters || []).map(c => ({ id: c.id, name: c.name, displayName: c.displayName }))}
                          name={localBeat.parameters?.variableName || localBeat.parameters?.left || ''}
                          character={localBeat.parameters?.character || ''}
                          onChange={(name, character) =>
                            handleParametersChange({ variableName: name, character })
                          }
                        />
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
                        <CounterOwnerPicker
                          label="First Counter"
                          counters={availableCounters}
                          characters={(characters || []).map(c => ({ id: c.id, name: c.name, displayName: c.displayName }))}
                          name={localBeat.parameters?.counter1 || ''}
                          character={localBeat.parameters?.character || ''}
                          onChange={(name, character) =>
                            handleParametersChange({ counter1: name, character })
                          }
                        />
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
                        <CounterOwnerPicker
                          label="Second Counter"
                          counters={availableCounters}
                          characters={(characters || []).map(c => ({ id: c.id, name: c.name, displayName: c.displayName }))}
                          name={localBeat.parameters?.counter2 || ''}
                          character={localBeat.parameters?.character || ''}
                          lockedCharacter={localBeat.parameters?.character || ''}
                          onChange={(name) =>
                            handleParameterChange('counter2', name)
                          }
                        />
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

                    {/* ===== Affect-stack condition operators (v0.9.43) =====
                        Each form takes a Character target and a per-type value
                        field. The character dropdown stores the canonical id;
                        downstream resolveCharRef accepts either id or name.

                        v0.9.45 adds the "Compared to" baseline switch on
                        mood / emotion / sentiment so the same form can
                        express a literal threshold OR a delta-from-initial
                        / delta-from-bookmark check. The baseline param is
                        either 'literal', 'initial', or { bookmark: name }. */}

                    {/* Mood condition — branch on character.mood.<axis> ≷ value */}
                    {localBeat.parameters?.conditionType === 'mood' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Character</label>
                          <select
                            value={localBeat.parameters?.character || ''}
                            onChange={(e) => handleParameterChange('character', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">— pick a character —</option>
                            <option value="player">Player</option>
                            {(characters || []).map((c) => (
                              <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Mood Axis</label>
                          <select
                            value={localBeat.parameters?.moodAxis || 'valence'}
                            onChange={(e) => handleParameterChange('moodAxis', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="valence">valence (sad ↔ happy)</option>
                            <option value="arousal">arousal (calm ↔ excited)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                          <select
                            value={localBeat.parameters?.operator || '>='}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value=">">&gt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<">&lt;</option>
                            <option value="<=">&lt;=</option>
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Compare Value (-1 .. +1)</label>
                          <input
                            type="number"
                            step={0.05} min={-1} max={1}
                            value={localBeat.parameters?.value ?? 0}
                            onChange={(e) => handleParameterChange('value', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        {(() => {
                          const baseline = localBeat.parameters?.baseline;
                          const mode: 'literal' | 'initial' | 'bookmark' =
                            !baseline || baseline === 'literal' ? 'literal'
                            : baseline === 'initial' ? 'initial' : 'bookmark';
                          const bookmarkName = mode === 'bookmark' && typeof baseline === 'object'
                            ? (baseline as any).bookmark || '' : '';
                          return (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Compared to
                                  <span className="text-xs text-gray-500 block">
                                    {mode === 'literal'
                                      ? 'Literal threshold — compare value directly.'
                                      : 'Value above is a delta — "improved/dropped by X" since the baseline.'}
                                  </span>
                                </label>
                                <select
                                  value={mode}
                                  onChange={(e) => {
                                    const m = e.target.value as 'literal' | 'initial' | 'bookmark';
                                    if (m === 'literal') handleParameterChange('baseline', undefined);
                                    else if (m === 'initial') handleParameterChange('baseline', 'initial');
                                    else handleParameterChange('baseline', { bookmark: bookmarkName });
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                  <option value="literal">literal value (default)</option>
                                  <option value="initial">delta from initial (story-start / first-touch)</option>
                                  <option value="bookmark">delta from a named bookmark</option>
                                </select>
                              </div>
                              {mode === 'bookmark' && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Bookmark name
                                    <span className="text-xs text-gray-500 block">
                                      Match the name used in an earlier bookmarkAffectState effect.
                                    </span>
                                  </label>
                                  <input
                                    type="text"
                                    value={bookmarkName}
                                    onChange={(e) => handleParameterChange('baseline', { bookmark: e.target.value })}
                                    placeholder="e.g. reunion-scene"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                                  />
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}

                    {/* Emotion condition — branch on character emotion intensity */}
                    {localBeat.parameters?.conditionType === 'emotion' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Character</label>
                          <select
                            value={localBeat.parameters?.character || ''}
                            onChange={(e) => handleParameterChange('character', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">— pick a character —</option>
                            <option value="player">Player</option>
                            {(characters || []).map((c) => (
                              <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Emotion Name</label>
                          <input
                            type="text"
                            value={localBeat.parameters?.emotionName || ''}
                            onChange={(e) => handleParameterChange('emotionName', e.target.value)}
                            placeholder="e.g. fear, joy, pride"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                            title="Looked up against the project emotion palette (case-insensitive). Unknown names just resolve to 0."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                          <select
                            value={localBeat.parameters?.operator || '>='}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value=">">&gt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<">&lt;</option>
                            <option value="<=">&lt;=</option>
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Compare Value (0 .. 1)</label>
                          <input
                            type="number"
                            step={0.05} min={-1} max={1}
                            value={localBeat.parameters?.value ?? 0}
                            onChange={(e) => handleParameterChange('value', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          {/* Note: range widens to [-1, 1] when baseline ≠ literal,
                              since the value is a delta. Authors can dial below 0. */}
                        </div>
                        {(() => {
                          const baseline = localBeat.parameters?.baseline;
                          const mode: 'literal' | 'initial' | 'bookmark' =
                            !baseline || baseline === 'literal' ? 'literal'
                            : baseline === 'initial' ? 'initial' : 'bookmark';
                          const bookmarkName = mode === 'bookmark' && typeof baseline === 'object'
                            ? (baseline as any).bookmark || '' : '';
                          return (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Compared to
                                  <span className="text-xs text-gray-500 block">
                                    {mode === 'literal'
                                      ? 'Literal threshold — compare emotion intensity directly.'
                                      : 'Value above is a delta — "spiked/eased by X" since the baseline.'}
                                  </span>
                                </label>
                                <select
                                  value={mode}
                                  onChange={(e) => {
                                    const m = e.target.value as 'literal' | 'initial' | 'bookmark';
                                    if (m === 'literal') handleParameterChange('baseline', undefined);
                                    else if (m === 'initial') handleParameterChange('baseline', 'initial');
                                    else handleParameterChange('baseline', { bookmark: bookmarkName });
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                  <option value="literal">literal value (default)</option>
                                  <option value="initial">delta from initial (story-start / first-touch)</option>
                                  <option value="bookmark">delta from a named bookmark</option>
                                </select>
                              </div>
                              {mode === 'bookmark' && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Bookmark name
                                    <span className="text-xs text-gray-500 block">
                                      Match the name used in an earlier bookmarkAffectState effect.
                                    </span>
                                  </label>
                                  <input
                                    type="text"
                                    value={bookmarkName}
                                    onChange={(e) => handleParameterChange('baseline', { bookmark: e.target.value })}
                                    placeholder="e.g. reunion-scene"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                                  />
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}

                    {/* Trait condition — branch on character trait value */}
                    {localBeat.parameters?.conditionType === 'trait' && (() => {
                      const charId = localBeat.parameters?.character;
                      const selectedChar = (characters || []).find((c) => c.id === charId);
                      const traitNames = selectedChar?.traits ? Object.keys(selectedChar.traits) : [];
                      // Variants override traits; merge in their trait keys too so authors see the full set.
                      const variantTraitNames = selectedChar?.variants?.flatMap((v) => v.traits ? Object.keys(v.traits) : []) || [];
                      const allTraits = Array.from(new Set([...traitNames, ...variantTraitNames])).sort();
                      return (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Character</label>
                            <select
                              value={charId || ''}
                              onChange={(e) => handleParameterChange('character', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="">— pick a character —</option>
                              {(characters || []).map((c) => (
                                <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Trait Name</label>
                            {allTraits.length > 0 ? (
                              <select
                                value={localBeat.parameters?.traitName || ''}
                                onChange={(e) => handleParameterChange('traitName', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="">— pick a trait —</option>
                                {allTraits.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={localBeat.parameters?.traitName || ''}
                                onChange={(e) => handleParameterChange('traitName', e.target.value)}
                                placeholder={charId ? "Character has no traits — type a trait name to author one" : "Pick a character first"}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                            <select
                              value={localBeat.parameters?.operator || '>='}
                              onChange={(e) => handleParameterChange('operator', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value=">">&gt;</option>
                              <option value=">=">&gt;=</option>
                              <option value="<">&lt;</option>
                              <option value="<=">&lt;=</option>
                              <option value="==">==</option>
                              <option value="!=">!=</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Compare Value (0 .. 1)</label>
                            <input
                              type="number"
                              step={0.05} min={0} max={1}
                              value={localBeat.parameters?.value ?? 0.5}
                              onChange={(e) => handleParameterChange('value', parseFloat(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                        </>
                      );
                    })()}

                    {/* Sentiment condition — character feels emotion toward target ≷ value */}
                    {localBeat.parameters?.conditionType === 'sentiment' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Character (sentiment-holder)</label>
                          <select
                            value={localBeat.parameters?.character || ''}
                            onChange={(e) => handleParameterChange('character', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">— pick a character —</option>
                            <option value="player">Player</option>
                            {(characters || []).map((c) => (
                              <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Toward (target)
                            <span className="text-gray-400 text-xs ml-2">character or free-text tag</span>
                          </label>
                          <input
                            type="text"
                            list="sentiment-target-suggestions"
                            value={localBeat.parameters?.sentimentTarget || ''}
                            onChange={(e) => handleParameterChange('sentimentTarget', e.target.value)}
                            placeholder="player / character id / inventory item / tag"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                          {/*
                            <datalist> options expose two strings to the
                            user: the option's `value` (what gets stored
                            when picked) and its inner text (the label).
                            Chrome renders both as a stacked two-line
                            entry, which authors read as "duplicate" when
                            the value is a lowercase slug ("elena") and
                            the label is the same word capitalized
                            ("Elena"). Disambiguate by including the
                            role / kind in the label so the two strings
                            are visibly distinct and the entry reads as
                            ONE option, not two.
                          */}
                          <datalist id="sentiment-target-suggestions">
                            <option value="player">Player (built-in)</option>
                            {(characters || []).map((c) => {
                              const displayName = c.displayName || c.name || c.id;
                              const role = c.role === 'player' ? 'player character' : 'NPC';
                              const label = c.id === displayName
                                ? `${displayName} (${role})`
                                : `${displayName} (${role}, id: ${c.id})`;
                              return (
                                <option key={c.id} value={c.id}>{label}</option>
                              );
                            })}
                          </datalist>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Emotion (optional)
                            <span className="text-gray-400 text-xs ml-2">empty = sum across all emotions toward target</span>
                          </label>
                          <input
                            type="text"
                            value={localBeat.parameters?.sentimentEmotion || ''}
                            onChange={(e) => handleParameterChange('sentimentEmotion', e.target.value)}
                            placeholder="e.g. trust, fear"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                          <select
                            value={localBeat.parameters?.operator || '>='}
                            onChange={(e) => handleParameterChange('operator', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value=">">&gt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<">&lt;</option>
                            <option value="<=">&lt;=</option>
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Compare Value (-1 .. +1)</label>
                          <input
                            type="number"
                            step={0.05} min={-1} max={1}
                            value={localBeat.parameters?.value ?? 0}
                            onChange={(e) => handleParameterChange('value', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        {(() => {
                          const baseline = localBeat.parameters?.baseline;
                          const mode: 'literal' | 'initial' | 'bookmark' =
                            !baseline || baseline === 'literal' ? 'literal'
                            : baseline === 'initial' ? 'initial' : 'bookmark';
                          const bookmarkName = mode === 'bookmark' && typeof baseline === 'object'
                            ? (baseline as any).bookmark || '' : '';
                          return (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Compared to
                                  <span className="text-xs text-gray-500 block">
                                    {mode === 'literal'
                                      ? 'Literal threshold — compare sentiment strength directly.'
                                      : 'Value above is a delta — "grown/eroded by X" since the baseline.'}
                                  </span>
                                </label>
                                <select
                                  value={mode}
                                  onChange={(e) => {
                                    const m = e.target.value as 'literal' | 'initial' | 'bookmark';
                                    if (m === 'literal') handleParameterChange('baseline', undefined);
                                    else if (m === 'initial') handleParameterChange('baseline', 'initial');
                                    else handleParameterChange('baseline', { bookmark: bookmarkName });
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                  <option value="literal">literal value (default)</option>
                                  <option value="initial">delta from initial (story-start / first-touch)</option>
                                  <option value="bookmark">delta from a named bookmark</option>
                                </select>
                              </div>
                              {mode === 'bookmark' && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Bookmark name
                                    <span className="text-xs text-gray-500 block">
                                      Match the name used in an earlier bookmarkAffectState effect.
                                    </span>
                                  </label>
                                  <input
                                    type="text"
                                    value={bookmarkName}
                                    onChange={(e) => handleParameterChange('baseline', { bookmark: e.target.value })}
                                    placeholder="e.g. reunion-scene"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                                  />
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}

                    {/* Goal condition — branch on goal status (open/met/failed/abandoned) */}
                    {localBeat.parameters?.conditionType === 'goal' && (() => {
                      const charId = localBeat.parameters?.character;
                      const selectedChar = (characters || []).find((c) => c.id === charId);
                      const goals = selectedChar?.goals || [];
                      return (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Character</label>
                            <select
                              value={charId || ''}
                              onChange={(e) => handleParameterChange('character', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="">— pick a character —</option>
                              {(characters || []).map((c) => (
                                <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Goal</label>
                            {goals.length > 0 ? (
                              <select
                                value={localBeat.parameters?.goalId || ''}
                                onChange={(e) => handleParameterChange('goalId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="">— pick a goal —</option>
                                {goals.map((g: any) => (
                                  <option key={g.id} value={g.id}>{g.name || g.id}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={localBeat.parameters?.goalId || ''}
                                onChange={(e) => handleParameterChange('goalId', e.target.value)}
                                placeholder={charId ? "Character has no authored goals — type a goal id" : "Pick a character first"}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                            <select
                              value={localBeat.parameters?.operator || '=='}
                              onChange={(e) => handleParameterChange('operator', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="==">is</option>
                              <option value="!=">is not</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                              value={localBeat.parameters?.goalStatus || 'met'}
                              onChange={(e) => handleParameterChange('goalStatus', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="open">open</option>
                              <option value="met">met</option>
                              <option value="failed">failed</option>
                              <option value="abandoned">abandoned</option>
                            </select>
                          </div>
                        </>
                      );
                    })()}

                    {/* CharacterVariant condition — which variant is currently active on character */}
                    {localBeat.parameters?.conditionType === 'characterVariant' && (() => {
                      const charId = localBeat.parameters?.character;
                      const selectedChar = (characters || []).find((c) => c.id === charId);
                      const variants = selectedChar?.variants || [];
                      return (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Character</label>
                            <select
                              value={charId || ''}
                              onChange={(e) => handleParameterChange('character', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="">— pick a character —</option>
                              {(characters || []).map((c) => (
                                <option key={c.id} value={c.id}>{c.displayName || c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                            <select
                              value={localBeat.parameters?.operator || '=='}
                              onChange={(e) => handleParameterChange('operator', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="==">is</option>
                              <option value="!=">is not</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Variant</label>
                            {variants.length > 0 ? (
                              <select
                                value={localBeat.parameters?.variantId || ''}
                                onChange={(e) => handleParameterChange('variantId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="">— pick a variant —</option>
                                {variants.map((v: any) => (
                                  <option key={v.id} value={v.id}>{v.name || v.id}</option>
                                ))}
                                <option value="">(none / no variant active)</option>
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={localBeat.parameters?.variantId || ''}
                                onChange={(e) => handleParameterChange('variantId', e.target.value)}
                                placeholder={charId ? "Character has no variants — type a variant id" : "Pick a character first"}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                              />
                            )}
                          </div>
                        </>
                      );
                    })()}

                    {/* ===== XR / sensor ConditionBeat operators (S3+) ===== */}
                    {localBeat.parameters?.conditionType === 'gpsProximity' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Target Latitude</label>
                          <input
                            type="number" step={0.000001}
                            value={localBeat.parameters?.targetLat ?? 0}
                            onChange={(e) => handleParameterChange('targetLat', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Target Longitude</label>
                          <input
                            type="number" step={0.000001}
                            value={localBeat.parameters?.targetLng ?? 0}
                            onChange={(e) => handleParameterChange('targetLng', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Radius (metres)</label>
                          <input
                            type="number" min={1} step={1}
                            value={localBeat.parameters?.radiusMeters ?? 25}
                            onChange={(e) => handleParameterChange('radiusMeters', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Mode
                            <span className="text-xs text-gray-500 block">
                              within = player is inside the radius (you've arrived). outside = player has left the area.
                            </span>
                          </label>
                          <select
                            value={localBeat.parameters?.proximityMode || 'within'}
                            onChange={(e) => handleParameterChange('proximityMode', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="within">within radius</option>
                            <option value="outside">outside radius</option>
                          </select>
                        </div>
                      </>
                    )}

                    {localBeat.parameters?.conditionType === 'indoorProximity' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Beacon UUID</label>
                          <input
                            type="text"
                            value={localBeat.parameters?.beaconUuid || ''}
                            onChange={(e) => handleParameterChange('beaconUuid', e.target.value)}
                            placeholder="e.g. f7826da6-4fa2-4e98-8024-bc5b71e0893e"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Major</label>
                            <input
                              type="number"
                              value={localBeat.parameters?.beaconMajor ?? ''}
                              onChange={(e) => handleParameterChange('beaconMajor', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Minor</label>
                            <input
                              type="number"
                              value={localBeat.parameters?.beaconMinor ?? ''}
                              onChange={(e) => handleParameterChange('beaconMinor', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1" title="Closer to 0 = stronger. -65 ≈ 1m. -85 ≈ 10m.">Min RSSI (dBm)</label>
                            <input
                              type="number" step={1}
                              value={localBeat.parameters?.minRssi ?? -65}
                              onChange={(e) => handleParameterChange('minRssi', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 italic">
                          Bluetooth scanning ships in v2 of the XR roadmap. Authoring works now;
                          runtime relies on a stub on Web until then.
                        </p>
                      </>
                    )}

                    {localBeat.parameters?.conditionType === 'permissionGranted' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Required permissions
                          <span className="text-xs text-gray-500 block">
                            All listed permissions must be granted for the condition to evaluate true.
                            An earlier beat must run a permission probe (ensureXRPermission) for these to be cached.
                          </span>
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {(['gps', 'camera', 'orientation', 'beacons'] as const).map((p) => {
                            const list = (localBeat.parameters?.permissions || []) as string[];
                            const checked = list.includes(p);
                            return (
                              <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked ? list.filter((x) => x !== p) : [...list, p];
                                    handleParameterChange('permissions', next);
                                  }}
                                />
                                <span>{p}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Update Affect Beat — v0.9.45 migrated to ChoiceEffectsEditor.
                    A standalone beat that holds an Effect[] (mood nudges, emotion
                    fires, sentiment adds, reflections, goal flips, variant
                    switches, bookmark snapshots). Same authoring surface as a
                    choice's effects, so authors get templates, the live "what
                    does this do?" summary, palette auto-complete, and bookmarks
                    all in one move. Legacy single-row params are migrated into
                    an Effect[] on first open so old projects keep working.

                    The runtime (UpdateAffectBeat.performAction) prefers the
                    effects[] array; legacy fields are still honoured when no
                    effects[] is present, so save/load is non-destructive. */}
                {beat.type === 'updateAffect' && (() => {
                  const params = (localBeat.parameters || {}) as any;
                  // Synthesise effects[] from legacy fields the first time
                  // this beat is opened in an editor that uses the new shape.
                  const effects: any[] = Array.isArray(params.effects)
                    ? params.effects
                    : synthesizeEffectsFromLegacyParams(params);
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Effects
                        <span className="text-xs text-gray-500 block">
                          One or more affect Effects applied in order. Use the template
                          dropdown to seed a coherent bundle, then fine-tune. The live
                          summary below describes the cumulative effect in plain language.
                        </span>
                      </label>
                      <ChoiceEffectsEditor
                        effects={effects as any}
                        onChange={(next) => {
                          // Persisting the new effects[] is the migration: once
                          // saved, the legacy single-row fields aren't read again.
                          handleParameterChange('effects', next);
                        }}
                        availableCounters={availableCounters}
                        availableVariables={availableVariables}
                        availableInventoryItems={availableInventoryItems}
                        availableCharacters={getAvailableCharacters() as any}
                        emotionPalette={emotionPalette}
                      />
                    </div>
                  );
                })()}

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
                          const newConnections: { targetId: string; label: string }[] = [];
                          if (timerConn) newConnections.push(timerConn);
                          if (targetId) {
                            newConnections.push({ targetId, label: '' });
                          }
                          // Also keep parameters.continueTarget in sync so that
                          // rebuildConnectionsAndUpdate passes the new value to
                          // SetTimerBeat.updateParameters (which rebuilds connections
                          // from parameters, not from localBeat.connections).
                          const updatedBeat = {
                            ...localBeat,
                            connections: newConnections,
                            parameters: { ...localBeat.parameters, continueTarget: targetId }
                          };
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
                      characterObjects={characters}
                      allBeats={availableTargets}
                      beatHasAuthorLocations={beatHasAuthorLocations}
                      projectIsResponsive={projectIsResponsive}
                      counters={availableCounters.map(c => ({ name: c.name, displayName: c.displayName, characterName: c.characterName }))}
                      variables={availableVariables.map(v => v.name)}
                      availableCounters={availableCounters}
                      availableVariables={availableVariables}
                      speakerNameResolver={speakerNameResolver}
                      availableInventoryItems={availableInventoryItems}
                      onDefineAsCharacter={onDefineAsCharacter}
                      emotionPalette={emotionPalette}
                    />

                    {showAdvanced && (
                      <div className="border-t pt-3 space-y-3">
                        {/* Bug 20 — presentation mode picker. Schema-declared
                            but the dialogTree section bypasses the full
                            SchemaFormGenerator, so we hand-render it here. */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Presentation Mode
                            <span className="text-xs text-gray-500 block font-normal">
                              How the dialog is laid out at runtime
                            </span>
                          </label>
                          <select
                            value={localBeat.parameters?.presentationMode || 'positioned'}
                            onChange={(e) => handleParameterChange('presentationMode', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="positioned">Positioned (traditional elements / spatial)</option>
                            <option value="chat-scroll">Chat — scrolling history</option>
                            <option value="chat-bubble">Chat — single bubble</option>
                          </select>
                        </div>
                        {(localBeat.parameters?.presentationMode === 'chat-scroll' ||
                          localBeat.parameters?.presentationMode === 'chat-bubble') && (
                          <>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="showAvatars-dialog"
                                checked={localBeat.parameters?.showAvatars ?? true}
                                onChange={(e) => handleParameterChange('showAvatars', e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <label htmlFor="showAvatars-dialog" className="text-sm text-gray-700">
                                Show character avatars
                              </label>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                NPC Response Delay (seconds)
                                <span className="text-xs text-gray-500 block font-normal">
                                  Typing-indicator delay before NPC replies
                                </span>
                              </label>
                              <input
                                type="number"
                                value={localBeat.parameters?.responseDelay || 0}
                                onChange={(e) => handleParameterChange('responseDelay', parseFloat(e.target.value))}
                                min="0"
                                max="10"
                                step="0.5"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                          </>
                        )}
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
                            Block and dim visited choices
                            <span className="text-xs text-gray-500 block">
                              Block and dim choices leading to previously visited beats
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* 360° Panorama */}
                {beat.type === 'panorama' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Text</label>
                      <TextFieldWithVariables
                        value={localBeat.parameters?.prompt || ''}
                        onChange={(val) => handleParameterChange('prompt', val)}
                        placeholder="Look around to explore..."
                        availableVariables={availableVariables}
                      />
                    </div>
                    {showAdvanced && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Initial Pitch</label>
                            <input type="number" value={localBeat.parameters?.initialPitch ?? 0}
                              onChange={(e) => handleParameterChange('initialPitch', parseFloat(e.target.value))}
                              min="-90" max="90" step="1"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Initial Yaw</label>
                            <input type="number" value={localBeat.parameters?.initialYaw ?? 0}
                              onChange={(e) => handleParameterChange('initialYaw', parseFloat(e.target.value))}
                              min="-180" max="180" step="1"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Field of View</label>
                          <input type="number" value={localBeat.parameters?.hfov ?? 100}
                            onChange={(e) => handleParameterChange('hfov', parseFloat(e.target.value))}
                            min="30" max="120" step="5"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                        </div>
                      </div>
                    )}

                    {/* Hotspots */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Hotspots</span>
                        <button
                          onClick={() => {
                            const hotspotId = `hotspot_${Date.now()}`;
                            const newHotspot = {
                              id: hotspotId,
                              pitch: 0,
                              yaw: 0,
                              text: `Hotspot ${(localBeat.parameters?.hotspots?.length || 0) + 1}`,
                              target: '',
                            };
                            handleParameterChange('hotspots', [...(localBeat.parameters?.hotspots || []), newHotspot]);
                            // Also create a VisualElement on the VE stage so it's visible in Layout view
                            console.log('[Inspector] Dispatching addElementToStage for panorama hotspot:', hotspotId);
                            window.dispatchEvent(new CustomEvent('asaps:addPanoramaHotspot', {
                              detail: {
                                beatId: localBeat.id,
                                hotspot: newHotspot,
                              }
                            }));
                          }}
                          className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                        >
                          <Plus className="w-3 h-3 inline" /> Add
                        </button>
                      </div>

                      {localBeat.parameters?.hotspots?.map((hotspot: any, index: number) => (
                        <div key={hotspot.id || index} className="p-3 bg-gray-50 rounded-lg space-y-2 mb-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-600">Hotspot {index + 1}</span>
                            <button
                              onClick={() => {
                                const newHotspots = localBeat.parameters?.hotspots?.filter((_: any, i: number) => i !== index) || [];
                                handleParameterChange('hotspots', newHotspots);
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {translationState.activeLanguage ? (
                            <>
                              <input
                                type="text"
                                value={hotspot.displayText || ''}
                                onChange={(e) => handleUpdateHotspot(index, 'displayText', e.target.value)}
                                placeholder="Translated label"
                                className="w-full px-2 py-1 text-sm border rounded border-blue-300"
                              />
                              {sourceParametersRef.current?.hotspots?.[index] && (
                                <div className="text-xs text-gray-400 italic truncate">
                                  Source: {sourceParametersRef.current.hotspots[index].text || ''}
                                </div>
                              )}
                            </>
                          ) : (
                            <input type="text"
                              value={hotspot.text || ''}
                              onChange={(e) => handleUpdateHotspot(index, 'text', e.target.value)}
                              placeholder="Hotspot label"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          )}

                          {/* Location Assignment (hotspot/prop/character) */}
                          {(() => {
                            // Compute the effective locationName: explicit locationName, or fall back
                            // to matching by hotspot text/id against existing VE elements
                            const allLocs = [...availableLocations.hotspots, ...availableLocations.props, ...availableLocations.characters];
                            const allLocNames = new Set(allLocs.map(l => l.name));
                            const effectiveLocationName = hotspot.locationName
                              || (allLocNames.has(hotspot.text) ? hotspot.text : undefined)
                              || (allLocNames.has(hotspot.id) ? hotspot.id : undefined)
                              || '';
                            return (
                          <div className="flex gap-2">
                            <select
                              value={effectiveLocationName}
                              onChange={(e) => handleUpdateHotspot(index, 'locationName', e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border rounded"
                              title="Associate this hotspot with a VE element"
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
                              {availableLocations.characters.length > 0 && (
                                <optgroup label="Characters">
                                  {availableLocations.characters.map((loc) => (
                                    <option key={`char-${loc.name}`} value={loc.name}>
                                      👤 {loc.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleCreateHotspotForPanorama(index)}
                              className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-1"
                              title="Create a new hotspot in the Visual Editor for this panorama hotspot"
                            >
                              <MapPin className="w-3 h-3" />
                              New
                            </button>
                          </div>
                            );
                          })()}

                          <select
                            value={hotspot.target || ''}
                            onChange={(e) => handleUpdateHotspot(index, 'target', e.target.value)}
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
                              <div className="text-xs font-medium text-blue-700">Effects (Optional)</div>
                              <ChoiceEffectsEditor
                                effects={hotspot.effects || []}
                                onChange={(newEffects) => handleUpdateHotspot(index, 'effects', newEffects)}
                                availableCounters={availableCounters}
                                availableVariables={availableVariables}
                                availableInventoryItems={availableInventoryItems}
                                availableCharacters={characters}
                                emotionPalette={emotionPalette}
                                compact
                              />
                              <div className="mt-2 pt-2 border-t border-blue-200">
                                <div className="text-xs font-medium text-blue-700 mb-1">Sound Effect (Optional)</div>
                                <input
                                  type="text"
                                  value={hotspot.soundEffect || ''}
                                  onChange={(e) => handleUpdateHotspot(index, 'soundEffect', e.target.value)}
                                  placeholder="Sound file (e.g., click.mp3)"
                                  className="w-full px-2 py-1 text-xs border rounded"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {(!localBeat.parameters?.hotspots || localBeat.parameters.hotspots.length === 0) && (
                        <p className="text-xs text-gray-400 italic">No hotspots yet. Add one to create an interactive point in the panorama.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Movement Choice & MultiChoice — share the choice editor.
                    multiChoice is the no-spatial sibling: just text + buttons +
                    per-choice effects. The spatial-specific fields (location-
                    name picker, "Create hotspot", show-text-on-hover) are
                    conditionally hidden below. */}
                {(beat.type === 'movementChoice' || beat.type === 'multiChoice') && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                      <TextFieldWithVariables
                        value={localBeat.parameters?.question || (beat.type === 'multiChoice' ? 'What do you say?' : 'Where do you want to go?')}
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
                            Block and dim visited choices
                            <span className="text-xs text-gray-500 block">
                              Block and dim choices leading to previously visited beats
                            </span>
                          </label>
                        </div>
                        {beat.type !== 'multiChoice' && (
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
                        )}
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
                        <div
                          key={`${choice.id ?? 'choice'}_${index}`}
                          onPointerEnter={() => dispatchChoiceHover(choice.id)}
                          onPointerLeave={() => dispatchChoiceHover(null)}
                          className={`p-3 rounded-lg space-y-2 mb-2 transition-colors ${
                            hoveredHotspotId === choice.id
                              ? 'bg-green-50 ring-2 ring-green-400'
                              : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex justify-between">
                            <span className="text-xs font-medium">Choice {index + 1}</span>
                            <button
                              onClick={() => handleRemoveChoice(index)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          {translationState.activeLanguage ? (
                            <>
                              <input
                                type="text"
                                value={choice.displayText || ''}
                                onChange={(e) => handleUpdateChoice(index, 'displayText', e.target.value)}
                                placeholder="Translated label"
                                className="w-full px-2 py-1 text-sm border rounded border-blue-300"
                              />
                              {sourceParametersRef.current?.choices?.[index] && (
                                <div className="text-xs text-gray-400 italic truncate">
                                  Source: {sourceParametersRef.current.choices[index].text || sourceParametersRef.current.choices[index].location || ''}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={choice.text}
                                onChange={(e) => handleUpdateChoice(index, 'text', e.target.value)}
                                placeholder="Choice text"
                                className="w-full px-2 py-1 text-sm border rounded"
                              />

                              {beat.type !== 'multiChoice' && (
                                <input
                                  type="text"
                                  value={choice.location || ''}
                                  onChange={(e) => handleUpdateChoice(index, 'location', e.target.value)}
                                  placeholder="Location description"
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              )}
                            </>
                          )}

                          {/* Hotspot/Prop Association — movementChoice only */}
                          {beat.type !== 'multiChoice' && (
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
                          )}

                          {/* P3-3c-4 — spatial hotspot (normalized 0–1 on the
                              image rect). Independent from the locationName /
                              legacy pixel-hotspot path above. When every
                              choice has one (and the beat has no baked
                              locations), the beat composes through
                              SpatialFlowView and the canvas editor lets the
                              author drag-place them visually. multiChoice
                              skips this entirely — it's button-only. */}
                          {beat.type !== 'multiChoice' && (() => {
                            const sp = (choice as any).hotspot;
                            return (
                              <div>
                              <div className="flex items-center gap-2 px-2 py-1 bg-blue-50/60 border border-blue-200 rounded">
                                <span className="text-[11px] text-gray-700">Spatial hotspot:</span>
                                {sp ? (
                                  <>
                                    <select
                                      value={sp.shape || 'rect'}
                                      onChange={(e) =>
                                        handleSetSpatialHotspotShape(index, e.target.value as 'rect' | 'ellipse')
                                      }
                                      className="text-xs px-1 py-0.5 border rounded bg-white"
                                      title="Shape — rectangle or oval"
                                    >
                                      <option value="rect">Rectangle</option>
                                      <option value="ellipse">Ellipse</option>
                                    </select>
                                    <span className="text-[10px] text-gray-500 ml-auto">
                                      {Math.round(sp.x * 100)}%, {Math.round(sp.y * 100)}% · {Math.round(sp.width * 100)}×{Math.round(sp.height * 100)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSpatialHotspot(index)}
                                      className="text-xs px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-red-50 hover:border-red-300 text-red-600"
                                      title="Remove the spatial hotspot — keeps the choice"
                                    >
                                      Remove
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleAddSpatialHotspot(index)}
                                      className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 ml-auto"
                                      title="Add a normalized clickable region on the spatial image — drag in the Visual Editor to place it"
                                    >
                                      Add hotspot
                                    </button>
                                  </>
                                )}
                              </div>
                              {sp && hotspotIsInactive && (
                                <p className="text-[10px] text-amber-700 mt-0.5 leading-snug">
                                  ⚠ Inactive — this project is in fixed-layout mode and the beat has baked positions, so the absolute layout runs and the hotspot isn't fired. Either clear the baked positions, or switch the project to Responsive layout (header → Responsive layout).
                                </p>
                              )}
                              </div>
                            );
                          })()}

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
                                availableCharacters={characters}
                                emotionPalette={emotionPalette}
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

                {/* XR location beats — shared editor for gpsLocation + indoorLocation. */}
                {(beat.type === 'gpsLocation' || beat.type === 'indoorLocation') && (() => {
                  const flavour = beat.type === 'gpsLocation' ? 'gps' : 'indoor';
                  const locations = (localBeat.parameters?.xrLocations || []) as XRLocationEntry[];
                  const venueBeacons = (globalSettings as any)?.location?.venue?.beacons as
                    | Array<{ uuid: string; displayName?: string; x: number; y: number }>
                    | undefined;
                  return (
                    <div className="space-y-3">
                      {/* Mode selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                        <select
                          value={localBeat.parameters?.mode || 'display'}
                          onChange={(e) => handleParameterChange('mode', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="display">Display only (continue button)</option>
                          <option value="trigger-on-arrival">Trigger on arrival</option>
                          <option value="trigger-on-departure">Trigger on departure</option>
                        </select>
                      </div>

                      {/* Instructional text */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Instructional text</label>
                        <textarea
                          value={localBeat.parameters?.text || ''}
                          onChange={(e) => handleParameterChange('text', e.target.value)}
                          placeholder={flavour === 'gps' ? 'Walk to the meeting point' : 'Find the artefact in the east wing'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          rows={2}
                        />
                      </div>

                      {/* Beat-level radius default */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-0.5">
                            Default radius (m)
                          </label>
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={localBeat.parameters?.radiusMeters ?? ''}
                            onChange={(e) => handleParameterChange('radiusMeters',
                              e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.'))
                            )}
                            placeholder={flavour === 'gps' ? '25' : '5'}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-0.5">
                            Timeout (ms, optional)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={localBeat.parameters?.timeoutMs ?? ''}
                            onChange={(e) => handleParameterChange('timeoutMs',
                              e.target.value === '' ? undefined : parseFloat(e.target.value)
                            )}
                            placeholder="(no timeout)"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                      </div>

                      {/* Indoor-only: per-beat floor plan (v0.9.49+).
                          Each indoor beat carries its own room/space —
                          floor plan asset + dimensions in metres. Falls
                          back to project venue settings if blank. */}
                      {flavour === 'indoor' && (
                        <div className="space-y-2 p-3 bg-purple-50/50 border border-purple-200 rounded-lg">
                          <div className="text-xs font-medium text-purple-900">
                            Floor plan for this beat
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                              Floor plan image
                            </label>
                            {localBeat.parameters?.floorPlanAssetId ? (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs truncate">
                                  {assets?.find(a => a.id === localBeat.parameters?.floorPlanAssetId)?.name
                                    || localBeat.parameters.floorPlanAssetId.substring(0, 12) + '…'}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAssetSelection('background', (asset) => {
                                    handleParameterChange('floorPlanAssetId', asset.id);
                                  })}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50"
                                  title="Replace floor plan"
                                >
                                  Change
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleParameterChange('floorPlanAssetId', undefined)}
                                  className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                                  title="Remove floor plan"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAssetSelection('background', (asset) => {
                                  handleParameterChange('floorPlanAssetId', asset.id);
                                })}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 bg-white"
                              >
                                Pick or upload floor plan…
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block text-[11px] text-gray-600">
                              Floor width (metres)
                              <input
                                type="number"
                                min={1}
                                step={0.1}
                                value={localBeat.parameters?.floorWidthM ?? ''}
                                onChange={(e) => handleParameterChange('floorWidthM',
                                  e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.'))
                                )}
                                placeholder="e.g. 20"
                                className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </label>
                            <label className="block text-[11px] text-gray-600">
                              Floor height (metres)
                              <input
                                type="number"
                                min={1}
                                step={0.1}
                                value={localBeat.parameters?.floorHeightM ?? ''}
                                onChange={(e) => handleParameterChange('floorHeightM',
                                  e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.'))
                                )}
                                placeholder="e.g. 30"
                                className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </label>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            Each indoor beat is one physical space. Leave blank to use the
                            project's venue (Settings → Location & XR → Indoor venue).
                          </p>
                        </div>
                      )}

                      {/* GPS-only: map style + player marker toggle */}
                      {flavour === 'gps' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">Map style</label>
                            <select
                              value={localBeat.parameters?.mapStyle || 'streets'}
                              onChange={(e) => handleParameterChange('mapStyle', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="streets">Streets</option>
                              <option value="satellite">Satellite</option>
                              <option value="minimal">Minimal</option>
                            </select>
                          </div>
                          <label className="flex items-center gap-2 mt-5 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={localBeat.parameters?.showPlayerMarker !== false}
                              onChange={(e) => handleParameterChange('showPlayerMarker', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            Show player marker
                          </label>
                        </div>
                      )}

                      {/* Continue / cancel button labels */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-0.5">Continue button</label>
                          <input
                            type="text"
                            value={localBeat.parameters?.buttonText || ''}
                            onChange={(e) => handleParameterChange('buttonText', e.target.value)}
                            placeholder="Continue"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-0.5">Skip button (optional)</label>
                          <input
                            type="text"
                            value={localBeat.parameters?.cancelButtonText || ''}
                            onChange={(e) => handleParameterChange('cancelButtonText', e.target.value)}
                            placeholder="(no skip button)"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                      </div>

                      {/* Locations list */}
                      <XRLocationsEditor
                        flavour={flavour}
                        locations={locations}
                        onChange={(next) => handleParameterChange('xrLocations', next)}
                        availableTargets={availableTargets}
                        venueBeacons={venueBeacons}
                        storyOrigin={(() => {
                          const loc = (globalSettings as any)?.location;
                          if (loc?.originLat !== undefined && loc?.originLng !== undefined) {
                            return { lat: loc.originLat, lng: loc.originLng };
                          }
                          return loc?.mockLocation || undefined;
                        })()}
                        availableCounters={availableCounters}
                        availableVariables={availableVariables}
                        availableInventoryItems={availableInventoryItems}
                        availableCharacters={characters}
                        emotionPalette={emotionPalette}
                      />

                      {/* Default target — used in display mode + on timeout / skip / no-match */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-0.5">
                          Default target — used on Continue / timeout / skip
                        </label>
                        <select
                          value={localBeat.parameters?.defaultTarget || ''}
                          onChange={(e) => handleParameterChange('defaultTarget', e.target.value || undefined)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="">— none (uses graph connection) —</option>
                          {availableTargets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name ? `${t.name} (${t.id})` : t.id}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}

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
                            Block and dim visited choices
                            <span className="text-xs text-gray-500 block">
                              Block and dim choices leading to previously visited beats
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
                        <div
                          key={prop.id}
                          onPointerEnter={() => dispatchChoiceHover(prop.id)}
                          onPointerLeave={() => dispatchChoiceHover(null)}
                          className={`p-3 rounded-lg space-y-2 mb-2 transition-colors ${
                            hoveredHotspotId === prop.id
                              ? 'bg-green-50 ring-2 ring-green-400'
                              : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex justify-between">
                            <span className="text-xs font-medium">Prop {index + 1}</span>
                            <button
                              onClick={() => handleRemoveProp(index)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          {translationState.activeLanguage ? (
                            <>
                              <div>
                                <input
                                  type="text"
                                  value={prop.displayName || ''}
                                  onChange={(e) => handleUpdateProp(index, 'displayName', e.target.value)}
                                  placeholder="Translated label"
                                  className="w-full px-2 py-1 text-sm border rounded border-blue-300"
                                />
                                {sourceParametersRef.current?.props?.[index] && (
                                  <div className="text-xs text-gray-400 italic truncate">
                                    Source: {sourceParametersRef.current.props[index].displayName || sourceParametersRef.current.props[index].name || ''}
                                  </div>
                                )}
                              </div>
                              <input
                                type="text"
                                value={prop.description}
                                onChange={(e) => handleUpdateProp(index, 'description', e.target.value)}
                                placeholder="Translated description"
                                className="w-full px-2 py-1 text-sm border rounded border-blue-300"
                              />
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={prop.name}
                                onChange={(e) => handleUpdateProp(index, 'name', e.target.value)}
                                placeholder="Prop name (internal key)"
                                className="w-full px-2 py-1 text-sm border rounded"
                              />

                              <div>
                                <input
                                  type="text"
                                  value={prop.displayName || ''}
                                  onChange={(e) => handleUpdateProp(index, 'displayName', e.target.value)}
                                  placeholder={prop.name || 'Display label (defaults to name)'}
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                                <span className="text-xs text-gray-400">
                                  Label shown on hotspot. Leave empty to use "{prop.name || 'name'}"
                                </span>
                              </div>

                              <input
                                type="text"
                                value={prop.description}
                                onChange={(e) => handleUpdateProp(index, 'description', e.target.value)}
                                placeholder="Description"
                                className="w-full px-2 py-1 text-sm border rounded"
                              />
                            </>
                          )}

                          {/* Display — unified stage element / image asset selector */}
                          <div className="flex gap-2">
                            <select
                              value={
                                (prop as any).locationName
                                  ? `loc:${(prop as any).locationName}`
                                  : (prop as any).assetId
                                    ? `asset:${(prop as any).assetId}`
                                    : [...availableLocations.hotspots, ...availableLocations.props]
                                        .some(loc => loc.name === prop.name)
                                      ? `loc:${prop.name}`
                                      : ''
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                const newProps = [...(localBeat.parameters?.props || [])];
                                if (val.startsWith('loc:')) {
                                  newProps[index] = { ...newProps[index], locationName: val.slice(4), assetId: undefined };
                                  handleParameterChange('props', newProps);
                                } else if (val.startsWith('asset:')) {
                                  // Add image asset to stage as a prop element
                                  const selectedAssetId = val.slice(6);
                                  const selectedAsset = assets.find(a => a.id === selectedAssetId);
                                  if (selectedAsset && beat) {
                                    const baseName = (selectedAsset.name || `Prop ${index + 1}`).replace(/\.[^.]+$/, '');
                                    const existingNames = new Set(
                                      Array.from(beat.locations?.values() || []).map(loc => loc.name)
                                    );
                                    let finalName = baseName;
                                    let counter = 1;
                                    while (existingNames.has(finalName)) {
                                      finalName = `${baseName} (${counter})`;
                                      counter++;
                                    }
                                    // Build location object for both persistence and VE notification
                                    const newLocation = {
                                      kind: 'prop' as const,
                                      name: finalName,
                                      x: 100 + (index * 50),
                                      y: 300 + (index * 60),
                                      width: 150,
                                      height: 150,
                                      zIndex: 10 + index,
                                      assetId: selectedAssetId,
                                    };
                                    // Persist to beat.locations (for when VE mounts later)
                                    beat.locations.set(finalName, newLocation as any);
                                    // Notify VE to add the element to its live state
                                    window.dispatchEvent(new CustomEvent('asaps:addElementToStage', {
                                      detail: { beatId: beat.id, location: newLocation }
                                    }));
                                    newProps[index] = { ...newProps[index], locationName: finalName, assetId: undefined };
                                    const updatedBeat = {
                                      ...localBeat,
                                      parameters: { ...localBeat.parameters, props: newProps }
                                    };
                                    setLocalBeat(updatedBeat);
                                    rebuildConnectionsAndUpdate(updatedBeat);
                                  }
                                } else {
                                  newProps[index] = { ...newProps[index], locationName: '', assetId: undefined };
                                  handleParameterChange('props', newProps);
                                }
                              }}
                              className="flex-1 px-2 py-1 text-sm border rounded"
                              title="How this prop is displayed: as a text button, a stage element, or an image"
                            >
                              <option value="">Button (default)</option>
                              {availableLocations.hotspots.length > 0 && (
                                <optgroup label="Stage Elements — Hotspots">
                                  {availableLocations.hotspots.map((loc) => (
                                    <option key={`hotspot-${loc.name}`} value={`loc:${loc.name}`}>
                                      🎯 {loc.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {availableLocations.props.length > 0 && (
                                <optgroup label="Stage Elements — Props">
                                  {availableLocations.props.map((loc) => (
                                    <option key={`prop-${loc.name}`} value={`loc:${loc.name}`}>
                                      📦 {loc.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {assets.filter(a => a.type === 'image').length > 0 && (
                                <optgroup label="Image Assets">
                                  {assets.filter(a => a.type === 'image').map(asset => (
                                    <option key={`asset-${asset.id}`} value={`asset:${asset.id}`}>
                                      🖼 {asset.name}
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
                              placeholder={prop.name || 'Same as prop name'}
                              className="w-full px-2 py-1 text-sm border rounded"
                            />
                            <span className="text-xs text-gray-400">
                              Name added to inventory when picked. Leave empty to use "{prop.name || 'prop name'}"
                            </span>
                          </div>

                          {/* P3-3c-8 — spatial hotspot (parallel to the movementChoice
                              flow). Same data shape on `prop.hotspot`. */}
                          {(() => {
                            const sp = (prop as any).hotspot;
                            return (
                              <div>
                              <div className="flex items-center gap-2 px-2 py-1 bg-blue-50/60 border border-blue-200 rounded">
                                <span className="text-[11px] text-gray-700">Spatial hotspot:</span>
                                {sp ? (
                                  <>
                                    <select
                                      value={sp.shape || 'rect'}
                                      onChange={(e) =>
                                        handleUpdateProp(index, 'hotspot', { ...sp, shape: e.target.value })
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
                                      onClick={() => handleUpdateProp(index, 'hotspot', undefined)}
                                      className="text-xs px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-red-50 hover:border-red-300 text-red-600"
                                    >
                                      Remove
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const stagger = (index % 4) * 0.18;
                                      handleUpdateProp(index, 'hotspot', {
                                        x: 0.1 + stagger,
                                        y: 0.4,
                                        width: 0.18,
                                        height: 0.18,
                                        shape: 'rect',
                                      });
                                    }}
                                    className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 ml-auto"
                                  >
                                    Add hotspot
                                  </button>
                                )}
                              </div>
                              {sp && hotspotIsInactive && (
                                <p className="text-[10px] text-amber-700 mt-0.5 leading-snug">
                                  ⚠ Inactive — this project is in fixed-layout mode and the beat has baked positions, so the absolute layout runs and the hotspot isn't fired. Either clear the baked positions, or switch the project to Responsive layout (header → Responsive layout).
                                </p>
                              )}
                              </div>
                            );
                          })()}

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
                              availableCharacters={characters}
                              emotionPalette={emotionPalette}
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
                            {beat.type === 'qrScan'
                              ? 'Default Next Beat (Required)'
                              : `Target Beat ${beat.type === 'setTimer' ? '(Timer Expiry)' : '(Required)'}`}
                          </label>
                          {beat.type === 'qrScan' && (
                            <p className="text-xs text-gray-500 mb-1 leading-snug">
                              Where the beat advances for unrecognized codes, a cancelled scan, or
                              when <em>Interpret asaps:// URIs</em> is off. A scanned{' '}
                              <span className="font-mono">asaps://beat/…</span> QR overrides this and
                              jumps directly (use the QR generator below to track such jumps as dashed edges).
                            </p>
                          )}
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


                {/* QR Generator — only for qrScan beats. Authors can
                    build an asaps:// URI and copy/download the resulting
                    QR without leaving the editor; pairs with the beat's
                    interpretAsapsUri flag so the scan auto-routes. */}
                {beat.type === 'qrScan' && (
                  <div className="border-t pt-4">
                    <AsapsQRGenerator
                      beats={allBeatsForQR}
                      jumpTargets={localBeat.parameters?.qrJumpTargets || []}
                      onJumpTargetsChange={(t) => handleParameterChange('qrJumpTargets', t)}
                    />
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

                {/* Requirements Section - Collapsible, universal (applies to all beat types) */}
                <div className="border-t pt-4">
                  <button
                    onClick={() => setShowRequirements(!showRequirements)}
                    className="w-full py-2 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 rounded-lg"
                  >
                    {showRequirements ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    Requirements
                    {localBeat.requires && localBeat.requires.length > 0 && (
                      <span className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        {localBeat.requires.length}
                      </span>
                    )}
                  </button>

                  {showRequirements && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-2">
                        Conditions that must hold when the player reaches this beat. When unmet at
                        runtime, the engine redirects to the fallback beat you choose. The path
                        analyzer also uses these to detect soft-locks.
                      </p>
                      <RequirementsEditor
                        value={localBeat.requires}
                        onChange={next => handleChange('requires', next)}
                        mode={localBeat.requiresMode || 'all'}
                        onModeChange={next => handleChange('requiresMode', next)}
                        allBeats={allBeats}
                        availableCounters={(() => {
                          const declared = new Set(availableCounters.map(c => c.name));
                          const fromStory = [...storyStateRefs.counters]
                            .filter(n => !declared.has(n))
                            .map(name => ({
                              name,
                              displayName: `${name} (used in story)`,
                            }));
                          return [
                            ...availableCounters.map(c => ({
                              name: c.name,
                              displayName: c.displayName || c.name,
                              characterName: c.characterName,
                            })),
                            ...fromStory,
                          ];
                        })()}
                        availableVariables={(() => {
                          const declared = new Set(availableVariables.map(v => v.name));
                          const fromStory = [...storyStateRefs.variables]
                            .filter(n => !declared.has(n))
                            .map(name => ({
                              name,
                              displayName: `${name} (used in story)`,
                            }));
                          return [
                            ...availableVariables.map(v => ({
                              name: v.name,
                              displayName: v.description ? `${v.name} (${v.description})` : v.name,
                            })),
                            ...fromStory,
                          ];
                        })()}
                        availableInventoryItems={(() => {
                          const declared = new Set(availableInventoryItems.map(i => i.name));
                          const fromStory = [...storyStateRefs.items]
                            .filter(n => !declared.has(n))
                            .map(name => ({
                              name,
                              displayName: `${name} (used in story)`,
                            }));
                          return [
                            ...availableInventoryItems.map(i => ({
                              name: i.name,
                              displayName: i.displayName || i.name,
                              characterName: i.characterName,
                            })),
                            ...fromStory,
                          ];
                        })()}
                        availableCharacters={characters}
                      />
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
                // Real title (was hardcoded 'Current Story'); no genre —
                // beatDef.category was 'visible'/'invisible', not a genre.
                title: storyTitle || 'Untitled Story',
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
        // assetType maps the local picker name to the asset-storage primary
        // type. background / character / prop are all 'image'; sound is
        // 'audio'. Without this mapping the modal's asset.type !== assetType
        // filter rejects every asset (no asset has type === 'background').
        assetType={
          assetSelectionModal.type === 'sound' ? 'audio' :
          (assetSelectionModal.type === 'background' ||
           assetSelectionModal.type === 'character' ||
           assetSelectionModal.type === 'prop') ? 'image' :
          undefined
        }
        // For 'sound' (Background Sound) we deliberately leave subType blank
        // so every audio file qualifies — background music is not a sound
        // effect, and tagging it as `sfx` was misleading the asset filter.
        assetSubType={assetSelectionModal.type === 'background' ? 'background' :
                     assetSelectionModal.type === 'character' ? 'character' :
                     assetSelectionModal.type === 'prop' ? 'prop' :
                     undefined}
        title={`Select ${assetSelectionModal.type || 'Asset'}`}
      />
    </>
  );
};