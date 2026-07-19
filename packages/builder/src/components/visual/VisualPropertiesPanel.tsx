import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Plus,
  User,
  Box,
  Type,
  Square,
  MessageSquare,
  MousePointer,
  RotateCw,
  Maximize2,
  Volume2,
  BarChart3,
  ArrowRight,
  Info,
  DoorOpen,
} from 'lucide-react';
import { getAllPresetSounds, isPresetSound, getPresetSound, type PresetSound } from '@asaps/core';
import { getSlotSpec, getSpatialSpec } from '@asaps/renderer';
import type { Asset } from '../assets/AssetManager';
import type { VisualElement } from './VisualBeatEditor';
import type { Character, CharacterState } from '../../types/character';
import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import { useFonts } from '../../hooks/useFonts';

// Transition types supported by the renderer
type TransitionType = 'none' | 'fade' | 'slide' | 'zoom' | 'dissolve';

interface VisualPropertiesPanelProps {
  /**
   * Layout mode of the current beat instance — drives Inspector mode-
   * awareness. 'absolute' (default) keeps today's Transform (Position X/Y +
   * Size + Scale + Rotation + pixel Z-Index). 'slot' / 'spatial' suppress
   * absolute Position X/Y and pixel Z-Index (engine/anchor-managed in those
   * modes) but KEEP Size, Scale and Rotation as element-intrinsic. See
   * project_responsive_layout_system memory ("Left Inspector mode-awareness").
   */
  layoutMode?: 'absolute' | 'slot' | 'spatial';
  backgroundAssetId?: string;
  elements: VisualElement[];
  selectedElements: string[];
  onBackgroundSelect: () => void;
  onElementSelect: (elementId: string | null) => void;
  onElementUpdate: (elementId: string, updates: Partial<VisualElement>) => void;
  onElementDelete: (elementId: string) => void;
  onElementAdd: (type: 'character' | 'prop' | 'text' | 'hotspot' | 'meter') => void;
  onElementReorder: (elementId: string, direction: 'up' | 'down') => void;
  onSelectAsset?: (assetType: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  assets: Asset[];
  stageWidth: number;
  stageHeight: number;
  beatType?: string;  // Beat type to control which elements are available
  beatName?: string;  // Beat name for display in header
  beatParams?: Record<string, any>; // Current beat parameter values (for slot-content preview rows)
  onOpenCharacterManager?: (callback: (character: any) => void) => void;  // For changing character
  characters?: Character[];  // Project characters for state selection
  // Beat-level settings
  beatTransition?: { type: TransitionType; duration: number };
  onBeatTransitionChange?: (transition: { type: TransitionType; duration: number }) => void;
  // Global settings for default font fallback
  globalSettings?: GlobalSettings;
  // DialogTree-specific settings
  presentationMode?: 'positioned' | 'chat-scroll' | 'chat-bubble';
  onPresentationModeChange?: (mode: 'positioned' | 'chat-scroll' | 'chat-bubble') => void;
  showAvatars?: boolean;
  onShowAvatarsChange?: (show: boolean) => void;
  responseDelay?: number;
  onResponseDelayChange?: (delay: number) => void;
  // Unified layout template (multiChoice today; dialogTree migrates here next).
  // Values vary by beat type — multiChoice has no chat-scroll, dialogTree does.
  layoutTemplate?: string;
  onLayoutTemplateChange?: (template: string) => void;
  // Per-slot author intent (anchor h/v per slot name, preferredLines, gap,
  // buttonAnchors, etc.). The panel reads and writes the whole map so it
  // can render per-slot controls inline with each slot row.
  slotIntent?: Record<string, any>;
  onSlotIntentChange?: (next: Record<string, any>) => void;
  // Renderer-reported applied/override status per slot. Drives a small
  // status indicator next to each slot row so the author sees if their
  // intent took effect at the current viewport.
  slotResolutions?: Array<{
    slot: string;
    applied: boolean;
    requested?: { preferredLines?: number };
    holdsAboveWidth?: number;
    overrideReason?: string;
  }>;
  // Optional controlled expand state for slot rows. Pass these in to
  // share selection with stage clicks (so clicking a slot on the stage
  // expands the matching panel row, and vice versa). Omit for uncontrolled
  // local state.
  expandedSlotKey?: string | null;
  onExpandedSlotKeyChange?: (next: string | null) => void;
  // Panorama hotspot props
  allBeats?: { id: string; name: string; type: string }[];
  panoramaHotspots?: { id: string; target: string; text: string; displayText?: string; icon?: string; pitch: number; yaw: number }[];
  onPanoramaHotspotUpdate?: (id: string, updates: Record<string, any>) => void;
  // Panorama camera/settings props
  panoramaSettings?: {
    initialPitch: number;
    initialYaw: number;
    hfov: number;
    minHfov: number;
    maxHfov: number;
    zoomSpeed: number;
    promptDisplay: 'static' | 'pinned';
    projectionType: 'equirectangular' | 'cylindrical';
  };
  onPanoramaCameraChange?: (settings: { initialPitch?: number; initialYaw?: number; hfov?: number; minHfov?: number; maxHfov?: number; zoomSpeed?: number }) => void;
  onPromptDisplayChange?: (display: 'static' | 'pinned') => void;
  onProjectionTypeChange?: (type: 'equirectangular' | 'cylindrical') => void;
  // VideoBeat props
  videoAssetId?: string;
  videoSettings?: { autoplay: boolean; controls: boolean; skipButton: boolean };
  onSelectVideo?: () => void;
  onVideoSettingsChange?: (settings: { autoplay?: boolean; controls?: boolean; skipButton?: boolean }) => void;
  // Bug 26 follow-up — per-beat background fit (contain | cover).
  // Lives under the Background section in the VE properties panel,
  // not the inspector — feedback was that fit is a background-asset
  // concern and belongs next to the "Change Background" button.
  spatialFit?: 'contain' | 'cover';
  onSpatialFitChange?: (fit: 'contain' | 'cover' | undefined) => void;
}

// Helper to format beat type for display (camelCase -> Title Case)
const formatBeatType = (beatType: string): string => {
  return beatType
    .replace(/([A-Z])/g, ' $1')  // Add space before capitals
    .replace(/^./, str => str.toUpperCase())  // Capitalize first letter
    .trim();
};

export const VisualPropertiesPanel: React.FC<VisualPropertiesPanelProps> = ({
  layoutMode = 'absolute',
  backgroundAssetId,
  elements,
  selectedElements,
  onBackgroundSelect,
  onElementSelect,
  onElementUpdate,
  onElementDelete,
  onElementAdd,
  onElementReorder,
  onSelectAsset,
  assets,
  stageWidth,
  stageHeight,
  beatType,
  beatName,
  beatParams,
  onOpenCharacterManager,
  characters = [],
  beatTransition,
  onBeatTransitionChange,
  globalSettings,
  presentationMode,
  onPresentationModeChange,
  showAvatars,
  onShowAvatarsChange,
  responseDelay,
  onResponseDelayChange,
  layoutTemplate,
  onLayoutTemplateChange,
  slotIntent,
  onSlotIntentChange,
  slotResolutions,
  expandedSlotKey: controlledExpandedSlotKey,
  onExpandedSlotKeyChange,
  allBeats,
  panoramaHotspots,
  onPanoramaHotspotUpdate,
  panoramaSettings,
  onPanoramaCameraChange,
  onPromptDisplayChange,
  onProjectionTypeChange,
  videoAssetId,
  videoSettings,
  onSelectVideo,
  onVideoSettingsChange,
  spatialFit,
  onSpatialFitChange,
}) => {
  // Get available fonts (built-in + custom from assets)
  const { fonts } = useFonts(assets);

  // Helper to extract display name from a CSS font-family string
  // e.g., '"Courier New", Courier, monospace' -> 'Courier New'
  const extractFontDisplayName = (fontFamily: string): string => {
    if (!fontFamily) return 'Arial';

    // Extract the first font name from the CSS font-family string
    // Handle quoted names: "Courier New" or 'Courier New'
    const quotedMatch = fontFamily.match(/^["']([^"']+)["']/);
    if (quotedMatch) {
      // Check if this matches a known font displayName
      const matchedFont = fonts.find(f => f.displayName === quotedMatch[1]);
      if (matchedFont) return matchedFont.displayName;
    }

    // Handle unquoted names: Arial, sans-serif
    const firstFont = fontFamily.split(',')[0].trim().replace(/["']/g, '');
    const matchedFont = fonts.find(f => f.displayName === firstFont);
    if (matchedFont) return matchedFont.displayName;

    // Fallback: return the extracted name or Arial
    return firstFont || 'Arial';
  };

  // Get default fonts from global settings based on element type
  // Renderer uses different fonts for text vs buttons vs titles
  const defaultTitleFont = extractFontDisplayName(globalSettings?.fonts?.titleFont || 'Arial');
  const defaultTextFont = extractFontDisplayName(globalSettings?.fonts?.textFont || 'Arial');
  const defaultButtonFont = extractFontDisplayName(globalSettings?.fonts?.btnFont || 'Arial');

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    background: true,
    dialogSettings: true,  // Show Dialog Settings expanded by default
    elements: true,
    transform: true,
  });
  const [soundTab, setSoundTab] = useState<'presets' | 'custom'>('presets');
  const [playingSound, setPlayingSound] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);
  // Derive single-select compatibility from multi-select array
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
  const selected = selectedElement ? elements.find(el => el.id === selectedElement) : undefined;
  const sortedElements = [...elements].sort((a, b) => b.z - a.z); // Sort by z-index descending

  // Slot-content rows — derived from the beat's slot schema + current params.
  // These render alongside scene elements so the Elements panel reflects what's
  // actually on stage, not just free-form characters/props/text the author placed.
  // Each row carries enough metadata to render its own per-slot intent controls
  // inline (Title lines stepper, Pin presets, etc.) so the top toolbar stays
  // focused on stage-level concerns.
  type SlotRow = {
    key: string;
    icon: React.ReactNode;
    label: string;
    preview: string;
    tooltip: string;
    role: 'title' | 'body' | 'action' | 'speaker' | 'input' | 'hotspot';
    slotName: string;
    // For action rows: which button this row represents.
    buttonId?: string;
    // For hotspot rows: the choice id whose hotspot this represents,
    // and the normalized (0..1) bounds. Hotspot rows are data-defined
    // per-choice, not schema-defined like the slot rows above.
    choiceId?: string;
    hotspotBounds?: { x: number; y: number; width: number; height: number };
  };
  // Slot-row selection — clicking a row expands it and exposes its
  // controls below the preview line. Independent from selectedElements
  // (which is for free-form character/prop/text rows).
  //
  // When the parent supplies expandedSlotKey + onExpandedSlotKeyChange,
  // selection lives upstream (so stage clicks and panel clicks share
  // the same source of truth). Otherwise we fall back to local state.
  const [localExpandedSlotKey, setLocalExpandedSlotKey] = useState<string | null>(null);
  const expandedSlotKey = controlledExpandedSlotKey ?? localExpandedSlotKey;
  const setExpandedSlotKey = (next: string | null) => {
    if (onExpandedSlotKeyChange) onExpandedSlotKeyChange(next);
    else setLocalExpandedSlotKey(next);
  };
  const slotRows: SlotRow[] = (() => {
    if (!beatType) return [];
    // Both slot-mode and spatial-mode beats expose slots — spatial beats
    // composite their flow slots over a background image. titleScreen is
    // spatial, infoText is slot. Either way the slot content tells us
    // what's on stage.
    // Absolute (fixed-canvas) mode: the baked elements list below is the
    // stage content, and the slot rows' controls (per-slot intent, action
    // layout) only affect the responsive renderer — showing them here made
    // fixed projects look like they were still responsive. Slot rows are
    // responsive/spatial-mode UI only.
    if (layoutMode === 'absolute') return [];
    const spec = getSlotSpec(beatType) ?? getSpatialSpec(beatType)?.slots ?? null;
    if (!spec) return [];
    const p = beatParams || {};
    const ellipsize = (s: unknown, n = 60): string => {
      const str = (typeof s === 'string' ? s : '') || '';
      return str.length > n ? `${str.slice(0, n - 1)}…` : str;
    };
    const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const buttonLabel = (id: string): string => {
      if (id === 'continueButton') return (p.buttonText && String(p.buttonText).trim()) || 'Continue';
      if (id === 'restartButton') return (p.restartText && String(p.restartText).trim()) || 'Restart';
      if (id === 'creditsButton') return (p.creditsText && String(p.creditsText).trim()) || 'Credits';
      return id;
    };
    const rows: SlotRow[] = [];
    for (const s of spec) {
      if (s.role === 'title') {
        const preview = ellipsize(p[s.source ?? 'title']) || '(empty)';
        rows.push({ key: `slot:${s.name}`, icon: <Type className="w-4 h-4 text-blue-600" />, label: 'Title', preview, tooltip: `Slot "${s.name}" — edit in the right inspector under Title.`, role: 'title', slotName: s.name });
      } else if (s.role === 'speaker') {
        const preview = ellipsize(p[s.source ?? 'speaker']) || '(unset)';
        rows.push({ key: `slot:${s.name}`, icon: <User className="w-4 h-4 text-blue-600" />, label: 'Speaker', preview, tooltip: `Slot "${s.name}" — edit in the right inspector under Speaker.`, role: 'speaker', slotName: s.name });
      } else if (s.role === 'input') {
        // inputText's single-line text field. Authored value is the
        // placeholder (the runtime value comes from the user typing).
        const ph = (s as any).placeholderSource ? p[(s as any).placeholderSource] : '';
        const preview = ellipsize(ph) || '(no placeholder)';
        rows.push({ key: `slot:${s.name}`, icon: <Type className="w-4 h-4 text-blue-600" />, label: 'Input field', preview, tooltip: `Slot "${s.name}" — single-line text input. Edit the placeholder in the right inspector under Placeholder.`, role: 'input', slotName: s.name });
      } else if (s.role === 'body') {
        const label = titleCase(s.name);
        const preview = ellipsize(p[s.source ?? s.name]) || '(empty)';
        rows.push({ key: `slot:${s.name}`, icon: <MessageSquare className="w-4 h-4 text-blue-600" />, label, preview, tooltip: `Slot "${s.name}" — edit in the right inspector under ${label}.`, role: 'body', slotName: s.name });
      } else if (s.role === 'action') {
        for (const bid of (s as any).buttons ?? []) {
          // Skip restart/credits if the author chose to hide them on endScreen.
          if (bid === 'restartButton' && p.showRestart === false) continue;
          if (bid === 'creditsButton' && p.showCredits !== true) continue;
          rows.push({
            key: `slot:${s.name}:${bid}`,
            icon: <Square className="w-4 h-4 text-blue-600" />,
            label: buttonLabel(bid),
            preview: 'Action button',
            tooltip: `Action button "${bid}" — edit in the right inspector under Button Text.`,
            role: 'action',
            slotName: s.name,
            buttonId: bid,
          });
        }
      }
    }
    // Hotspot rows for movementChoice / pickProp / dialogTree. Choices
    // with a hotspot are interactive regions on the spatial image —
    // surface them in the panel so authors can see + select them like
    // any other on-stage element. Read from the same per-beat path the
    // runtime uses.
    const choicesForHotspots: any[] | null =
      beatType === 'movementChoice' ? (p.choices as any[]) ?? null
      : beatType === 'pickProp' ? (p.props as any[]) ?? null
      : beatType === 'dialogTree' || beatType === 'aiDialogTree'
        ? (p.dialogTree?.choices as any[]) ?? null
        : null;
    if (choicesForHotspots && Array.isArray(choicesForHotspots)) {
      for (const c of choicesForHotspots) {
        if (!c?.hotspot) continue;
        // fromProp hotspots are represented by the prop sprite in the
        // free-positioned section below — surfacing them again here as a
        // separate row would suggest there are two distinct elements for
        // a single visual.
        if (c.hotspot.fromProp) continue;
        const label = (c.text || c.name || c.id || 'choice').toString();
        const x = Math.round(((c.hotspot.x ?? 0) as number) * 100);
        const y = Math.round(((c.hotspot.y ?? 0) as number) * 100);
        const w = Math.round(((c.hotspot.width ?? 0) as number) * 100);
        const h = Math.round(((c.hotspot.height ?? 0) as number) * 100);
        rows.push({
          key: `hotspot:${c.id}`,
          icon: <MousePointer className="w-4 h-4 text-blue-600" />,
          label,
          preview: `Hotspot · ${x},${y} · ${w}×${h}%`,
          tooltip: `Choice "${label}" hotspot — edit on the canvas or in the right inspector under Choices.`,
          role: 'hotspot',
          slotName: c.id,
          choiceId: c.id,
          hotspotBounds: {
            x: c.hotspot.x ?? 0,
            y: c.hotspot.y ?? 0,
            width: c.hotspot.width ?? 0,
            height: c.hotspot.height ?? 0,
          },
        });
      }
    }
    return rows;
  })();
  // Find the action slot (used for the shared "Action layout" group +
  // per-button anchor reads/writes).
  const actionSlotName = slotRows.find(r => r.role === 'action')?.slotName;
  // Look up the renderer's resolution status for a given slot.
  const resolutionForSlot = (name: string) =>
    slotResolutions?.find(r => r.slot === name);
  // SlotIntent mutators — derive from the slotIntent map + onSlotIntentChange.
  // The map keys are slot names; each entry can carry preferredLines, anchor,
  // gap, buttonAnchors, etc. Setters do shallow merge so unrelated fields
  // (e.g. animations) survive each change.
  const writeSlotIntent = (slot: string, patch: Record<string, any>) => {
    if (!onSlotIntentChange) return;
    const cur = slotIntent ?? {};
    const next = { ...cur };
    const prev = (cur[slot] ?? {}) as Record<string, any>;
    const merged = { ...prev, ...patch };
    // Prune null/undefined keys so the intent stays minimal.
    Object.keys(merged).forEach(k => {
      if (merged[k] === undefined || merged[k] === null) delete merged[k];
    });
    if (Object.keys(merged).length === 0) {
      delete next[slot];
    } else {
      next[slot] = merged;
    }
    onSlotIntentChange(next);
  };
  const setSlotPreferredLines = (slot: string, lines: number | null) => {
    writeSlotIntent(slot, { preferredLines: lines == null ? null : lines });
  };
  const setActionAnchor = (slot: string, patch: { __mode?: 'bottom' | 'belowBody'; h?: 'left' | 'center' | 'right'; gap?: number }) => {
    if (!onSlotIntentChange) return;
    const cur = slotIntent ?? {};
    const prev = (cur[slot] ?? {}) as Record<string, any>;
    const prevAnchor = (prev.anchor ?? {}) as Record<string, any>;
    let nextAnchor: Record<string, any> = { ...prevAnchor };
    if (patch.__mode === 'bottom') {
      nextAnchor = { ...nextAnchor, v: 'bottom', relativeTo: 'stage' };
    } else if (patch.__mode === 'belowBody') {
      nextAnchor = { ...nextAnchor, v: 'top', relativeTo: 'element', edge: 'below' };
    }
    if (patch.h) nextAnchor.h = patch.h;
    if (typeof patch.gap === 'number') nextAnchor.gap = patch.gap;
    writeSlotIntent(slot, { anchor: nextAnchor });
  };
  const setButtonAnchorIntent = (slot: string, buttonId: string, patch: Record<string, any> | null) => {
    if (!onSlotIntentChange) return;
    const cur = slotIntent ?? {};
    const prev = (cur[slot] ?? {}) as Record<string, any>;
    const prevAnchors = ((prev.buttonAnchors ?? {}) as Record<string, any>);
    const nextAnchors = { ...prevAnchors };
    if (patch === null) {
      delete nextAnchors[buttonId];
    } else {
      const curBtn = nextAnchors[buttonId] ?? { h: 'center', v: 'bottom', relativeTo: 'stage', gap: 16 };
      nextAnchors[buttonId] = { ...curBtn, ...patch };
    }
    writeSlotIntent(slot, { buttonAnchors: Object.keys(nextAnchors).length > 0 ? nextAnchors : undefined });
  };
  // Renders the per-slot type/transform controls (font / fontSize /
  // rotation / width%) used inside every expanded slot row. The values
  // live in slotIntent[slot].{font, fontSize, rotation, widthPercent};
  // absent fields render as "default / theme / none" and the renderer
  // falls back to theme + intrinsic defaults.
  const renderSlotTypeTransform = (slotName: string): React.ReactNode => {
    const entry = (slotIntent?.[slotName] ?? {}) as Record<string, any>;
    const font: string | undefined = entry.font;
    const fontSize: number | undefined = entry.fontSize;
    const rotation: number = typeof entry.rotation === 'number' ? entry.rotation : 0;
    const widthPercent: number | undefined = entry.widthPercent;
    const builtin = fonts.filter(f => f.type === 'builtin');
    const custom = fonts.filter(f => f.type === 'custom');
    return (
      <div className="space-y-2 text-xs text-gray-700">
        {/* Font family */}
        <div className="flex items-center gap-2">
          <span className="opacity-70 w-14 flex-shrink-0">Font</span>
          <select
            value={font ?? ''}
            onChange={(e) => writeSlotIntent(slotName, { font: e.target.value || null })}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
          >
            <option value="">Theme default</option>
            {builtin.map(f => (
              <option key={f.id} value={f.displayName}>{f.displayName}</option>
            ))}
            {custom.length > 0 && (
              <optgroup label="Custom Fonts">
                {custom.map(f => (
                  <option key={f.id} value={f.displayName}>{f.displayName}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {/* Font size */}
        <div className="flex items-center gap-2">
          <span className="opacity-70 w-14 flex-shrink-0">Size</span>
          <input
            type="range"
            min={10}
            max={72}
            step={1}
            value={fontSize ?? 0}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              writeSlotIntent(slotName, { fontSize: v > 0 ? v : null });
            }}
            className="flex-1"
          />
          <input
            type="number"
            min={10}
            max={72}
            value={fontSize ?? ''}
            placeholder="auto"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              writeSlotIntent(slotName, { fontSize: Number.isFinite(v) && v > 0 ? v : null });
            }}
            className="w-14 px-1 py-1 border border-gray-300 rounded text-xs text-center"
          />
          {fontSize != null && (
            <button
              type="button"
              className="px-1.5 py-0.5 rounded border border-gray-300 bg-white text-[10px] text-gray-600 hover:bg-gray-50"
              title="Clear font-size override (use theme default)"
              onClick={() => writeSlotIntent(slotName, { fontSize: null })}
            >
              auto
            </button>
          )}
        </div>
        {/* Rotation */}
        <div className="flex items-center gap-2">
          <span className="opacity-70 w-14 flex-shrink-0">Rotation</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={rotation}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10) || 0;
              writeSlotIntent(slotName, { rotation: v === 0 ? null : v });
            }}
            className="flex-1"
          />
          <input
            type="number"
            min={0}
            max={360}
            value={rotation}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10) || 0;
              writeSlotIntent(slotName, { rotation: v === 0 ? null : v });
            }}
            className="w-14 px-1 py-1 border border-gray-300 rounded text-xs text-center"
          />
          <span className="opacity-60">°</span>
        </div>
        {/* Width % */}
        <div className="flex items-center gap-2">
          <span className="opacity-70 w-14 flex-shrink-0">Width</span>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={widthPercent ?? 100}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              writeSlotIntent(slotName, { widthPercent: v < 100 ? v : null });
            }}
            className="flex-1"
          />
          <span className="w-10 tabular-nums text-right opacity-70">
            {widthPercent != null ? `${widthPercent}%` : 'auto'}
          </span>
          {widthPercent != null && (
            <button
              type="button"
              className="px-1.5 py-0.5 rounded border border-gray-300 bg-white text-[10px] text-gray-600 hover:bg-gray-50"
              title="Clear width override"
              onClick={() => writeSlotIntent(slotName, { widthPercent: null })}
            >
              auto
            </button>
          )}
        </div>
      </div>
    );
  };
  // Count reflects what's visible in the panel — slot rows + non-empty
  // scene elements. Visually-empty rows are hidden, so don't pad the count.
  const totalElementCount = slotRows.length + sortedElements.length;

  // Get audio assets for custom sound selection
  const audioAssets = assets.filter(a => a.type === 'audio' && a.subType === 'sfx');
  const presetSounds = getAllPresetSounds();

  const getElementIcon = (type: string) => {
    switch (type) {
      case 'character':
        return <User className="w-4 h-4" />;
      case 'prop':
        return <Box className="w-4 h-4" />;
      case 'text':
        return <Type className="w-4 h-4" />;
      case 'hotspot':
        return <MousePointer className="w-4 h-4" />;
      case 'button':
        return <Square className="w-4 h-4" />;
      case 'dialog':
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <Square className="w-4 h-4" />;
    }
  };

  // Helper function to play sound preview
  const playSound = (soundUrl: string, soundId: string) => {
    setPlayingSound(soundId);
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    audio.play();
    audio.onended = () => setPlayingSound(null);
    audio.onerror = () => {
      setPlayingSound(null);
      console.error('Error playing sound:', soundUrl);
    };
  };

  return (
    <div className="h-full bg-white flex flex-col w-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Visual Properties</h2>
        <div className="text-sm text-gray-500 mt-1">
          {beatName || (beatType ? formatBeatType(beatType) : 'No beat selected')}
          {beatType && <span className="text-gray-400 ml-1">({beatType})</span>}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Background Section (hidden for videoBeat — has its own Video section) */}
        {beatType !== 'videoBeat' && <div className="border-b border-gray-200">
          <button
            onClick={() => toggleSection('background')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              <span className="font-medium text-sm">{beatType === 'panorama' ? 'Panorama Image' : 'Background'}</span>
            </div>
          </button>
          
          {expandedSections.background && (
            <div className="px-4 pb-4">
              <button
                onClick={onBackgroundSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                {backgroundAsset
                  ? (beatType === 'panorama' ? 'Change Panorama Image' : 'Change Background')
                  : (beatType === 'panorama' ? 'Choose Panorama Image' : 'Choose Background')}
              </button>
              {backgroundAsset && (
                <div className="mt-2 text-xs text-gray-600">
                  {backgroundAsset.name}
                </div>
              )}

              {/* Bug 26 follow-up — Background fit. Sits next to "Change
                  Background" because fit is a background-asset concern.
                  Spatial beats (SpatialFlowView) default to CONTAIN; every
                  other beat type renders its background through
                  SlotFlowView / PositionedBeatView, which default to COVER
                  — the default option's label reflects whichever applies.
                  Panorama keeps its own stretch semantics and is excluded. */}
              {onSpatialFitChange && beatType !== 'panorama' && (() => {
                const isSpatialType =
                  beatType === 'titleScreen' ||
                  beatType === 'movementChoice' ||
                  beatType === 'pickProp' ||
                  beatType === 'dialogTree';
                const effectiveFit = spatialFit || (isSpatialType ? 'contain' : 'cover');
                return (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Background fit
                    </label>
                    <select
                      value={spatialFit || ''}
                      onChange={(e) => onSpatialFitChange((e.target.value || undefined) as 'contain' | 'cover' | undefined)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    >
                      <option value="">{isSpatialType ? 'Default (contain)' : 'Default (cover)'}</option>
                      <option value="contain">Contain — show whole image (letterbox)</option>
                      <option value="cover">Cover — fill stage, crop edges</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {effectiveFit === 'cover'
                        ? 'Image fills the stage; edges may be cropped when aspect ratios differ.'
                        : 'Image is shown whole with letterboxed bars when aspect ratios differ.'}
                    </p>
                  </div>
                );
              })()}

              {/* Panorama Settings - inline under panorama image */}
              {beatType === 'panorama' && panoramaSettings && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  {/* Projection Type */}
                  {onProjectionTypeChange && (
                    <label className="block">
                      <span className="text-xs text-gray-500">Projection</span>
                      <select
                        value={panoramaSettings.projectionType}
                        onChange={(e) => onProjectionTypeChange(e.target.value as 'equirectangular' | 'cylindrical')}
                        className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="equirectangular">Equirectangular (2:1, e.g. 4096x2048)</option>
                        <option value="cylindrical">Cylindrical (4:1-8:1, e.g. 8000x2000)</option>
                      </select>
                      <p className="text-xs text-blue-600 mt-1">
                        {panoramaSettings.projectionType === 'equirectangular'
                          ? 'Use 2:1 images from 360\u00b0 cameras.'
                          : 'Use wide panoramas from phone cameras (4:1 to 8:1 ratio).'}
                      </p>
                    </label>
                  )}

                  {/* Initial Pitch */}
                  {onPanoramaCameraChange && (
                    <>
                      <label className="block">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Initial Pitch</span>
                          <input
                            type="number"
                            value={parseFloat(panoramaSettings.initialPitch.toFixed(1))}
                            onChange={(e) => {
                              const v = Math.max(-90, Math.min(90, parseFloat(e.target.value) || 0));
                              onPanoramaCameraChange({ initialPitch: v });
                            }}
                            min={-90} max={90} step={0.1}
                            className="w-16 text-right text-xs text-gray-400 border border-gray-200 rounded px-1 py-0.5"
                          />
                        </div>
                        <input
                          type="range"
                          value={panoramaSettings.initialPitch}
                          onChange={(e) => onPanoramaCameraChange({ initialPitch: parseFloat(e.target.value) })}
                          min={-90}
                          max={90}
                          step={0.1}
                          className="mt-0.5 w-full h-1.5 accent-blue-500"
                        />
                      </label>

                      {/* Initial Yaw */}
                      <label className="block">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Initial Yaw</span>
                          <input
                            type="number"
                            value={parseFloat(panoramaSettings.initialYaw.toFixed(1))}
                            onChange={(e) => {
                              const v = Math.max(-180, Math.min(180, parseFloat(e.target.value) || 0));
                              onPanoramaCameraChange({ initialYaw: v });
                            }}
                            min={-180} max={180} step={0.1}
                            className="w-16 text-right text-xs text-gray-400 border border-gray-200 rounded px-1 py-0.5"
                          />
                        </div>
                        <input
                          type="range"
                          value={panoramaSettings.initialYaw}
                          onChange={(e) => onPanoramaCameraChange({ initialYaw: parseFloat(e.target.value) })}
                          min={-180}
                          max={180}
                          step={0.1}
                          className="mt-0.5 w-full h-1.5 accent-blue-500"
                        />
                      </label>

                      {/* HFOV — design-time ground truth, independent of min/max */}
                      <label className="block">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Field of View</span>
                          <input
                            type="number"
                            value={panoramaSettings.hfov}
                            onChange={(e) => {
                              const v = Math.max(10, Math.min(179, parseFloat(e.target.value) || 75));
                              onPanoramaCameraChange({ hfov: v });
                            }}
                            min={10} max={179} step={1}
                            className="w-14 text-right text-xs text-gray-400 border border-gray-200 rounded px-1 py-0.5"
                          />
                        </div>
                        <input
                          type="range"
                          value={panoramaSettings.hfov}
                          onChange={(e) => onPanoramaCameraChange({ hfov: parseFloat(e.target.value) })}
                          min={10}
                          max={179}
                          step={1}
                          className="mt-0.5 w-full h-1.5 accent-blue-500"
                        />
                      </label>

                      {/* Zoom Limits (runtime only) */}
                      <div className="mt-1 pt-1 border-t border-gray-100">
                        <span className="text-xs text-gray-400 font-medium">Zoom Limits (runtime)</span>
                      </div>

                      {/* Min HFOV (Max Zoom In) */}
                      <label className="block">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Min FOV (Max Zoom In)</span>
                          <input
                            type="number"
                            value={panoramaSettings.minHfov}
                            onChange={(e) => {
                              const val = Math.max(10, Math.min(175, parseFloat(e.target.value) || 30));
                              const gap = 5;
                              const updates: Record<string, number> = { minHfov: val };
                              if (val + gap > panoramaSettings.maxHfov) updates.maxHfov = val + gap;
                              onPanoramaCameraChange(updates);
                            }}
                            min={10} max={175} step={5}
                            className="w-14 text-right text-xs text-gray-400 border border-gray-200 rounded px-1 py-0.5"
                          />
                        </div>
                        <input
                          type="range"
                          value={panoramaSettings.minHfov}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const gap = 5;
                            const updates: Record<string, number> = { minHfov: val };
                            if (val + gap > panoramaSettings.maxHfov) updates.maxHfov = val + gap;
                            onPanoramaCameraChange(updates);
                          }}
                          min={10}
                          max={175}
                          step={5}
                          className="mt-0.5 w-full h-1.5 accent-blue-500"
                        />
                      </label>

                      {/* Max HFOV (Max Zoom Out) */}
                      <label className="block">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Max FOV (Max Zoom Out)</span>
                          <input
                            type="number"
                            value={panoramaSettings.maxHfov}
                            onChange={(e) => {
                              const val = Math.max(15, Math.min(180, parseFloat(e.target.value) || 120));
                              const gap = 5;
                              const updates: Record<string, number> = { maxHfov: val };
                              if (val - gap < panoramaSettings.minHfov) updates.minHfov = val - gap;
                              onPanoramaCameraChange(updates);
                            }}
                            min={15} max={180} step={5}
                            className="w-14 text-right text-xs text-gray-400 border border-gray-200 rounded px-1 py-0.5"
                          />
                        </div>
                        <input
                          type="range"
                          value={panoramaSettings.maxHfov}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const gap = 5;
                            const updates: Record<string, number> = { maxHfov: val };
                            if (val - gap < panoramaSettings.minHfov) updates.minHfov = val - gap;
                            onPanoramaCameraChange(updates);
                          }}
                          min={15}
                          max={180}
                          step={5}
                          className="mt-0.5 w-full h-1.5 accent-blue-500"
                        />
                      </label>

                      {/* Zoom Speed */}
                      <label className="block">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Zoom Speed</span>
                          <input
                            type="number"
                            value={panoramaSettings.zoomSpeed}
                            onChange={(e) => {
                              const v = Math.max(0.1, Math.min(3.0, parseFloat(e.target.value) || 1.0));
                              onPanoramaCameraChange({ zoomSpeed: v });
                            }}
                            min={0.1} max={3.0} step={0.1}
                            className="w-14 text-right text-xs text-gray-400 border border-gray-200 rounded px-1 py-0.5"
                          />
                        </div>
                        <input
                          type="range"
                          value={panoramaSettings.zoomSpeed}
                          onChange={(e) => onPanoramaCameraChange({ zoomSpeed: parseFloat(e.target.value) })}
                          min={0.1}
                          max={3.0}
                          step={0.1}
                          className="mt-0.5 w-full h-1.5 accent-blue-500"
                        />
                      </label>
                    </>
                  )}

                  {/* Prompt Display */}
                  {onPromptDisplayChange && (
                    <label className="block">
                      <span className="text-xs text-gray-500">Prompt Display</span>
                      <select
                        value={panoramaSettings.promptDisplay}
                        onChange={(e) => onPromptDisplayChange(e.target.value as 'static' | 'pinned')}
                        className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="static">Static (floating)</option>
                        <option value="pinned">Pinned (scrolls with pano)</option>
                      </select>
                      <p className="text-xs text-blue-600 mt-1">
                        {panoramaSettings.promptDisplay === 'pinned'
                          ? 'Prompt scrolls with the panorama at its positioned location'
                          : 'Prompt floats as an overlay in front of the panorama'}
                      </p>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </div>}

        {/* Transition Section - Beat-level setting */}
        {onBeatTransitionChange && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('transition')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <RotateCw className="w-4 h-4" />
                <span className="font-medium text-sm">Transition</span>
              </div>
            </button>

            {expandedSections.transition && (
              <div className="px-4 pb-4 space-y-3">
                {/* Transition Type */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Type
                  </label>
                  <select
                    value={beatTransition?.type || 'none'}
                    onChange={(e) => {
                      if (onBeatTransitionChange) {
                        onBeatTransitionChange({
                          type: e.target.value as TransitionType,
                          duration: beatTransition?.duration || 500
                        });
                      }
                    }}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                    <option value="slide">Slide</option>
                    <option value="zoom">Zoom</option>
                    <option value="dissolve">Dissolve</option>
                  </select>
                </div>

                {/* Transition Duration - only show if type is not 'none' */}
                {beatTransition?.type && beatTransition.type !== 'none' && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Duration (ms)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="100"
                        max="2000"
                        step="100"
                        value={beatTransition?.duration || 500}
                        onChange={(e) => onBeatTransitionChange({
                          type: beatTransition?.type || 'fade',
                          duration: parseInt(e.target.value)
                        })}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={beatTransition?.duration || 500}
                        onChange={(e) => onBeatTransitionChange({
                          type: beatTransition?.type || 'fade',
                          duration: parseInt(e.target.value) || 500
                        })}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                        min="100"
                        max="2000"
                      />
                      <span className="text-xs text-gray-600">ms</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Dialog Settings Section - For dialogTree and aiDialogTree beats */}
        {beatType === 'multiChoice' && onLayoutTemplateChange && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('dialogSettings')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium text-sm">Layout</span>
              </div>
              {expandedSections.dialogSettings ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            {expandedSections.dialogSettings && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Layout Template
                  </label>
                  <select
                    value={layoutTemplate || 'stacked'}
                    onChange={(e) => onLayoutTemplateChange(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="stacked">Stacked (prompt + buttons)</option>
                    <option value="conversation">Conversation (side-by-side)</option>
                    <option value="chat-bubble">Chat - Single Bubble</option>
                    <option value="custom">Custom (drag-place)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {(!layoutTemplate || layoutTemplate === 'stacked') && 'Prompt on top, choice buttons below — the default.'}
                    {layoutTemplate === 'conversation' && 'NPC prompt on the left, choice buttons on the right.'}
                    {layoutTemplate === 'chat-bubble' && 'Prompt rendered as a chat bubble; choices as reply buttons.'}
                    {layoutTemplate === 'custom' && 'Place prompt and buttons manually on the stage.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {(beatType === 'multiChoice' || beatType === 'dialogTree' || beatType === 'aiDialogTree') && layoutTemplate === 'custom' && onSlotIntentChange && (() => {
          // 3×3 anchor picker per slot. Phase 1 of "custom" — discrete
          // positions, fast to author, covers the 9 canonical placements
          // (top-left, top-center, top-right, mid-left, … bottom-right).
          // Phase 2 will let authors drag slots on the stage and snap to
          // these same anchors.
          //
          // Slot names match what the renderer reads:
          //   multiChoice  → 'question' (body), 'actions' (buttons)
          //   dialogTree   → 'text'     (body), 'actions' (buttons)
          // The speaker label rides along inside the body card on both.
          const isDialogTree = beatType === 'dialogTree' || beatType === 'aiDialogTree';
          const slots: Array<{ name: string; label: string; desc: string }> = isDialogTree
            ? [
                { name: 'text', label: 'Dialog', desc: 'NPC dialog card (the speaker label rides along)' },
                { name: 'actions', label: 'Choices', desc: 'Response buttons' },
              ]
            : [
                { name: 'question', label: 'Question', desc: 'NPC prompt (the speaker label rides along)' },
                { name: 'actions', label: 'Choices', desc: 'Response buttons' },
              ];
          const hValues: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
          const vValues: Array<'top' | 'middle' | 'bottom'> = ['top', 'middle', 'bottom'];
          const setAnchor = (slot: string, h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom') => {
            const cur = slotIntent ?? {};
            const next = { ...cur, [slot]: { ...(cur[slot] ?? {}), anchor: { h, v } } };
            onSlotIntentChange(next);
          };
          return (
            <div className="border-b border-gray-200">
              <button
                onClick={() => toggleSection('slotPositions')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  <span className="font-medium text-sm">Slot Positions</span>
                </div>
                {expandedSections.slotPositions !== false ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {expandedSections.slotPositions !== false && (
                <div className="px-4 pb-4 space-y-4">
                  <p className="text-xs text-gray-500">
                    Click a cell to pin each slot to that stage corner / edge / center. The responsive layout still adapts to the viewport — these are soft positions, not pixels.
                  </p>
                  {slots.map(slot => {
                    const cur = slotIntent?.[slot.name]?.anchor;
                    return (
                      <div key={slot.name}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-gray-700">{slot.label}</label>
                          <span className="text-[10px] text-gray-400">{slot.desc}</span>
                        </div>
                        <div
                          className="inline-grid gap-0.5 p-1 rounded border border-gray-200 bg-gray-50"
                          style={{ gridTemplateColumns: 'repeat(3, 24px)', gridTemplateRows: 'repeat(3, 24px)' }}
                        >
                          {vValues.map(v =>
                            hValues.map(h => {
                              const active = cur?.h === h && cur?.v === v;
                              return (
                                <button
                                  key={`${slot.name}-${h}-${v}`}
                                  type="button"
                                  title={`${v} ${h}`}
                                  onClick={() => setAnchor(slot.name, h, v)}
                                  className={`w-full h-full rounded-sm border ${
                                    active
                                      ? 'bg-blue-500 border-blue-600'
                                      : 'bg-white border-gray-300 hover:bg-blue-50 hover:border-blue-400'
                                  }`}
                                />
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {(beatType === 'dialogTree' || beatType === 'aiDialogTree') && onLayoutTemplateChange && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('dialogSettings')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium text-sm">Dialog Settings</span>
              </div>
              {expandedSections.dialogSettings ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSections.dialogSettings && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Layout Template
                  </label>
                  <select
                    value={layoutTemplate || 'stacked'}
                    onChange={(e) => onLayoutTemplateChange(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="stacked">Stacked (Visual Novel)</option>
                    <option value="conversation">Conversation (side-by-side)</option>
                    <option value="chat-scroll">Chat - Scrollable History</option>
                    <option value="chat-bubble">Chat - Single Bubble</option>
                    <option value="custom">Custom (drag-place)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {(!layoutTemplate || layoutTemplate === 'stacked') && 'Traditional dialog box on top, choices below — the classic visual-novel layout.'}
                    {layoutTemplate === 'conversation' && 'NPC text on one side, player choices on the other — short back-and-forth.'}
                    {layoutTemplate === 'chat-scroll' && 'Messages stack vertically with scrollable history.'}
                    {layoutTemplate === 'chat-bubble' && 'Shows one message at a time in chat style.'}
                    {layoutTemplate === 'custom' && 'Place dialog and buttons manually on the stage.'}
                  </p>
                </div>

                {(layoutTemplate === 'chat-scroll' || layoutTemplate === 'chat-bubble') && onShowAvatarsChange && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showAvatars"
                      checked={showAvatars ?? true}
                      onChange={(e) => onShowAvatarsChange(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="showAvatars" className="text-sm text-gray-700">
                      Show character avatars
                    </label>
                  </div>
                )}

                {(layoutTemplate === 'chat-scroll' || layoutTemplate === 'chat-bubble') && onResponseDelayChange && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NPC Response Delay (seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={responseDelay ?? 0}
                      onChange={(e) => onResponseDelayChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Adds a natural pause before NPC responds. Shows typing indicator during delay.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Video Section — only for videoBeat */}
        {beatType === 'videoBeat' && onSelectVideo && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('background')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                <span className="font-medium text-sm">Video</span>
              </div>
            </button>
            {expandedSections.background && (
              <div className="px-4 pb-4 space-y-3">
                {/* Video asset selector */}
                {(() => {
                  const videoAsset = videoAssetId ? assets.find(a => a.id === videoAssetId) : null;
                  return videoAsset ? (
                    <div className="space-y-2">
                      <div
                        className="w-full py-4 rounded border border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors bg-gray-900 text-white text-sm"
                        onClick={onSelectVideo}
                      >
                        🎬 {videoAsset.name}
                      </div>
                      <button
                        onClick={onSelectVideo}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 transition-colors"
                      >
                        Change Video
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={onSelectVideo}
                      className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm"
                    >
                      Select Video File
                    </button>
                  );
                })()}

                {/* Video playback options */}
                {videoSettings && onVideoSettingsChange && (
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={videoSettings.autoplay}
                        onChange={(e) => onVideoSettingsChange({ autoplay: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">Autoplay</span>
                        <p className="text-xs text-gray-500">Start playing automatically</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={videoSettings.controls}
                        onChange={(e) => onVideoSettingsChange({ controls: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">Controls</span>
                        <p className="text-xs text-gray-500">Show video controls</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={videoSettings.skipButton}
                        onChange={(e) => onVideoSettingsChange({ skipButton: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">Skip Button</span>
                        <p className="text-xs text-gray-500">Allow skipping video</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Elements Section */}
        <div className="border-b border-gray-200">
          <button
            onClick={() => toggleSection('elements')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4" />
              <span className="font-medium text-sm">Elements ({totalElementCount})</span>
            </div>
          </button>

          {expandedSections.elements && (
            <div className="px-4 pb-4 space-y-2">
              {/* Add Element Buttons — Character/Prop/Text are available in
                  BOTH absolute (fixed-canvas) and slot/spatial (responsive)
                  modes. The affordance must never be hidden. What adding does
                  and which graphics options apply MAY differ per mode — that
                  behaviour is the concern of onElementAdd / the renderer, not
                  a reason to remove the buttons. (Previously gated on
                  layoutMode === 'absolute', which hid them entirely in
                  slot/spatial beats.) */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => onElementAdd('character')}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <User className="w-3 h-3" />
                  Character
                </button>
                <button
                  onClick={() => onElementAdd('prop')}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Box className="w-3 h-3" />
                  Prop
                </button>
                <button
                  onClick={() => onElementAdd('text')}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Type className="w-3 h-3" />
                  Text
                </button>
                {/* Show Hotspot button for movementChoice, pickProp, and panorama beats */}
                {(beatType === 'movementChoice' || beatType === 'pickProp' || beatType === 'panorama') && (
                  <button
                    onClick={() => onElementAdd('hotspot')}
                    className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <MousePointer className="w-3 h-3" />
                    Hotspot
                  </button>
                )}
                {/* Counter Meter button - only show if characters have counters with meters enabled */}
                {characters.some(c => c.counters?.some(counter => counter.showLevelMeter)) && (
                  <button
                    onClick={() => onElementAdd('meter')}
                    className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                    title="Add counter level meter"
                  >
                    <BarChart3 className="w-3 h-3" />
                    Meter
                  </button>
                )}
              </div>

              {/* Slot-content rows (slot/spatial mode only). Each row
                  represents a piece of slot content on stage AND owns the
                  per-slot intent controls (lines, anchor, pin). Click a
                  row to expand its controls inline. Text values are still
                  edited in the right Inspector.

                  Action button rows + the shared "Action layout" group are
                  visually wrapped together so it's obvious which buttons
                  the placement controls govern. */}
              {slotRows.length > 0 && (
                <div className="space-y-1 mb-2">
                  <div className="text-[10px] uppercase tracking-wide text-blue-600 font-medium px-1">
                    On stage (from slots)
                  </div>
                  {/* Non-action slot rows render in document order first. */}
                  {slotRows.filter(r => r.role !== 'action').map(row => {
                    const expanded = expandedSlotKey === row.key;
                    const res = resolutionForSlot(row.slotName);
                    const slotEntry = (slotIntent?.[row.slotName] ?? {}) as Record<string, any>;
                    return (
                      <div
                        key={row.key}
                        className={`rounded border ${expanded ? 'border-blue-400 bg-blue-50' : 'border-blue-200 bg-blue-50/60'}`}
                      >
                        <button
                          type="button"
                          className="w-full text-left p-2"
                          title={row.tooltip}
                          onClick={() => setExpandedSlotKey(expanded ? null : row.key)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-blue-600 opacity-60 text-xs w-3 flex-shrink-0">
                              {expanded ? '▼' : '▶'}
                            </span>
                            {row.icon}
                            <span className="text-sm font-medium truncate">{row.label}</span>
                            <span className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-medium flex-shrink-0">
                              slot
                            </span>
                            {/* Status indicator — applied (green) or
                                override (amber). Anchored to the row it
                                describes; gone is the floating top-toolbar
                                badge that didn't name what it applied to. */}
                            {res && row.role !== 'action' && (
                              res.applied ? (
                                <span
                                  className="ml-auto text-[10px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded flex-shrink-0"
                                  title="Renders with the requested layout intent at this viewport."
                                >
                                  ✓ {res.requested?.preferredLines
                                    ? `${res.requested.preferredLines} line${res.requested.preferredLines === 1 ? '' : 's'}`
                                    : 'applied'}
                                </span>
                              ) : (
                                <span
                                  className="ml-auto text-[10px] px-1 py-0.5 bg-amber-200 text-amber-900 rounded flex-shrink-0"
                                  title={res.overrideReason || ''}
                                >
                                  ⚠ {res.holdsAboveWidth ? `holds ≥ ${res.holdsAboveWidth}px` : 'overridden'}
                                </span>
                              )
                            )}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5 truncate pl-6" title={row.preview}>
                            {row.preview}
                          </div>
                        </button>
                        {expanded && (
                          <div className="px-3 pb-2.5 pt-1 border-t border-blue-200/60 space-y-2">
                            {/* Title row controls: preferred lines stepper +
                                clear-to-auto. The number lives in slotIntent
                                under the slot's name. */}
                            {row.role === 'title' && (
                              <div className="flex items-center gap-2 text-xs text-gray-700">
                                <span className="opacity-70">Lines</span>
                                <button
                                  type="button"
                                  className="w-6 h-6 rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
                                  disabled={(slotEntry.preferredLines ?? 1) <= 1}
                                  onClick={() =>
                                    setSlotPreferredLines(
                                      row.slotName,
                                      Math.max(1, (slotEntry.preferredLines ?? 1) - 1),
                                    )
                                  }
                                >
                                  −
                                </button>
                                <span className="w-8 text-center tabular-nums">
                                  {slotEntry.preferredLines ?? 'auto'}
                                </span>
                                <button
                                  type="button"
                                  className="w-6 h-6 rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
                                  disabled={(slotEntry.preferredLines ?? 0) >= 4}
                                  onClick={() =>
                                    setSlotPreferredLines(
                                      row.slotName,
                                      Math.min(4, (slotEntry.preferredLines ?? 1) + 1),
                                    )
                                  }
                                >
                                  +
                                </button>
                                {slotEntry.preferredLines != null && (
                                  <button
                                    type="button"
                                    className="ml-1 px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 opacity-70"
                                    title="Clear (auto)"
                                    onClick={() => setSlotPreferredLines(row.slotName, null)}
                                  >
                                    auto
                                  </button>
                                )}
                                {res && !res.applied && res.overrideReason && (
                                  <span className="ml-1 text-[10px] text-amber-700 italic" title={res.overrideReason}>
                                    overridden here
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Per-slot type / transform overrides — apply
                                to all slot roles that render text or visible
                                content. Falls through to theme defaults when
                                fields are unset. */}
                            {(row.role === 'title' || row.role === 'body' || row.role === 'speaker' || row.role === 'input') && (
                              renderSlotTypeTransform(row.slotName)
                            )}
                            {/* Action button rows: per-button Pin presets
                                (row / four corners / bottom-center) + gap. */}
                            {row.role === 'action' && row.buttonId && (() => {
                              const buttonAnchors = (slotEntry.buttonAnchors ?? {}) as Record<string, any>;
                              const cur = buttonAnchors[row.buttonId];
                              type PinPreset = 'row' | 'bl' | 'bc' | 'br' | 'tl' | 'tr';
                              const presets: Array<{ key: PinPreset; title: string; glyph: string }> = [
                                { key: 'row', title: 'In shared row', glyph: '—' },
                                { key: 'tl', title: 'Top-left',      glyph: '⌜' },
                                { key: 'tr', title: 'Top-right',     glyph: '⌝' },
                                { key: 'bl', title: 'Bottom-left',   glyph: '⌞' },
                                { key: 'bc', title: 'Bottom-center', glyph: '⎵' },
                                { key: 'br', title: 'Bottom-right',  glyph: '⌟' },
                              ];
                              const currentKey: PinPreset = !cur
                                ? 'row'
                                : cur.v === 'top' && cur.h === 'left' ? 'tl'
                                : cur.v === 'top' && cur.h === 'right' ? 'tr'
                                : cur.h === 'left' ? 'bl'
                                : cur.h === 'right' ? 'br'
                                : 'bc';
                              const applyPreset = (k: PinPreset) => {
                                if (k === 'row') return setButtonAnchorIntent(row.slotName, row.buttonId!, null);
                                const map: Record<Exclude<PinPreset, 'row'>, Record<string, any>> = {
                                  tl: { h: 'left',   v: 'top',    relativeTo: 'stage' },
                                  tr: { h: 'right',  v: 'top',    relativeTo: 'stage' },
                                  bl: { h: 'left',   v: 'bottom', relativeTo: 'stage' },
                                  bc: { h: 'center', v: 'bottom', relativeTo: 'stage' },
                                  br: { h: 'right',  v: 'bottom', relativeTo: 'stage' },
                                };
                                setButtonAnchorIntent(row.slotName, row.buttonId!, { ...map[k], gap: cur?.gap ?? 16 });
                              };
                              return (
                                <>
                                  <div className="flex items-center gap-1 text-xs text-gray-700">
                                    <span className="opacity-70">Pin</span>
                                    <div className="flex rounded overflow-hidden border border-gray-300">
                                      {presets.map(p => (
                                        <button
                                          key={p.key}
                                          type="button"
                                          onClick={() => applyPreset(p.key)}
                                          title={p.title}
                                          className={`px-2 py-1 text-sm leading-none ${
                                            currentKey === p.key
                                              ? 'bg-blue-600 text-white'
                                              : 'bg-white hover:bg-gray-50 text-gray-700'
                                          }`}
                                        >
                                          {p.glyph}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {cur && (
                                    <div className="flex items-center gap-2 text-xs text-gray-700">
                                      <span className="opacity-70">Gap</span>
                                      <input
                                        type="range"
                                        min={0}
                                        max={64}
                                        step={4}
                                        value={typeof cur.gap === 'number' ? cur.gap : 16}
                                        onChange={e => setButtonAnchorIntent(row.slotName, row.buttonId!, { gap: parseInt(e.target.value, 10) || 0 })}
                                        className="flex-1"
                                        title={`${cur.gap ?? 16}px`}
                                      />
                                      <span className="w-8 tabular-nums text-right opacity-70">{cur.gap ?? 16}px</span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Action slot group: button rows + their shared
                      placement controls inside one bordered container.
                      Makes it visually clear that "Action layout" governs
                      the buttons listed above it. */}
                  {actionSlotName && (() => {
                    const actionRows = slotRows.filter(r => r.role === 'action');
                    if (actionRows.length === 0) return null;
                    const slotEntry = (slotIntent?.[actionSlotName] ?? {}) as Record<string, any>;
                    const anchor = (slotEntry.anchor ?? {}) as Record<string, any>;
                    const anchorMode: 'bottom' | 'belowBody' =
                      anchor.relativeTo === 'element' ? 'belowBody' : 'bottom';
                    const anchorH = (anchor.h ?? 'center') as 'left' | 'center' | 'right';
                    const anchorGap = typeof anchor.gap === 'number' ? anchor.gap : 16;
                    return (
                      <div className="mt-1 rounded border border-blue-300 bg-blue-50/30 p-1.5 space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-blue-700 font-medium px-1 pt-0.5">
                          Action slot
                        </div>
                        {/* Render each action button row inside the group. */}
                        {actionRows.map(row => {
                          const expanded = expandedSlotKey === row.key;
                          const res = resolutionForSlot(row.slotName);
                          const slotEntry = (slotIntent?.[row.slotName] ?? {}) as Record<string, any>;
                          return (
                            <div
                              key={row.key}
                              className={`rounded border ${expanded ? 'border-blue-400 bg-blue-50' : 'border-blue-200 bg-white/80'}`}
                            >
                              <button
                                type="button"
                                className="w-full text-left p-2"
                                title={row.tooltip}
                                onClick={() => setExpandedSlotKey(expanded ? null : row.key)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-blue-600 opacity-60 text-xs w-3 flex-shrink-0">
                                    {expanded ? '▼' : '▶'}
                                  </span>
                                  {row.icon}
                                  <span className="text-sm font-medium truncate">{row.label}</span>
                                  <span className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-medium flex-shrink-0">
                                    slot
                                  </span>
                                </div>
                                <div className="text-xs text-gray-600 mt-0.5 truncate pl-6" title={row.preview}>
                                  {row.preview}
                                </div>
                              </button>
                              {expanded && row.buttonId && (() => {
                                const buttonAnchors = (slotEntry.buttonAnchors ?? {}) as Record<string, any>;
                                const cur = buttonAnchors[row.buttonId];
                                type PinPreset = 'row' | 'bl' | 'bc' | 'br' | 'tl' | 'tr';
                                const presets: Array<{ key: PinPreset; title: string; glyph: string }> = [
                                  { key: 'row', title: 'In shared row', glyph: '—' },
                                  { key: 'tl', title: 'Top-left',      glyph: '⌜' },
                                  { key: 'tr', title: 'Top-right',     glyph: '⌝' },
                                  { key: 'bl', title: 'Bottom-left',   glyph: '⌞' },
                                  { key: 'bc', title: 'Bottom-center', glyph: '⎵' },
                                  { key: 'br', title: 'Bottom-right',  glyph: '⌟' },
                                ];
                                const currentKey: PinPreset = !cur
                                  ? 'row'
                                  : cur.v === 'top' && cur.h === 'left' ? 'tl'
                                  : cur.v === 'top' && cur.h === 'right' ? 'tr'
                                  : cur.h === 'left' ? 'bl'
                                  : cur.h === 'right' ? 'br'
                                  : 'bc';
                                const applyPreset = (k: PinPreset) => {
                                  if (k === 'row') return setButtonAnchorIntent(row.slotName, row.buttonId!, null);
                                  const map: Record<Exclude<PinPreset, 'row'>, Record<string, any>> = {
                                    tl: { h: 'left',   v: 'top',    relativeTo: 'stage' },
                                    tr: { h: 'right',  v: 'top',    relativeTo: 'stage' },
                                    bl: { h: 'left',   v: 'bottom', relativeTo: 'stage' },
                                    bc: { h: 'center', v: 'bottom', relativeTo: 'stage' },
                                    br: { h: 'right',  v: 'bottom', relativeTo: 'stage' },
                                  };
                                  setButtonAnchorIntent(row.slotName, row.buttonId!, { ...map[k], gap: cur?.gap ?? 16 });
                                };
                                return (
                                  <div className="px-3 pb-2.5 pt-1 border-t border-blue-200/60 space-y-2">
                                    <div className="flex items-center gap-1 text-xs text-gray-700">
                                      <span className="opacity-70">Pin</span>
                                      <div className="flex rounded overflow-hidden border border-gray-300">
                                        {presets.map(p => (
                                          <button
                                            key={p.key}
                                            type="button"
                                            onClick={() => applyPreset(p.key)}
                                            title={p.title}
                                            className={`px-2 py-1 text-sm leading-none ${
                                              currentKey === p.key
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white hover:bg-gray-50 text-gray-700'
                                            }`}
                                          >
                                            {p.glyph}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {cur && (
                                      <div className="flex items-center gap-2 text-xs text-gray-700">
                                        <span className="opacity-70">Gap</span>
                                        <input
                                          type="range"
                                          min={0}
                                          max={64}
                                          step={4}
                                          value={typeof cur.gap === 'number' ? cur.gap : 16}
                                          onChange={e => setButtonAnchorIntent(row.slotName, row.buttonId!, { gap: parseInt(e.target.value, 10) || 0 })}
                                          className="flex-1"
                                          title={`${cur.gap ?? 16}px`}
                                        />
                                        <span className="w-8 tabular-nums text-right opacity-70">{cur.gap ?? 16}px</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                        {/* Layout sub-section — the connector visually
                            between the buttons (above) and these controls
                            ("applies to ↑ buttons above"). */}
                        <div className="rounded border border-blue-300 bg-white/70 px-2.5 py-2 space-y-2 mt-1">
                        <div className="text-[10px] uppercase tracking-wide text-blue-600 font-medium">
                          Action layout
                          <span className="ml-1 opacity-60 normal-case font-normal text-gray-600">
                            applies to the button{actionRows.length === 1 ? '' : 's'} above
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-700">
                          <span className="opacity-70 w-12">Where</span>
                          {(['bottom', 'belowBody'] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setActionAnchor(actionSlotName, { __mode: m })}
                              className={`px-2 py-1 rounded border ${
                                anchorMode === m
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
                              }`}
                              title={m === 'bottom' ? 'Pinned to bottom of stage' : 'Directly below the body text'}
                            >
                              {m === 'bottom' ? 'Stage bottom' : 'Below body'}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-700">
                          <span className="opacity-70 w-12">Align</span>
                          {(['left', 'center', 'right'] as const).map(h => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setActionAnchor(actionSlotName, { h })}
                              className={`w-8 py-1 rounded border ${
                                anchorH === h
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
                              }`}
                              title={h}
                            >
                              {h === 'left' ? '⟸' : h === 'right' ? '⟹' : '≡'}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-700">
                          <span className="opacity-70 w-12">Gap</span>
                          <input
                            type="range"
                            min={0}
                            max={64}
                            step={4}
                            value={anchorGap}
                            onChange={e => setActionAnchor(actionSlotName, { gap: parseInt(e.target.value, 10) || 0 })}
                            className="flex-1"
                            title={`${anchorGap}px`}
                          />
                          <span className="w-8 tabular-nums text-right opacity-70">{anchorGap}px</span>
                        </div>
                        {/* Type/transform overrides for the whole
                            action slot — affects every button in the
                            row uniformly. Per-button overrides aren't
                            supported (would clutter the UI for little
                            authoring gain). */}
                        <div className="border-t border-blue-200/60 pt-2 mt-1">
                          {renderSlotTypeTransform(actionSlotName)}
                        </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Element List */}
              {sortedElements.length === 0 ? (
                slotRows.length === 0 ? (
                  <div className="text-xs text-gray-500 italic py-2 text-center">
                    No elements yet. Add one above.
                  </div>
                ) : null
              ) : (
                <div className="space-y-1">
                  {sortedElements.map((element, index) => {
                    // Orphan = a character-type element that references no
                    // resolvable character (either explicitly null or its
                    // name doesn't match any project character). These tend
                    // to accumulate in old projects after a character is
                    // renamed/deleted and the location row is left behind.
                    // Legacy data carries a `character` field; current type
                    // uses `characterId`. Read either so older projects
                    // still resolve.
                    const elementCharacterRef =
                      (element as { character?: string | null }).character ??
                      element.characterId;
                    const isOrphanCharacter =
                      element.type === 'character' &&
                      !characters.some(c =>
                        c.id === elementCharacterRef ||
                        c.name === elementCharacterRef ||
                        c.name === element.name
                      );
                    return (
                    <div
                      key={element.id}
                      className={`
                        p-2 rounded border transition-colors cursor-pointer
                        ${selectedElements.includes(element.id)
                          ? 'border-blue-500 bg-blue-50'
                          : isOrphanCharacter
                            ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                      `}
                      onClick={() => onElementSelect(element.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getElementIcon(element.type)}
                          <span className="text-sm font-medium truncate">
                            {element.name}
                          </span>
                          {isOrphanCharacter && (
                            <span
                              className="text-[10px] px-1 py-0.5 bg-amber-200 text-amber-900 rounded font-medium"
                              title={`No character named "${elementCharacterRef || element.name}" exists in this project. This row is a leftover from a deleted/renamed character — use Delete to clean it up.`}
                            >
                              ⚠ orphan
                            </span>
                          )}
                          {element.groupId && (
                            <span className="text-[10px] px-1 py-0.5 bg-purple-100 text-purple-600 rounded" title="Grouped">G</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">z:{element.z}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 mt-1">
                        {/* Visibility Toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementUpdate(element.id, { visible: !element.visible });
                          }}
                          className="p-1 hover:bg-white rounded"
                          title={element.visible ? 'Hide' : 'Show'}
                        >
                          {element.visible ? (
                            <Eye className="w-3 h-3 text-gray-600" />
                          ) : (
                            <EyeOff className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                        
                        {/* Lock Toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementUpdate(element.id, { locked: !element.locked });
                          }}
                          className="p-1 hover:bg-white rounded"
                          title={element.locked ? 'Unlock' : 'Lock'}
                        >
                          {element.locked ? (
                            <Lock className="w-3 h-3 text-gray-600" />
                          ) : (
                            <Unlock className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                        
                        <div className="flex-1" />
                        
                        {/* Reorder Buttons */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementReorder(element.id, 'up');
                          }}
                          disabled={index === 0}
                          className="p-1 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Up"
                        >
                          <ChevronUp className="w-3 h-3 text-gray-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementReorder(element.id, 'down');
                          }}
                          disabled={index === sortedElements.length - 1}
                          className="p-1 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Down"
                        >
                          <ChevronDown className="w-3 h-3 text-gray-600" />
                        </button>
                        
                        {/* Delete Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${element.name}"?`)) {
                              onElementDelete(element.id);
                            }
                          }}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Multi-select summary */}
        {selectedElements.length > 1 && (
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="text-sm font-medium text-gray-700 mb-2">
              {selectedElements.length} elements selected
              {(() => {
                const selEls = elements.filter(el => selectedElements.includes(el.id));
                const grouped = selEls.filter(el => el.groupId);
                if (grouped.length > 0) {
                  const groups = new Set(grouped.map(el => el.groupId));
                  return <span className="text-purple-600 ml-1">({groups.size} group{groups.size > 1 ? 's' : ''})</span>;
                }
                return null;
              })()}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => {
                  selectedElements.forEach(id => {
                    const el = elements.find(e => e.id === id);
                    if (el && !el.locked) onElementUpdate(id, { locked: true });
                  });
                }}
                className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                Lock All
              </button>
              <button
                onClick={() => {
                  selectedElements.forEach(id => {
                    const el = elements.find(e => e.id === id);
                    if (el && el.locked) onElementUpdate(id, { locked: false });
                  });
                }}
                className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                Unlock All
              </button>
              <button
                onClick={() => {
                  selectedElements.forEach(id => onElementDelete(id));
                }}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Delete All
              </button>
            </div>
          </div>
        )}

        {/* Transform Section - Only shown when element is selected */}
        {selected && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('transform')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4" />
                <span className="font-medium text-sm">Transform</span>
              </div>
            </button>
            
            {expandedSections.transform && (
              <div className="px-4 pb-4 space-y-3">
                {/* Position - shows effective position accounting for scale transform */}
                {(() => {
                  const scale = selected.scale || 1;
                  // Calculate effective dimensions (visual size after scale)
                  const effectiveWidth = selected.width * scale;
                  const effectiveHeight = selected.height * scale;
                  // Calculate effective position (top-left of scaled element, transform origin is center)
                  const effectiveX = selected.x + (selected.width - effectiveWidth) / 2;
                  const effectiveY = selected.y + (selected.height - effectiveHeight) / 2;

                  // Character / prop free-positioned elements use
                  // percentage in any project (the runtime always reads
                  // xPercent/yPercent first; pixel x/y is the fallback for
                  // pre-migration data). So percentage controls are the
                  // canonical authoring surface for these element types
                  // regardless of the per-instance layoutMode.
                  const isFreePositioned = selected.type === 'character' || selected.type === 'prop';
                  return (
                    <>
                      {isFreePositioned ? (
                        // Free-positioned characters/props: percentage
                        // position is canonical (runtime reads xPercent/
                        // yPercent first; the pixel x/y stays populated
                        // as a fallback for pre-migration data and absolute
                        // mode). Slot content (title/body/buttons) is
                        // anchor-managed in the left panel's slot rows.
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Position
                            <span className="ml-1 text-gray-500 font-normal">
                              · % of stage
                            </span>
                          </label>
                          {(() => {
                            const stageW = stageWidth || 1024;
                            const stageH = stageHeight || 768;
                            // Read xPercent if set, else derive from pixel x.
                            const xPct = typeof (selected as any).xPercent === 'number'
                              ? (selected as any).xPercent as number
                              : (selected.x / stageW) * 100;
                            const yPct = typeof (selected as any).yPercent === 'number'
                              ? (selected as any).yPercent as number
                              : (selected.y / stageH) * 100;
                            const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
                            const updateXPct = (v: number) => {
                              const next = clamp(v, 0, 100);
                              onElementUpdate(selected.id, {
                                xPercent: next,
                                // Keep pixel x in sync as a fallback.
                                x: Math.round((next / 100) * stageW),
                              } as any);
                            };
                            const updateYPct = (v: number) => {
                              const next = clamp(v, 0, 100);
                              onElementUpdate(selected.id, {
                                yPercent: next,
                                y: Math.round((next / 100) * stageH),
                              } as any);
                            };
                            return (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-600">X %</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={0.5}
                                      value={xPct}
                                      onChange={(e) => updateXPct(parseFloat(e.target.value))}
                                      className="flex-1"
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.5}
                                      value={Math.round(xPct * 10) / 10}
                                      onChange={(e) => updateXPct(parseFloat(e.target.value) || 0)}
                                      className="w-14 px-1 py-1 text-xs border border-gray-300 rounded text-center"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Y %</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={0.5}
                                      value={yPct}
                                      onChange={(e) => updateYPct(parseFloat(e.target.value))}
                                      className="flex-1"
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.5}
                                      value={Math.round(yPct * 10) / 10}
                                      onChange={(e) => updateYPct(parseFloat(e.target.value) || 0)}
                                      className="w-14 px-1 py-1 text-xs border border-gray-300 rounded text-center"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : layoutMode === 'absolute' ? (
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Position
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-600">X</label>
                              <input
                                type="number"
                                value={Math.round(effectiveX)}
                                onChange={(e) => {
                                  const newEffectiveX = parseInt(e.target.value) || 0;
                                  const baseX = newEffectiveX - (selected.width - effectiveWidth) / 2;
                                  onElementUpdate(selected.id, { x: Math.round(baseX) });
                                }}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Y</label>
                              <input
                                type="number"
                                value={Math.round(effectiveY)}
                                onChange={(e) => {
                                  const newEffectiveY = parseInt(e.target.value) || 0;
                                  const baseY = newEffectiveY - (selected.height - effectiveHeight) / 2;
                                  onElementUpdate(selected.id, { y: Math.round(baseY) });
                                }}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Other slot/spatial elements (text/dialog/button)
                        // are anchored by the slot system itself; pixel
                        // position would be misleading.
                        <div className="text-xs text-gray-500 italic px-1 py-1.5 rounded bg-gray-50 border border-dashed border-gray-300">
                          Position is managed by the {layoutMode === 'spatial' ? 'spatial' : 'slot'} layout.
                          Edit anchor / preferred lines in the left panel's slot rows.
                        </div>
                      )}

                      {/* Size — characters have a dedicated "Size (N%)"
                          slider in the Character section below, so suppress
                          the bounding-box editor here (it'd be confusing to
                          show two different size controls). Free-positioned
                          props get widthPercent/heightPercent sliders so
                          they scale with the stage at any viewport, with
                          pixel width/height as derived secondary inputs.
                          Other elements (text/dialog/button) keep the pixel
                          width/height inputs. */}
                      {selected.type === 'character' ? null : isFreePositioned ? (
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Size
                            <span className="ml-1 text-gray-500 font-normal">
                              · % of stage
                            </span>
                          </label>
                          {(() => {
                            const stageW = stageWidth || 1024;
                            const stageH = stageHeight || 768;
                            const widthPct = typeof (selected as any).widthPercent === 'number'
                              ? (selected as any).widthPercent as number
                              : (selected.width / stageW) * 100;
                            const heightPct = typeof (selected as any).heightPercent === 'number'
                              ? (selected as any).heightPercent as number
                              : (selected.height / stageH) * 100;
                            const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
                            const updateWPct = (v: number) => {
                              const next = clamp(v, 1, 100);
                              onElementUpdate(selected.id, {
                                widthPercent: next,
                                width: Math.round((next / 100) * stageW),
                              } as any);
                            };
                            const updateHPct = (v: number) => {
                              const next = clamp(v, 1, 100);
                              onElementUpdate(selected.id, {
                                heightPercent: next,
                                height: Math.round((next / 100) * stageH),
                              } as any);
                            };
                            return (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-600">W %</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="range"
                                      min={1}
                                      max={100}
                                      step={0.5}
                                      value={widthPct}
                                      onChange={(e) => updateWPct(parseFloat(e.target.value))}
                                      className="flex-1"
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      step={0.5}
                                      value={Math.round(widthPct * 10) / 10}
                                      onChange={(e) => updateWPct(parseFloat(e.target.value) || 1)}
                                      className="w-14 px-1 py-1 text-xs border border-gray-300 rounded text-center"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">H %</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="range"
                                      min={1}
                                      max={100}
                                      step={0.5}
                                      value={heightPct}
                                      onChange={(e) => updateHPct(parseFloat(e.target.value))}
                                      className="flex-1"
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      step={0.5}
                                      value={Math.round(heightPct * 10) / 10}
                                      onChange={(e) => updateHPct(parseFloat(e.target.value) || 1)}
                                      className="w-14 px-1 py-1 text-xs border border-gray-300 rounded text-center"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Size
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-600">Width</label>
                              <input
                                type="number"
                                value={Math.round(effectiveWidth)}
                                onChange={(e) => {
                                  const newEffectiveWidth = parseInt(e.target.value) || 50;
                                  const baseWidth = newEffectiveWidth / scale;
                                  onElementUpdate(selected.id, { width: Math.round(baseWidth) });
                                }}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                                min="10"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Height</label>
                              <input
                                type="number"
                                value={Math.round(effectiveHeight)}
                                onChange={(e) => {
                                  const newEffectiveHeight = parseInt(e.target.value) || 50;
                                  const baseHeight = newEffectiveHeight / scale;
                                  onElementUpdate(selected.id, { height: Math.round(baseHeight) });
                                }}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                                min="10"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Scale - hide for characters since they have their own Size control */}
                {selected.type !== 'character' && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Scale
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="3"
                      step="0.1"
                      value={selected.scale}
                      onChange={(e) => onElementUpdate(selected.id, { scale: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-600 text-center">{(selected.scale * 100).toFixed(0)}%</div>
                  </div>
                )}

                {/* Rotation */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Rotation
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={selected.rotation}
                      onChange={(e) => onElementUpdate(selected.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      value={selected.rotation}
                      onChange={(e) => onElementUpdate(selected.id, { rotation: parseInt(e.target.value) || 0 })}
                      className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                      min="0"
                      max="360"
                    />
                    <span className="text-xs text-gray-600">°</span>
                  </div>
                </div>

                {/* Z-Index — pixel stacking is meaningless in slot/spatial
                    (the engine resolves layer order from slot role and the
                    spatial vs flow split). Hidden there. */}
                {layoutMode === 'absolute' && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Layer (Z-Index)
                    </label>
                    <input
                      type="number"
                      value={selected.z}
                      onChange={(e) => onElementUpdate(selected.id, { z: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>
                )}

                {/* Phase 1 — Lock position (designer feedback). When
                    set, CollisionDetect skips this element's
                    auto-shift; the renderer keeps the authored x/y
                    even if it overlaps text or other buttons. Only
                    meaningful in fixed/absolute mode; the responsive
                    flow doesn't run collision detection. */}
                {layoutMode === 'absolute' && (
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!(selected as any).lockPosition}
                      onChange={(e) => onElementUpdate(selected.id, { lockPosition: e.target.checked } as any)}
                      className="rounded border-gray-300"
                    />
                    Lock position
                    <span className="text-gray-500 text-[10px]">
                      (skip auto-shift on overlap)
                    </span>
                  </label>
                )}

                {/* Name */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Name
                  </label>
                  <input
                    type="text"
                    value={selected.name}
                    onChange={(e) => onElementUpdate(selected.id, { name: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>

                {/* Asset Controls - Only for character and prop elements */}
                {(selected.type === 'character' || selected.type === 'prop') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Asset
                    </label>
                    {selected.assetId && (
                      <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                        {(() => {
                          const asset = assets.find(a => a.id === selected.assetId);
                          if (asset) {
                            return (
                              <div className="flex items-center gap-2">
                                {asset.url && asset.type === 'image' && (
                                  <img
                                    src={asset.url}
                                    alt={asset.name}
                                    className="w-12 h-12 object-contain rounded border border-gray-300"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-gray-900 truncate">{asset.name}</div>
                                  {asset.dimensions && (
                                    <div className="text-xs text-gray-500">
                                      {asset.dimensions.width} × {asset.dimensions.height}px
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="text-xs text-red-600">
                              Asset not found: {selected.assetId}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {/* Character: Show "Change Character" button */}
                    {selected.type === 'character' ? (
                      <button
                        onClick={() => {
                          if (onOpenCharacterManager) {
                            onOpenCharacterManager((character) => {
                              // Get the character's default state image
                              const defaultState = character.states?.find((s: any) => s.id === character.defaultState);
                              const characterImage = defaultState?.visual?.image || character.visual?.defaultImage;

                              // Convert base64 to blob URL if needed
                              const convertBase64ToBlob = (base64: string): string => {
                                if (!base64.startsWith('data:')) return base64;
                                try {
                                  const parts = base64.split(',');
                                  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
                                  const bstr = atob(parts[1]);
                                  const n = bstr.length;
                                  const u8arr = new Uint8Array(n);
                                  for (let i = 0; i < n; i++) {
                                    u8arr[i] = bstr.charCodeAt(i);
                                  }
                                  const blob = new Blob([u8arr], { type: mime });
                                  return URL.createObjectURL(blob);
                                } catch (error) {
                                  console.error('Error converting base64 to blob:', error);
                                  return base64;
                                }
                              };

                              let imageUrl = characterImage;
                              if (imageUrl && imageUrl.startsWith('data:')) {
                                imageUrl = convertBase64ToBlob(imageUrl);
                              }

                              // Load image to get natural dimensions
                              const updateCharacter = (width?: number, height?: number) => {
                                const updates: Record<string, any> = {
                                  name: character.displayName,
                                  characterId: character.id,
                                  characterName: character.name,
                                  stateId: defaultState?.id || 'default',
                                  imageUrl: imageUrl,
                                  size: 100 // Reset to 100% for new character
                                };
                                if (width && height) {
                                  updates.width = width;
                                  updates.height = height;
                                }
                                onElementUpdate(selected.id, updates);
                              };

                              // Try to load image to get natural dimensions
                              if (imageUrl) {
                                const img = new Image();
                                img.onload = () => {
                                  updateCharacter(img.naturalWidth, img.naturalHeight);
                                };
                                img.onerror = () => {
                                  updateCharacter();
                                };
                                img.src = imageUrl;
                              } else {
                                updateCharacter();
                              }
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
                      >
                        <User className="w-4 h-4" />
                        Change Character
                      </button>
                    ) : (
                      /* Prop: Show "Select Asset" button */
                      <button
                        onClick={() => {
                          if (onSelectAsset) {
                            onSelectAsset(selected.type as 'character' | 'prop', (asset) => {
                              onElementUpdate(selected.id, { assetId: asset.id });
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
                      >
                        <ImageIcon className="w-4 h-4" />
                        {selected.assetId ? 'Change Asset' : 'Select Asset'}
                      </button>
                    )}
                  </div>
                )}

                {/* Character State and Size Controls - Only for character elements */}
                {selected.type === 'character' && selected.characterId && (
                  <>
                    {/* State Selector */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Character State
                      </label>
                      <select
                        value={selected.stateId || 'default'}
                        onChange={(e) => {
                          const character = characters.find(c => c.id === selected.characterId);
                          const newState = character?.states?.find(s => s.id === e.target.value);
                          const newImageUrl = newState?.visual?.image || character?.visual?.defaultImage;
                          onElementUpdate(selected.id, {
                            stateId: e.target.value,
                            imageUrl: newImageUrl
                          });
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      >
                        {(() => {
                          const character = characters.find(c => c.id === selected.characterId);
                          if (character?.states && character.states.length > 0) {
                            return character.states.map(state => (
                              <option key={state.id} value={state.id}>
                                {state.name}
                              </option>
                            ));
                          }
                          return <option value="default">Default</option>;
                        })()}
                      </select>
                    </div>

                    {/* Size/Scale Slider */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Size ({selected.size || 100}%)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="10"
                          max="200"
                          value={selected.size || 100}
                          onChange={(e) => onElementUpdate(selected.id, { size: parseInt(e.target.value) })}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="10"
                          max="200"
                          value={selected.size || 100}
                          onChange={(e) => onElementUpdate(selected.id, { size: parseInt(e.target.value) || 100 })}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Hotspot Settings - Only for hotspot elements */}
                {selected.type === 'hotspot' && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <label className="text-xs font-medium text-gray-700 mb-2 block">
                      Hotspot Settings (Per-Element Override)
                    </label>

                    {/* Override Global Settings Checkbox */}
                    <label className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={selected.hotspotOverride?.enabled ?? false}
                        onChange={(e) => onElementUpdate(selected.id, {
                          hotspotOverride: {
                            ...selected.hotspotOverride,
                            enabled: e.target.checked
                          }
                        })}
                        className="rounded"
                      />
                      <span className="text-xs text-gray-700">Override global hotspot settings</span>
                    </label>

                    {/* Override Controls - Only show when override is enabled */}
                    {selected.hotspotOverride?.enabled && (
                      <div className="space-y-3 pl-2 border-l-2 border-blue-200">
                        {/* Opacity Slider */}
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Opacity
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={selected.hotspotOverride?.opacity ?? globalSettings?.hotspots?.opacity ?? 30}
                              onChange={(e) => onElementUpdate(selected.id, {
                                hotspotOverride: {
                                  ...selected.hotspotOverride,
                                  enabled: true,
                                  opacity: parseInt(e.target.value)
                                }
                              })}
                              className="flex-1"
                            />
                            <span className="text-xs text-gray-600 w-8 text-right">
                              {selected.hotspotOverride?.opacity ?? globalSettings?.hotspots?.opacity ?? 30}%
                            </span>
                          </div>
                        </div>

                        {/* Preview Mode Visibility */}
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Preview Visibility
                          </label>
                          <select
                            value={selected.hotspotOverride?.showInPreview ?? globalSettings?.hotspots?.showInPreview ?? 'visible'}
                            onChange={(e) => onElementUpdate(selected.id, {
                              hotspotOverride: {
                                ...selected.hotspotOverride,
                                enabled: true,
                                showInPreview: e.target.value as 'visible' | 'onHover' | 'invisible'
                              }
                            })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          >
                            <option value="visible">Visible (always show)</option>
                            <option value="onHover">On Hover only</option>
                            <option value="invisible">Invisible (no feedback)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Panorama Hotspot Properties - Only for hotspot elements in panorama beats */}
                {selected.type === 'hotspot' && beatType === 'panorama' && panoramaHotspots && onPanoramaHotspotUpdate && (() => {
                  const hs = panoramaHotspots.find(h => h.id === selected.id);
                  if (!hs) return null;
                  return (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                      <label className="text-xs font-semibold text-gray-700 block uppercase tracking-wider">
                        Panorama Hotspot
                      </label>

                      {/* Pitch/Yaw (editable — repositions element on stage) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500">Pitch</label>
                          <input
                            type="number"
                            value={parseFloat(hs.pitch.toFixed(1))}
                            onChange={(e) => {
                              const newPitch = parseFloat(e.target.value) || 0;
                              onPanoramaHotspotUpdate(hs.id, { pitch: Math.round(newPitch * 10) / 10 });
                            }}
                            step={0.5}
                            min={-90}
                            max={90}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Yaw</label>
                          <input
                            type="number"
                            value={parseFloat(hs.yaw.toFixed(1))}
                            onChange={(e) => {
                              const newYaw = parseFloat(e.target.value) || 0;
                              onPanoramaHotspotUpdate(hs.id, { yaw: Math.round(newYaw * 10) / 10 });
                            }}
                            step={0.5}
                            min={-180}
                            max={180}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Font Controls - Only for text, dialog, and button elements */}
                {(selected.type === 'text' || selected.type === 'dialog' || selected.type === 'button') && (
                  <>
                    {/* Font Family with Reset Button */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-700">
                          Font Family
                        </label>
                        {(selected.font || selected.fontSize || selected.fontOverridden) && (
                          <button
                            onClick={() => onElementUpdate(selected.id, {
                              font: undefined,
                              fontSize: undefined,
                              fontOverridden: false
                            })}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            title="Reset to theme defaults"
                          >
                            <RotateCw className="w-3 h-3" />
                            Reset
                          </button>
                        )}
                      </div>
                      <select
                        value={selected.font || (
                          selected.type === 'button' ? defaultButtonFont :
                          (selected.name?.toLowerCase().includes('title') || selected.name?.toLowerCase().includes('author')) ? defaultTitleFont :
                          defaultTextFont
                        )}
                        onChange={(e) => onElementUpdate(selected.id, { font: e.target.value, fontOverridden: true })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      >
                        {fonts.filter(f => f.type === 'builtin').map(font => (
                          <option key={font.id} value={font.displayName}>
                            {font.displayName}
                          </option>
                        ))}
                        {fonts.filter(f => f.type === 'custom').length > 0 && (
                          <optgroup label="Custom Fonts">
                            {fonts.filter(f => f.type === 'custom').map(font => (
                              <option key={font.id} value={font.displayName}>
                                {font.displayName}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    {/* Font Size */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Font Size
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="10"
                          max="72"
                          value={selected.fontSize || 16}
                          onChange={(e) => onElementUpdate(selected.id, { fontSize: parseInt(e.target.value), fontOverridden: true })}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          value={selected.fontSize || 16}
                          onChange={(e) => onElementUpdate(selected.id, { fontSize: parseInt(e.target.value) || 16, fontOverridden: true })}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                          min="10"
                          max="72"
                        />
                        <span className="text-xs text-gray-600">px</span>
                      </div>
                    </div>

                    {/* Text Alignment */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Text Alignment
                      </label>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() => onElementUpdate(selected.id, { textAlign: 'left' })}
                          className={`px-2 py-1 text-xs border rounded ${
                            (selected.textAlign || 'center') === 'left'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Left
                        </button>
                        <button
                          onClick={() => onElementUpdate(selected.id, { textAlign: 'center' })}
                          className={`px-2 py-1 text-xs border rounded ${
                            (selected.textAlign || 'center') === 'center'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Center
                        </button>
                        <button
                          onClick={() => onElementUpdate(selected.id, { textAlign: 'right' })}
                          className={`px-2 py-1 text-xs border rounded ${
                            (selected.textAlign || 'center') === 'right'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Right
                        </button>
                      </div>
                    </div>

                    {/* Require Scroll to Bottom - Only for text and dialog elements */}
                    {(selected.type === 'text' || selected.type === 'dialog') && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.requireScrollToBottom ?? false}
                            onChange={(e) => onElementUpdate(selected.id, { requireScrollToBottom: e.target.checked })}
                            className="rounded border-gray-300"
                          />
                          <span className="text-xs font-medium text-gray-700">Require scroll to bottom</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-5">
                          When enabled, the Continue button will be disabled until the player scrolls to the bottom of this text box.
                        </p>
                      </div>
                    )}

                  </>
                )}

                {/* Click Sound Section - For interactive elements (outside font controls block so hotspots can access it) */}
                {(selected.type === 'button' || selected.type === 'text' || selected.type === 'dialog' || selected.type === 'hotspot') && (
                  <div className="mt-4">
                    <label className="text-xs font-medium text-gray-700 mb-2 block">
                      Click Sound
                    </label>

                    {/* Tab Selection */}
                    <div className="grid grid-cols-2 gap-1 mb-2">
                      <button
                        onClick={() => setSoundTab('presets')}
                        className={`px-2 py-1 text-xs border rounded ${
                          soundTab === 'presets'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Presets
                      </button>
                      <button
                        onClick={() => setSoundTab('custom')}
                        className={`px-2 py-1 text-xs border rounded ${
                          soundTab === 'custom'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Custom
                      </button>
                    </div>

                    {/* Preset Sounds */}
                    {soundTab === 'presets' && (
                      <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
                        {presetSounds.map((sound) => (
                          <div
                            key={sound.id}
                            className={`flex items-center justify-between p-2 rounded border transition-colors ${
                              selected.sound === sound.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0 mr-2">
                              <div className="text-xs font-medium text-gray-900">{sound.name}</div>
                              <div className="text-xs text-gray-500">{sound.description}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => playSound(sound.url, sound.id)}
                                className="p-1 hover:bg-white rounded"
                                title="Preview sound"
                              >
                                <Volume2 className={`w-3 h-3 ${playingSound === sound.id ? 'text-blue-600' : 'text-gray-600'}`} />
                              </button>
                              <button
                                onClick={() => onElementUpdate(selected.id, { sound: sound.id })}
                                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                              >
                                {selected.sound === sound.id ? 'Selected' : 'Use'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Custom Audio Assets */}
                    {soundTab === 'custom' && (
                      <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
                        {audioAssets.length === 0 ? (
                          <div className="text-xs text-gray-500 italic py-4 text-center">
                            No custom audio assets uploaded yet.
                            <br />
                            Upload audio files with subType 'sfx' to use them here.
                          </div>
                        ) : (
                          audioAssets.map((asset) => (
                            <div
                              key={asset.id}
                              className={`flex items-center justify-between p-2 rounded border transition-colors ${
                                selected.sound === asset.id
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex-1 min-w-0 mr-2">
                                <div className="text-xs font-medium text-gray-900 truncate">{asset.name}</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => playSound(asset.url, asset.id)}
                                  className="p-1 hover:bg-white rounded"
                                  title="Preview sound"
                                >
                                  <Volume2 className={`w-3 h-3 ${playingSound === asset.id ? 'text-blue-600' : 'text-gray-600'}`} />
                                </button>
                                <button
                                  onClick={() => onElementUpdate(selected.id, { sound: asset.id, soundAssetId: asset.id })}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  {selected.sound === asset.id ? 'Selected' : 'Use'}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Clear Sound Button */}
                    {selected.sound && (
                      <button
                        onClick={() => onElementUpdate(selected.id, { sound: undefined, soundAssetId: undefined })}
                        className="w-full mt-2 px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                      >
                        Remove Sound
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
