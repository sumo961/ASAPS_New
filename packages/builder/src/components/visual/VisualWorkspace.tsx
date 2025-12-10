/**
 * Visual Workspace Component
 * Unified visual editor with all controls in one left panel
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Beat, type Location, type AnimationPath } from '@asaps/core';
import { VisualBeatEditor, VisualElement } from './VisualBeatEditor';
import { VisualPropertiesPanel } from './VisualPropertiesPanel';
import { AnimationPanel } from './AnimationPanel';
import { AssetSelectionModal } from '../assets/AssetSelectionModal';
import type { Asset } from '../assets/AssetManager';
import { initializeLocationsFromSchema } from '../../utils/SchemaLocationInitializer';
import { calculateTextBoxDimensions, calculateButtonDimensions, calculateDialogDimensions } from '../../utils/textSizeCalculator';
import { Info } from 'lucide-react';

import type { GlobalSettings } from '../settings/GlobalSettingsInspector';

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
}) => {
  const [visualElements, setVisualElements] = useState<VisualElement[]>([]);
  const [backgroundAssetId, setBackgroundAssetId] = useState<string>('');
  const [backgroundSound, setBackgroundSound] = useState<string>('');
  const [showProperties, setShowProperties] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'elements' | 'animations'>('elements');
  const [animations, setAnimations] = useState<AnimationPath[]>([]);

  // Use refs to track current state for cleanup
  const beatRef = useRef(beat);
  const visualElementsRef = useRef(visualElements);
  const backgroundAssetIdRef = useRef(backgroundAssetId);
  const backgroundSoundRef = useRef(backgroundSound);
  const hasChangesRef = useRef(hasChanges);

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
    backgroundSoundRef.current = backgroundSound;
  }, [backgroundSound]);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  // Asset selection modal state
  const [assetModal, setAssetModal] = useState<{
    isOpen: boolean;
    type: 'background' | 'character' | 'prop' | 'sound' | null;
    callback: ((asset: Asset) => void) | null;
  }>({ isOpen: false, type: null, callback: null });

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

  // Save changes when switching to a different beat - MUST run before load
  const prevBeatIdRef = useRef(beat?.id);

  useEffect(() => {
    // If beat ID is changing and we had unsaved changes, save to the PREVIOUS beat first
    if (beat?.id !== prevBeatIdRef.current && hasChangesRef.current && beatRef.current) {
      const prevBeat = beatRef.current;
      console.log('[VisualWorkspace] Beat changing - auto-saving previous beat:', prevBeatIdRef.current, '-> new:', beat?.id);

      // Save using refs to get current state
      const params = prevBeat.getParameters ? prevBeat.getParameters() : {};

      // Clear beat.locations and repopulate with ALL properties
      prevBeat.locations.clear();

      visualElementsRef.current.forEach((el: VisualElement) => {
        if (el.name === 'Main Text') return;

        let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog';
        if (el.type === 'character') kind = 'character';
        else if (el.type === 'prop') kind = 'prop';
        else if (el.type === 'dialog') kind = 'dialog';
        else if (el.type === 'button') kind = 'button';
        else if (el.type === 'hotspot') kind = 'hotspot';
        else kind = 'text';

        const location: any = {
          kind,
          name: el.name || el.text || '',
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

        prevBeat.locations.set(el.name || el.id, location);
      });

      // Save to parameters
      prevBeat.updateParameters({
        ...params,
        visualElements: visualElementsRef.current,
        backgroundAssetId: backgroundAssetIdRef.current,
        node: backgroundAssetIdRef.current,
        backgroundSound: backgroundSoundRef.current
      });

      console.log(`[VisualWorkspace] Auto-saved ${prevBeat.locations.size} locations to previous beat`);
    }

    // Update beatRef to new beat AFTER saving to previous beat
    beatRef.current = beat;

    // Update previous beat ID
    prevBeatIdRef.current = beat?.id;
  }, [beat]); // Depend on beat object, not beat?.id, to run before the load

  // Initialize from beat parameters
  useEffect(() => {
    if (!beat) return;

    console.log(`[VisualWorkspace] LOADING BEAT: ${beat.type} (id: ${beat.id}, name: ${beat.name})`);

    const params = beat.getParameters ? beat.getParameters() : {};

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
      console.log(`[VisualWorkspace] Loading ${beat.locations.size} elements from beat.locations for ${beat.type}`);
      const locationDetails = Array.from(beat.locations.values()).map((loc: Location) => ({
        name: loc.name,
        kind: loc.kind,
        x: loc.x,
        y: loc.y,
        width: loc.width,
        height: loc.height
      }));
      console.log('[VisualWorkspace] Location details:', locationDetails);
      elements = Array.from(beat.locations.values()).map((loc: Location) => {
        const element: any = {
          id: `element_${Date.now()}_${Math.random()}`,
          type: loc.kind === 'character' ? 'character' :
                loc.kind === 'prop' ? 'prop' :
                loc.kind === 'dialog' ? 'dialog' :
                loc.kind === 'button' ? 'button' :
                loc.kind === 'hotspot' ? 'hotspot' :
                'text',
          name: loc.name,
          text: '', // Will be populated below from params
          assetId: loc.assetId,
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
          textAlign: loc.textAlign
        };

        // Populate text content from beat parameters based on element name
        const nameLower = loc.name.toLowerCase();
        if (element.type === 'dialog' || element.type === 'text') {
          if (beat.type === 'introText' || beat.type === 'durScreen') {
            element.text = params.text || '';
          } else if (beat.type === 'hyperText') {
            element.text = params.text || '';
          } else if (beat.type === 'endScreen' && nameLower.includes('message')) {
            element.text = params.message || 'The End';
          } else if (beat.type === 'dialogTree') {
            element.text = params.text || '';
          } else if (beat.type === 'titleScreen') {
            if (nameLower.includes('title')) {
              element.text = params.title || 'Untitled Story';
            } else if (nameLower.includes('author')) {
              element.text = params.author || 'Anonymous';
            }
          } else if (beat.type === 'movementChoice' || beat.type === 'pickProp') {
            if (nameLower.includes('question')) {
              element.text = params.question || '';
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
        const element: any = {
          id: `element_${Date.now()}_${Math.random()}`,
          type: loc.kind === 'char' ? 'character' :
                loc.kind === 'text' ? 'dialog' : // CRITICAL: Convert text to dialog
                loc.kind === 'inputfield' ? 'hotspot' :
                loc.kind,
          name: loc.name,
          text: loc.text, // Will be populated below if missing
          speaker: loc.speaker,
          assetId: loc.assetId,
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
          textAlign: loc.textAlign
        };
        
        // CRITICAL FIX: If element is a dialog/text and has no text, get it from beat parameters
        if ((element.type === 'dialog' || loc.kind === 'text') && !element.text) {
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
        
        return element;
      }).filter((element: any) => element !== null); // Remove null elements (skipped "Main Text")
      console.log('Converted elements:', elements);
      
      // CRITICAL FIX: Also populate beat.locations Map from loaded data
      beat.locations.clear();
      elements.forEach((el: VisualElement) => {
        let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' = el.type as any;
        if (el.type === 'character') kind = 'character';
        else if (el.type === 'prop') kind = 'prop';
        else if (el.type === 'dialog') kind = 'dialog';
        else if (el.type === 'button') kind = 'button';
        else if (el.type === 'hotspot') kind = 'hotspot';
        else if (el.type === 'text') kind = 'text';

        const location: any = {
          kind,
          name: el.name || el.text || '',
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

    console.log(`[VisualWorkspace] Setting ${elements.length} elements for ${beat.type}:`, elements.map(e => ({ type: e.type, name: e.name, text: e.text })));

    setVisualElements(elements);
    setBackgroundAssetId(bgId);
    setBackgroundSound(params.backgroundSound || '');
    setAnimations(params.animations || []);
    setHasChanges(false);

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
        const hasRestartButton = updated.some(e => e.type === 'button' && e.name?.toLowerCase().includes('restart'));
        const hasCreditsButton = updated.some(e => e.type === 'button' && e.name?.toLowerCase().includes('credits'));

        // Remove Restart button if showRestart is false
        if (!showRestart && hasRestartButton) {
          console.log('[VisualWorkspace] Removing Restart button (showRestart=false)');
          updated = updated.filter(e => !(e.type === 'button' && e.name?.toLowerCase().includes('restart')));
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
    });
  }, [handleAssetSelection]);

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
      let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' = el.type as any;
      
      if (el.type === 'character') kind = 'character';
      else if (el.type === 'prop') kind = 'prop';
      else if (el.type === 'dialog') kind = 'dialog';
      else if (el.type === 'button') kind = 'button';
      else if (el.type === 'hotspot') kind = 'hotspot';
      else if (el.type === 'text') kind = 'text';
      
      const location: any = {
        kind,
        name: el.name || el.text || '',
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
        zIndex: el.z
      };

      // Add optional properties
      if (el.assetId) location.assetId = el.assetId;
      if (el.sound) location.sound = el.sound;

      // Add font properties
      if (el.font) location.font = el.font;
      if (el.fontSize !== undefined) location.fontSize = el.fontSize;
      if (el.textAlign) location.textAlign = el.textAlign;

      // Set autosize - only enable if fontSize is not explicitly set
      location.autosize = el.fontSize === undefined;

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

  console.log('[VisualWorkspace] beatContent for rendering:', { beatType: beat?.type, content });

  return (
    <div className="h-full flex bg-gray-100 relative">
      {/* Left Panel with Tabs */}
      {showProperties && (
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
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
                  setVisualElements(prev => prev.filter(el => el.id !== elementId));
                  if (selectedElementId === elementId) {
                    setSelectedElementId(null);
                  }
                  setHasChanges(true);
                }}
                onElementAdd={(type) => {
                  const stageWidth = projectSettings?.width || 1024;
                  const stageHeight = projectSettings?.height || 768;
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
              />
            )}

            {activeTab === 'animations' && (
              <AnimationPanel
                animations={animations}
                elements={visualElements}
                stageWidth={projectSettings?.width || 1024}
                stageHeight={projectSettings?.height || 768}
                backgroundUrl={
                  backgroundAssetId && assets
                    ? assets.find(a => a.id === backgroundAssetId)?.url
                    : undefined
                }
                onAnimationsChange={(newAnimations) => {
                  setAnimations(newAnimations);
                  setHasChanges(true);
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
          backgroundSound={backgroundSound}
          elements={visualElements}
          onElementsChange={(elements) => {
            setVisualElements(elements);
            setHasChanges(true);
          }}
          assets={assets}
          onSelectAsset={handleAssetSelection}
          beatContent={content}
          beatType={beat.type}
          selectedElement={selectedElementId}
          onSelectElement={setSelectedElementId}
          projectSettings={projectSettings}
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
    </div>
  );
};
