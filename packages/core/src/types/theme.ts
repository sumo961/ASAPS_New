/**
 * Theme System Types
 *
 * Defines the complete theme data model for ASAPS Modern, supporting:
 * - Transferable themes between projects
 * - Theme inheritance (extends)
 * - Optional asset bundling (fonts, UI graphics, default backgrounds)
 * - Built-in presets (Visual Novel, Twine, Point-and-Click)
 */

// ============================================================================
// Theme Definition (Main Interface)
// ============================================================================

/**
 * Complete theme definition including all styling options and optional assets.
 * This is the canonical format stored in IndexedDB and exported as .asaps-theme.
 */
export interface ThemeDefinition {
  /** Theme metadata (id, name, version, inheritance) */
  meta: ThemeMeta;

  /** Color palette for UI elements */
  colors: ThemeColors;

  /** Typography settings */
  fonts: ThemeFonts;

  /** Text box styling */
  textBox: ThemeTextBox;

  /** Button styling */
  button: ThemeButton;

  /** Hotspot styling */
  hotspot: ThemeHotspot;

  /** Text animation and transition effects */
  effects: ThemeEffects;

  /** Beat-type-specific overrides (optional) */
  components?: ThemeComponentOverrides;

  /** Optional bundled assets (fonts, UI graphics, defaults) */
  assets?: ThemeAssets;
}

// ============================================================================
// Theme Metadata
// ============================================================================

/**
 * Theme metadata including version, inheritance, and compatibility info.
 */
export interface ThemeMeta {
  /** Unique theme identifier (UUID) */
  id: string;

  /** Display name for the theme */
  name: string;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Optional parent theme ID for inheritance */
  extends?: string;

  /** Optional description */
  description?: string;

  /** Optional author name */
  author?: string;

  /** Tags for categorization and search */
  tags?: string[];

  /** Compatibility information */
  compatibility: ThemeCompatibility;

  /** When the theme was created */
  createdAt?: string;

  /** When the theme was last modified */
  modifiedAt?: string;
}

/**
 * Compatibility information for theme portability.
 */
export interface ThemeCompatibility {
  /** Minimum ASAPS version required */
  asapsVersion: string;

  /** Target engine platforms (for future export) */
  engineTargets?: ('web' | 'unity' | 'unreal' | 'godot')[];
}

// ============================================================================
// Color System
// ============================================================================

/**
 * Color value with optional alpha channel.
 */
export interface ThemeColor {
  /** Hex color code (e.g., "#FF5733") */
  hex: string;

  /** Alpha transparency 0-1 (optional, defaults to 1) */
  alpha?: number;
}

/**
 * Complete color palette for the theme.
 */
export interface ThemeColors {
  /** Primary text color (player/main) */
  primary: ThemeColor;

  /** Secondary text color (non-player/NPC) */
  secondary: ThemeColor;

  /** Accent color for highlights and links */
  accent: ThemeColor;

  /** Page/scene background color */
  background: ThemeColor;

  /** Surface color (text boxes, panels) */
  surface: ThemeColor;

  /** Button normal state */
  buttonNormal: ThemeColor;

  /** Button hover state */
  buttonHover: ThemeColor;

  /** Button text color */
  buttonText: ThemeColor;

  /** Border color for UI elements */
  border: ThemeColor;

  /** Optional additional custom colors */
  custom?: Record<string, ThemeColor>;
}

// ============================================================================
// Typography
// ============================================================================

/**
 * Font specification for a text role.
 */
export interface ThemeFont {
  /** Font family name (e.g., "Noto Sans", "serif") */
  family: string;

  /** Font size in pixels */
  size: number;

  /** Font weight (100-900 or "normal", "bold") */
  weight?: number | 'normal' | 'bold';

  /** Line height multiplier (e.g., 1.5) */
  lineHeight?: number;

  /** Letter spacing in pixels */
  letterSpacing?: number;
}

/**
 * Typography settings for different text roles.
 */
export interface ThemeFonts {
  /** Title/heading font */
  title: ThemeFont;

  /** Body/narrative text font */
  body: ThemeFont;

  /** Button text font */
  button: ThemeFont;

  /** Dialog/speech text font */
  dialog: ThemeFont;

  /** Global font scale multiplier (1 = 100%) */
  scale?: number;
}

// ============================================================================
// Text Box
// ============================================================================

/**
 * Text box (dialog box) styling.
 */
export interface ThemeTextBox {
  /** Background color (can override surface) */
  background?: ThemeColor;

  /** Border color */
  borderColor?: ThemeColor;

  /** Border width in pixels */
  borderWidth: number;

  /** Corner radius in pixels */
  borderRadius: number;

  /** Internal padding in pixels */
  padding: number;

  /** Background opacity 0-1 */
  opacity: number;

  /** Text box position */
  position: 'bottom' | 'top' | 'center' | 'custom';

  /** Custom position (when position is 'custom') */
  customPosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Optional frame image asset reference */
  frameAssetId?: string;
}

// ============================================================================
// Button Styling
// ============================================================================

/**
 * Button styling including states.
 */
export interface ThemeButton {
  /** Normal state background */
  background: ThemeColor;

  /** Hover state background */
  hoverBackground: ThemeColor;

  /** Active/pressed state background */
  activeBackground?: ThemeColor;

  /** Disabled state background */
  disabledBackground?: ThemeColor;

  /** Text color */
  textColor: ThemeColor;

  /** Border color */
  borderColor: ThemeColor;

  /** Border width in pixels */
  borderWidth: number;

  /** Corner radius in pixels */
  borderRadius: number;

  /** Internal padding */
  padding: {
    horizontal: number;
    vertical: number;
  };

  /** Transition duration in milliseconds */
  transitionDuration?: number;
}

// ============================================================================
// Hotspot Styling
// ============================================================================

/**
 * Hotspot (interactive area) styling.
 */
export interface ThemeHotspot {
  /** Highlight color when visible */
  highlightColor: string;

  /** Opacity 0-1 */
  opacity: number;

  /** Whether to show hotspots */
  visible: boolean;

  /** Whether to show labels/tooltips */
  showLabels: boolean;

  /** Preview mode visibility behavior */
  showInPreview: 'visible' | 'onHover' | 'invisible';

  /** Cursor style on hover */
  cursor?: string;
}

// ============================================================================
// Effects
// ============================================================================

/**
 * Text and transition effects.
 */
export interface ThemeEffects {
  /** Text animation type */
  textAnimation: 'none' | 'typewriter' | 'fade';

  /** Typewriter speed (characters per second) */
  typewriterSpeed: number;

  /** Fade in duration in milliseconds */
  fadeInDuration: number;

  /** Scene transition type */
  sceneTransition?: 'none' | 'fade' | 'slide' | 'dissolve';

  /** Scene transition duration in milliseconds */
  sceneTransitionDuration?: number;
}

// ============================================================================
// Component Overrides
// ============================================================================

/**
 * Beat-type-specific style overrides.
 */
export interface ThemeComponentOverrides {
  /** Title screen overrides */
  titleScreen?: Partial<{
    titleFont: ThemeFont;
    subtitleFont: ThemeFont;
    buttonStyle: Partial<ThemeButton>;
  }>;

  /** Dialog tree overrides */
  dialogTree?: Partial<{
    speakerFont: ThemeFont;
    choiceStyle: Partial<ThemeButton>;
  }>;

  /** End screen overrides */
  endScreen?: Partial<{
    messageFont: ThemeFont;
  }>;

  /** Custom component overrides by beat type */
  custom?: Record<string, Record<string, unknown>>;
}

// ============================================================================
// Theme Assets
// ============================================================================

/**
 * Reference to a bundled theme asset.
 */
export interface ThemeAssetRef {
  /** Asset UUID in theme-assets store */
  id: string;

  /** Asset role identifier (e.g., 'title-font', 'textbox-frame') */
  role: ThemeAssetRole;

  /** Original filename */
  filename: string;

  /** MIME type */
  mimeType: string;

  /** Optional CSS font-family name (for fonts) */
  fontFamily?: string;

  /** Optional font weight (for fonts) */
  fontWeight?: number | 'normal' | 'bold';
}

/**
 * Predefined asset roles for theme assets.
 */
export type ThemeAssetRole =
  // Fonts
  | 'title-font'
  | 'body-font'
  | 'button-font'
  | 'dialog-font'
  // UI Graphics
  | 'textbox-frame'
  | 'button-normal'
  | 'button-hover'
  | 'button-active'
  // Sounds
  | 'click-sound'
  | 'hover-sound'
  | 'transition-sound'
  // Default Content
  | 'default-background'
  | 'placeholder-character'
  | 'placeholder-prop'
  // Custom
  | string;

/**
 * Optional bundled assets for a theme.
 */
export interface ThemeAssets {
  // UI Elements
  /** Custom font files */
  fonts?: ThemeAssetRef[];

  /** UI graphics (frames, sprites) */
  uiGraphics?: ThemeAssetRef[];

  /** UI sounds (clicks, transitions) */
  uiSounds?: ThemeAssetRef[];

  // Default Content (fallbacks for projects)
  /** Default scene backgrounds */
  defaultBackgrounds?: ThemeAssetRef[];

  /** Placeholder graphics (character silhouettes, etc.) */
  placeholders?: ThemeAssetRef[];
}

// ============================================================================
// Stored Theme (for IndexedDB)
// ============================================================================

/**
 * Theme as stored in IndexedDB including source tracking.
 */
export interface StoredTheme {
  /** Theme definition */
  definition: ThemeDefinition;

  /** Asset IDs belonging to this theme */
  assetIds: string[];

  /** Theme source */
  source: 'built-in' | 'imported' | 'custom';

  /** Whether the theme is read-only (built-in themes) */
  readOnly?: boolean;

  /** Last time the theme was used */
  lastUsedAt?: string;

  /** Preview image data URL */
  previewImage?: string;
}

// ============================================================================
// Theme Asset (for IndexedDB)
// ============================================================================

/**
 * Theme asset stored in theme-assets object store.
 */
export interface StoredThemeAsset {
  /** Unique asset identifier */
  id: string;

  /** Theme this asset belongs to */
  themeId: string;

  /** Asset type */
  type: 'font' | 'image' | 'audio' | 'other';

  /** Asset role */
  role: ThemeAssetRole;

  /** Original filename */
  filename: string;

  /** MIME type */
  mimeType: string;

  /** File size in bytes */
  size: number;

  /** Binary data (for IndexedDB storage) */
  blob: Blob;

  /** Upload timestamp */
  uploadedAt: string;
}

// ============================================================================
// Default Theme Values
// ============================================================================

/**
 * Default theme values used when properties are not specified.
 */
export const DEFAULT_THEME_VALUES: Partial<ThemeDefinition> = {
  colors: {
    primary: { hex: '#ffffff', alpha: 1 },
    secondary: { hex: '#cccccc', alpha: 1 },
    accent: { hex: '#4a90d9', alpha: 1 },
    background: { hex: '#1a1a2e', alpha: 1 },
    surface: { hex: '#16213e', alpha: 0.9 },
    buttonNormal: { hex: '#0f3460', alpha: 1 },
    buttonHover: { hex: '#1a4a7a', alpha: 1 },
    buttonText: { hex: '#ffffff', alpha: 1 },
    border: { hex: '#4a90d9', alpha: 0.5 },
  },
  fonts: {
    title: { family: 'serif', size: 48, weight: 'bold' },
    body: { family: 'sans-serif', size: 18, lineHeight: 1.6 },
    button: { family: 'sans-serif', size: 16, weight: 'bold' },
    dialog: { family: 'sans-serif', size: 20, lineHeight: 1.5 },
    scale: 1,
  },
  textBox: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 20,
    opacity: 0.9,
    position: 'bottom',
  },
  button: {
    background: { hex: '#0f3460', alpha: 1 },
    hoverBackground: { hex: '#1a4a7a', alpha: 1 },
    textColor: { hex: '#ffffff', alpha: 1 },
    borderColor: { hex: '#4a90d9', alpha: 0.5 },
    borderWidth: 1,
    borderRadius: 4,
    padding: { horizontal: 24, vertical: 12 },
    transitionDuration: 200,
  },
  hotspot: {
    highlightColor: '#ffff00',
    opacity: 0.3,
    visible: true,
    showLabels: true,
    showInPreview: 'visible',
  },
  effects: {
    textAnimation: 'none',
    typewriterSpeed: 50,
    fadeInDuration: 500,
  },
};
