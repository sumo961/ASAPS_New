/**
 * Built-in Preset Themes
 *
 * Three default themes that cover common interactive fiction styles:
 * 1. Visual Novel (Ren'Py style)
 * 2. Twine/Text Adventure
 * 3. Point-and-Click Adventure
 */

import type { ThemeDefinition } from '../types/theme';

// ============================================================================
// Visual Novel Theme (Ren'Py style)
// ============================================================================

/**
 * Visual Novel theme inspired by Ren'Py and classic VN engines.
 *
 * Characteristics:
 * - Semi-transparent text box at bottom
 * - Character name highlight
 * - Dark overlay for backgrounds
 * - No text animation by default (author can enable typewriter)
 */
export const VISUAL_NOVEL_THEME: ThemeDefinition = {
  meta: {
    id: 'builtin-visual-novel',
    name: 'Visual Novel',
    version: '1.0.0',
    description: 'Classic visual novel style inspired by Ren\'Py',
    author: 'ASAPS',
    tags: ['visual-novel', 'vn', 'renpy', 'dialog'],
    compatibility: {
      asapsVersion: '2.0.0',
    },
  },
  colors: {
    // High contrast: white text on dark backgrounds
    primary: { hex: '#ffffff', alpha: 1 },           // Main text - pure white
    secondary: { hex: '#ffcc66', alpha: 1 },         // Character names - warm gold
    accent: { hex: '#ff99cc', alpha: 1 },            // Highlights - soft pink (typical VN accent)
    background: { hex: '#1a1a2e', alpha: 1 },        // Dark navy background
    surface: { hex: '#0d0d1a', alpha: 0.92 },        // Nearly opaque dark text box
    buttonNormal: { hex: '#3d3d5c', alpha: 1 },      // Muted purple buttons
    buttonHover: { hex: '#5c5c8a', alpha: 1 },       // Lighter on hover
    buttonText: { hex: '#ffffff', alpha: 1 },        // White button text
    border: { hex: '#6666aa', alpha: 0.6 },          // Soft purple border
  },
  fonts: {
    title: {
      family: '"Noto Serif", Georgia, serif',
      size: 42,
      weight: 'bold',
      lineHeight: 1.3,
    },
    body: {
      family: '"Noto Sans", "Segoe UI", sans-serif',
      size: 20,
      weight: 'normal',
      lineHeight: 1.7,
    },
    button: {
      family: '"Noto Sans", "Segoe UI", sans-serif',
      size: 18,
      weight: 600,
    },
    dialog: {
      family: '"Noto Sans", "Segoe UI", sans-serif',
      size: 22,
      weight: 'normal',
      lineHeight: 1.6,
    },
    scale: 1,
  },
  textBox: {
    background: { hex: '#0d0d1a', alpha: 0.92 },     // Dark, nearly opaque for readability
    borderColor: { hex: '#6666aa', alpha: 0.6 },
    borderWidth: 2,
    borderRadius: 0, // VN style: no rounded corners
    padding: 24,
    opacity: 0.92,
    position: 'bottom',
  },
  button: {
    background: { hex: '#3d3d5c', alpha: 1 },
    hoverBackground: { hex: '#5c5c8a', alpha: 1 },
    activeBackground: { hex: '#7a7ab8', alpha: 1 },
    textColor: { hex: '#ffffff', alpha: 1 },
    borderColor: { hex: '#6666aa', alpha: 0.6 },
    borderWidth: 1,
    borderRadius: 4,
    padding: { horizontal: 24, vertical: 12 },
    transitionDuration: 150,
  },
  hotspot: {
    highlightColor: '#ff99cc',
    opacity: 0.25,
    visible: true,
    showLabels: true,
    showInPreview: 'onHover',
  },
  effects: {
    textAnimation: 'none', // No typewriter by default
    typewriterSpeed: 40,
    fadeInDuration: 300,
    sceneTransition: 'fade',
    sceneTransitionDuration: 500,
  },
  components: {
    dialogTree: {
      speakerFont: {
        family: '"Noto Sans", sans-serif',
        size: 18,
        weight: 'bold',
      },
    },
  },
};

// ============================================================================
// Twine/Text Adventure Theme
// ============================================================================

/**
 * Twine/Text Adventure theme inspired by SugarCube and classic IF.
 *
 * Characteristics:
 * - Minimal UI, link-based navigation
 * - Dark background, light text
 * - Hyperlink-style choices
 * - No text box frame
 */
export const TWINE_THEME: ThemeDefinition = {
  meta: {
    id: 'builtin-twine',
    name: 'Text Adventure',
    version: '1.0.0',
    description: 'Minimal text adventure style inspired by Twine/SugarCube',
    author: 'ASAPS',
    tags: ['twine', 'text-adventure', 'if', 'minimal'],
    compatibility: {
      asapsVersion: '2.0.0',
    },
  },
  colors: {
    primary: { hex: '#e0e0e0', alpha: 1 },
    secondary: { hex: '#b0b0b0', alpha: 1 },
    accent: { hex: '#4a9df0', alpha: 1 }, // Blue links like classic IF
    background: { hex: '#1a1a1a', alpha: 1 },
    surface: { hex: '#1a1a1a', alpha: 0 }, // Transparent - no frame
    buttonNormal: { hex: 'transparent', alpha: 0 },
    buttonHover: { hex: '#2a2a2a', alpha: 0.5 },
    buttonText: { hex: '#4a9df0', alpha: 1 }, // Link blue
    border: { hex: 'transparent', alpha: 0 },
  },
  fonts: {
    title: {
      family: '"Courier New", Courier, monospace',
      size: 32,
      weight: 'bold',
      lineHeight: 1.4,
    },
    body: {
      family: '"Courier New", Courier, monospace',
      size: 16,
      weight: 'normal',
      lineHeight: 1.8,
    },
    button: {
      family: '"Courier New", Courier, monospace',
      size: 16,
      weight: 'normal',
    },
    dialog: {
      family: '"Courier New", Courier, monospace',
      size: 16,
      weight: 'normal',
      lineHeight: 1.8,
    },
    scale: 1,
  },
  textBox: {
    background: { hex: '#1a1a1a', alpha: 0 },
    borderColor: { hex: 'transparent', alpha: 0 },
    borderWidth: 0,
    borderRadius: 0,
    padding: 40,
    opacity: 0,
    position: 'center',
  },
  button: {
    background: { hex: 'transparent', alpha: 0 },
    hoverBackground: { hex: '#2a2a2a', alpha: 0.5 },
    textColor: { hex: '#4a9df0', alpha: 1 },
    borderColor: { hex: 'transparent', alpha: 0 },
    borderWidth: 0,
    borderRadius: 0,
    padding: { horizontal: 8, vertical: 4 },
    transitionDuration: 100,
  },
  hotspot: {
    highlightColor: '#4a9df0',
    opacity: 0.2,
    visible: false, // Text-based, no visual hotspots
    showLabels: true,
    showInPreview: 'invisible',
  },
  effects: {
    textAnimation: 'none', // Default to none for faster debugging; author can enable fade
    typewriterSpeed: 50,
    fadeInDuration: 400,
    sceneTransition: 'fade',
    sceneTransitionDuration: 400,
  },
};

// ============================================================================
// Point-and-Click Adventure Theme
// ============================================================================

/**
 * Point-and-Click Adventure theme inspired by LucasArts and Sierra classics.
 *
 * Characteristics:
 * - Classic LucasArts/Sierra aesthetic
 * - Verb bar style interactions
 * - Inventory panel styling
 * - Prominent hotspot indicators
 */
export const POINT_AND_CLICK_THEME: ThemeDefinition = {
  meta: {
    id: 'builtin-point-and-click',
    name: 'Point & Click Adventure',
    version: '1.0.0',
    description: 'Classic point-and-click adventure style inspired by LucasArts/Sierra',
    author: 'ASAPS',
    tags: ['adventure', 'point-and-click', 'lucasarts', 'sierra'],
    compatibility: {
      asapsVersion: '2.0.0',
    },
  },
  colors: {
    // Classic adventure game palette: warm browns, high contrast
    primary: { hex: '#ffffff', alpha: 1 },           // Main text - pure white for readability
    secondary: { hex: '#f5deb3', alpha: 1 },         // Wheat/parchment for secondary text
    accent: { hex: '#ff8c00', alpha: 1 },            // Dark orange for hotspots/highlights
    background: { hex: '#2b1810', alpha: 1 },        // Dark brown (like old adventure games)
    surface: { hex: '#1a0f0a', alpha: 0.95 },        // Nearly black brown for text boxes
    buttonNormal: { hex: '#4a3728', alpha: 1 },      // Medium brown buttons
    buttonHover: { hex: '#6b4f3a', alpha: 1 },       // Lighter brown on hover
    buttonText: { hex: '#ffffff', alpha: 1 },        // White button text
    border: { hex: '#8b7355', alpha: 1 },            // Tan border (like wood frame)
  },
  fonts: {
    title: {
      family: '"Cinzel", "Trajan Pro", Georgia, serif',
      size: 38,
      weight: 'bold',
      lineHeight: 1.3,
    },
    body: {
      family: '"Source Sans Pro", Arial, sans-serif',
      size: 18,
      weight: 'normal',
      lineHeight: 1.6,
    },
    button: {
      family: '"Source Sans Pro", Arial, sans-serif',
      size: 16,
      weight: 'bold',
    },
    dialog: {
      family: '"Source Sans Pro", Arial, sans-serif',
      size: 20,
      weight: 'normal',
      lineHeight: 1.6,
    },
    scale: 1,
  },
  textBox: {
    background: { hex: '#1a0f0a', alpha: 0.95 },     // Dark brown, nearly opaque
    borderColor: { hex: '#8b7355', alpha: 1 },       // Tan wood-like border
    borderWidth: 3,
    borderRadius: 0, // Sharp corners like classic games
    padding: 20,
    opacity: 0.95,
    position: 'bottom',
  },
  button: {
    background: { hex: '#4a3728', alpha: 1 },
    hoverBackground: { hex: '#6b4f3a', alpha: 1 },
    activeBackground: { hex: '#8b6f5a', alpha: 1 },
    textColor: { hex: '#ffffff', alpha: 1 },
    borderColor: { hex: '#8b7355', alpha: 1 },
    borderWidth: 2,
    borderRadius: 0,
    padding: { horizontal: 20, vertical: 10 },
    transitionDuration: 100,
  },
  hotspot: {
    highlightColor: '#ff8c00',
    opacity: 0.4,
    visible: true,
    showLabels: true,
    showInPreview: 'visible', // Always show hotspots like classic adventures
    cursor: 'pointer',
  },
  effects: {
    textAnimation: 'none', // No typewriter by default
    typewriterSpeed: 60,
    fadeInDuration: 200,
    sceneTransition: 'dissolve',
    sceneTransitionDuration: 400,
  },
  components: {
    dialogTree: {
      choiceStyle: {
        background: { hex: '#4a3728', alpha: 1 },
        hoverBackground: { hex: '#6b4f3a', alpha: 1 },
        textColor: { hex: '#ffffff', alpha: 1 },
        borderColor: { hex: '#8b7355', alpha: 1 },
        borderWidth: 1,
        borderRadius: 0,
        padding: { horizontal: 16, vertical: 8 },
      },
    },
  },
};

// ============================================================================
// All Built-in Themes
// ============================================================================


// ============================================================================
// Clean Editorial Theme (12b look preset)
// ============================================================================

/**
 * Clean Editorial — a LIGHT theme, the first among the built-ins.
 *
 * For documentary, museum and explainer stories: the look of a well-set
 * exhibition label or a broadsheet feature. Warm paper ground, near-black ink,
 * serif display over a quiet grotesque body, hairline rules, and one restrained
 * slate-blue accent. Buttons are outlined, not filled — the content is the
 * colour here, not the chrome.
 */
export const EDITORIAL_THEME: ThemeDefinition = {
  meta: {
    id: 'builtin-editorial',
    name: 'Clean Editorial',
    version: '1.0.0',
    description: 'Light, print-inspired look for documentary and museum stories',
    author: 'ASAPS',
    tags: ['light', 'editorial', 'documentary', 'museum'],
    compatibility: { asapsVersion: '2.0.0' },
  },
  colors: {
    primary: { hex: '#1c1a17', alpha: 1 },           // Ink on paper
    secondary: { hex: '#5b708a', alpha: 1 },         // Speaker names — slate
    accent: { hex: '#3d5a80', alpha: 1 },            // Links / highlights — deep slate blue
    background: { hex: '#f7f4ee', alpha: 1 },        // Warm paper, not pure white
    surface: { hex: '#fffdf9', alpha: 1 },           // Text box barely lifts off the page
    buttonNormal: { hex: '#fffdf9', alpha: 1 },      // Outlined, not filled
    buttonHover: { hex: '#e9e4da', alpha: 1 },
    buttonText: { hex: '#1c1a17', alpha: 1 },
    border: { hex: '#c9c2b4', alpha: 1 },            // Hairline warm grey
  },
  fonts: {
    title: { family: 'Georgia, "Times New Roman", serif', size: 44, weight: 'bold', lineHeight: 1.25 },
    body: { family: '-apple-system, "Segoe UI", "Helvetica Neue", sans-serif', size: 19, weight: 'normal', lineHeight: 1.75 },
    button: { family: '-apple-system, "Segoe UI", "Helvetica Neue", sans-serif', size: 17, weight: 600 },
    dialog: { family: 'Georgia, "Times New Roman", serif', size: 21, weight: 'normal', lineHeight: 1.7 },
    scale: 1,
  },
  textBox: {
    background: { hex: '#fffdf9', alpha: 1 },
    borderColor: { hex: '#c9c2b4', alpha: 1 },
    borderWidth: 1,
    borderRadius: 3,
    padding: 28,
    opacity: 1,
    position: 'center',
  },
  button: {
    background: { hex: '#fffdf9', alpha: 1 },
    hoverBackground: { hex: '#e9e4da', alpha: 1 },
    activeBackground: { hex: '#d9d2c2', alpha: 1 },
    textColor: { hex: '#1c1a17', alpha: 1 },
    borderColor: { hex: '#1c1a17', alpha: 1 },
    borderWidth: 1,
    borderRadius: 3,
    padding: { horizontal: 26, vertical: 11 },
    transitionDuration: 120,
  },
  hotspot: {
    highlightColor: '#3d5a80',
    opacity: 0.18,
    visible: true,
    showLabels: true,
    showInPreview: 'onHover',
  },
  effects: {
    textAnimation: 'none',
    typewriterSpeed: 40,
    fadeInDuration: 250,
    sceneTransition: 'fade',
    sceneTransitionDuration: 400,
  },
};

// ============================================================================
// Dark Cinematic Theme (12b look preset)
// ============================================================================

/**
 * Dark Cinematic — near-black ground, tungsten accent.
 *
 * For thrillers, chat fiction and anything that plays at night: the palette of
 * a colour-graded frame rather than a website. Text is cool and slightly
 * desaturated so the single warm tungsten accent reads as light, not decor.
 * Corners are sharp; the typewriter is on, slow enough to feel deliberate.
 */
export const CINEMATIC_THEME: ThemeDefinition = {
  meta: {
    id: 'builtin-cinematic',
    name: 'Dark Cinematic',
    version: '1.0.0',
    description: 'Near-black, colour-graded look with a tungsten accent',
    author: 'ASAPS',
    tags: ['dark', 'cinematic', 'thriller', 'chat-fiction'],
    compatibility: { asapsVersion: '2.0.0' },
  },
  colors: {
    primary: { hex: '#d7dbe0', alpha: 1 },           // Cool off-white
    secondary: { hex: '#8892a0', alpha: 1 },         // Speaker names — steel
    accent: { hex: '#d98e32', alpha: 1 },            // Tungsten
    background: { hex: '#0b0d10', alpha: 1 },        // Near-black, blue-leaning
    surface: { hex: '#14171c', alpha: 0.96 },
    buttonNormal: { hex: '#1c2026', alpha: 1 },
    buttonHover: { hex: '#2a2f37', alpha: 1 },
    buttonText: { hex: '#d7dbe0', alpha: 1 },
    border: { hex: '#2e333b', alpha: 1 },
  },
  fonts: {
    title: { family: '"Helvetica Neue", "Segoe UI", Arial, sans-serif', size: 46, weight: 700, lineHeight: 1.15 },
    body: { family: '"Helvetica Neue", "Segoe UI", Arial, sans-serif', size: 19, weight: 'normal', lineHeight: 1.65 },
    button: { family: '"Helvetica Neue", "Segoe UI", Arial, sans-serif', size: 16, weight: 600 },
    dialog: { family: '"Helvetica Neue", "Segoe UI", Arial, sans-serif', size: 20, weight: 'normal', lineHeight: 1.6 },
    scale: 1,
  },
  textBox: {
    background: { hex: '#14171c', alpha: 0.96 },
    borderColor: { hex: '#2e333b', alpha: 1 },
    borderWidth: 1,
    borderRadius: 2,
    padding: 24,
    opacity: 0.96,
    position: 'bottom',
  },
  button: {
    background: { hex: '#1c2026', alpha: 1 },
    hoverBackground: { hex: '#2a2f37', alpha: 1 },
    activeBackground: { hex: '#d98e32', alpha: 1 },
    textColor: { hex: '#d7dbe0', alpha: 1 },
    borderColor: { hex: '#2e333b', alpha: 1 },
    borderWidth: 1,
    borderRadius: 2,
    padding: { horizontal: 24, vertical: 12 },
    transitionDuration: 150,
  },
  hotspot: {
    highlightColor: '#d98e32',
    opacity: 0.22,
    visible: true,
    showLabels: false,                                // Cinematic: discover, don't label
    showInPreview: 'onHover',
  },
  effects: {
    textAnimation: 'typewriter',
    typewriterSpeed: 30,
    fadeInDuration: 400,
    sceneTransition: 'fade',
    sceneTransitionDuration: 700,
  },
};

// ============================================================================
// Playful Theme (12b look preset)
// ============================================================================

/**
 * Playful — sticker-bright on white.
 *
 * For GPS walks, family and classroom stories: big rounded buttons, thick ink
 * outlines, coral and teal doing the shouting on a calm white ground. The ink
 * outline is what keeps it from mush — every element is drawn, not floated.
 */
export const PLAYFUL_THEME: ThemeDefinition = {
  meta: {
    id: 'builtin-playful',
    name: 'Playful',
    version: '1.0.0',
    description: 'Bright, rounded, sticker-like look for walks and family stories',
    author: 'ASAPS',
    tags: ['light', 'playful', 'family', 'gps-walk'],
    compatibility: { asapsVersion: '2.0.0' },
  },
  colors: {
    primary: { hex: '#073b4c', alpha: 1 },           // Deep ink-teal text
    secondary: { hex: '#118ab2', alpha: 1 },         // Speaker names — bright blue
    accent: { hex: '#06d6a0', alpha: 1 },            // Mint highlight
    background: { hex: '#ffffff', alpha: 1 },
    surface: { hex: '#f2fbfa', alpha: 1 },           // Whisper of mint under text
    buttonNormal: { hex: '#ff6b6b', alpha: 1 },      // Coral
    buttonHover: { hex: '#ff8787', alpha: 1 },
    buttonText: { hex: '#ffffff', alpha: 1 },
    border: { hex: '#073b4c', alpha: 1 },            // Ink outline everywhere
  },
  fonts: {
    title: { family: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', size: 42, weight: 'bold', lineHeight: 1.2 },
    body: { family: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', size: 20, weight: 'normal', lineHeight: 1.65 },
    button: { family: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', size: 19, weight: 'bold' },
    dialog: { family: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', size: 21, weight: 'normal', lineHeight: 1.6 },
    scale: 1,
  },
  textBox: {
    background: { hex: '#f2fbfa', alpha: 1 },
    borderColor: { hex: '#073b4c', alpha: 1 },
    borderWidth: 2,
    borderRadius: 18,
    padding: 26,
    opacity: 1,
    position: 'center',
  },
  button: {
    background: { hex: '#ff6b6b', alpha: 1 },
    hoverBackground: { hex: '#ff8787', alpha: 1 },
    activeBackground: { hex: '#f0525b', alpha: 1 },
    textColor: { hex: '#ffffff', alpha: 1 },
    borderColor: { hex: '#073b4c', alpha: 1 },
    borderWidth: 2,
    borderRadius: 18,
    padding: { horizontal: 28, vertical: 14 },
    transitionDuration: 120,
  },
  hotspot: {
    highlightColor: '#06d6a0',
    opacity: 0.3,
    visible: true,
    showLabels: true,
    showInPreview: 'visible',                         // A walk should show where to look
  },
  effects: {
    textAnimation: 'none',
    typewriterSpeed: 40,
    fadeInDuration: 200,
    sceneTransition: 'slide',
    sceneTransitionDuration: 350,
  },
};

// ============================================================================
// High-Contrast Accessible Theme (12b look preset)
// ============================================================================

/**
 * High Contrast — black, white and warning-yellow, nothing translucent.
 *
 * Built to WCAG contrast rather than to taste: pure white on pure black
 * (21:1), yellow reserved for the interactive, every alpha 1, type a step
 * larger with generous leading, no text animation, focus-friendly thick
 * borders. Deliberately committed to one look — this theme does not do mood.
 */
export const HIGH_CONTRAST_THEME: ThemeDefinition = {
  meta: {
    id: 'builtin-high-contrast',
    name: 'High Contrast',
    version: '1.0.0',
    description: 'WCAG-first black/white/yellow look, larger type, no motion',
    author: 'ASAPS',
    tags: ['accessible', 'high-contrast', 'large-type'],
    compatibility: { asapsVersion: '2.0.0' },
  },
  colors: {
    primary: { hex: '#ffffff', alpha: 1 },
    secondary: { hex: '#ffd700', alpha: 1 },          // Speaker names — the one colour
    accent: { hex: '#ffd700', alpha: 1 },             // Interactive = yellow, always
    background: { hex: '#000000', alpha: 1 },
    surface: { hex: '#000000', alpha: 1 },
    buttonNormal: { hex: '#000000', alpha: 1 },
    buttonHover: { hex: '#ffd700', alpha: 1 },
    buttonText: { hex: '#ffffff', alpha: 1 },
    border: { hex: '#ffffff', alpha: 1 },
  },
  fonts: {
    title: { family: '-apple-system, "Segoe UI", Arial, sans-serif', size: 46, weight: 'bold', lineHeight: 1.3 },
    body: { family: '-apple-system, "Segoe UI", Arial, sans-serif', size: 22, weight: 'normal', lineHeight: 1.8 },
    button: { family: '-apple-system, "Segoe UI", Arial, sans-serif', size: 20, weight: 'bold' },
    dialog: { family: '-apple-system, "Segoe UI", Arial, sans-serif', size: 23, weight: 'normal', lineHeight: 1.75 },
    scale: 1,
  },
  textBox: {
    background: { hex: '#000000', alpha: 1 },
    borderColor: { hex: '#ffffff', alpha: 1 },
    borderWidth: 3,
    borderRadius: 4,
    padding: 28,
    opacity: 1,
    position: 'center',
  },
  button: {
    background: { hex: '#000000', alpha: 1 },
    hoverBackground: { hex: '#ffd700', alpha: 1 },    // Hover inverts: black-on-yellow
    activeBackground: { hex: '#ffd700', alpha: 1 },
    textColor: { hex: '#ffffff', alpha: 1 },
    borderColor: { hex: '#ffffff', alpha: 1 },
    borderWidth: 3,
    borderRadius: 4,
    padding: { horizontal: 30, vertical: 16 },
    transitionDuration: 0,                            // No motion
  },
  hotspot: {
    highlightColor: '#ffd700',
    opacity: 0.4,
    visible: true,
    showLabels: true,
    showInPreview: 'visible',
  },
  effects: {
    textAnimation: 'none',
    typewriterSpeed: 40,
    fadeInDuration: 0,
    sceneTransition: 'none',
    sceneTransitionDuration: 0,
  },
};

/**
 * Array of all built-in preset themes
 */
export const BUILT_IN_THEMES: ThemeDefinition[] = [
  VISUAL_NOVEL_THEME,
  TWINE_THEME,
  POINT_AND_CLICK_THEME,
  // 12b look presets — each pairs with a starter template of the same mood.
  EDITORIAL_THEME,
  CINEMATIC_THEME,
  PLAYFUL_THEME,
  HIGH_CONTRAST_THEME,
];

/**
 * Get a built-in theme by ID
 */
export function getBuiltInTheme(id: string): ThemeDefinition | undefined {
  return BUILT_IN_THEMES.find(theme => theme.meta.id === id);
}

/**
 * Get all built-in theme IDs
 */
export function getBuiltInThemeIds(): string[] {
  return BUILT_IN_THEMES.map(theme => theme.meta.id);
}

/**
 * Check if a theme ID is a built-in theme
 */
export function isBuiltInTheme(id: string): boolean {
  return getBuiltInThemeIds().includes(id);
}
