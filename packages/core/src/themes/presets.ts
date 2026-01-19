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

/**
 * Array of all built-in preset themes
 */
export const BUILT_IN_THEMES: ThemeDefinition[] = [
  VISUAL_NOVEL_THEME,
  TWINE_THEME,
  POINT_AND_CLICK_THEME,
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
