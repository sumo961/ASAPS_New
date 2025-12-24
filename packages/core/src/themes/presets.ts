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
 * - Typewriter text animation
 * - Dark overlay for backgrounds
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
    primary: { hex: '#ffffff', alpha: 1 },
    secondary: { hex: '#f0c674', alpha: 1 }, // Golden for character names
    accent: { hex: '#81a2be', alpha: 1 }, // Soft blue for highlights
    background: { hex: '#1d1f21', alpha: 1 }, // Dark background
    surface: { hex: '#282a2e', alpha: 0.85 }, // Semi-transparent dark
    buttonNormal: { hex: '#373b41', alpha: 1 },
    buttonHover: { hex: '#4a4e54', alpha: 1 },
    buttonText: { hex: '#ffffff', alpha: 1 },
    border: { hex: '#5f819d', alpha: 0.5 },
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
    background: { hex: '#282a2e', alpha: 0.85 },
    borderColor: { hex: '#5f819d', alpha: 0.3 },
    borderWidth: 1,
    borderRadius: 0, // VN style: no rounded corners
    padding: 24,
    opacity: 0.85,
    position: 'bottom',
  },
  button: {
    background: { hex: '#373b41', alpha: 1 },
    hoverBackground: { hex: '#4a4e54', alpha: 1 },
    activeBackground: { hex: '#5c6166', alpha: 1 },
    textColor: { hex: '#ffffff', alpha: 1 },
    borderColor: { hex: '#5f819d', alpha: 0.3 },
    borderWidth: 1,
    borderRadius: 4,
    padding: { horizontal: 24, vertical: 12 },
    transitionDuration: 150,
  },
  hotspot: {
    highlightColor: '#81a2be',
    opacity: 0.25,
    visible: true,
    showLabels: true,
    showInPreview: 'onHover',
  },
  effects: {
    textAnimation: 'typewriter',
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
      family: 'Georgia, "Times New Roman", serif',
      size: 36,
      weight: 'normal',
      lineHeight: 1.4,
    },
    body: {
      family: 'Georgia, "Times New Roman", serif',
      size: 18,
      weight: 'normal',
      lineHeight: 1.8,
    },
    button: {
      family: 'Georgia, "Times New Roman", serif',
      size: 18,
      weight: 'normal',
    },
    dialog: {
      family: 'Georgia, "Times New Roman", serif',
      size: 18,
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
    textAnimation: 'fade',
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
    description: 'Classic point-and-click adventure style',
    author: 'ASAPS',
    tags: ['adventure', 'point-and-click', 'lucasarts', 'sierra'],
    compatibility: {
      asapsVersion: '2.0.0',
    },
  },
  colors: {
    primary: { hex: '#ffd700', alpha: 1 }, // Golden text like classic adventures
    secondary: { hex: '#ffffff', alpha: 1 },
    accent: { hex: '#ff6b35', alpha: 1 }, // Orange for hotspots
    background: { hex: '#0a0a12', alpha: 1 }, // Deep blue-black
    surface: { hex: '#1a1a2e', alpha: 0.95 }, // Dark blue surface
    buttonNormal: { hex: '#2a2a4e', alpha: 1 },
    buttonHover: { hex: '#3a3a6e', alpha: 1 },
    buttonText: { hex: '#ffd700', alpha: 1 },
    border: { hex: '#5a5a8e', alpha: 1 },
  },
  fonts: {
    title: {
      family: '"Cinzel", "Trajan Pro", serif',
      size: 38,
      weight: 'bold',
      lineHeight: 1.3,
    },
    body: {
      family: '"Source Sans Pro", Arial, sans-serif',
      size: 16,
      weight: 'normal',
      lineHeight: 1.5,
    },
    button: {
      family: '"Source Sans Pro", Arial, sans-serif',
      size: 14,
      weight: 'bold',
    },
    dialog: {
      family: '"Source Sans Pro", Arial, sans-serif',
      size: 18,
      weight: 'normal',
      lineHeight: 1.5,
    },
    scale: 1,
  },
  textBox: {
    background: { hex: '#1a1a2e', alpha: 0.95 },
    borderColor: { hex: '#5a5a8e', alpha: 1 },
    borderWidth: 2,
    borderRadius: 0, // Sharp corners like classic games
    padding: 16,
    opacity: 0.95,
    position: 'bottom',
  },
  button: {
    background: { hex: '#2a2a4e', alpha: 1 },
    hoverBackground: { hex: '#3a3a6e', alpha: 1 },
    activeBackground: { hex: '#4a4a8e', alpha: 1 },
    textColor: { hex: '#ffd700', alpha: 1 },
    borderColor: { hex: '#5a5a8e', alpha: 1 },
    borderWidth: 2,
    borderRadius: 0,
    padding: { horizontal: 16, vertical: 8 },
    transitionDuration: 100,
  },
  hotspot: {
    highlightColor: '#ff6b35',
    opacity: 0.4,
    visible: true,
    showLabels: true,
    showInPreview: 'visible', // Always show hotspots like classic adventures
    cursor: 'pointer',
  },
  effects: {
    textAnimation: 'typewriter',
    typewriterSpeed: 60, // Faster for action games
    fadeInDuration: 200,
    sceneTransition: 'dissolve',
    sceneTransitionDuration: 400,
  },
  components: {
    dialogTree: {
      choiceStyle: {
        background: { hex: '#2a2a4e', alpha: 1 },
        hoverBackground: { hex: '#3a3a6e', alpha: 1 },
        textColor: { hex: '#ffffff', alpha: 1 },
        borderColor: { hex: '#5a5a8e', alpha: 1 },
        borderWidth: 1,
        borderRadius: 0,
        padding: { horizontal: 12, vertical: 6 },
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
