import { StoryEngine, Story, SerializedStoryState, ASMLParser, BeatTypeRegistry } from '@asaps/core';
import type { IRenderer, StoryMetadata, BeatConfig } from '@asaps/core';
import type { RenderThemeSettings } from '@asaps/renderer';
import { AssetResolver } from './AssetResolver';
import { SaveSystem, SaveSlot, ISaveStorageAdapter } from './SaveSystem';
import { WebSaveAdapter } from './storage/WebSaveAdapter';
import { EventEmitter } from 'eventemitter3';
import { captureScreenshot as captureScreenshotUtil } from './utils/screenshot';

/**
 * GlobalSettings from the builder export (simplified version)
 */
interface GlobalSettings {
  project?: {
    width: number;       // Stage width in pixels
    height: number;      // Stage height in pixels
    aspectRatio?: string;
    scalingMode?: 'none' | 'fit' | 'fill' | 'stretch';
  };
  colors: {
    pcolor: string;         // Button/choice background color
    palpha: number;         // Button/choice opacity (0-100)
    ptextcolor?: string;    // Button/choice text color (auto-calculated if empty)
    nonpcolor: string;      // NPC/narrator text box background
    nonpalpha: number;      // NPC/narrator opacity (0-100)
    nonptextcolor?: string; // NPC/narrator text color (auto-calculated if empty)
    bgColor: string;        // Stage background color
    textBoxBorder: string;  // Text box/button border color
    // Legacy support
    textBoxBg?: string;     // Old field - map to nonpcolor
    buttonBg?: string;      // Old field - map to pcolor
  };
  fonts: {
    titleFont: string;
    textFont: string;
    btnFont: string;
    fontSize?: {
      title: number;
      text: number;
      button: number;
    };
  };
  textbox: {
    radius: number;
    padding: number;
    borderWidth: number;
    opacity: number;
    position?: 'bottom' | 'top' | 'center';
    boxVisibility?: 'all' | 'hideText' | 'hideAll';
  };
  textEffects?: {
    animation: 'none' | 'typewriter' | 'fade';
    typewriterSpeed: number;
    fadeInDuration: number;
  };
  hotspots?: {
    visible: boolean;
    labels: boolean;
    highlightColor: string;
    opacity: number;
    showInPreview: 'visible' | 'onHover' | 'invisible';
    labelDisplay?: 'none' | 'hover' | 'always';
  };
  sound?: {
    backgroundMusic?: string;
    backgroundMusicAssetId?: string;
    backgroundVolume: number;
    mute?: boolean;
  };
  hudOverlays?: {
    timerHud?: any;
    countdownMeter?: any;
    fictionalTime?: {
      enabled: boolean;
      initialTime?: any;
      displayFormat?: string;
      showInTimerHud?: boolean;
    };
  };
  speakerDisplay?: {
    showNames?: boolean;
    showGraphics?: boolean;
    nameStyle?: string;
    namePosition?: string;
    nameColor?: string;
    graphicPosition?: string;
    graphicSize?: number;
  };
}

/**
 * Font name to CSS font-family mapping
 */
const FONT_FAMILIES: Record<string, string> = {
  'Arial': 'Arial, sans-serif',
  'Times New Roman': 'Times New Roman, serif',
  'Courier New': 'Courier New, monospace',
  'Georgia': 'Georgia, serif',
  'Verdana': 'Verdana, sans-serif',
  'Gothic': 'Georgia, serif',
  'Handwriting': 'Brush Script MT, cursive',
  'Handwriting2': 'Lucida Handwriting, cursive',
  'Comic Sans MS': 'Comic Sans MS, cursive',
  'Impact': 'Impact, sans-serif',
  'Trebuchet MS': 'Trebuchet MS, sans-serif',
  'Palatino': 'Palatino Linotype, Book Antiqua, Palatino, serif',
};

/**
 * Get CSS font-family from font name
 */
function getFontFamily(fontName: string): string {
  return FONT_FAMILIES[fontName] || fontName;
}

/**
 * Normalize opacity values (0-1 or 0-100 to 0-100)
 */
function normalizeOpacity(value: number): number {
  if (value <= 1) {
    return Math.round(value * 100);
  } else if (value > 100) {
    return 100;
  }
  return value;
}

/**
 * Lighten a hex color by a percentage
 */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(255 * percent);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0x00ff) + amt;
  let b = (num & 0x0000ff) + amt;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/**
 * Calculate contrasting text color based on background luminance.
 * Returns black for light backgrounds, white for dark backgrounds.
 */
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Convert GlobalSettings to RenderThemeSettings
 */
function convertGlobalSettingsToTheme(settings: GlobalSettings): RenderThemeSettings {
  // Get effective colors with legacy fallbacks
  const buttonBg = settings.colors.pcolor || settings.colors.buttonBg || '#ffffff';
  const textBoxBg = settings.colors.nonpcolor || settings.colors.textBoxBg || '#cccccc';

  // Calculate text colors: use explicit color if set, otherwise auto-calculate from background
  const buttonTextColor = settings.colors.ptextcolor || getContrastColor(buttonBg);
  const npcTextColor = settings.colors.nonptextcolor || getContrastColor(textBoxBg);

  return {
    backgroundColor: settings.colors.bgColor,
    textBox: {
      // NPC/narrator text box uses nonpcolor
      backgroundColor: textBoxBg,
      borderColor: settings.colors.textBoxBorder,
      borderWidth: settings.textbox.borderWidth,
      borderRadius: settings.textbox.radius,
      padding: settings.textbox.padding,
      opacity: normalizeOpacity(settings.textbox.opacity),
    },
    button: {
      // Button/choice uses pcolor for background
      backgroundColor: buttonBg,
      hoverBackgroundColor: lightenColor(buttonBg, 0.15),
      textColor: buttonTextColor,
      borderColor: settings.colors.textBoxBorder,
      borderWidth: settings.textbox.borderWidth,
      borderRadius: settings.textbox.radius,
    },
    colors: {
      textColor: npcTextColor, // NPC/narrator text color
      textAlpha: 100, // Text is always fully visible; nonpalpha controls text BOX background, not text
    },
    fonts: {
      titleFont: getFontFamily(settings.fonts.titleFont),
      textFont: getFontFamily(settings.fonts.textFont),
      buttonFont: getFontFamily(settings.fonts.btnFont),
    },
    textEffects: settings.textEffects ? {
      animation: settings.textEffects.animation,
      typewriterSpeed: settings.textEffects.typewriterSpeed,
      fadeInDuration: settings.textEffects.fadeInDuration,
    } : undefined,
    hotspot: settings.hotspots ? {
      highlightColor: settings.hotspots.highlightColor || '#ffff00',
      visible: settings.hotspots.visible ?? true,
      showLabels: settings.hotspots.labels ?? true,
      opacity: (settings.hotspots.opacity ?? 30) / 100,
      showInPreview: settings.hotspots.showInPreview ?? 'visible',
      labelDisplay: settings.hotspots.labelDisplay ?? 'hover',
    } : undefined,
    speakerDisplay: settings.speakerDisplay ? (() => {
      const sd = settings.speakerDisplay as any;
      const nameStyle = sd.nameStyle || (sd.namePosition === 'off' ? 'off' : 'label');
      const showNames = sd.showNames ?? (nameStyle !== 'off');
      const graphicPosition = sd.graphicPosition || 'off';
      const showGraphics = sd.showGraphics ?? (graphicPosition !== 'off');
      return { showNames, showGraphics, nameStyle, namePosition: sd.namePosition || 'left', nameColor: sd.nameColor, graphicPosition, graphicSize: sd.graphicSize };
    })() : undefined,
  };
}

/**
 * Player configuration options
 */
export interface PlayerConfig {
  /** Container element for rendering */
  container: HTMLElement;
  /** Custom renderer (optional, uses ReactRenderer by default) */
  renderer?: IRenderer;
  /** Custom save storage adapter (optional, uses WebSaveAdapter by default) */
  saveAdapter?: ISaveStorageAdapter;
  /** Maximum save slots */
  maxSaveSlots?: number;
  /** Enable auto-save */
  autoSaveEnabled?: boolean;
  /** Auto-save interval in milliseconds */
  autoSaveIntervalMs?: number;
}

/**
 * Player events
 */
export interface PlayerEvents {
  storyLoaded: (story: Story) => void;
  storyStarted: () => void;
  storyEnded: () => void;
  beatChanged: (beatId: string) => void;
  saved: (slot: SaveSlot) => void;
  loaded: (slot: SaveSlot) => void;
  error: (error: Error) => void;
}

/**
 * PlayerEngine is a high-level wrapper around StoryEngine
 * Integrates asset loading, save system, and rendering
 */
export class PlayerEngine extends EventEmitter<PlayerEvents> {
  private engine: StoryEngine | null = null;
  private assetResolver: AssetResolver;
  private saveSystem: SaveSystem | null = null;
  private config: PlayerConfig;
  private storyId: string = '';
  private storyTitle: string = '';
  private globalSettings: GlobalSettings | null = null;
  private backgroundMusicAudio: HTMLAudioElement | null = null;
  private assetMap: Map<string, string> = new Map();
  private currentMuted: boolean = false;
  private currentVolume: number = 100;

  constructor(config: PlayerConfig) {
    super();
    this.config = config;
    this.assetResolver = new AssetResolver();
  }

  /**
   * Load a story from a ZIP file, Blob, or ArrayBuffer
   */
  async loadStory(data: File | Blob | ArrayBuffer): Promise<void> {
    try {
      // Load and parse the ZIP
      const storyData = await this.assetResolver.loadFromZip(data);

      // Create or get the story
      let story: Story;

      if (storyData.format === 'asml') {
        // Parse ASML XML
        const parser = new ASMLParser();
        const result = await parser.parse(storyData.content);

        if (!result.success || !result.story) {
          throw new Error(`Failed to parse ASML: ${result.errors.join(', ')}`);
        }

        story = result.story;

        // Log any warnings
        if (result.warnings.length > 0) {
          console.warn('[PlayerEngine] ASML parse warnings:', result.warnings);
        }
      } else {
        // JSON format - create Story from data
        story = this.createStoryFromJson(storyData);
      }

      // Build assets array from ZIP and set on story
      // This maps asset IDs to blob URLs so beats can resolve them
      await this.buildStoryAssets(story);

      // Extract story metadata
      const metadata = story.getMetadata();
      this.storyId = storyData.id || `story_${Date.now()}`;
      this.storyTitle = metadata.title || storyData.title || 'Untitled Story';

      // Initialize save system
      const saveAdapter = this.config.saveAdapter || new WebSaveAdapter();
      this.saveSystem = new SaveSystem(this.storyId, this.storyTitle, {
        adapter: saveAdapter,
        maxSlots: this.config.maxSaveSlots || 10,
        autoSaveEnabled: this.config.autoSaveEnabled ?? true,
        autoSaveIntervalMs: this.config.autoSaveIntervalMs || 60000,
      });

      // Create the engine with the renderer
      if (!this.config.renderer) {
        throw new Error('Renderer is required. Pass a renderer in the config.');
      }

      this.engine = new StoryEngine(this.config.renderer);

      // Configure renderer's resolvers using preloaded assets
      this.setupRendererResolvers(story);

      // Load the story into the engine
      await this.engine.loadStory(story);

      // Forward engine events
      this.engine.on('storyEnded', () => this.emit('storyEnded'));

      // Handle restart request from EndScreen
      this.engine.on('restartRequested', async () => {
        console.log('[PlayerEngine] Received restartRequested event');
        await this.restart();
      });

      this.emit('storyLoaded', story);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Load a story from a URL
   */
  async loadStoryFromUrl(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch story: ${response.statusText}`);
      }
      const data = await response.arrayBuffer();
      await this.loadStory(data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Create a Story object from JSON data
   * Uses BeatTypeRegistry to properly instantiate beats from serialized JSON.
   */
  private createStoryFromJson(data: any): Story {
    // If there's already a parsed story, return it
    if (data instanceof Story) {
      return data;
    }

    // Handle nested structure from projectZipManager export
    // project.json format: { metadata, project: { story: { metadata, beats, ... } } }
    const storyData = data.project?.story || data.story || data.content || data;

    // Extract metadata from various possible locations
    const metadata: Partial<StoryMetadata> = {
      title: storyData.metadata?.title || data.project?.name || data.metadata?.title || data.title || 'Untitled Story',
      author: storyData.metadata?.author || data.metadata?.author || data.author,
      firstBeatId: storyData.metadata?.firstBeatId || data.metadata?.firstBeatId || data.firstBeatId,
    };

    console.log('[PlayerEngine] Creating story from JSON, storyData keys:', Object.keys(storyData));
    console.log('[PlayerEngine] storyData.characters:', storyData.characters?.length || 0, 'characters');
    if (storyData.characters?.length > 0) {
      console.log('[PlayerEngine] First character:', JSON.stringify(storyData.characters[0], null, 2).substring(0, 500));
    }
    console.log('[PlayerEngine] Full data structure keys:', Object.keys(data));
    if (data.project) {
      console.log('[PlayerEngine] data.project keys:', Object.keys(data.project));
      // Check if characters are at project level
      if (data.project.characters) {
        console.log('[PlayerEngine] data.project.characters:', data.project.characters.length, 'characters');
      }
    }

    const story = new Story(metadata);

    // Get the beat registry instance
    const registry = BeatTypeRegistry.getInstance();

    // Deserialize beats using BeatTypeRegistry
    const beats = storyData.beats || data.beats || [];
    if (Array.isArray(beats) && beats.length > 0) {
      console.log(`[PlayerEngine] Deserializing ${beats.length} beats from JSON`);

      for (const beatData of beats) {
        try {
          // Create beat config from serialized data
          const beatConfig: BeatConfig = {
            id: beatData.id,
            name: beatData.name || beatData.id,
            type: beatData.type,
            cluster: beatData.cluster,
            transition: beatData.transition,
            sound: beatData.sound,
            locations: beatData.locations || [],
            connections: beatData.connections || [],
            defaultTarget: beatData.defaultTarget,
            x: beatData.x,
            y: beatData.y,
            parameters: beatData.parameters || {},
          };

          // Use registry to create the proper beat type
          const beat = registry.createBeat(beatData.type, beatConfig);

          // Apply additional properties that may not be in config
          if (beatData.defaultTargetDelay !== undefined) {
            beat.defaultTargetDelay = beatData.defaultTargetDelay;
          }
          if (beatData.showTimer !== undefined) {
            beat.showTimer = beatData.showTimer;
          }
          if (beatData.node) {
            beat.node = beatData.node;
          }
          if (beatData.timeDisplayMode) {
            (beat as any).timeDisplayMode = beatData.timeDisplayMode;
          }
          if (beatData.timeDisplayText) {
            (beat as any).timeDisplayText = beatData.timeDisplayText;
          }
          if (beatData.overrideCountdownMeter !== undefined) {
            (beat as any).overrideCountdownMeter = beatData.overrideCountdownMeter;
          }
          if (beatData.notes) {
            (beat as any).notes = beatData.notes;
          }
          if (beatData.speaker) {
            beat.speaker = beatData.speaker;
          }
          if (beatData.showSpeaker != null) {
            beat.showSpeaker = beatData.showSpeaker;
          }

          story.addBeat(beat);
        } catch (error) {
          console.error(`[PlayerEngine] Failed to deserialize beat ${beatData.id}:`, error);
        }
      }

      // Set firstBeatId if not already set
      if (!metadata.firstBeatId && beats.length > 0) {
        story.setFirstBeatId(beats[0].id);
      }
    }

    // Set story settings
    if (storyData.settings) {
      story.setSettings(storyData.settings);
    }

    // Set environment (props, nodes for backgrounds)
    if (storyData.environment) {
      story.setEnvironment(storyData.environment);
    }

    // Set characters
    if (storyData.characters) {
      story.setCharacters(storyData.characters);
    }

    // Apply project-level emotion palette so runtime fireEmotion uses
    // the author's weights / decay rates rather than core defaults.
    // Same wiring as PreviewWindow's runtime story reconstruction.
    if (storyData.emotionPalette && Array.isArray(storyData.emotionPalette) && storyData.emotionPalette.length > 0) {
      story.setEmotionPalette(storyData.emotionPalette);
    }

    // Apply trait → emotion modulations so per-character traits scale
    // incoming deltas as authored.
    if (storyData.traitModulations && Array.isArray(storyData.traitModulations)) {
      story.setTraitModulations(storyData.traitModulations);
    }

    // Set clusters
    if (storyData.clusters) {
      story.setClusters(storyData.clusters);
    }

    // Extract and store globalSettings for theme and audio
    const globalSettings = data.project?.globalSettings || data.globalSettings;
    if (globalSettings) {
      this.globalSettings = globalSettings;
      console.log('[PlayerEngine] Loaded globalSettings:', JSON.stringify(globalSettings, null, 2).substring(0, 500));
    }

    // Validate the story
    const validation = story.validate();
    if (!validation.valid) {
      console.warn('[PlayerEngine] Story validation warnings:', validation.errors);
    }

    console.log(`[PlayerEngine] Created story with ${story.getAllBeats().length} beats, firstBeatId: ${story.getFirstBeatId()}`);

    return story;
  }

  /**
   * Build assets array from ZIP contents and set on story
   * This allows beats to resolve asset IDs to blob URLs
   */
  private async buildStoryAssets(story: Story): Promise<void> {
    const manifest = this.assetResolver.getManifest();
    const assets: Array<{ id: string; url: string; type: string; filename: string }> = [];

    console.log(`[PlayerEngine] Building assets from ${manifest.length} files in ZIP`);

    // First pass: collect known asset IDs from metadata JSON filenames.
    // The ZIP stores metadata as "{folder}/{assetId}.json" alongside media files
    // as "{folder}/{assetId}_{originalFilename}.ext". Since asset IDs can contain
    // underscores (e.g. "asset_1772586254887_ty1nd6r8i"), we can't just split on
    // the first underscore. Instead, use the JSON filenames as the source of truth.
    const knownAssetIds = new Set<string>();
    for (const assetInfo of manifest) {
      if (assetInfo.path.endsWith('.json')) {
        const jsonFilename = assetInfo.path.split('/').pop() || '';
        const potentialId = jsonFilename.replace(/\.json$/, '');
        if (potentialId) knownAssetIds.add(potentialId);
      }
    }

    // Second pass: load media assets with correct IDs
    for (const assetInfo of manifest) {
      try {
        // Skip .json metadata files - only load actual media assets
        if (assetInfo.path.endsWith('.json')) {
          continue;
        }

        const loaded = await this.assetResolver.getAsset(assetInfo.path);
        if (loaded) {
          // Extract asset ID from path - format is "folder/assetId_filename.ext"
          // Match against known IDs from metadata files (handles IDs with underscores)
          const filename = assetInfo.path.split('/').pop() || '';
          let assetId = '';
          for (const knownId of knownAssetIds) {
            if (filename.startsWith(knownId + '_') || filename === knownId) {
              assetId = knownId;
              break;
            }
          }
          // Fallback for ZIPs without metadata files
          if (!assetId) {
            assetId = filename.includes('_') ? filename.split('_')[0] : assetInfo.id;
          }

          assets.push({
            id: assetId,
            url: loaded.url,
            type: assetInfo.type,
            filename: assetInfo.name,
          });

          console.log(`[PlayerEngine] Loaded asset: ${assetId} -> ${loaded.url.substring(0, 50)}...`);
        }
      } catch (err) {
        console.warn(`[PlayerEngine] Failed to load asset ${assetInfo.path}:`, err);
      }
    }

    // Set assets on story so beats can resolve them
    story.setAssets(assets);

    // Also build environment.nodes from loaded assets for background resolution
    const environment = story.getEnvironment() || { props: [], nodes: [] };
    const imageAssets = assets.filter(a => a.type === 'image');

    // Add loaded images to environment.nodes if not already present
    for (const asset of imageAssets) {
      const exists = environment.nodes?.some((n: any) => n.id === asset.id);
      if (!exists) {
        environment.nodes = environment.nodes || [];
        environment.nodes.push({
          id: asset.id,
          url: asset.url,
          src: asset.url,
          name: asset.filename,
        });
      }
    }

    story.setEnvironment(environment);
    console.log(`[PlayerEngine] Set ${assets.length} assets and ${environment.nodes?.length || 0} environment nodes`);
  }

  /**
   * Set up renderer resolvers for assets, characters, and sounds
   */
  private setupRendererResolvers(story: Story): void {
    const renderer = this.config.renderer as any;
    const assets = story.getAssets() || [];
    const characters = story.getCharacters() || [];

    // Build lookup maps for fast sync resolution
    this.assetMap = new Map<string, string>();
    for (const asset of assets) {
      this.assetMap.set(asset.id, asset.url);
    }

    // Build prop asset map and display name map from PickProp beats
    const propAssetMap = new Map<string, string>();
    const propDisplayNameMap = new Map<string, string>();
    const allBeats = story.getAllBeats();
    for (const beat of allBeats) {
      if (beat.type === 'pickProp') {
        const props = (beat as any).props || [];
        for (const prop of props) {
          if (prop.name && prop.assetId) {
            const url = this.assetMap.get(prop.assetId);
            if (url) {
              propAssetMap.set(prop.name, url);
              propAssetMap.set(prop.name.toLowerCase(), url);
            }
          }
          // Map prop name to displayName for inventory label resolution
          if (prop.name && prop.displayName) {
            propDisplayNameMap.set(prop.name, prop.displayName);
            propDisplayNameMap.set(prop.name.toLowerCase(), prop.displayName);
          }
        }
        // Also check beat locations for prop graphics
        const locations = Array.from(beat.locations?.values?.() || []);
        for (const loc of locations) {
          if ((loc as any).kind === 'prop' && (loc as any).name && (loc as any).assetId) {
            const url = this.assetMap.get((loc as any).assetId);
            if (url) {
              propAssetMap.set((loc as any).name, url);
              propAssetMap.set((loc as any).name.toLowerCase(), url);
            }
          }
        }
      }
    }

    console.log(`[PlayerEngine] Setting up resolvers with ${this.assetMap.size} assets, ${characters.length} characters, ${propAssetMap.size} prop icons`);

    // Apply theme settings from globalSettings
    if (this.globalSettings && 'setTheme' in renderer) {
      try {
        const theme = convertGlobalSettingsToTheme(this.globalSettings);
        renderer.setTheme(theme);
        console.log('[PlayerEngine] Applied theme with speakerDisplay:', JSON.stringify(theme.speakerDisplay));
        console.log('[PlayerEngine] globalSettings.speakerDisplay:', JSON.stringify(this.globalSettings.speakerDisplay));
      } catch (err) {
        console.warn('[PlayerEngine] Failed to apply theme settings:', err);
      }
    } else {
      console.warn('[PlayerEngine] No globalSettings or setTheme not available:', { hasGS: !!this.globalSettings, hasSetTheme: !!renderer && 'setTheme' in renderer });
    }
    if (characters.length > 0) {
      console.log(`[PlayerEngine] Characters:`, characters.map((c: any) => ({ id: c.id, name: c.name, states: c.states?.length || 0 })));
    }

    // Character portrait resolver for speaker portraits
    if ('setCharacterPortraitResolver' in renderer && characters.length > 0) {
      renderer.setCharacterPortraitResolver((speakerName: string): string | undefined => {
        if (!speakerName) return undefined;
        const lower = speakerName.toLowerCase();
        const char = characters.find((c: any) =>
          c.displayName?.toLowerCase() === lower || c.name?.toLowerCase() === lower
        );
        if (!char?.portrait) return undefined;
        if (char.portrait.assetId && this.assetMap.has(char.portrait.assetId)) {
          return this.assetMap.get(char.portrait.assetId);
        }
        return char.portrait.image;
      });
      console.log('[PlayerEngine] Set up character portrait resolver');
    }

    // Asset resolver - resolves asset IDs to blob URLs
    if ('setAssetResolver' in renderer) {
      renderer.setAssetResolver((assetId: string): string | undefined => {
        // Direct lookup
        if (this.assetMap.has(assetId)) {
          return this.assetMap.get(assetId);
        }
        // Check if it's already a valid URL
        if (assetId?.startsWith('blob:') || assetId?.startsWith('http')) {
          // If it's a blob from another origin (builder), try to find by filename
          if (assetId.includes('localhost:5173')) {
            console.warn(`[AssetResolver] Skipping builder blob URL: ${assetId}`);
            return undefined;
          }
          return assetId;
        }
        return undefined;
      });
    }

    // Character resolver - resolves characterId + stateId to image URL
    if ('setCharacterResolver' in renderer) {
      renderer.setCharacterResolver((characterId: string, stateId?: string): string | undefined => {
        console.log(`[CharacterResolver] Called with characterId="${characterId}", stateId="${stateId}"`);
        console.log(`[CharacterResolver] Available characters:`, characters.map((c: any) => ({ id: c.id, name: c.name, displayName: c.displayName })));

        // Try to find by id or name (case-insensitive for displayName)
        const character = characters.find((c: any) =>
          c.id === characterId ||
          c.name === characterId ||
          c.displayName === characterId ||
          c.name?.toLowerCase() === characterId?.toLowerCase() ||
          c.displayName?.toLowerCase() === characterId?.toLowerCase()
        );

        if (!character) {
          console.log(`[CharacterResolver] Character not found: ${characterId}`);
          return undefined;
        }

        console.log(`[CharacterResolver] Found character:`, {
          id: character.id,
          name: character.name,
          hasVisual: !!character.visual,
          visualType: character.visual?.type,
          hasSpriteSheet: !!character.visual?.spriteSheet,
          spriteSheetUrl: character.visual?.spriteSheet?.url?.substring(0, 80) + '...',
        });

        // Find the state image
        const states = character.states || [];
        const state = stateId
          ? states.find((s: any) => s.id === stateId || s.name === stateId)
          : states[0]; // Default to first state

        // Check various paths for asset ID
        const assetId = state?.visual?.assetId ||
                        state?.assetId ||
                        character.visual?.defaultAssetId ||
                        character.defaultAssetId;

        if (assetId) {
          const url = this.assetMap.get(assetId);
          if (url) {
            console.log(`[CharacterResolver] Resolved ${characterId} -> ${assetId} -> ${url.substring(0, 50)}...`);
            return url;
          }
        }

        // Check for direct URL (not from builder)
        // Support multiple paths: states, spriteSheet, or defaultImage
        const directUrl = state?.visual?.image ||
                          state?.url ||
                          character.visual?.spriteSheet?.url ||
                          character.visual?.defaultImage;

        console.log(`[CharacterResolver] Direct URL check:`, {
          stateVisualImage: !!state?.visual?.image,
          stateUrl: !!state?.url,
          spriteSheetUrl: !!character.visual?.spriteSheet?.url,
          defaultImage: !!character.visual?.defaultImage,
          directUrl: directUrl?.substring(0, 50),
        });

        if (directUrl && !directUrl.includes('localhost:5173')) {
          console.log(`[CharacterResolver] Resolved ${characterId} via direct URL: ${directUrl.substring(0, 50)}...`);
          return directUrl;
        }

        console.log(`[CharacterResolver] Could not resolve ${characterId}, assetId: ${assetId}`);
        return undefined;
      });
    }

    // Sprite data resolver - provides spritesheet frame dimensions for character sprites
    if ('setSpriteDataResolver' in renderer) {
      renderer.setSpriteDataResolver((characterId: string) => {
        // Find character by id, name, or displayName
        const character = characters.find((c: any) =>
          c.id === characterId ||
          c.name === characterId ||
          c.displayName === characterId ||
          c.name?.toLowerCase() === characterId?.toLowerCase() ||
          c.displayName?.toLowerCase() === characterId?.toLowerCase()
        );

        if (!character || character.visual?.type !== 'sprite' || !character.visual?.spriteSheet) {
          return null;
        }

        const sheet = character.visual.spriteSheet;
        console.log(`[SpriteDataResolver] Returning sprite data for ${characterId}:`, {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
          imageWidth: sheet.imageWidth,
        });

        return {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
          imageWidth: sheet.imageWidth,
          defaultFrame: 0,
          animations: sheet.animations?.map((a: any) => ({
            name: a.name,
            frames: a.frames,
            frameDuration: a.frameDuration,
            loop: a.loop,
          })),
          activeAnimation: undefined,
        };
      });
    }

    // Sound blob resolver - resolves sound asset IDs to blobs
    if ('setSoundBlobResolver' in renderer) {
      renderer.setSoundBlobResolver(async (assetId: string): Promise<Blob | null> => {
        try {
          // First check our asset map
          const url = this.assetMap.get(assetId);
          if (url) {
            const response = await fetch(url);
            return await response.blob();
          }

          // Try loading from ZIP
          const loaded = await this.assetResolver.getAsset(assetId);
          if (loaded) {
            return loaded.blob;
          }

          return null;
        } catch (err) {
          console.warn(`[SoundResolver] Failed to load sound ${assetId}:`, err);
          return null;
        }
      });
    }

    // Character inventory resolver - provides inventory HUD data for characters
    if ('setCharacterInventoryResolver' in renderer) {
      renderer.setCharacterInventoryResolver((characterId: string) => {
        // Find character by id, name, or displayName
        const character = characters.find((c: any) =>
          c.id === characterId ||
          c.name === characterId ||
          c.displayName === characterId ||
          c.name?.toLowerCase() === characterId?.toLowerCase() ||
          c.displayName?.toLowerCase() === characterId?.toLowerCase()
        );

        if (!character || !character.inventoryFrame) {
          console.log(`[InventoryResolver] Character "${characterId}" not found or has no inventoryFrame`);
          return null;
        }

        // Get runtime inventory from context
        const ctx = this.engine?.getContext();
        if (!ctx) {
          console.log(`[InventoryResolver] No context available for inventory lookup`);
          return null;
        }

        const isPlayer = character.role === 'player';
        const runtimeInventory = isPlayer
          ? ctx.getInventoryEntries()
          : (ctx.getState().characterInventories?.[character.name] || []);

        console.log(`[InventoryResolver] Character "${characterId}" (${isPlayer ? 'player' : 'npc'}): ${runtimeInventory.length} items, showOnDemand=${character.inventoryFrame.showOnDemand}`);

        if (runtimeInventory.length === 0) {
          return null;
        }

        // Build item data from runtime inventory
        const itemDefinitions = character.inventory || [];
        const itemData = runtimeInventory.map((entry: { name: string; quantity: number }) => {
          const definition = itemDefinitions.find((def: any) => def.name === entry.name);
          if (definition) {
            // Try to resolve icon from asset map, then prop asset map
            const iconAssetId = definition.icon || definition.iconAssetId;
            const iconUrl = iconAssetId ? this.assetMap.get(iconAssetId) : undefined;
            const propIcon = propAssetMap.get(entry.name) || propAssetMap.get(entry.name.toLowerCase());
            return {
              id: definition.id || entry.name,
              name: definition.name,
              displayName: definition.displayName || definition.name,
              description: definition.description || '',
              icon: iconUrl || propIcon || '',
              quantity: entry.quantity,
              category: definition.category || '',
            };
          }
          // No definition - try prop asset/display name maps
          const propIcon = propAssetMap.get(entry.name) || propAssetMap.get(entry.name.toLowerCase()) || '';
          const propDisplayName = propDisplayNameMap.get(entry.name) || propDisplayNameMap.get(entry.name.toLowerCase());
          return {
            id: entry.name,
            name: entry.name,
            displayName: propDisplayName || entry.name,
            description: '',
            icon: propIcon,
            quantity: entry.quantity,
            category: '',
          };
        });

        return {
          items: itemData,
          config: character.inventoryFrame,
        };
      });

      // Set initial inventory visibility based on player character's showOnDemand setting
      const playerChar = characters.find((c: any) => c.role === 'player' && c.inventoryFrame);
      if (playerChar?.inventoryFrame) {
        const showByDefault = !playerChar.inventoryFrame.showOnDemand;
        if ('setInventoryVisible' in renderer) {
          renderer.setInventoryVisible(showByDefault);
          console.log(`[PlayerEngine] Inventory visibility set to ${showByDefault} (showOnDemand=${playerChar.inventoryFrame.showOnDemand})`);
        }
      }
    }

    // Character meter frame resolver - provides counter HUD data for characters
    if ('setCharacterMeterFrameResolver' in renderer) {
      renderer.setCharacterMeterFrameResolver((characterId: string) => {
        // Find character by id, name, or displayName
        const character = characters.find((c: any) =>
          c.id === characterId ||
          c.name === characterId ||
          c.displayName === characterId ||
          c.name?.toLowerCase() === characterId?.toLowerCase() ||
          c.displayName?.toLowerCase() === characterId?.toLowerCase()
        );

        if (!character || !character.meterFrame) {
          return null;
        }

        // Filter to visible counters
        const visibleCounters = (character.counters || []).filter((c: any) => c.visible);
        if (visibleCounters.length === 0) {
          return null;
        }

        // Get runtime counter values from context
        const ctx = this.engine?.getContext();

        // Build counter data with current values
        const counters = visibleCounters.map((counter: any) => {
          // Get runtime value from context (returns 0 if not set)
          // Fall back to definition value if context not available
          const value = ctx ? ctx.getCounter(counter.name) : (counter.value ?? 0);

          return {
            name: counter.name,
            displayName: counter.displayName,
            value,
            min: counter.min ?? 0,
            max: counter.max ?? 100,
            color: counter.color || '#3B82F6',
            showNumericValue: counter.showNumericValue ?? false,
            numericFormat: counter.numericFormat || 'value',
            orientation: counter.levelMeterOrientation || 'horizontal',
          };
        });

        console.log(`[MeterFrameResolver] Character "${characterId}": ${counters.length} visible counters`);

        return {
          counters,
          config: character.meterFrame,
        };
      });
      console.log('[PlayerEngine] Character meter frame resolver set up');
    }

    // Mood-frame resolver — opt-in 2D mood-pad HUD per character. Reads
    // current mood from the live StoryContext so the dot tracks runtime
    // updates as choices fire affect effects.
    if ('setCharacterMoodFrameResolver' in renderer) {
      (renderer as any).setCharacterMoodFrameResolver((characterId: string) => {
        const character = characters.find((c: any) =>
          c.id === characterId ||
          c.name === characterId ||
          c.displayName === characterId ||
          c.name?.toLowerCase() === characterId?.toLowerCase() ||
          c.displayName?.toLowerCase() === characterId?.toLowerCase()
        );
        if (!character || !character.moodFrame || !character.moodFrame.enabled) {
          return null;
        }
        const ctx = this.engine?.getContext();
        if (!ctx) return null;
        // Hide HUD when character has variants but none has been chosen.
        if (character.variants && character.variants.length > 0) {
          const explicit = (ctx as any).hasExplicitlySetVariant?.(character.id);
          if (!explicit) return null;
        }
        const mood = ctx.getCharacterMood(character.id);
        const palette = (story as any)?.getEmotionPalette?.();
        const merged: any = (ctx as any).getMergedCharacter?.(character.id) || character;
        const portraitAsset = merged.portrait?.assetId
          ? assets.find((a: any) => a.id === merged.portrait.assetId)
          : undefined;
        return {
          valence: mood.valence,
          arousal: mood.arousal,
          config: character.moodFrame,
          palette,
          characterName: merged.displayName || merged.name || character.id,
          characterPortraitUrl: portraitAsset?.url || merged.portrait?.image,
          characterColor: merged.color,
        };
      });
      console.log('[PlayerEngine] Character mood frame resolver set up');
    }
  }

  /**
   * Start playing background music from globalSettings
   */
  private async startBackgroundMusic(): Promise<void> {
    const soundSettings = this.globalSettings?.sound;
    const assetId = soundSettings?.backgroundMusicAssetId;

    if (!assetId) {
      console.log('[PlayerEngine] No background music configured');
      return;
    }

    // Stop any existing background music
    this.stopBackgroundMusic();

    try {
      // Get the audio URL from the asset map
      const url = this.assetMap.get(assetId);
      if (!url) {
        console.warn(`[PlayerEngine] Background music asset not found: ${assetId}`);
        return;
      }

      console.log(`[PlayerEngine] Starting background music: ${assetId}`);

      // Create and configure audio element
      this.backgroundMusicAudio = new Audio(url);
      this.backgroundMusicAudio.loop = true;
      this.backgroundMusicAudio.volume = (soundSettings?.backgroundVolume ?? 50) / 100;

      // Play the audio
      try {
        await this.backgroundMusicAudio.play();
        console.log('[PlayerEngine] Background music started');
      } catch (playErr: any) {
        if (playErr?.name === 'NotAllowedError') {
          // Browser autoplay policy blocked playback — defer until first user interaction
          console.log('[PlayerEngine] Autoplay blocked, deferring background music to first user interaction');
          const audio = this.backgroundMusicAudio;
          const self = this;
          const resumeAudio = () => {
            // Only resume if this audio element is still the active background music
            if (audio && audio === self.backgroundMusicAudio && audio.paused) {
              audio.play().then(() => {
                console.log('[PlayerEngine] Background music started after user interaction');
              }).catch(() => {});
            }
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
            document.removeEventListener('touchstart', resumeAudio);
          };
          document.addEventListener('click', resumeAudio, { once: true });
          document.addEventListener('keydown', resumeAudio, { once: true });
          document.addEventListener('touchstart', resumeAudio, { once: true });
        } else {
          throw playErr;
        }
      }
    } catch (err) {
      console.warn('[PlayerEngine] Failed to start background music:', err);
    }
  }

  /**
   * Stop background music
   */
  private stopBackgroundMusic(): void {
    if (this.backgroundMusicAudio) {
      try {
        this.backgroundMusicAudio.pause();
        this.backgroundMusicAudio.currentTime = 0;
        this.backgroundMusicAudio = null;
        console.log('[PlayerEngine] Background music stopped');
      } catch (err) {
        console.warn('[PlayerEngine] Error stopping background music:', err);
      }
    }
  }

  /**
   * Set muted state for all audio
   */
  setMuted(muted: boolean): void {
    this.currentMuted = muted;

    // Mute/unmute background music
    if (this.backgroundMusicAudio) {
      this.backgroundMusicAudio.muted = muted;
    }

    // Mute/unmute any audio elements in the container (SFX)
    const audioElements = this.config.container.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.muted = muted;
    });

    // Also inform the renderer if it has audio elements
    const renderer = this.config.renderer as any;
    if ('setMuted' in renderer && typeof renderer.setMuted === 'function') {
      renderer.setMuted(muted);
    }

    console.log(`[PlayerEngine] Audio muted: ${muted}`);
  }

  /**
   * Set master volume for all audio (0-100)
   */
  setMasterVolume(volume: number): void {
    this.currentVolume = volume;
    const normalizedVolume = Math.max(0, Math.min(100, volume)) / 100;

    // Set background music volume (master × per-track volume)
    if (this.backgroundMusicAudio) {
      const bgVolume = (this.globalSettings?.sound?.backgroundVolume ?? 50) / 100;
      this.backgroundMusicAudio.volume = normalizedVolume * bgVolume;
    }

    // Set volume for any audio elements in the container
    const audioElements = this.config.container.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.volume = normalizedVolume;
    });

    console.log(`[PlayerEngine] Master volume: ${volume}%`);
  }

  /**
   * Start playing the story
   */
  async start(): Promise<void> {
    if (!this.engine) {
      throw new Error('No story loaded. Call loadStory() first.');
    }

    // Start auto-save if enabled
    if (this.saveSystem) {
      this.saveSystem.startAutoSave(
        () => this.engine!.getSerializedState(),
        async () => this.captureScreenshot()
      );
    }

    // Start background music if configured
    await this.startBackgroundMusic();

    this.emit('storyStarted');
    await this.engine.start();
  }

  /**
   * Resume from a save slot
   */
  async resumeFromSave(slotId: number): Promise<void> {
    console.log(`[PlayerEngine] resumeFromSave called with slotId: ${slotId}`);
    if (!this.saveSystem || !this.engine) {
      throw new Error('No story loaded. Call loadStory() first.');
    }

    const slot = await this.saveSystem.loadFromSlot(slotId);
    console.log(`[PlayerEngine] Loaded slot:`, slot ? { slotId: slot.slotId, beatId: slot.state?.currentBeatId } : null);
    if (!slot) {
      throw new Error(`Save slot ${slotId} not found`);
    }

    console.log(`[PlayerEngine] Calling engine.loadState with autoResume=true`);
    await this.engine.loadState(slot.state, true);
    console.log(`[PlayerEngine] loadState completed`);
    this.emit('loaded', slot);
  }

  /**
   * Resume from auto-save
   */
  async resumeFromAutoSave(): Promise<void> {
    if (!this.saveSystem || !this.engine) {
      throw new Error('No story loaded. Call loadStory() first.');
    }

    const slot = await this.saveSystem.getAutoSave();
    if (!slot) {
      throw new Error('No auto-save found');
    }

    await this.engine.loadState(slot.state, true);
    this.emit('loaded', slot);
  }

  /**
   * Save to a slot
   */
  async saveToSlot(slotId: number): Promise<SaveSlot> {
    if (!this.saveSystem || !this.engine) {
      throw new Error('No story loaded. Call loadStory() first.');
    }

    const state = this.engine.getSerializedState();
    const thumbnail = await this.captureScreenshot();
    const slot = await this.saveSystem.saveToSlot(slotId, state, thumbnail);

    this.emit('saved', slot);
    return slot;
  }

  /**
   * Quick save (saves to slot 0)
   */
  async quickSave(): Promise<SaveSlot> {
    return this.saveToSlot(0);
  }

  /**
   * Quick load (loads from slot 0)
   */
  async quickLoad(): Promise<void> {
    await this.resumeFromSave(0);
  }

  /**
   * Get all save slots
   */
  async getSaveSlots(): Promise<SaveSlot[]> {
    if (!this.saveSystem) {
      return [];
    }
    return this.saveSystem.listSlots();
  }

  /**
   * Delete a save slot
   */
  async deleteSaveSlot(slotId: number): Promise<void> {
    if (this.saveSystem) {
      await this.saveSystem.deleteSlot(slotId);
    }
  }

  /**
   * Pause the story
   */
  pause(): void {
    if (this.engine) {
      this.engine.pause();
      this.saveSystem?.stopAutoSave();
    }
  }

  /**
   * Resume the story
   */
  async resume(): Promise<void> {
    if (this.engine) {
      if (this.saveSystem) {
        this.saveSystem.startAutoSave(
          () => this.engine!.getSerializedState(),
          async () => this.captureScreenshot()
        );
      }
      await this.engine.resume();
    }
  }

  /**
   * Stop the story
   */
  stop(): void {
    if (this.engine) {
      this.engine.stop();
      this.saveSystem?.stopAutoSave();
      this.stopBackgroundMusic();
    }
  }

  /**
   * Restart the story from the beginning
   */
  async restart(): Promise<void> {
    if (this.engine) {
      console.log('[PlayerEngine] Restarting story...');

      // Remember current audio settings
      const wasMuted = this.currentMuted;
      const savedVolume = this.currentVolume;

      // Stop current playback and background music
      this.engine.stop();
      this.stopBackgroundMusic();

      // Reset story state
      this.engine.getContext().reset();

      // Clear the renderer to show a fresh screen
      const renderer = this.config.renderer as any;
      if ('clear' in renderer) {
        renderer.clear();
      }

      // Start fresh
      await this.start();

      // Reapply audio settings after restart
      if (wasMuted) {
        this.setMuted(true);
      }
      if (savedVolume !== 100) {
        this.setMasterVolume(savedVolume);
      }
    }
  }

  /**
   * Capture a screenshot for save thumbnails
   */
  private async captureScreenshot(): Promise<string | undefined> {
    return captureScreenshotUtil(this.config.container, {
      quality: 0.5,
      maxWidth: 160,
      maxHeight: 90,
      format: 'image/jpeg',
    });
  }

  /**
   * Get the current beat ID
   */
  getCurrentBeatId(): string | null {
    return this.engine?.getCurrentBeatId() || null;
  }

  /**
   * Get the story engine
   */
  getEngine(): StoryEngine | null {
    return this.engine;
  }

  /**
   * Get the asset resolver
   */
  getAssetResolver(): AssetResolver {
    return this.assetResolver;
  }

  /**
   * Get the loaded global settings (for HUD overlays, fictional time, etc.)
   */
  getGlobalSettings(): GlobalSettings | null {
    return this.globalSettings;
  }

  /**
   * Get the story title
   */
  getStoryTitle(): string {
    return this.storyTitle;
  }

  /**
   * Get stage dimensions from the loaded story's globalSettings
   * Returns the project's configured width/height, or defaults (1024x768)
   */
  getStageDimensions(): { width: number; height: number } {
    const width = this.globalSettings?.project?.width ?? 1024;
    const height = this.globalSettings?.project?.height ?? 768;
    return { width, height };
  }

  /**
   * Get the save system
   */
  getSaveSystem(): SaveSystem | null {
    return this.saveSystem;
  }

  /**
   * Get play time formatted
   */
  getPlayTime(): string {
    return this.saveSystem?.formatPlayTime() || '0:00';
  }

  /**
   * Check if a story is loaded
   */
  isLoaded(): boolean {
    return this.engine !== null;
  }

  /**
   * Check if the story is running
   */
  isRunning(): boolean {
    return this.engine?.isRunning() || false;
  }

  /**
   * Check if the story is paused
   */
  isPaused(): boolean {
    return this.engine?.isPaused() || false;
  }

  /**
   * Generate a session log as a text string.
   * Contains an overview (beat path, final state, stats) and a detailed timeline.
   */
  generateSessionLog(): string {
    const context = this.engine?.getContext();
    if (!context) return 'No story loaded.';

    const storyObj = context.getStory();
    const timeline = context.getTimeline();
    const variables = context.getVariables();
    const counters = context.getCounters();
    const inventory = context.getInventoryEntries();
    const visitedBeats = context.getVisitedBeats();
    const timers = context.getTimers();
    const fictionalTime = context.getFictionalTime?.();

    const lines: string[] = [];
    const now = new Date().toISOString();
    const fmt = (ts: number) => new Date(ts).toLocaleTimeString();

    lines.push('ASAPS Play Session Log');
    lines.push('======================');
    lines.push(`Story: ${this.storyTitle || 'Untitled'}`);
    lines.push(`Exported: ${now}`);

    // Current beat
    const currentBeatId = context.getCurrentBeatId();
    const currentBeat = currentBeatId ? storyObj?.getBeat(currentBeatId) : null;
    lines.push(`Current Beat: ${currentBeat?.name || 'none'} (${currentBeatId || '-'})`);
    lines.push('');

    // ── OVERVIEW ──
    lines.push('════════════════════════════════════════════');
    lines.push('OVERVIEW');
    lines.push('════════════════════════════════════════════');
    lines.push('');

    const beatEvents = timeline.filter(e => e.type === 'beat-enter');
    const currentInTimeline = currentBeat && beatEvents.some(e => e.beatId === currentBeatId);
    const totalBeats = beatEvents.length + (currentBeat && !currentInTimeline ? 1 : 0);
    lines.push(`Beat Path (${totalBeats} beats)`);
    lines.push('-------------------------------------------');
    beatEvents.forEach((e, i) => {
      lines.push(`  ${i + 1}. [${fmt(e.timestamp)}] [${e.beatType}] ${e.beatName || e.beatId}`);
    });
    if (currentBeat && !currentInTimeline) {
      lines.push(`  ${beatEvents.length + 1}. [${fmt(Date.now())}] [${currentBeat.type}] ${currentBeat.name} (current)`);
    }
    lines.push('');

    // Final state
    const varEntries = Object.entries(variables);
    const counterEntries = Object.entries(counters);
    if (varEntries.length > 0 || counterEntries.length > 0 || inventory.length > 0) {
      lines.push('Final State');
      lines.push('-------------------------------------------');
      varEntries.forEach(([k, v]) => lines.push(`  var  ${k} = ${JSON.stringify(v)}`));
      counterEntries.forEach(([k, v]) => lines.push(`  ctr  ${k} = ${v}`));
      inventory.forEach(item => lines.push(`  inv  ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`));
      const timerEntries = Object.entries(timers);
      timerEntries.forEach(([k, t]) => lines.push(`  tmr  ${k}: ${(t as any).value}s${(t as any).target ? ` -> ${(t as any).target}` : ''}`));
      if (fictionalTime) lines.push(`  time ${JSON.stringify(fictionalTime)}`);
      lines.push('');
    }

    // Stats
    const choiceCount = timeline.filter(e => e.type === 'choice').length;
    const branchCount = timeline.filter(e => e.type === 'branch').length;
    const aiCount = timeline.filter(e => e.type === 'ai-output').length;
    lines.push('Statistics');
    lines.push('-------------------------------------------');
    lines.push(`  Unique beats visited: ${visitedBeats.length}`);
    lines.push(`  Total beat transitions: ${beatEvents.length}`);
    lines.push(`  Choices made: ${choiceCount}`);
    lines.push(`  Branch decisions: ${branchCount}`);
    lines.push(`  AI outputs: ${aiCount}`);
    lines.push('');

    // ── DETAILED TIMELINE ──
    lines.push('════════════════════════════════════════════');
    lines.push('DETAILED TIMELINE');
    lines.push('════════════════════════════════════════════');
    lines.push('');

    let eventNum = 0;
    for (const event of timeline) {
      eventNum++;
      const time = fmt(event.timestamp);

      switch (event.type) {
        case 'beat-enter':
          lines.push(`${eventNum}. [${time}] [${event.beatType}] ${event.beatName || event.beatId} (${event.beatId})`);
          break;

        case 'choice':
          lines.push(`${eventNum}. [${time}] CHOICE at ${event.beatName || event.beatId}`);
          if (event.choiceContext) lines.push(`     Q: ${event.choiceContext}`);
          lines.push(`     -> "${event.choiceText}"`);
          break;

        case 'branch': {
          const target = event.targetBeatName || event.targetBeatId || '?';
          lines.push(`${eventNum}. [${time}] [${event.beatType}] ${event.beatName || event.beatId} branched to ${target}`);
          if (event.reason) lines.push(`     because: ${event.reason}`);
          break;
        }

        case 'ai-output': {
          if (event.text?.startsWith('{"id":')) { eventNum--; break; }
          if (event.beatType === 'aiDialogTree' && event.text && !event.text.startsWith('[Routing Plan]')) { eventNum--; break; }
          const isRoutingPlan = event.text?.startsWith('[Routing Plan]');
          const label = isRoutingPlan ? 'routing plan' : 'generated';
          lines.push(`${eventNum}. [${time}] [${event.beatType}] ${event.beatName || event.beatId} ${label}:`);
          if (event.text) {
            event.text.split('\n').forEach(line => lines.push(`     ${line}`));
          }
          break;
        }

        case 'state-change':
          lines.push(`${eventNum}. [${time}] STATE: ${event.stateChange}`);
          break;
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.stopBackgroundMusic();
    this.saveSystem?.dispose();
    this.assetResolver.dispose();
    this.engine = null;
    this.saveSystem = null;
    this.globalSettings = null;
    this.assetMap.clear();
  }
}
