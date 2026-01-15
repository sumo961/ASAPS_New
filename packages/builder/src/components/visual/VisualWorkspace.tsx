/**
 * Visual Workspace Component
 * Unified visual editor with all controls in one left panel
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Beat, Cluster, type Location, type AnimationPath, type SharedVisualContent, computeAutoLayout, type LayoutElement, type AutoLayoutTheme } from '@asaps/core';
import { VisualBeatEditor, VisualElement } from './VisualBeatEditor';
import { VisualPropertiesPanel } from './VisualPropertiesPanel';
import { AnimationPanel } from './AnimationPanel';
import { AssetSelectionModal } from '../assets/AssetSelectionModal';
import type { Asset } from '../assets/AssetManager';
import { initializeLocationsFromSchema } from '../../utils/SchemaLocationInitializer';
import { calculateTextBoxDimensions, calculateButtonDimensions, calculateDialogDimensions } from '../../utils/textSizeCalculator';
import { Info, Share2, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import type { DialogNode } from '@asaps/core';

import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import type { Character } from '../../types/character';
import type { ThemeAssetUrls } from '../../hooks/useThemes';

/**
 * Helper to resolve fresh image URL from assets using assetId.
 * Character state images stored with blob URLs become stale after page reload.
 * This function looks up the assetId in the assets array to get fresh URLs.
 */
function resolveCharacterImageUrl(
  state: { visual?: { assetId?: string; image?: string } } | null,
  defaultImage: string | undefined,
  assets: Asset[]
): string | undefined {
  if (!state?.visual) {
    return defaultImage;
  }

  // Try to resolve via assetId first (this gives fresh blob URLs)
  if (state.visual.assetId) {
    const asset = assets.find(a => a.id === state.visual!.assetId);
    if (asset?.url) {
      return asset.url;
    }
  }

  // Fall back to stored image URL (may be stale blob URL)
  if (state.visual.image) {
    // Check if it's a blob URL - these are likely stale after page reload
    if (state.visual.image.startsWith('blob:')) {
      console.warn('[VisualWorkspace] Using potentially stale blob URL - no assetId found:', state.visual.image.substring(0, 50));
    }
    return state.visual.image;
  }

  return defaultImage;
}

/**
 * Phase tree node for DialogTree navigation
 */
interface PhaseTreeNode {
  id: string;
  speaker: string;
  text: string;  // Truncated for display
  fullText: string;  // Full text for reference
  depth: number;  // Indentation level
  choiceText?: string;  // The choice that leads to this phase
  children: PhaseTreeNode[];
}

/**
 * Build a tree structure from DialogTree's nested DialogNode structure
 */
function buildPhaseTree(dialogTree: DialogNode | undefined): PhaseTreeNode | null {
  if (!dialogTree) return null;

  function traverse(node: DialogNode, depth: number, choiceText?: string): PhaseTreeNode {
    const truncatedText = node.text.length > 25
      ? node.text.substring(0, 25) + '...'
      : node.text;

    return {
      id: node.id,
      speaker: node.speaker || 'NPC',
      text: truncatedText,
      fullText: node.text,
      depth,
      choiceText: choiceText ? (choiceText.length > 20 ? choiceText.substring(0, 20) + '...' : choiceText) : undefined,
      children: (node.choices || [])
        .filter(c => c.dialogNode)
        .map(c => traverse(c.dialogNode!, depth + 1, c.text)),
    };
  }

  return traverse(dialogTree, 0);
}

/**
 * Flatten phase tree to array with depth info for rendering
 */
function flattenPhaseTree(node: PhaseTreeNode | null): PhaseTreeNode[] {
  if (!node) return [];

  const result: PhaseTreeNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenPhaseTree(child));
  }
  return result;
}

/**
 * Find a DialogNode by ID in the tree
 */
function findPhaseById(dialogTree: DialogNode | undefined, phaseId: string | null): DialogNode | null {
  if (!dialogTree || !phaseId) return null;

  // Check if this is the node we're looking for
  if (dialogTree.id === phaseId) {
    return dialogTree;
  }

  // Recursively search in choices
  for (const choice of dialogTree.choices || []) {
    if (choice.dialogNode) {
      const found = findPhaseById(choice.dialogNode, phaseId);
      if (found) return found;
    }
  }

  return null;
}

interface VisualWorkspaceProps {
  beat: Beat | null;
  beats: Beat[];
  assets?: Asset[];
  onAssetSelect?: (type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  onAssetAdd?: (asset: Asset) => Promise<boolean>;
  onAssetRemove?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: Partial<Asset>) => void;
  onOpenCharacterManager?: (callback?: (character: any) => void) => void;
  onBeatUpdate?: (beatId: string, updates: Partial<Beat>) => void;
  projectSettings?: {
    width: number;
    height: number;
    aspectRatio: string;
    scalingMode: string;
  };
  globalSettings?: GlobalSettings;
  characters?: Character[];
  themeAssets?: ThemeAssetUrls | null;
  // Cluster containing this beat (for shared visuals)
  cluster?: Cluster | null;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: SharedVisualContent | undefined) => void;
}

export const VisualWorkspace: React.FC<VisualWorkspaceProps> = ({
  beat,
  beats,
  assets = [],
  onAssetSelect,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  onOpenCharacterManager,
  onBeatUpdate,
  projectSettings,
  globalSettings,
  characters = [],
  themeAssets,
  cluster,
  onSetClusterSharedVisuals,
}) => {
  const [visualElements, setVisualElements] = useState<VisualElement[]>([]);
  const [backgroundAssetId, setBackgroundAssetId] = useState<string>('');
  const [backgroundUrl, setBackgroundUrl] = useState<string>(''); // Direct URL for ASML import
  const [backgroundSound, setBackgroundSound] = useState<string>('');
  const [showProperties, setShowProperties] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'elements' | 'animations'>('elements');
  const [animations, setAnimations] = useState<AnimationPath[]>([]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320); // Default w-80 = 320px
  const [isResizingPanel, setIsResizingPanel] = useState(false);

  // Phase navigation state for DialogTree beats
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [phasesExpanded, setPhasesExpanded] = useState(true);

  // Use refs to track current state for cleanup
  const beatRef = useRef(beat);
  const visualElementsRef = useRef(visualElements);
  const backgroundAssetIdRef = useRef(backgroundAssetId);
  const backgroundSoundRef = useRef(backgroundSound);
  const animationsRef = useRef(animations);
  const hasChangesRef = useRef(hasChanges);
  const charactersRef = useRef(characters);

  // Track previous parameters to detect changes
  const prevParamsRef = useRef<string>('');

  // Update refs whenever state changes (EXCEPT beatRef which is updated in the save effect)
  useEffect(() => {
    visualElementsRef.current = visualElements;
  }, [visualElements]);

  useEffect(() => {
    backgroundAssetIdRef.current = backgroundAssetId;
  }, [backgroundAssetId]);

  useEffect(() => {
    animationsRef.current = animations;
  }, [animations]);

  useEffect(() => {
    backgroundSoundRef.current = backgroundSound;
  }, [backgroundSound]);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  // Handle panel resize dragging
  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel]);

  // Asset selection modal state
  const [assetModal, setAssetModal] = useState<{
    isOpen: boolean;
    type: 'background' | 'character' | 'prop' | 'sound' | null;
    callback: ((asset: Asset) => void) | null;
  }>({ isOpen: false, type: null, callback: null });

  // Meter selection modal state
  const [meterModal, setMeterModal] = useState<{
    isOpen: boolean;
  }>({ isOpen: false });

  // Phase tree computation for DialogTree beats
  // Note: We need to depend on beat._version to detect parameter changes (e.g., after merging)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beatVersion = (beat as any)?._version;

  const dialogTreeParams = useMemo(() => {
    if (beat?.type !== 'dialogTree') return null;
    return (beat.getParameters?.() as { dialogTree?: DialogNode } | undefined)?.dialogTree || null;
  }, [beat?.type, beat?.id, beatVersion]);

  const phaseTree = useMemo(() => {
    if (beat?.type !== 'dialogTree' || !dialogTreeParams) return null;
    console.log('[VisualWorkspace] Building phase tree from dialogTree:', dialogTreeParams);
    const tree = buildPhaseTree(dialogTreeParams);
    console.log('[VisualWorkspace] Built phase tree:', tree);
    return tree;
  }, [beat?.type, dialogTreeParams]);

  const flattenedPhases = useMemo(() => {
    const flattened = flattenPhaseTree(phaseTree);
    console.log('[VisualWorkspace] Flattened phases:', flattened.length, flattened.map(p => p.id));
    return flattened;
  }, [phaseTree]);
  const isDialogTreeBeat = beat?.type === 'dialogTree' && flattenedPhases.length > 1;
  console.log('[VisualWorkspace] isDialogTreeBeat:', isDialogTreeBeat, 'phases:', flattenedPhases.length);

  // Get the current phase's DialogNode for phase-aware editing
  // Must depend on dialogTreeParams to recalculate when dialog tree is modified (e.g., adding choices)
  const selectedPhase = useMemo(() => {
    if (beat?.type !== 'dialogTree' || !selectedPhaseId || !dialogTreeParams) return null;
    return findPhaseById(dialogTreeParams, selectedPhaseId);
  }, [beat?.type, dialogTreeParams, selectedPhaseId]);

  // Track previous phase ID to detect phase changes for auto-save
  const prevPhaseIdRef = useRef<string | null>(null);
  // Track previous phase choices count to detect when choices are added/removed
  const prevChoicesCountRef = useRef<number>(0);

  // Reset selected phase when beat changes
  useEffect(() => {
    if (beat?.id) {
      // Default to root phase when switching beats
      const rootPhase = phaseTree?.id || null;
      setSelectedPhaseId(rootPhase);
      // Set prevPhaseIdRef to null so the phase effect knows to reload
      // (if we set it to rootPhase, the phase effect would skip loading)
      prevPhaseIdRef.current = null;
    }
  }, [beat?.id, phaseTree?.id]);

  // Helper functions to auto-size text elements based on content and font
  // These use the improved textSizeCalculator utility with font awareness
  const autoSizeTextBox = useCallback((element: VisualElement, text: string) => {
    const fontSize = element.fontSize || 16;
    const fontFamily = element.font || 'Arial';
    return calculateTextBoxDimensions(text, fontSize, fontFamily);
  }, []);

  const autoSizeButton = useCallback((element: VisualElement, text: string) => {
    const fontSize = element.fontSize || 16;
    const fontFamily = element.font || 'Arial';
    return calculateButtonDimensions(text, fontSize, fontFamily);
  }, []);

  const autoSizeDialog = useCallback((element: VisualElement, text: string) => {
    const fontSize = element.fontSize || 16;
    const fontFamily = element.font || 'Arial';
    return calculateDialogDimensions(text, fontSize, fontFamily);
  }, []);

  /**
   * Generate visual elements for a specific DialogTree phase
   * This creates the NPC text box and choice buttons with auto-layout
   * Matches the preview renderer's flex-based layout positioning
   *
   * Position priority:
   * 1. phaseOverrides (user-edited positions)
   * 2. storedLocations (imported ASML positions)
   * 3. auto-layout (fallback for new beats)
   */
  const generatePhaseElements = useCallback((
    phase: DialogNode,
    stageWidth: number,
    stageHeight: number,
    overrides?: Record<string, Partial<{ x: number; y: number; width: number; height: number }>>,
    storedLocations?: Map<string, Location>
  ): VisualElement[] => {
    const defaultFontSize = 16;
    const defaultFont = globalSettings?.fonts?.textFont || 'Arial';
    const padding = globalSettings?.textbox?.padding || 20;

    // Gaps match preview renderer's flex layout
    const textButtonGap = 20; // Gap between text box and first button
    const buttonGap = 16; // Gap between buttons (matches preview's row gap)
    const startY = 50; // Match preview's starting position

    // Calculate text box dimensions first (same logic as preview/autoLayout)
    const lineHeight = 1.4;
    const contentPadding = padding * 2;
    const text = phase.text || '';

    // Estimate text width (same as autoLayout.ts)
    const textWidth = text.length * defaultFontSize * 0.55;
    const maxTextWidth = stageWidth * 0.8;

    let textBoxWidth: number;
    let textBoxHeight: number;

    if (textWidth + contentPadding <= maxTextWidth) {
      // Fits in single line - use actual text width
      textBoxWidth = Math.max(200, Math.min(textWidth + contentPadding, maxTextWidth));
      textBoxHeight = defaultFontSize * lineHeight + contentPadding;
    } else {
      // Multiple lines needed - use max width and calculate height
      textBoxWidth = maxTextWidth;
      const availableWidth = maxTextWidth - contentPadding;
      const avgCharWidth = defaultFontSize * 0.55;
      const charsPerLine = Math.floor(availableWidth / avgCharWidth);
      const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
      textBoxHeight = lines * defaultFontSize * lineHeight + contentPadding;
    }

    // Center text box horizontally
    const textCenterX = (stageWidth - textBoxWidth) / 2;

    // Create base elements for this phase
    const baseElements: LayoutElement[] = [];

    // NPC text box - centered horizontally with calculated dimensions
    baseElements.push({
      id: 'npc',
      kind: 'dialog',
      content: text,
      x: textCenterX,
      y: startY,
      width: textBoxWidth,
      height: textBoxHeight,
      fontSize: defaultFontSize,
      fontFamily: defaultFont,
      speaker: phase.speaker,
    });

    // Calculate button positions - immediately after text box
    const buttonStartY = startY + textBoxHeight + textButtonGap;

    // Calculate button width - max of all button text widths, capped at 60%
    const maxButtonWidth = stageWidth * 0.6;
    const choices = phase.choices || [];

    // Calculate dimensions for each button (including height for multi-line text)
    const buttonDimensions = choices.map(choice => {
      const btnText = choice.text || '';
      return calculateButtonDimensions(btnText, defaultFontSize, defaultFont);
    });

    // Use uniform width for all buttons (max of calculated widths, capped)
    const uniformButtonWidth = Math.min(
      Math.max(200, ...buttonDimensions.map(d => d.width)),
      maxButtonWidth
    );
    const buttonCenterX = (stageWidth - uniformButtonWidth) / 2;

    // Choice buttons - positioned with cumulative Y based on individual heights
    let currentY = buttonStartY;
    choices.forEach((choice, idx) => {
      // Use calculated height for this specific button
      const buttonHeight = buttonDimensions[idx]?.height || 50;

      baseElements.push({
        id: `choice_${idx}`,
        kind: 'button',
        content: choice.text || '',
        x: buttonCenterX,
        y: currentY,
        width: uniformButtonWidth,
        height: buttonHeight,
        fontSize: defaultFontSize,
        fontFamily: defaultFont,
      });

      // Move Y position for next button
      currentY += buttonHeight + buttonGap;
    });

    // Apply auto-layout (mainly for collision detection and fine-tuning)
    const layoutTheme: AutoLayoutTheme = {
      textBoxPadding: padding,
      maxTextWidthRatio: 0.8,
      maxButtonWidthRatio: 0.6,
      textButtonGap: textButtonGap,
      buttonGap: buttonGap,
    };
    const layoutResult = computeAutoLayout(baseElements, stageWidth, stageHeight, layoutTheme);

    // Convert to VisualElements and apply overrides/stored positions
    // Priority: 1. phaseOverrides, 2. storedLocations, 3. auto-layout
    return layoutResult.adjustedElements.map((el) => {
      const override = overrides?.[el.id];

      // Look for stored position in beat.locations (from ASML import)
      // Dialog elements: ASML uses kind='text' or kind='dialog'
      // Button elements: ASML uses kind='button' (converted from 'text' during import)
      let storedPosition: { x: number; y: number; width: number; height: number } | undefined;
      if (storedLocations && storedLocations.size > 0) {
        // For dialog, look for 'dialog' or 'text' kind locations (ASML uses 'text' for dialog boxes)
        if (el.kind === 'dialog') {
          storedLocations.forEach((loc) => {
            // Accept both 'dialog' (modern) and 'text' (legacy ASML) kinds
            // Exclude buttons by checking that name doesn't match button patterns
            const isDialogLike = (loc.kind === 'dialog' || loc.kind === 'text') &&
              !loc.name?.match(/^(choice|button)/i);
            if (isDialogLike && !storedPosition) {
              storedPosition = { x: loc.x, y: loc.y, width: loc.width, height: loc.height };
            }
          });
        }
        // For buttons, look for 'button' kind locations by index
        if (el.kind === 'button') {
          const choiceIdx = parseInt(el.id.replace('choice_', ''), 10);
          let buttonIdx = 0;
          storedLocations.forEach((loc) => {
            if (loc.kind === 'button') {
              if (buttonIdx === choiceIdx && !storedPosition) {
                storedPosition = { x: loc.x, y: loc.y, width: loc.width, height: loc.height };
              }
              buttonIdx++;
            }
          });
        }
      }

      return {
        id: el.id,
        type: el.kind === 'dialog' ? 'dialog' : 'button',
        name: el.id === 'npc' ? `NPC: ${phase.speaker || 'Character'}` : `Choice ${el.id.replace('choice_', '')}`,
        text: el.content,
        speaker: el.speaker,
        // Priority: override > storedPosition > auto-layout
        x: override?.x ?? storedPosition?.x ?? el.x,
        y: override?.y ?? storedPosition?.y ?? el.y,
        width: override?.width ?? storedPosition?.width ?? el.width,
        height: override?.height ?? storedPosition?.height ?? el.height,
        z: 0,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        font: el.fontFamily,
        fontSize: el.fontSize,
      } as VisualElement;
    });
  }, [globalSettings]);

  /**
   * Sync visual elements to beat.locations Map
   * This is called whenever elements change to ensure preview always has latest positions
   */
  const syncElementsToBeatLocations = useCallback((elements: VisualElement[], targetBeat: Beat) => {
    if (!targetBeat) return;

    targetBeat.locations.clear();

    elements.forEach((el: VisualElement) => {
      if (el.name === 'Main Text') return;

      // For DialogTree beats, skip dialog and button elements (they're regenerated per phase)
      if (targetBeat.type === 'dialogTree' && (el.type === 'dialog' || el.type === 'button')) {
        return;
      }

      let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter';
      if (el.type === 'character') kind = 'character';
      else if (el.type === 'prop') kind = 'prop';
      else if (el.type === 'dialog') kind = 'dialog';
      else if (el.type === 'button') kind = 'button';
      else if (el.type === 'hotspot') kind = 'hotspot';
      else if (el.type === 'meter') kind = 'meter';
      else kind = 'text';

      const location: any = {
        kind,
        name: el.name || el.text || '',
        id: el.id, // Include element ID for animation targeting
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
        zIndex: el.z
      };

      // Add optional properties
      if (el.assetId) location.assetId = el.assetId;
      if (el.imageUrl) location.imageUrl = el.imageUrl;
      if (el.sound) location.sound = el.sound;
      if (el.font) location.font = el.font;
      if (el.fontSize !== undefined) location.fontSize = el.fontSize;
      if (el.textAlign) location.textAlign = el.textAlign;
      location.autosize = el.fontSize === undefined;

      // Add character-specific properties
      if (el.type === 'character') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.characterName) location.characterName = el.characterName;
        if (el.stateId) location.stateId = el.stateId;
        if (el.size !== undefined) location.size = el.size;
        // Look up character name if not already set
        if (!location.characterName) {
          const character = charactersRef.current.find(c => c.id === el.characterId);
          if (character) {
            location.characterName = character.name;
          }
        }
      }

      // Add meter-specific properties
      if (el.type === 'meter') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.counterName) location.counterName = el.counterName;
        if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
        if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
        if (el.numericFormat) location.numericFormat = el.numericFormat;
        if (el.meterColor) location.meterColor = el.meterColor;
        if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
      }

      targetBeat.locations.set(el.name || el.id, location);
    });

    console.log(`[VisualWorkspace] Synced ${targetBeat.locations.size} locations to beat.locations`);
  }, []);

  // Save changes when switching to a different beat - MUST run before load
  const prevBeatIdRef = useRef(beat?.id);

  useEffect(() => {
    // If beat ID is changing and we had unsaved changes, save to the PREVIOUS beat first
    if (beat?.id !== prevBeatIdRef.current && hasChangesRef.current && beatRef.current) {
      const prevBeat = beatRef.current;

      // Save using refs to get current state
      const params = prevBeat.getParameters ? prevBeat.getParameters() : {};

      // Clear beat.locations and repopulate with ALL properties
      // For DialogTree beats: only save characters, props, meters (dialog/buttons are phase-specific)
      prevBeat.locations.clear();

      visualElementsRef.current.forEach((el: VisualElement) => {
        if (el.name === 'Main Text') return;

        // For DialogTree beats, skip dialog and button elements (they're regenerated per phase)
        if (prevBeat.type === 'dialogTree' && (el.type === 'dialog' || el.type === 'button')) {
          return;
        }

        let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter';
        if (el.type === 'character') kind = 'character';
        else if (el.type === 'prop') kind = 'prop';
        else if (el.type === 'dialog') kind = 'dialog';
        else if (el.type === 'button') kind = 'button';
        else if (el.type === 'hotspot') kind = 'hotspot';
        else if (el.type === 'meter') kind = 'meter';
        else kind = 'text';

        const location: any = {
          kind,
          name: el.name || el.text || '',
          id: el.id,  // Include element ID for animation targeting
          x: Math.round(el.x),
          y: Math.round(el.y),
          width: Math.round(el.width),
          height: Math.round(el.height),
          zIndex: el.z
        };

        // Add optional properties
        if (el.assetId) location.assetId = el.assetId;
        if (el.imageUrl) location.imageUrl = el.imageUrl;  // Preserve direct image URL (ASML imports)
        if (el.sound) location.sound = el.sound;
        if (el.font) location.font = el.font;
        if (el.fontSize !== undefined) location.fontSize = el.fontSize;
        if (el.textAlign) location.textAlign = el.textAlign;
        location.autosize = el.fontSize === undefined;

        // Add character-specific properties (for kind='character')
        if (el.type === 'character') {
          if (el.characterId) location.characterId = el.characterId;
          if (el.characterName) location.characterName = el.characterName;  // Preserve character name
          if (el.stateId) location.stateId = el.stateId;
          if (el.size !== undefined) location.size = el.size;
          // Look up character name for ASML export compatibility (if not already set)
          if (!location.characterName) {
            const character = charactersRef.current.find(c => c.id === el.characterId);
            if (character) {
              location.characterName = character.name;
            }
          }
        }

        // Add meter-specific properties (for kind='meter')
        if (el.type === 'meter') {
          if (el.characterId) location.characterId = el.characterId;
          if (el.counterName) location.counterName = el.counterName;
          if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
          if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
          if (el.numericFormat) location.numericFormat = el.numericFormat;
          if (el.meterColor) location.meterColor = el.meterColor;
          if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
        }

        prevBeat.locations.set(el.name || el.id, location);
      });

      // For DialogTree beats: save phase-specific element positions to phaseOverrides
      // This preserves dialog/button positions when switching beats
      // Use selectedPhaseId as fallback if prevPhaseIdRef.current is null (e.g., after HMR re-mount)
      const phaseKeyToSave = prevPhaseIdRef.current || selectedPhaseId;
      if (prevBeat.type === 'dialogTree' && phaseKeyToSave) {
        const phaseKey = phaseKeyToSave;
        const overrides: Record<string, Partial<{ x: number; y: number; width: number; height: number }>> = {};

        visualElementsRef.current.forEach((el: VisualElement) => {
          // Save ALL elements to phaseOverrides (dialog, buttons, and others)
          overrides[el.id] = {
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
          };
        });

        const existingOverrides = params.phaseOverrides || {};
        params.phaseOverrides = {
          ...existingOverrides,
          [phaseKey]: overrides,
        };
        console.log(`[VisualWorkspace] Saved phase overrides for phase: ${phaseKey} before beat change`);
      }

      // Save to parameters
      prevBeat.updateParameters({
        ...params,
        visualElements: visualElementsRef.current,
        backgroundAssetId: backgroundAssetIdRef.current,
        node: backgroundAssetIdRef.current,
        backgroundSound: backgroundSoundRef.current,
        animations: animationsRef.current
      });

      // Also set animations directly on beat (updateParameters doesn't handle base Beat properties)
      prevBeat.animations = animationsRef.current;

      console.log(`[VisualWorkspace] Auto-saved ${prevBeat.locations.size} locations and ${animationsRef.current?.length || 0} animations to previous beat`);
    }

    // Update beatRef to new beat AFTER saving to previous beat
    beatRef.current = beat;

    // NOTE: Don't update prevBeatIdRef here! It's updated by the phase loading effect
    // so that effect can correctly detect beat changes. The auto-save check at line 512
    // will still work because prevBeatIdRef isn't updated until AFTER phase loading.
  }, [beat]); // Depend on beat object, not beat?.id, to run before the load

  /**
   * Save current phase overrides before switching to a new phase
   */
  const saveCurrentPhaseOverrides = useCallback(() => {
    if (!beat || beat.type !== 'dialogTree' || !prevPhaseIdRef.current) return;
    if (!hasChanges) return; // No changes to save

    const params = beat.getParameters ? beat.getParameters() : {};
    const phaseKey = prevPhaseIdRef.current;

    // Calculate overrides: elements that differ from auto-layout
    // For simplicity, save all element positions as overrides
    const overrides: Record<string, Partial<{ x: number; y: number; width: number; height: number }>> = {};

    visualElements.forEach(el => {
      overrides[el.id] = {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
      };
    });

    // Save to phaseOverrides
    const existingOverrides = params.phaseOverrides || {};
    beat.updateParameters({
      ...params,
      phaseOverrides: {
        ...existingOverrides,
        [phaseKey]: overrides,
      },
    });

    console.log(`[VisualWorkspace] Saved phase overrides for phase: ${phaseKey}`);
  }, [beat, hasChanges, visualElements]);

  /**
   * Handle phase selection with auto-save
   */
  const handlePhaseSelect = useCallback((phaseId: string) => {
    if (phaseId === selectedPhaseId) return; // Same phase, no action needed

    console.log(`[VisualWorkspace] Phase switch: ${selectedPhaseId} → ${phaseId}`);

    // Save current phase before switching
    saveCurrentPhaseOverrides();

    // Switch to new phase - DON'T update prevPhaseIdRef here!
    // Let the useEffect handle it after loading elements
    setSelectedPhaseId(phaseId);
    setHasChanges(false);
  }, [selectedPhaseId, saveCurrentPhaseOverrides]);

  /**
   * Load phase-specific elements when phase changes (for DialogTree beats)
   */
  useEffect(() => {
    console.log(`[VisualWorkspace] Phase effect - beatId: ${beat?.id}, prevBeatId: ${prevBeatIdRef.current}, selectedPhaseId: ${selectedPhaseId}, prevRef: ${prevPhaseIdRef.current}, selectedPhase: ${selectedPhase?.id}`);

    if (!beat || beat.type !== 'dialogTree' || !selectedPhaseId || !selectedPhase) {
      console.log(`[VisualWorkspace] Phase effect - skipping (missing data): beat=${!!beat}, type=${beat?.type}, phaseId=${selectedPhaseId}, phase=${!!selectedPhase}`);
      return;
    }

    // Use default project settings if not provided
    const stageWidth = projectSettings?.width || 1024;
    const stageHeight = projectSettings?.height || 768;

    // Check if beat changed - always reload when switching to a different beat
    const beatChanged = prevBeatIdRef.current !== beat.id;

    // Check if choices count changed - force reload when choices are added/removed
    const currentChoicesCount = selectedPhase.choices?.length || 0;
    const choicesChanged = prevChoicesCountRef.current !== currentChoicesCount;

    // Don't reload if this is the same beat AND same phase AND same choices count AND we already have elements
    if (!beatChanged && !choicesChanged && prevPhaseIdRef.current === selectedPhaseId && visualElements.length > 0) {
      console.log(`[VisualWorkspace] Phase effect - skipping (same beat+phase+choices, already have elements)`);
      return;
    }

    console.log(`[VisualWorkspace] Loading phase elements for: ${selectedPhaseId}, phase text: ${selectedPhase.text}, beatChanged: ${beatChanged}`);

    const params = beat.getParameters ? beat.getParameters() : {};
    const phaseOverrides = params.phaseOverrides?.[selectedPhaseId];

    // Generate dialog and choice elements for this phase
    // Uses stored positions from beat.locations (ASML import) if available,
    // otherwise falls back to auto-layout
    const phaseElements = generatePhaseElements(
      selectedPhase,
      stageWidth,
      stageHeight,
      phaseOverrides,
      beat.locations  // Pass stored locations for imported ASML positions
    );

    // Also load characters and props from beat.locations (these are shared across all phases)
    const persistedElements: VisualElement[] = [];
    if (beat.locations.size > 0) {
      beat.locations.forEach((loc: Location) => {
        // Only include characters and props - dialog/buttons come from phase
        if (loc.kind === 'character' || loc.kind === 'prop') {
          const element: VisualElement = {
            id: `element_${Date.now()}_${Math.random()}`,
            type: loc.kind as 'character' | 'prop',
            name: loc.name,
            text: '',
            assetId: loc.assetId,
            imageUrl: loc.imageUrl,
            characterId: loc.characterId,
            characterName: loc.characterName,
            stateId: loc.stateId,
            size: loc.size,
            x: loc.x,
            y: loc.y,
            z: loc.zIndex || 0,
            width: loc.width,
            height: loc.height,
            rotation: 0,
            scale: 1,
            visible: true,
            locked: false,
            sound: loc.sound,
          };

          // Resolve character image URLs
          if (loc.kind === 'character' && loc.characterId) {
            const character = characters.find(c => c.id === loc.characterId);
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              const state = character.states?.find((s: any) => s.id === stateId);
              if (state) {
                const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets);
                if (resolvedUrl) {
                  element.imageUrl = resolvedUrl;
                }
              }
            }
          }

          // Resolve prop image URLs
          if (loc.kind === 'prop' && loc.assetId) {
            const asset = assets.find(a => a.id === loc.assetId);
            if (asset) {
              element.imageUrl = asset.url;
            }
          }

          persistedElements.push(element);
        }
      });
      console.log(`[VisualWorkspace] Loaded ${persistedElements.length} persisted elements (characters/props) from beat.locations`);
    }

    // Merge: persisted elements (characters/props) + phase elements (dialog/choices)
    const allElements = [...persistedElements, ...phaseElements];
    setVisualElements(allElements);
    setHasChanges(false);
    prevPhaseIdRef.current = selectedPhaseId;
    prevBeatIdRef.current = beat.id;
    prevChoicesCountRef.current = currentChoicesCount;

    console.log(`[VisualWorkspace] Loaded ${allElements.length} elements for phase: ${selectedPhaseId} (${persistedElements.length} persisted + ${phaseElements.length} phase, ${currentChoicesCount} choices)`);
  }, [beat, selectedPhaseId, selectedPhase, projectSettings, generatePhaseElements, characters, assets]);

  // Initialize from beat parameters
  useEffect(() => {
    if (!beat) return;

    // For DialogTree beats: load background/animations but skip element loading
    // Elements are handled by phase-aware loading effect (which runs before this effect)
    if (beat.type === 'dialogTree') {
      console.log(`[VisualWorkspace] DialogTree: loading background/animations only, elements via phase-aware loading`);
      const params = beat.getParameters ? beat.getParameters() : {};
      const bgId = params.node || params.backgroundAssetId || '';
      const bgUrl = params.backgroundUrl || '';
      setBackgroundAssetId(bgId);
      setBackgroundUrl(bgUrl);
      setBackgroundSound(params.backgroundSound || '');
      // Load animations from beat.animations first (direct property), fallback to params.animations
      console.log(`[VisualWorkspace] DialogTree: Loading animations: beat.animations=${beat.animations?.length || 0}, params.animations=${params.animations?.length || 0}`);
      setAnimations(beat.animations || params.animations || []);
      // NOTE: Don't clear visual elements here - the phase loading effect already handles this
      // by calling setVisualElements(allElements) which replaces all elements
      return;
    }

    console.log(`[VisualWorkspace] LOADING BEAT: ${beat.type} (id: ${beat.id}, name: ${beat.name})`);

    const params = beat.getParameters ? beat.getParameters() : {};
    console.log(`[VisualWorkspace] params.node (background): ${params.node || 'NOT SET'}`);
    console.log(`[VisualWorkspace] beat.node (direct): ${beat.node || 'NOT SET'}`);
    console.log(`[VisualWorkspace] beat.locations.size: ${beat.locations?.size || 0}`);

    // Determine element visibility based on global settings (Phase 5 - Optional Text Boxes)
    const boxVisibility = globalSettings?.textbox.boxVisibility || 'all';
    const textBoxesVisible = boxVisibility === 'all'; // Text boxes visible
    const buttonBoxesVisible = boxVisibility !== 'hideAll'; // Buttons visible unless hideAll

    // Helper to set visibility based on element type
    const getElementVisibility = (elementType: 'text' | 'dialog' | 'button' | 'hotspot' | 'prop' | 'character') => {
      if (elementType === 'text' || elementType === 'dialog') {
        return textBoxesVisible;
      } else if (elementType === 'button') {
        return buttonBoxesVisible;
      }
      // For hotspots, props, characters - always visible
      return true;
    };

    // CRITICAL FIX: Load from beat.locations FIRST (this is the source of truth)
    // Only fall back to params.visualElements or params.locs if beat.locations is empty
    let elements: VisualElement[] = [];

    // Priority 1: Load from beat.locations (persisted data)
    if (beat.locations.size > 0) {
      console.warn(`[VisualWorkspace] ★★★ Loading ${beat.locations.size} elements from beat.locations for ${beat.type} ★★★`);
      console.warn(`[VisualWorkspace] ========== LOCATION POSITIONS ==========`);
      beat.locations.forEach((loc: Location, key: string) => {
        console.warn(`[VisualWorkspace]   "${key}": x=${loc.x}, y=${loc.y}, w=${loc.width}, h=${loc.height}, size=${(loc as any).size}`);
      });
      console.warn(`[VisualWorkspace] ========================================`);
      const locationDetails = Array.from(beat.locations.values()).map((loc: Location) => ({
        name: loc.name,
        kind: loc.kind,
        x: loc.x,
        y: loc.y,
        width: loc.width,
        height: loc.height,
        // Character-related fields
        characterId: (loc as any).characterId,
        characterName: (loc as any).characterName,
        stateId: (loc as any).stateId,
        imageUrl: (loc as any).imageUrl?.substring?.(0, 50) ?? 'NOT SET',
        assetId: (loc as any).assetId
      }));
      console.log('[VisualWorkspace] Location details:', locationDetails);
      elements = Array.from(beat.locations.values()).map((loc: Location) => {
        // Detect if this is a button based on name (legacy ASML uses kind="text" for buttons)
        const nameLower = loc.name?.toLowerCase() || '';
        const isButtonByName = nameLower.includes('button') ||
                               nameLower.includes('start') ||
                               nameLower.includes('continue') ||
                               nameLower.includes('restart') ||
                               nameLower.includes('credits') ||
                               nameLower.includes('submit') ||
                               nameLower.includes('skip');

        const element: any = {
          id: `element_${Date.now()}_${Math.random()}`,
          type: loc.kind === 'character' ? 'character' :
                loc.kind === 'prop' ? 'prop' :
                loc.kind === 'button' ? 'button' :
                isButtonByName ? 'button' : // Detect buttons by name for legacy ASML
                loc.kind === 'dialog' ? 'dialog' :
                loc.kind === 'hotspot' ? 'hotspot' :
                loc.kind === 'meter' ? 'meter' :
                'text',
          name: loc.name,
          text: '', // Will be populated below from params
          assetId: loc.assetId,
          imageUrl: loc.imageUrl, // Direct image URL (for ASML imported characters)
          // Character-specific properties
          characterId: loc.characterId,
          characterName: loc.characterName,
          stateId: loc.stateId,
          size: loc.size,
          x: loc.x,
          y: loc.y,
          z: loc.zIndex || 0,
          width: loc.width,
          height: loc.height,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          sound: loc.sound,
          // Include font properties from location
          font: loc.font,
          fontSize: loc.fontSize,
          textAlign: loc.textAlign,
          // Meter-specific properties
          counterName: loc.counterName,
          meterOrientation: loc.meterOrientation,
          showNumericValue: loc.showNumericValue,
          numericFormat: loc.numericFormat,
          meterColor: loc.meterColor,
          meterBackgroundColor: loc.meterBackgroundColor
        };

        // Resolve asset URL for props immediately (so updateImageDimensions can use it)
        if (element.type === 'prop') {
          // Try by assetId first
          if (loc.assetId) {
            const asset = assets.find(a => a.id === loc.assetId);
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
          // Try by prop name if assetId didn't work
          if (!element.imageUrl && loc.name) {
            const propName = loc.name.toLowerCase();
            const asset = assets.find(a =>
              a.name?.toLowerCase() === propName ||
              a.name?.toLowerCase().includes(propName)
            );
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
        }

        // Resolve character images from characters array (fresh URLs, not stale blob URLs)
        // FIRST OCCURRENCE - for beat.locations path
        if (element.type === 'character') {
          let resolved = false;
          let character: Character | undefined;
          let state: any;

          // Try by characterId first
          if (loc.characterId) {
            character = characters.find(c => c.id === loc.characterId);
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by characterName if characterId didn't work
          if (!character && loc.characterName) {
            const charName = loc.characterName.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by element name as character name (fallback)
          if (!character && loc.name) {
            const charName = loc.name.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Resolve image URL using helper (handles stale blob URLs via assetId lookup)
          if (character) {
            const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets);
            if (resolvedUrl) {
              element.imageUrl = resolvedUrl;
              resolved = true;
            }
          }

          if (!resolved) {
            console.warn('[VisualWorkspace] Character NOT resolved (beat.locations), using original imageUrl:', element.imageUrl);
          }
        }

        // Populate text content from beat parameters based on element name
        // Note: nameLower is already defined above for button detection
        if (element.type === 'dialog' || element.type === 'text') {
          if (beat.type === 'introText' || beat.type === 'durScreen') {
            element.text = params.text || '';
          } else if (beat.type === 'hyperText') {
            element.text = params.text || '';
          } else if (beat.type === 'endScreen' && nameLower.includes('message')) {
            element.text = params.message || 'The End';
          } else if (beat.type === 'dialogTree') {
            // DialogTree stores text in dialogTree.text, not params.text
            element.text = params.dialogTree?.text || params.text || '';
          } else if (beat.type === 'titleScreen') {
            if (nameLower.includes('title')) {
              element.text = params.title || 'Untitled Story';
            } else if (nameLower.includes('author')) {
              element.text = params.author || 'Anonymous';
            }
          } else if (beat.type === 'movementChoice' || beat.type === 'pickProp') {
            // Text element gets question text - check for 'question' OR 'text' name
            if (nameLower.includes('question') || nameLower === 'text') {
              element.text = params.question || params.text || '';
            }
          } else if (beat.type === 'inputText') {
            if (nameLower.includes('prompt')) {
              element.text = params.prompt || 'Please enter your response:';
            }
          }
        } else if (element.type === 'button') {
          // Populate button text from params
          if (beat.type === 'titleScreen' && nameLower.includes('start')) {
            element.text = params.buttonText || 'Start';
          } else if (beat.type === 'endScreen') {
            if (nameLower.includes('restart') || nameLower.includes('again')) {
              element.text = params.restartText || params.buttonText || 'Play Again';
            } else if (nameLower.includes('credits')) {
              element.text = params.creditsText || 'Credits';
            }
          } else {
            element.text = params.buttonText || loc.name || 'Continue';
          }
        }

        return element;
      }).filter((element: any) => element !== null && element.name !== 'Main Text');
    }
    // Priority 2: Fall back to params.visualElements (legacy/initial load)
    else if (params.visualElements && params.visualElements.length > 0) {
      console.log('[VisualWorkspace] Loading from params.visualElements');
      elements = params.visualElements;
    }
    // Priority 3: Convert from params.locs (ASML import)
    else if (params.locs && params.locs.length > 0) {
      console.log('[DEBUG] Converting locations to visual elements:', params.locs);
      console.log('[DEBUG] Beat type:', beat.type);
      elements = params.locs.map((loc: any) => {
        console.log('[DEBUG] Converting location:', { kind: loc.kind, name: loc.name, text: loc.text });

        // Skip deprecated "Main Text" elements to prevent duplication
        if (loc.name === 'Main Text') {
          console.log('[DEBUG] Skipping deprecated Main Text element');
          return null;
        }

        // Detect if this is a button based on name (legacy ASML uses kind="text" for buttons)
        const nameLower = loc.name?.toLowerCase() || '';
        const isButtonByName = nameLower.includes('button') ||
                               nameLower.includes('start') ||
                               nameLower.includes('continue') ||
                               nameLower.includes('restart') ||
                               nameLower.includes('credits') ||
                               nameLower.includes('submit') ||
                               nameLower.includes('skip');

        const element: any = {
          id: `element_${Date.now()}_${Math.random()}`,
          type: loc.kind === 'char' || loc.kind === 'character' ? 'character' :
                loc.kind === 'button' ? 'button' :
                isButtonByName ? 'button' : // Detect buttons by name for legacy ASML
                loc.kind === 'text' ? 'dialog' : // Convert remaining text to dialog
                loc.kind === 'inputfield' ? 'hotspot' :
                loc.kind === 'meter' ? 'meter' :
                loc.kind,
          name: loc.name,
          text: loc.text, // Will be populated below if missing
          speaker: loc.speaker,
          assetId: loc.assetId,
          imageUrl: loc.imageUrl, // Direct image URL (for ASML imported characters)
          // Character-specific properties
          characterId: loc.characterId,
          characterName: loc.characterName,
          stateId: loc.stateId,
          size: loc.size,
          x: loc.x,
          y: loc.y,
          z: loc.z || 0,
          width: loc.width,
          height: loc.height,
          rotation: loc.rotation || 0,
          scale: loc.scale || 1,
          visible: true,
          locked: false,
          sound: loc.sound,
          // Include font properties from location
          font: loc.font,
          fontSize: loc.fontSize,
          textAlign: loc.textAlign,
          // Meter-specific properties
          counterName: loc.counterName,
          meterOrientation: loc.meterOrientation,
          showNumericValue: loc.showNumericValue,
          numericFormat: loc.numericFormat,
          meterColor: loc.meterColor,
          meterBackgroundColor: loc.meterBackgroundColor
        };

        // Resolve asset URL for props immediately (so updateImageDimensions can use it)
        if (element.type === 'prop') {
          // Try by assetId first
          if (loc.assetId) {
            const asset = assets.find(a => a.id === loc.assetId);
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
          // Try by prop name if assetId didn't work
          if (!element.imageUrl && loc.name) {
            const propName = loc.name.toLowerCase();
            const asset = assets.find(a =>
              a.name?.toLowerCase() === propName ||
              a.name?.toLowerCase().includes(propName)
            );
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
        }

        // Resolve character images from characters array (fresh URLs, not stale blob URLs)
        // SECOND OCCURRENCE - for params.locs path
        if (element.type === 'character') {
          let character: Character | undefined;
          let state: any;

          // Try by characterId first
          if (loc.characterId) {
            character = characters.find(c => c.id === loc.characterId);
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by characterName if characterId didn't work
          if (!character && loc.characterName) {
            const charName = loc.characterName.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by element name as character name (fallback)
          if (!character && loc.name) {
            const charName = loc.name.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Resolve image URL using helper (handles stale blob URLs via assetId lookup)
          if (character) {
            const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets);
            if (resolvedUrl) {
              element.imageUrl = resolvedUrl;
            }
          }
        }

        // CRITICAL FIX: If element is a dialog/text and has no text, get it from beat parameters
        if ((element.type === 'dialog' || loc.kind === 'text') && !element.text && !isButtonByName) {
          // For different beat types, get text from appropriate parameter
          if (beat.type === 'introText' || beat.type === 'durScreen') {
            element.text = params.text;
          } else if (beat.type === 'hyperText') {
            element.text = params.text;
          } else if (beat.type === 'endScreen' && loc.name === 'End Message') {
            element.text = params.message || 'The End';
          } else if (beat.type === 'dialogTree') {
            element.text = params.dialogTree?.text || params.text;
          }
        }

        // Populate button text from beat parameters
        if (element.type === 'button' && !element.text) {
          if (beat.type === 'titleScreen') {
            element.text = params.buttonText || 'Start';
          } else if (beat.type === 'endScreen') {
            if (nameLower.includes('restart') || nameLower.includes('again')) {
              element.text = params.restartText || params.buttonText || 'Play Again';
            } else if (nameLower.includes('credits')) {
              element.text = params.creditsText || 'Credits';
            } else {
              element.text = params.buttonText || 'Continue';
            }
          } else {
            // Default for introText, durScreen, inputText, etc.
            element.text = params.buttonText || 'Continue';
          }
        }

        return element;
      }).filter((element: any) => element !== null); // Remove null elements (skipped "Main Text")
      console.log('Converted elements:', elements);
      
      // CRITICAL FIX: Also populate beat.locations Map from loaded data
      beat.locations.clear();
      elements.forEach((el: VisualElement) => {
        let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter' = el.type as any;
        if (el.type === 'character') kind = 'character';
        else if (el.type === 'prop') kind = 'prop';
        else if (el.type === 'dialog') kind = 'dialog';
        else if (el.type === 'button') kind = 'button';
        else if (el.type === 'hotspot') kind = 'hotspot';
        else if (el.type === 'meter') kind = 'meter';
        else if (el.type === 'text') kind = 'text';

        const location: any = {
          kind,
          name: el.name || el.text || '',
          id: el.id,  // Include element ID for animation targeting
          x: Math.round(el.x),
          y: Math.round(el.y),
          width: Math.round(el.width),
          height: Math.round(el.height),
          zIndex: el.z
        };

        // Add optional properties
        if (el.assetId) location.assetId = el.assetId;
        if (el.sound) location.sound = el.sound;
        if (el.font) location.font = el.font;
        if (el.fontSize !== undefined) location.fontSize = el.fontSize;
        if (el.textAlign) location.textAlign = el.textAlign;
        location.autosize = el.fontSize === undefined;

        // Add meter-specific properties
        if (el.type === 'meter') {
          if (el.characterId) location.characterId = el.characterId;
          if (el.counterName) location.counterName = el.counterName;
          if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
          if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
          if (el.numericFormat) location.numericFormat = el.numericFormat;
          if (el.meterColor) location.meterColor = el.meterColor;
          if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
        }

        beat.locations.set(el.name || el.id, location);
      });
      console.log(`[VisualWorkspace] Loaded ${beat.locations.size} locations to beat.locations Map`);
    }
    
    // Calculate dynamic center positions based on project settings
    const centerX = projectSettings?.width ? projectSettings.width / 2 : 512;
    const centerY = projectSettings?.height ? projectSettings.height / 2 : 384;

    // SCHEMA-DRIVEN LOCATION INITIALIZATION
    // Use SchemaLocationInitializer to generate elements from schema
    if (elements.length === 0 && beat.locations.size === 0) {
      console.log(`[VisualWorkspace] Using SchemaLocationInitializer for ${beat.type}`);
      const schemaElements = initializeLocationsFromSchema(beat, params, projectSettings);
      elements = schemaElements;
    }

    // Fallback: Auto-add beat-specific elements if not already present (legacy)
    // Note: All visible beats now use schema-driven initialization only

    // Load background from node parameter (old ASML style) or backgroundAssetId
    const bgId = params.node || params.backgroundAssetId || '';
    // Use direct backgroundUrl from ASML import (if available) - avoids asset lookup
    const bgUrl = params.backgroundUrl || '';

    console.warn(`[VisualWorkspace] ★★★ Setting ${elements.length} elements for ${beat.type} ★★★`);
    console.warn(`[VisualWorkspace] ========== ELEMENT POSITIONS BEING SET ==========`);
    elements.forEach((e, idx) => {
      console.warn(`[VisualWorkspace]   [${idx}] ${e.type}/${e.name}: x=${e.x}, y=${e.y}, w=${e.width}, h=${e.height}, size=${e.size}, fontSize=${e.fontSize}`);
    });
    console.warn(`[VisualWorkspace] ================================================`);
    console.log(`[VisualWorkspace] Background: bgId=${bgId?.substring?.(0, 8) || 'none'}, bgUrl=${bgUrl ? 'set' : 'none'}`);

    setVisualElements(elements);
    setBackgroundAssetId(bgId);
    setBackgroundUrl(bgUrl);
    setBackgroundSound(params.backgroundSound || '');
    // Load animations from beat.animations first (direct property), fallback to params.animations
    console.log(`[VisualWorkspace] Loading animations: beat.animations=${beat.animations?.length || 0}, params.animations=${params.animations?.length || 0}`);
    setAnimations(beat.animations || params.animations || []);
    setHasChanges(false);

    // Update character/prop element dimensions based on actual image size
    // This ensures the selection box and Properties panel show correct dimensions
    const updateImageDimensions = async () => {
      const elementsNeedingUpdate = elements.filter(el =>
        (el.type === 'character' || el.type === 'prop') &&
        (el.imageUrl || el.assetUrl) &&
        // Check for default/scaled default dimensions (100x100 or 128x128 from ASML scaling)
        ((el.width === 100 && el.height === 100) || (el.width === 128 && el.height === 128))
      );

      if (elementsNeedingUpdate.length === 0) return;

      console.log(`[VisualWorkspace] Loading ${elementsNeedingUpdate.length} images to get actual dimensions`);

      const updates: { id: string; width: number; height: number }[] = [];

      await Promise.all(elementsNeedingUpdate.map(el => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            // Apply size percentage to get effective dimensions
            const sizeMultiplier = (el.size || 100) / 100;
            const effectiveWidth = Math.round(img.naturalWidth * sizeMultiplier);
            const effectiveHeight = Math.round(img.naturalHeight * sizeMultiplier);
            console.log(`[VisualWorkspace] Image "${el.name}": natural=${img.naturalWidth}x${img.naturalHeight}, size=${el.size}%, effective=${effectiveWidth}x${effectiveHeight}`);
            updates.push({ id: el.id, width: effectiveWidth, height: effectiveHeight });
            resolve();
          };
          img.onerror = () => {
            console.warn(`[VisualWorkspace] Failed to load image for "${el.name}"`);
            resolve();
          };
          img.src = el.imageUrl || el.assetUrl!;
        });
      }));

      if (updates.length > 0) {
        setVisualElements(prev => prev.map(el => {
          const update = updates.find(u => u.id === el.id);
          if (update) {
            return { ...el, width: update.width, height: update.height };
          }
          return el;
        }));
      }
    };

    updateImageDimensions();

    // Update prevBeatIdRef for non-dialogTree beats (dialogTree updates in phase loading effect)
    prevBeatIdRef.current = beat.id;

    // Reset parameter tracking so second useEffect will run for this beat
    prevParamsRef.current = '';
  }, [beat?.id]);

  // Sync visual elements with current parameters when they change
  // This ensures that when parameters change in the Inspector, the visual elements update
  useEffect(() => {
    if (!beat || !beat.getParameters) return;

    const params = beat.getParameters();

    // Create a stable JSON representation of parameters to detect changes
    const paramsJson = JSON.stringify(params);

    // Only run if parameters actually changed
    if (paramsJson === prevParamsRef.current) {
      return;
    }

    console.log('[VisualWorkspace] Parameters changed, syncing visual elements');

    // Log only relevant parameters for this beat type
    const relevantParams: any = { beatType: beat.type };
    if (beat.type === 'titleScreen') {
      relevantParams.title = params.title;
      relevantParams.author = params.author;
      relevantParams.buttonText = params.buttonText;
    } else if (beat.type === 'endScreen') {
      relevantParams.message = params.message;
      relevantParams.restartText = params.restartText;
      relevantParams.creditsText = params.creditsText;
    } else if (beat.type === 'introText' || beat.type === 'durScreen') {
      relevantParams.text = params.text;
      relevantParams.buttonText = params.buttonText;
    } else {
      relevantParams.text = params.text;
      relevantParams.buttonText = params.buttonText;
    }
    console.log('[VisualWorkspace] Syncing visual elements with params:', relevantParams);

    setVisualElements(prev => {
      let updated = [...prev];
      let changed = false;

      // Update text content and auto-resize for IntroText/DurScreen
      if ((beat.type === 'introText' || beat.type === 'durScreen') && params.text) {
        updated = updated.map((e: VisualElement) => {
          if (e.type === 'text' && e.name === 'text') {
            if (e.text !== params.text) {
              changed = true;
              console.log('[VisualWorkspace] Updating text element, fontSize:', e.fontSize);
              // Auto-resize the textbox based on new text and font properties
              const { width, height } = autoSizeTextBox(e, params.text);
              console.log('[VisualWorkspace] Auto-resizing textbox to:', { width, height });
              return { ...e, text: params.text, width, height };
            }
          }
          return e;
        });
      }

      // Update EndScreen button texts and visibility
      if (beat.type === 'endScreen') {
        console.log('[VisualWorkspace] EndScreen detected, checking buttons:', {
          buttons: updated.filter(e => e.type === 'button').map(e => ({ name: e.name, text: e.text })),
          restartText: params.restartText,
          creditsText: params.creditsText,
          buttonText: params.buttonText,
          showRestart: params.showRestart,
          showCredits: params.showCredits
        });

        const stageWidth = projectSettings?.width || 1024;
        const centerX = stageWidth / 2;
        const restartWidth = 180;
        const creditsWidth = 180;
        const buttonSpacing = 20;

        // Check which buttons should exist
        const showRestart = params.showRestart !== false;
        const showCredits = params.showCredits === true;

        // Check which buttons currently exist
        // For legacy imports, any button that's NOT credits is treated as restart button
        const hasCreditsButton = updated.some(e => e.type === 'button' && e.name?.toLowerCase().includes('credits'));
        const hasRestartButton = updated.some(e => e.type === 'button' && !e.name?.toLowerCase().includes('credits'));

        // Remove Restart button if showRestart is false (any non-credits button)
        if (!showRestart && hasRestartButton) {
          console.log('[VisualWorkspace] Removing Restart button (showRestart=false)');
          updated = updated.filter(e => !(e.type === 'button' && !e.name?.toLowerCase().includes('credits')));
          changed = true;
        }

        // Remove Credits button if showCredits is false
        if (!showCredits && hasCreditsButton) {
          console.log('[VisualWorkspace] Removing Credits button (showCredits=false)');
          updated = updated.filter(e => !(e.type === 'button' && e.name?.toLowerCase().includes('credits')));
          changed = true;
        }

        // Add Restart button if showRestart is true and it doesn't exist
        if (showRestart && !hasRestartButton) {
          console.log('[VisualWorkspace] Adding Restart button (showRestart=true)');
          let restartX: number;
          if (showCredits) {
            const totalButtonWidth = restartWidth + creditsWidth + buttonSpacing;
            restartX = centerX - totalButtonWidth / 2;
          } else {
            restartX = centerX - restartWidth / 2;
          }
          updated.push({
            id: `button_restart_${Date.now()}`,
            type: 'button',
            name: 'Restart',
            text: params.restartText || params.buttonText || 'Play Again',
            x: restartX,
            y: 450,
            z: 11,
            width: 180,
            height: 50,
            rotation: 0,
            scale: 1,
            visible: true,
            locked: false,
            font: 'Arial',
            fontSize: 18,
            textAlign: 'center'
          });
          changed = true;
        }

        // Add Credits button if showCredits is true and it doesn't exist
        if (showCredits && !hasCreditsButton) {
          console.log('[VisualWorkspace] Adding Credits button (showCredits=true)');
          let creditsX: number;
          if (showRestart) {
            const totalButtonWidth = restartWidth + creditsWidth + buttonSpacing;
            creditsX = centerX - totalButtonWidth / 2 + restartWidth + buttonSpacing;
          } else {
            creditsX = centerX - creditsWidth / 2;
          }
          updated.push({
            id: `button_credits_${Date.now()}`,
            type: 'button',
            name: 'Credits',
            text: params.creditsText || 'Credits',
            x: creditsX,
            y: 450,
            z: 12,
            width: 180,
            height: 50,
            rotation: 0,
            scale: 1,
            visible: true,
            locked: false,
            font: 'Arial',
            fontSize: 18,
            textAlign: 'center'
          });
          changed = true;
        }

        // Update existing button texts and positions
        updated = updated.map((e: VisualElement) => {
          if (e.type === 'button') {
            const nameLower = e.name?.toLowerCase() || '';
            console.log('[VisualWorkspace] Checking button:', { name: e.name, nameLower, text: e.text });

            // Update Restart button text and position
            if (nameLower.includes('restart') || nameLower.includes('again')) {
              const newText = params.restartText || params.buttonText || 'Play Again';
              let newX = e.x;

              // Recalculate position based on whether Credits button exists
              const creditsExists = updated.some(el => el.type === 'button' && el.name?.toLowerCase().includes('credits'));
              if (creditsExists) {
                // Use ACTUAL button widths, not hardcoded values
                const actualRestartWidth = e.width;
                const creditsButton = updated.find(el => el.type === 'button' && el.name?.toLowerCase().includes('credits'));
                const actualCreditsWidth = creditsButton?.width || creditsWidth;
                const totalButtonWidth = actualRestartWidth + actualCreditsWidth + buttonSpacing;
                newX = centerX - totalButtonWidth / 2;
              } else {
                // Single button - use actual width
                newX = centerX - e.width / 2;
              }

              if (e.text !== newText || e.x !== newX) {
                console.log(`[VisualWorkspace] Updating Restart button: text="${newText}", x=${newX}`);
                changed = true;
                return { ...e, text: newText, x: newX };
              }
            }
            // Update Credits button text and position
            else if (nameLower.includes('credits')) {
              const newText = params.creditsText || 'Credits';
              let newX = e.x;

              // Recalculate position based on whether Restart button exists
              const restartExists = updated.some(el => el.type === 'button' && el.name?.toLowerCase().includes('restart'));
              if (restartExists) {
                // Use ACTUAL button widths, not hardcoded values
                const restartButton = updated.find(el => el.type === 'button' && (el.name?.toLowerCase().includes('restart') || el.name?.toLowerCase().includes('again')));
                const actualRestartWidth = restartButton?.width || restartWidth;
                const actualCreditsWidth = e.width;
                const totalButtonWidth = actualRestartWidth + actualCreditsWidth + buttonSpacing;
                newX = centerX - totalButtonWidth / 2 + actualRestartWidth + buttonSpacing;
              } else {
                // Single button - use actual width
                newX = centerX - e.width / 2;
              }

              if (e.text !== newText || e.x !== newX) {
                console.log(`[VisualWorkspace] Updating Credits button: text="${newText}", x=${newX}`);
                changed = true;
                return { ...e, text: newText, x: newX };
              }
            }
          }
          return e;
        });
      }

      // Update TitleScreen text elements and button
      if (beat.type === 'titleScreen') {
        updated = updated.map((e: VisualElement) => {
          const nameLower = e.name?.toLowerCase() || '';
          if (e.type === 'button' && nameLower.includes('start')) {
            const newText = params.buttonText || 'Start';
            if (e.text !== newText) {
              console.log(`[VisualWorkspace] Updating Start button text from "${e.text}" to "${newText}"`);
              changed = true;
              return { ...e, text: newText };
            }
          } else if (e.type === 'text' || e.type === 'dialog') {
            if (nameLower.includes('title')) {
              const newText = params.title || 'Untitled Story';
              if (e.text !== newText) {
                console.log(`[VisualWorkspace] Updating Title text from "${e.text}" to "${newText}"`);
                changed = true;
                // Auto-size the element based on new text and font properties
                const sizeFunc = e.type === 'dialog' ? autoSizeDialog : autoSizeTextBox;
                const { width, height } = sizeFunc(e, newText);
                return { ...e, text: newText, width, height };
              }
            } else if (nameLower.includes('author')) {
              const newText = params.author || 'Anonymous';
              if (e.text !== newText) {
                console.log(`[VisualWorkspace] Updating Author text from "${e.text}" to "${newText}"`);
                changed = true;
                // Auto-size the element based on new text and font properties
                const sizeFunc = e.type === 'dialog' ? autoSizeDialog : autoSizeTextBox;
                const { width, height } = sizeFunc(e, newText);
                return { ...e, text: newText, width, height };
              }
            } else if (nameLower.includes('message')) {
              // Handle message box for endScreen
              const newText = params.message || 'The End';
              if (e.text !== newText) {
                console.log(`[VisualWorkspace] Updating message text from "${e.text}" to "${newText}"`);
                changed = true;
                // Auto-size the element based on new text and font properties
                const sizeFunc = e.type === 'dialog' ? autoSizeDialog : autoSizeTextBox;
                const { width, height } = sizeFunc(e, newText);
                return { ...e, text: newText, width, height };
              }
            }
          }
          return e;
        });
      }

      if (changed) {
        console.log('[VisualWorkspace] Visual elements updated');
        setHasChanges(true); // Mark as changed so Save button appears
      }

      return changed ? updated : prev;
    });

    // Update previous parameters ref
    prevParamsRef.current = paramsJson;
  }, [beat, beat?.id, projectSettings]); // Depend on beat, beat.id, and projectSettings

  // Get beat content for display
  const getBeatContent = () => {
    if (!beat) return undefined;
    const params = beat.getParameters ? beat.getParameters() : {};
    
    switch (beat.type) {
      case 'titleScreen':
        return {
          title: params.title || 'Untitled',
          author: params.author || 'Unknown',
          buttonText: params.buttonText || 'Start'
        };
      case 'introText':
        return {
          text: params.text || '',
          buttonText: params.buttonText || 'Continue'
        };
      case 'durScreen':
        return {
          text: params.text || '',
          // DurScreen should NOT have a button - it auto-advances
        };
      case 'endScreen':
        return {
          message: params.message || 'The End',
          showRestart: params.showRestart !== false,
          showCredits: params.showCredits || false,
          restartText: params.restartText || 'Play Again',
          creditsText: params.creditsText || 'Credits',
          buttonText: params.buttonText
        };
      case 'dialogTree':
        return {
          speaker: params.speaker || params.dialogTree?.speaker || 'Character',
          text: params.text || params.dialogTree?.text || '',
          choices: params.dialogTree?.choices || []
        };
      case 'movement':
        return {
          question: params.question || 'Where do you want to go?',
          choices: params.choices || []
        };
      case 'pickProp':
        return {
          question: params.question || 'What do you want to interact with?',
          props: params.props || []
        };
      case 'inputText':
        return {
          prompt: params.prompt || 'Please enter your response:',
          placeholder: params.placeholder || 'Type here...',
          buttonText: params.buttonText || 'Continue'
        };
      case 'hyperText':
        return {
          text: params.text || 'Click on any word to explore.',
          hyperlinks: params.hyperlinks || []
        };
      case 'video':
        return {
          videoFile: params.videoFile || '',
          skipButton: params.skipButton !== false
        };
      default:
        return params;
    }
  };

  // Handle asset selection
  const handleAssetSelection = useCallback((
    type: 'background' | 'character' | 'prop' | 'sound',
    callback: (asset: Asset) => void
  ) => {
    setAssetModal({
      isOpen: true,
      type,
      callback
    });
  }, []);

  // Handle asset selected from modal
  const handleAssetSelected = (asset: Asset) => {
    if (assetModal.callback) {
      assetModal.callback(asset);
    }
    setAssetModal({ isOpen: false, type: null, callback: null });
  };

  // Handle background selection
  const handleBackgroundSelect = useCallback(() => {
    handleAssetSelection('background', (asset) => {
      setBackgroundAssetId(asset.id);
      setHasChanges(true);

      // CRITICAL FIX: Immediately persist background to beat parameters
      // This ensures the background is saved even without switching beats
      if (beat && beat.updateParameters) {
        const params = beat.getParameters ? beat.getParameters() : {};
        beat.updateParameters({
          ...params,
          backgroundAssetId: asset.id,
          node: asset.id // Also set 'node' for compatibility with Beat.execute()
        });
        console.log(`[VisualWorkspace] Background immediately persisted to beat: ${asset.id}`);
      }
    });
  }, [handleAssetSelection, beat]);

  // Save visual changes
  const handleSave = () => {
    if (!beat || !beat.updateParameters) return;
    
    const params = beat.getParameters ? beat.getParameters() : {};
    
    // CRITICAL FIX: Update beat.locations Map directly
    // Clear existing locations
    beat.locations.clear();
    
    // Add all visual elements as locations
    visualElements.forEach(el => {
      // Skip deprecated "Main Text" elements to prevent saving them back
      if (el.name === 'Main Text') {
        console.log('[DEBUG] Skipping deprecated Main Text element during save');
        return;
      }

      // For DialogTree beats, skip dialog and button elements (they're regenerated per phase)
      if (beat.type === 'dialogTree' && (el.type === 'dialog' || el.type === 'button')) {
        return;
      }

      let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter' = el.type as any;

      if (el.type === 'character') kind = 'character';
      else if (el.type === 'prop') kind = 'prop';
      else if (el.type === 'dialog') kind = 'dialog';
      else if (el.type === 'button') kind = 'button';
      else if (el.type === 'hotspot') kind = 'hotspot';
      else if (el.type === 'text') kind = 'text';
      else if (el.type === 'meter') kind = 'meter';

      const location: any = {
        kind,
        name: el.name || el.text || '',
        id: el.id,  // Include element ID for animation targeting
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
        zIndex: el.z
      };

      // Add optional properties
      if (el.assetId) location.assetId = el.assetId;
      if (el.imageUrl) location.imageUrl = el.imageUrl;  // Preserve direct image URL (ASML imports)
      if (el.sound) location.sound = el.sound;

      // Add font properties
      if (el.font) location.font = el.font;
      if (el.fontSize !== undefined) location.fontSize = el.fontSize;
      if (el.textAlign) location.textAlign = el.textAlign;

      // Set autosize - only enable if fontSize is not explicitly set
      location.autosize = el.fontSize === undefined;

      // Add character-specific properties (for kind='character')
      if (el.type === 'character') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.characterName) location.characterName = el.characterName;  // Preserve character name
        if (el.stateId) location.stateId = el.stateId;
        if (el.size !== undefined) location.size = el.size;
        // Look up character name for ASML export compatibility (if not already set)
        if (!location.characterName) {
          const character = characters.find(c => c.id === el.characterId);
          if (character) {
            location.characterName = character.name;
          }
        }
      }

      // Add meter-specific properties (for kind='meter')
      if (el.type === 'meter') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.counterName) location.counterName = el.counterName;
        if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
        if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
        if (el.numericFormat) location.numericFormat = el.numericFormat;
        if (el.meterColor) location.meterColor = el.meterColor;
        if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
      }

      beat.locations.set(el.name || el.id, location);
    });
    
    console.log(`[VisualWorkspace] Saved ${beat.locations.size} locations to beat`);

    // Save visual data to parameters
    beat.updateParameters({
      ...params,
      visualElements,
      backgroundAssetId,
      node: backgroundAssetId,
      backgroundSound,
      animations
    });

    // Also set animations directly on beat (updateParameters doesn't handle base Beat properties)
    beat.animations = animations;
    console.log(`[VisualWorkspace] Saved animations to beat:`, animations.length, animations);

    setHasChanges(false);

    // Show save confirmation
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in';
    notification.textContent = 'Visual changes saved!';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('animate-fade-out');
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 2000);
  };

  if (!beat) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center text-gray-500">
          <Info className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Beat Selected</h3>
          <p className="text-sm">Select a visual beat from the flowchart to start editing</p>
        </div>
      </div>
    );
  }

  const selectedElement = visualElements.find(el => el.id === selectedElementId);
  const content = getBeatContent();

  // Debug: log selected element details when selection changes
  if (selectedElement) {
    console.warn(`[VisualWorkspace] ★ SELECTED ELEMENT: ${selectedElement.type}/${selectedElement.name}`);
    console.warn(`[VisualWorkspace]   Position: x=${selectedElement.x}, y=${selectedElement.y}`);
    console.warn(`[VisualWorkspace]   Size: w=${selectedElement.width}, h=${selectedElement.height}, size=${selectedElement.size}`);
  }

  console.log('[VisualWorkspace] beatContent for rendering:', { beatType: beat?.type, content });

  // Handle sharing current background to cluster
  const handleShareBackgroundToCluster = useCallback(() => {
    if (!cluster || !onSetClusterSharedVisuals) return;

    const currentSharedVisuals = cluster.sharedVisuals || { locations: [] };
    const newSharedVisuals: SharedVisualContent = {
      ...currentSharedVisuals,
      background: backgroundAssetId ? {
        assetId: backgroundAssetId,
        scale: 1,
        opacity: 1,
      } : undefined,
    };

    onSetClusterSharedVisuals(cluster.id, newSharedVisuals);
    console.log('[VisualWorkspace] Shared background to cluster:', cluster.name, newSharedVisuals);
  }, [cluster, onSetClusterSharedVisuals, backgroundAssetId]);

  // Handle sharing selected element to cluster
  const handleShareElementToCluster = useCallback(() => {
    if (!cluster || !onSetClusterSharedVisuals || !selectedElementId) return;

    const elementToShare = visualElements.find(el => el.id === selectedElementId);
    if (!elementToShare) return;

    // Convert VisualElement to Location format
    const locationToShare: Location = {
      x: elementToShare.x,
      y: elementToShare.y,
      width: elementToShare.width,
      height: elementToShare.height,
      kind: elementToShare.type,  // Map 'type' to 'kind'
      name: elementToShare.name || elementToShare.id,  // Use name or fall back to id
      // Copy relevant properties
      assetId: elementToShare.assetId,
      characterId: elementToShare.characterId,
      fontSize: elementToShare.fontSize,
    };

    const currentSharedVisuals = cluster.sharedVisuals || { locations: [] };
    const newSharedVisuals: SharedVisualContent = {
      ...currentSharedVisuals,
      locations: [...(currentSharedVisuals.locations || []), locationToShare],
    };

    onSetClusterSharedVisuals(cluster.id, newSharedVisuals);
    console.log('[VisualWorkspace] Shared element to cluster:', elementToShare.name, cluster.name);
  }, [cluster, onSetClusterSharedVisuals, selectedElementId, visualElements]);

  return (
    <div className="h-full flex bg-gray-100 relative">
      {/* Left Panel with Tabs */}
      {showProperties && (
        <div
          className="bg-white border-r border-gray-200 flex flex-col relative"
          style={{ width: leftPanelWidth, minWidth: 280, maxWidth: 600 }}
        >
          {/* Resize Handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10"
            style={{ backgroundColor: isResizingPanel ? '#3b82f6' : 'transparent' }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingPanel(true);
            }}
          />
          {/* Cluster Info Banner */}
          {cluster && (
            <div className="p-2 bg-teal-50 border-b border-teal-200">
              <div className="flex items-center gap-2 text-sm">
                <Share2 className="w-4 h-4 text-teal-600" />
                <span className="font-medium text-teal-700">In cluster: {cluster.name}</span>
              </div>
              {cluster.sharedVisuals && (
                <div className="mt-1 text-xs text-teal-600">
                  {cluster.sharedVisuals.background ? '✓ Shared background' : ''}
                  {cluster.sharedVisuals.locations?.length ? ` • ${cluster.sharedVisuals.locations.length} shared element(s)` : ''}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {backgroundAssetId && onSetClusterSharedVisuals && (
                  <button
                    onClick={handleShareBackgroundToCluster}
                    className="px-2 py-1 text-xs bg-teal-500 text-white rounded hover:bg-teal-600"
                    title="Share current background with all beats in this cluster"
                  >
                    Share Background
                  </button>
                )}
                {selectedElementId && onSetClusterSharedVisuals && (
                  <button
                    onClick={handleShareElementToCluster}
                    className="px-2 py-1 text-xs bg-teal-500 text-white rounded hover:bg-teal-600"
                    title="Share selected element with all beats in this cluster"
                  >
                    Share Element
                  </button>
                )}
              </div>
            </div>
          )}

          {/* DialogTree Phase Navigator */}
          {isDialogTreeBeat && (
            <div className="border-b border-gray-200 bg-purple-50">
              {/* Header with expand/collapse */}
              <button
                onClick={() => setPhasesExpanded(!phasesExpanded)}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
              >
                {phasesExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <MessageSquare className="w-4 h-4" />
                <span>Dialog Phases ({flattenedPhases.length})</span>
              </button>

              {/* Phase tree list */}
              {phasesExpanded && (
                <div className="px-2 pb-2 max-h-48 overflow-y-auto">
                  {flattenedPhases.map((phase, index) => (
                    <button
                      key={phase.id}
                      onClick={() => handlePhaseSelect(phase.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        selectedPhaseId === phase.id
                          ? 'bg-purple-200 text-purple-900 ring-1 ring-purple-400'
                          : 'hover:bg-purple-100 text-purple-800'
                      }`}
                      style={{ paddingLeft: `${8 + phase.depth * 12}px` }}
                      title={phase.fullText}
                    >
                      <div className="flex items-start gap-1">
                        <span className="text-purple-500 font-medium shrink-0">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          {phase.choiceText && (
                            <div className="text-purple-400 text-[10px] truncate">
                              [{phase.choiceText}] →
                            </div>
                          )}
                          <div className="truncate">
                            <span className="font-medium">{phase.speaker}:</span>{' '}
                            {phase.text}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Buttons */}
          <div className="flex border-b border-gray-200">
            <button
              className={`flex-1 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'elements'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab('elements')}
            >
              Elements
            </button>
            <button
              className={`flex-1 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'animations'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab('animations')}
            >
              Animations
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'elements' && (
              <VisualPropertiesPanel
                backgroundAssetId={backgroundAssetId}
                elements={visualElements}
                selectedElement={selectedElementId}
                onBackgroundSelect={handleBackgroundSelect}
                onElementSelect={setSelectedElementId}
                onElementUpdate={(elementId, updates) => {
                  setVisualElements(prev => prev.map(el => {
                    if (el.id === elementId) {
                      const updatedElement = { ...el, ...updates };

                      // Auto-resize if fontSize, font, or text changes for text/button/dialog elements
                      if ((el.type === 'text' || el.type === 'dialog' || el.type === 'button') &&
                          (updates.fontSize !== undefined || updates.font !== undefined || updates.text !== undefined)) {
                        const text = updatedElement.text || '';
                        const fontSize = updatedElement.fontSize || 16;
                        const fontFamily = updatedElement.font || 'Arial';

                        // Choose appropriate sizing function based on element type
                        let newDimensions;
                        if (el.type === 'button') {
                          newDimensions = calculateButtonDimensions(text, fontSize, fontFamily);
                        } else if (el.type === 'dialog') {
                          newDimensions = calculateDialogDimensions(text, fontSize, fontFamily);
                        } else {
                          newDimensions = calculateTextBoxDimensions(text, fontSize, fontFamily);
                        }

                        console.log(`[VisualWorkspace] Auto-resizing ${el.type} element`, {
                          text: text.substring(0, 30) + '...',
                          fontSize,
                          fontFamily,
                          newDimensions
                        });

                        let resizedElement = { ...updatedElement, width: newDimensions.width, height: newDimensions.height };

                        // For buttons, recalculate x position to keep them centered
                        if (el.type === 'button') {
                          const stageWidth = projectSettings?.width || 1024;
                          const centerX = stageWidth / 2;
                          const nameLower = el.name?.toLowerCase() || '';

                          // Check if this is an EndScreen button (Restart or Credits)
                          if (nameLower.includes('restart') || nameLower.includes('again') || nameLower.includes('credits')) {
                            // Find if there are both Restart and Credits buttons
                            const hasRestartButton = prev.some(e =>
                              e.type === 'button' && (e.name?.toLowerCase().includes('restart') || e.name?.toLowerCase().includes('again'))
                            );
                            const hasCreditsButton = prev.some(e =>
                              e.type === 'button' && e.name?.toLowerCase().includes('credits')
                            );

                            if (hasRestartButton && hasCreditsButton) {
                              // Two buttons - calculate total width and position accordingly
                              const restartButton = prev.find(e =>
                                e.type === 'button' && (e.name?.toLowerCase().includes('restart') || e.name?.toLowerCase().includes('again'))
                              );
                              const creditsButton = prev.find(e =>
                                e.type === 'button' && e.name?.toLowerCase().includes('credits')
                              );

                              const restartWidth = (nameLower.includes('restart') || nameLower.includes('again')) ? newDimensions.width : (restartButton?.width || 180);
                              const creditsWidth = nameLower.includes('credits') ? newDimensions.width : (creditsButton?.width || 180);
                              const buttonSpacing = 20;
                              const totalButtonWidth = restartWidth + creditsWidth + buttonSpacing;

                              if (nameLower.includes('restart') || nameLower.includes('again')) {
                                // Restart button is on the left
                                resizedElement.x = centerX - totalButtonWidth / 2;
                              } else if (nameLower.includes('credits')) {
                                // Credits button is on the right
                                resizedElement.x = centerX - totalButtonWidth / 2 + restartWidth + buttonSpacing;
                              }
                            } else {
                              // Single button - center it
                              resizedElement.x = centerX - newDimensions.width / 2;
                            }
                          }
                        }

                        return resizedElement;
                      }

                      return updatedElement;
                    }
                    return el;
                  }));
                  setHasChanges(true);
                }}
                onElementDelete={(elementId) => {
                  // Find the element before removing it so we can remove from beat.locations
                  const elementToDelete = visualElements.find(el => el.id === elementId);

                  setVisualElements(prev => prev.filter(el => el.id !== elementId));
                  if (selectedElementId === elementId) {
                    setSelectedElementId(null);
                  }
                  setHasChanges(true);

                  // CRITICAL: Also remove from beat.locations immediately for Preview consistency
                  if (beat && elementToDelete) {
                    const locationKey = elementToDelete.name || elementToDelete.id;
                    if (beat.locations.has(locationKey)) {
                      beat.locations.delete(locationKey);
                      console.log(`[VisualWorkspace] Removed "${locationKey}" from beat.locations (now ${beat.locations.size} locations)`);
                    }
                  }
                }}
                onElementAdd={(type) => {
                  const stageWidth = projectSettings?.width || 1024;
                  const stageHeight = projectSettings?.height || 768;

                  // For character type, use Character Manager instead of Asset Manager
                  if (type === 'character' && onOpenCharacterManager) {
                    onOpenCharacterManager((character) => {
                      if (character && character.id) {
                        // Get the default state
                        const defaultState = character.states?.find((s: { id: string }) => s.id === character.defaultState) || character.states?.[0];
                        // Get the image from the state or character default
                        const imageUrl = defaultState?.visual?.image || character.visual?.defaultImage;

                        // Load image to get natural dimensions
                        const addCharacterElement = (width: number, height: number) => {
                          const newElement: VisualElement = {
                            id: `element_${Date.now()}`,
                            type: 'character',
                            name: character.name || 'Character',
                            x: Math.floor(stageWidth / 2) - Math.floor(width / 2),
                            y: Math.floor(stageHeight / 2) - Math.floor(height / 2),
                            z: visualElements.length,
                            width,
                            height,
                            rotation: 0,
                            scale: 1,
                            visible: true,
                            locked: false,
                            characterId: character.id,
                            characterName: character.name,
                            stateId: defaultState?.id || 'default',
                            imageUrl: imageUrl,
                            size: 100 // Default to 100%
                          };
                          setVisualElements(prev => [...prev, newElement]);
                          setSelectedElementId(newElement.id);
                          setHasChanges(true);

                          // CRITICAL: Also persist to beat.locations immediately for Preview
                          if (beat) {
                            const locationName = newElement.name || newElement.id;
                            beat.locations.set(locationName, {
                              kind: 'character',
                              name: locationName,
                              x: Math.round(newElement.x),
                              y: Math.round(newElement.y),
                              width: Math.round(newElement.width),
                              height: Math.round(newElement.height),
                              zIndex: newElement.z,
                              characterId: character.id,
                              characterName: character.name,
                              stateId: defaultState?.id || 'default'
                            });
                            console.log(`[VisualWorkspace] Added character "${locationName}" to beat.locations (now ${beat.locations.size} locations)`);
                          }
                        };

                        // Try to load image to get natural dimensions
                        if (imageUrl) {
                          const img = new Image();
                          img.onload = () => {
                            addCharacterElement(img.naturalWidth, img.naturalHeight);
                          };
                          img.onerror = () => {
                            // Fallback to default size if image fails to load
                            addCharacterElement(150, 150);
                          };
                          img.src = imageUrl;
                        } else {
                          // No image, use default size
                          addCharacterElement(150, 150);
                        }
                      }
                    });
                    return;
                  }

                  // For prop type, open asset selection modal
                  if (type === 'prop' && onAssetSelect) {
                    setAssetModal({
                      isOpen: true,
                      type: 'prop',
                      callback: (asset) => {
                        if (asset && asset.id) {
                          // Helper to add the prop element with given dimensions
                          const addPropElement = (width: number, height: number) => {
                            const newElement: VisualElement = {
                              id: `element_${Date.now()}`,
                              type,
                              name: asset.name || 'Prop',
                              x: Math.floor(stageWidth / 2) - Math.floor(width / 2),
                              y: Math.floor(stageHeight / 2) - Math.floor(height / 2),
                              z: visualElements.length,
                              width,
                              height,
                              rotation: 0,
                              scale: 1,
                              visible: true,
                              locked: false,
                              assetId: asset.id,
                            };
                            setVisualElements(prev => [...prev, newElement]);
                            setSelectedElementId(newElement.id);
                            setHasChanges(true);

                            // CRITICAL: Also persist to beat.locations immediately for Preview
                            // Without this, newly added props won't appear in Preview
                            if (beat) {
                              const locationName = newElement.name || newElement.id;
                              beat.locations.set(locationName, {
                                kind: 'prop',
                                name: locationName,
                                x: Math.round(newElement.x),
                                y: Math.round(newElement.y),
                                width: Math.round(newElement.width),
                                height: Math.round(newElement.height),
                                zIndex: newElement.z,
                                assetId: asset.id
                              });
                              console.log(`[VisualWorkspace] Added prop "${locationName}" to beat.locations (now ${beat.locations.size} locations)`);
                            }
                          };

                          // Try to load image to get natural dimensions
                          if (asset.url) {
                            const img = new Image();
                            img.onload = () => {
                              addPropElement(img.naturalWidth, img.naturalHeight);
                            };
                            img.onerror = () => {
                              // Fallback to default size if image fails to load
                              addPropElement(150, 150);
                            };
                            img.src = asset.url;
                          } else {
                            // No URL, use default size
                            addPropElement(150, 150);
                          }
                        }
                      }
                    });
                    return;
                  }

                  // For meter type, open meter selection modal
                  if (type === 'meter') {
                    setMeterModal({ isOpen: true });
                    return;
                  }

                  // For text and hotspot types, create element immediately
                  const newElement: VisualElement = {
                    id: `element_${Date.now()}`,
                    type,
                    name: type.charAt(0).toUpperCase() + type.slice(1),
                    x: Math.floor(stageWidth / 2) - 50,
                    y: Math.floor(stageHeight / 2) - 50,
                    z: visualElements.length,
                    width: type === 'text' ? 200 : 100,
                    height: type === 'text' ? 40 : 100,
                    rotation: 0,
                    scale: 1,
                    visible: true,
                    locked: false,
                    text: type === 'text' ? 'New Text' : undefined,
                    // Add font properties for text, dialog, and button elements
                    font: (type === 'text' || type === 'hotspot') ? 'Arial' : undefined,
                    fontSize: (type === 'text' || type === 'hotspot') ? 16 : undefined,
                    textAlign: (type === 'text' || type === 'hotspot') ? 'center' : undefined,
                  };
                  setVisualElements(prev => [...prev, newElement]);
                  setSelectedElementId(newElement.id);
                  setHasChanges(true);
                }}
                onElementReorder={(elementId, direction) => {
                  const sortedElements = [...visualElements].sort((a, b) => b.z - a.z);
                  const index = sortedElements.findIndex(el => el.id === elementId);
                  if (index === -1) return;

                  if (direction === 'up' && index > 0) {
                    // Swap z values
                    const currentZ = sortedElements[index].z;
                    const targetZ = sortedElements[index - 1].z;
                    setVisualElements(prev => prev.map(el => {
                      if (el.id === elementId) return { ...el, z: targetZ };
                      if (el.id === sortedElements[index - 1].id) return { ...el, z: currentZ };
                      return el;
                    }));
                    setHasChanges(true);
                  } else if (direction === 'down' && index < sortedElements.length - 1) {
                    // Swap z values
                    const currentZ = sortedElements[index].z;
                    const targetZ = sortedElements[index + 1].z;
                    setVisualElements(prev => prev.map(el => {
                      if (el.id === elementId) return { ...el, z: targetZ };
                      if (el.id === sortedElements[index + 1].id) return { ...el, z: currentZ };
                      return el;
                    }));
                    setHasChanges(true);
                  }
                }}
                assets={assets}
                stageWidth={projectSettings?.width || 1024}
                stageHeight={projectSettings?.height || 768}
                beatType={beat.type}
                beatName={beat.name}
                onSelectAsset={onAssetSelect}
                onOpenCharacterManager={onOpenCharacterManager}
                characters={characters}
                globalSettings={globalSettings}
                beatTransition={beat.transition}
                onBeatTransitionChange={onBeatUpdate ? (transition) => {
                  onBeatUpdate(beat.id, { transition });
                  setHasChanges(true);
                } : undefined}
                presentationMode={beat.type === 'dialogTree' ? ((beat as any).presentationMode || 'positioned') : undefined}
                onPresentationModeChange={beat.type === 'dialogTree' && onBeatUpdate ? (mode) => {
                  (beat as any).presentationMode = mode;
                  onBeatUpdate(beat.id, { presentationMode: mode } as any);
                  setHasChanges(true);
                } : undefined}
                showAvatars={beat.type === 'dialogTree' ? ((beat as any).showAvatars ?? true) : undefined}
                onShowAvatarsChange={beat.type === 'dialogTree' && onBeatUpdate ? (show) => {
                  (beat as any).showAvatars = show;
                  onBeatUpdate(beat.id, { showAvatars: show } as any);
                  setHasChanges(true);
                } : undefined}
                responseDelay={beat.type === 'dialogTree' ? ((beat as any).responseDelay ?? 0) : undefined}
                onResponseDelayChange={beat.type === 'dialogTree' && onBeatUpdate ? (delay) => {
                  (beat as any).responseDelay = delay;
                  onBeatUpdate(beat.id, { responseDelay: delay } as any);
                  setHasChanges(true);
                } : undefined}
              />
            )}

            {activeTab === 'animations' && (
              <AnimationPanel
                animations={animations}
                elements={visualElements}
                stageWidth={projectSettings?.width || 1024}
                stageHeight={projectSettings?.height || 768}
                backgroundUrl={
                  // Prioritize asset lookup (fresh URL) over direct URL (may be stale blob URL)
                  (backgroundAssetId && assets
                    ? assets.find(a => a.id === backgroundAssetId)?.url
                    : undefined) || backgroundUrl
                }
                characters={characters}
                onAnimationsChange={(newAnimations) => {
                  setAnimations(newAnimations);
                  setHasChanges(true);
                  // CRITICAL: Sync to beat.animations immediately so preview has latest animations
                  if (beat) {
                    beat.animations = newAnimations;
                    console.log(`[VisualWorkspace] Animations immediately synced to beat:`, newAnimations.length, newAnimations);
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Main Visual Editor Canvas - uses VisualBeatEditor */}
      <div className="flex-1 overflow-hidden">
        <VisualBeatEditor
          backgroundAssetId={backgroundAssetId}
          backgroundUrl={backgroundUrl}
          backgroundSound={backgroundSound}
          elements={visualElements}
          onElementsChange={(elements) => {
            setVisualElements(elements);
            setHasChanges(true);
            // CRITICAL: Sync to beat.locations immediately so preview has latest positions
            if (beat) {
              syncElementsToBeatLocations(elements, beat);
            }
          }}
          assets={assets}
          characters={characters}
          onSelectAsset={handleAssetSelection}
          onOpenCharacterManager={onOpenCharacterManager}
          beatContent={content}
          beatType={beat.type}
          selectedElement={selectedElementId}
          onSelectElement={setSelectedElementId}
          projectSettings={projectSettings}
          globalSettings={globalSettings}
          themeAssets={themeAssets}
        />
      </div>

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        isOpen={assetModal.isOpen}
        onClose={() => setAssetModal({ isOpen: false, type: null, callback: null })}
        onSelect={handleAssetSelected}
        assets={assets}
        onAssetAdd={onAssetAdd!}
        onAssetRemove={onAssetRemove!}
        onAssetUpdate={onAssetUpdate!}
        assetType={assetModal.type === 'sound' ? 'audio' : 'image'}
        assetSubType={assetModal.type === 'sound' ? 'sfx' : assetModal.type ?? undefined}
        title={`Select ${assetModal.type || 'Asset'}`}
      />

      {/* Meter Selection Modal */}
      {meterModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Select Counter Meter</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {characters.flatMap(character =>
                (character.counters || [])
                  .filter(counter => counter.showLevelMeter)
                  .map(counter => (
                    <button
                      key={`${character.id}-${counter.name}`}
                      onClick={() => {
                        const stageWidth = projectSettings?.width || 1024;
                        const stageHeight = projectSettings?.height || 768;
                        const isHorizontal = (counter.levelMeterOrientation || 'horizontal') === 'horizontal';

                        const newElement: VisualElement = {
                          id: `meter_${Date.now()}`,
                          type: 'meter',
                          name: `${counter.displayName || counter.name} Meter`,
                          x: 20,
                          y: 20,
                          z: 1000, // High z-index for HUD overlay
                          width: isHorizontal ? 150 : 30,
                          height: isHorizontal ? 20 : 100,
                          rotation: 0,
                          scale: 1,
                          visible: true,
                          locked: false,
                          characterId: character.id,
                          counterName: counter.name,
                          meterOrientation: counter.levelMeterOrientation || 'horizontal',
                          showNumericValue: counter.showNumericValue || false,
                          numericFormat: counter.numericFormat || 'value',
                          meterColor: counter.color || '#3B82F6',
                          meterBackgroundColor: 'rgba(255, 255, 255, 0.3)',
                        };

                        setVisualElements(prev => [...prev, newElement]);
                        setSelectedElementId(newElement.id);
                        setHasChanges(true);

                        // Persist to beat.locations
                        if (beat) {
                          const locationName = newElement.name || newElement.id;
                          beat.locations.set(locationName, {
                            kind: 'meter',
                            name: locationName,
                            x: Math.round(newElement.x),
                            y: Math.round(newElement.y),
                            width: Math.round(newElement.width),
                            height: Math.round(newElement.height),
                            zIndex: newElement.z,
                            characterId: character.id,
                            counterName: counter.name,
                            meterOrientation: counter.levelMeterOrientation || 'horizontal',
                            showNumericValue: counter.showNumericValue || false,
                            numericFormat: counter.numericFormat || 'value',
                            meterColor: counter.color || '#3B82F6',
                            meterBackgroundColor: 'rgba(255, 255, 255, 0.3)',
                          });
                          console.log(`[VisualWorkspace] Added meter "${locationName}" to beat.locations`);
                        }

                        setMeterModal({ isOpen: false });
                      }}
                      className="w-full px-4 py-3 text-left border rounded-lg hover:bg-gray-50 flex items-center gap-3"
                    >
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: counter.color || '#3B82F6' }}
                      />
                      <div>
                        <div className="font-medium">{counter.displayName || counter.name}</div>
                        <div className="text-xs text-gray-500">
                          {character.displayName || character.name} • {counter.levelMeterOrientation || 'horizontal'}
                        </div>
                      </div>
                    </button>
                  ))
              )}
              {!characters.some(c => c.counters?.some(counter => counter.showLevelMeter)) && (
                <div className="text-gray-500 text-center py-4">
                  No counters with level meters enabled.<br />
                  Enable "Show Level Meter" in Character Editor.
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setMeterModal({ isOpen: false })}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
