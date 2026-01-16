/**
 * Ren'Py GUI Parser
 *
 * Parses gui.rpy files to extract theme variables for conversion to ASAPS ThemeDefinition.
 * Handles Python-style variable assignments and Borders() function calls.
 */

/**
 * Parsed Ren'Py GUI data extracted from gui.rpy
 */
export interface RenpyGuiData {
  /** Color definitions */
  colors: {
    accent?: string;
    text?: string;
    idle?: string;
    hover?: string;
    selected?: string;
    insensitive?: string;
    mutedColor?: string;
    hoverMutedColor?: string;
  };

  /** Font settings */
  fonts: {
    textFont?: string;
    interfaceFont?: string;
    systemFont?: string;
    textSize?: number;
    nameTextSize?: number;
    interfaceTextSize?: number;
    labelTextSize?: number;
    notifyTextSize?: number;
    /** Title text size (main menu title) */
    titleTextSize?: number;
  };

  /** Title screen settings */
  title: {
    /** Title text size */
    textSize?: number;
    /** Title text color (from style) */
    textColor?: string;
  };

  /** Text box (dialogue box) settings */
  textbox: {
    height?: number;
    yalign?: number;
    dialogueXpos?: number;
    dialogueYpos?: number;
    dialogueWidth?: number;
    dialogueTextXalign?: number;
  };

  /** Name box settings */
  namebox: {
    xpos?: number;
    ypos?: number;
    width?: number;
    height?: number;
    borders?: [number, number, number, number];
    tile?: boolean;
  };

  /** Button settings */
  button: {
    width?: number;
    height?: number;
    borders?: [number, number, number, number];
    tile?: boolean;
    textFont?: string;
    textSize?: number;
    textIdleColor?: string;
    textHoverColor?: string;
    textSelectedColor?: string;
    textInsensitiveColor?: string;
  };

  /** Choice button settings */
  choice: {
    buttonWidth?: number;
    buttonHeight?: number;
    buttonBorders?: [number, number, number, number];
    buttonTile?: boolean;
    buttonTextFont?: string;
    buttonTextSize?: number;
    buttonTextIdleColor?: string;
    buttonTextHoverColor?: string;
    /** Y position of choice buttons on screen */
    ypos?: number;
    /** Spacing between choice buttons */
    spacing?: number;
  };

  /** Navigation button settings */
  navigation: {
    xpos?: number;
    yalign?: number;
    spacing?: number;
  };

  /** Slot (save/load) button settings */
  slot: {
    buttonWidth?: number;
    buttonHeight?: number;
    buttonBorders?: [number, number, number, number];
    cols?: number;
    rows?: number;
  };

  /** Game window settings */
  window: {
    width?: number;
    height?: number;
  };

  /** Raw variables for any not explicitly parsed */
  raw: Record<string, string | number | boolean | null>;
}

/**
 * Create empty RenpyGuiData structure
 */
function createEmptyGuiData(): RenpyGuiData {
  return {
    colors: {},
    fonts: {},
    title: {},
    textbox: {},
    namebox: {},
    button: {},
    choice: {},
    navigation: {},
    slot: {},
    window: {},
    raw: {},
  };
}

/**
 * Parse a Python color string (hex format)
 * @param value - String like "#cc6600" or '#cc6600'
 * @returns Normalized hex color or undefined
 */
function parseColorValue(value: string): string | undefined {
  // Match quoted hex color
  const match = value.match(/^["']?(#[0-9a-fA-F]{3,8})["']?$/);
  if (match) {
    return match[1].toLowerCase();
  }
  return undefined;
}

/**
 * Parse a Python string value (font path, etc.)
 * @param value - String like "DejaVuSans.ttf" or 'fonts/custom.ttf'
 * @returns Unquoted string or undefined
 */
function parseStringValue(value: string): string | undefined {
  // Match quoted string
  const match = value.match(/^["'](.+?)["']$/);
  if (match) {
    return match[1];
  }
  return undefined;
}

/**
 * Parse a Python numeric value
 * @param value - String like "33" or "1.0"
 * @returns Number or undefined
 */
function parseNumericValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === 'None' || trimmed === 'none') {
    return undefined;
  }
  const num = parseFloat(trimmed);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse a Python boolean value
 * @param value - String like "True" or "False"
 * @returns Boolean or undefined
 */
function parseBooleanValue(value: string): boolean | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return undefined;
}

/**
 * Parse Borders(left, top, right, bottom) function call
 * @param value - String like "Borders(6, 6, 6, 6)"
 * @returns Tuple of 4 numbers or undefined
 */
function parseBordersValue(value: string): [number, number, number, number] | undefined {
  const match = value.match(/Borders\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (match) {
    return [
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
      parseInt(match[4], 10),
    ];
  }
  return undefined;
}

/**
 * Map of gui variable names to their data location and parser
 */
interface VariableMapping {
  path: string[];
  parser: 'color' | 'string' | 'number' | 'boolean' | 'borders';
}

const VARIABLE_MAPPINGS: Record<string, VariableMapping> = {
  // Colors
  'gui.accent_color': { path: ['colors', 'accent'], parser: 'color' },
  'gui.text_color': { path: ['colors', 'text'], parser: 'color' },
  'gui.idle_color': { path: ['colors', 'idle'], parser: 'color' },
  'gui.hover_color': { path: ['colors', 'hover'], parser: 'color' },
  'gui.selected_color': { path: ['colors', 'selected'], parser: 'color' },
  'gui.insensitive_color': { path: ['colors', 'insensitive'], parser: 'color' },
  'gui.muted_color': { path: ['colors', 'mutedColor'], parser: 'color' },
  'gui.hover_muted_color': { path: ['colors', 'hoverMutedColor'], parser: 'color' },

  // Fonts
  'gui.text_font': { path: ['fonts', 'textFont'], parser: 'string' },
  'gui.interface_text_font': { path: ['fonts', 'interfaceFont'], parser: 'string' },
  'gui.system_font': { path: ['fonts', 'systemFont'], parser: 'string' },
  'gui.text_size': { path: ['fonts', 'textSize'], parser: 'number' },
  'gui.name_text_size': { path: ['fonts', 'nameTextSize'], parser: 'number' },
  'gui.interface_text_size': { path: ['fonts', 'interfaceTextSize'], parser: 'number' },
  'gui.label_text_size': { path: ['fonts', 'labelTextSize'], parser: 'number' },
  'gui.notify_text_size': { path: ['fonts', 'notifyTextSize'], parser: 'number' },
  'gui.title_text_size': { path: ['fonts', 'titleTextSize'], parser: 'number' },

  // Textbox
  'gui.textbox_height': { path: ['textbox', 'height'], parser: 'number' },
  'gui.textbox_yalign': { path: ['textbox', 'yalign'], parser: 'number' },
  'gui.dialogue_xpos': { path: ['textbox', 'dialogueXpos'], parser: 'number' },
  'gui.dialogue_ypos': { path: ['textbox', 'dialogueYpos'], parser: 'number' },
  'gui.dialogue_width': { path: ['textbox', 'dialogueWidth'], parser: 'number' },
  'gui.dialogue_text_xalign': { path: ['textbox', 'dialogueTextXalign'], parser: 'number' },

  // Namebox
  'gui.name_xpos': { path: ['namebox', 'xpos'], parser: 'number' },
  'gui.name_ypos': { path: ['namebox', 'ypos'], parser: 'number' },
  'gui.namebox_width': { path: ['namebox', 'width'], parser: 'number' },
  'gui.namebox_height': { path: ['namebox', 'height'], parser: 'number' },
  'gui.namebox_borders': { path: ['namebox', 'borders'], parser: 'borders' },
  'gui.namebox_tile': { path: ['namebox', 'tile'], parser: 'boolean' },

  // Button
  'gui.button_width': { path: ['button', 'width'], parser: 'number' },
  'gui.button_height': { path: ['button', 'height'], parser: 'number' },
  'gui.button_borders': { path: ['button', 'borders'], parser: 'borders' },
  'gui.button_tile': { path: ['button', 'tile'], parser: 'boolean' },
  'gui.button_text_font': { path: ['button', 'textFont'], parser: 'string' },
  'gui.button_text_size': { path: ['button', 'textSize'], parser: 'number' },
  'gui.button_text_idle_color': { path: ['button', 'textIdleColor'], parser: 'color' },
  'gui.button_text_hover_color': { path: ['button', 'textHoverColor'], parser: 'color' },
  'gui.button_text_selected_color': { path: ['button', 'textSelectedColor'], parser: 'color' },
  'gui.button_text_insensitive_color': { path: ['button', 'textInsensitiveColor'], parser: 'color' },

  // Choice buttons
  'gui.choice_button_width': { path: ['choice', 'buttonWidth'], parser: 'number' },
  'gui.choice_button_height': { path: ['choice', 'buttonHeight'], parser: 'number' },
  'gui.choice_button_borders': { path: ['choice', 'buttonBorders'], parser: 'borders' },
  'gui.choice_button_tile': { path: ['choice', 'buttonTile'], parser: 'boolean' },
  'gui.choice_button_text_font': { path: ['choice', 'buttonTextFont'], parser: 'string' },
  'gui.choice_button_text_size': { path: ['choice', 'buttonTextSize'], parser: 'number' },
  'gui.choice_button_text_idle_color': { path: ['choice', 'buttonTextIdleColor'], parser: 'color' },
  'gui.choice_button_text_hover_color': { path: ['choice', 'buttonTextHoverColor'], parser: 'color' },
  'gui.choice_ypos': { path: ['choice', 'ypos'], parser: 'number' },
  'gui.choice_spacing': { path: ['choice', 'spacing'], parser: 'number' },

  // Navigation
  'gui.navigation_xpos': { path: ['navigation', 'xpos'], parser: 'number' },
  'gui.navigation_yalign': { path: ['navigation', 'yalign'], parser: 'number' },
  'gui.navigation_spacing': { path: ['navigation', 'spacing'], parser: 'number' },

  // Slot buttons
  'gui.slot_button_width': { path: ['slot', 'buttonWidth'], parser: 'number' },
  'gui.slot_button_height': { path: ['slot', 'buttonHeight'], parser: 'number' },
  'gui.slot_button_borders': { path: ['slot', 'buttonBorders'], parser: 'borders' },
  'gui.file_slot_cols': { path: ['slot', 'cols'], parser: 'number' },
  'gui.file_slot_rows': { path: ['slot', 'rows'], parser: 'number' },
};

/**
 * Set a value in the data object following a path
 */
function setNestedValue(obj: any, path: string[], value: any): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

/**
 * Parse a gui.rpy file content and extract theme data
 *
 * @param content - The raw content of gui.rpy file
 * @returns Parsed GUI data structure
 *
 * @example
 * ```typescript
 * const guiRpy = `
 *   gui.accent_color = "#cc6600"
 *   gui.text_font = "DejaVuSans.ttf"
 *   gui.text_size = 33
 * `;
 * const data = parseGuiRpy(guiRpy);
 * // data.colors.accent === "#cc6600"
 * // data.fonts.textFont === "DejaVuSans.ttf"
 * // data.fonts.textSize === 33
 * ```
 */
export function parseGuiRpy(content: string): RenpyGuiData {
  const data = createEmptyGuiData();

  // Split into lines and process each
  const lines = content.split('\n');

  // Track if we're inside a multi-line define or init block to skip
  let insideBlock = false;
  let blockIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Check for block start (define, init, screen, etc.)
    if (trimmed.match(/^(define|init|screen|style|transform)\s+/)) {
      // Check if it's a single-line define with =
      if (!trimmed.includes('=') || trimmed.endsWith(':')) {
        insideBlock = true;
        blockIndent = line.search(/\S/);
        continue;
      }
    }

    // Skip lines inside blocks
    if (insideBlock) {
      const currentIndent = line.search(/\S/);
      if (currentIndent <= blockIndent && trimmed.length > 0) {
        insideBlock = false;
      } else {
        continue;
      }
    }

    // Match gui.xxx = value pattern (with optional 'define' keyword)
    // Supports: gui.xxx = value  OR  define gui.xxx = value
    const match = trimmed.match(/^(?:define\s+)?(gui\.[a-z_]+)\s*=\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const varName = match[1].toLowerCase();
    const rawValue = match[2].trim();

    // Look up mapping
    const mapping = VARIABLE_MAPPINGS[varName];

    if (mapping) {
      let parsedValue: any;

      switch (mapping.parser) {
        case 'color':
          parsedValue = parseColorValue(rawValue);
          break;
        case 'string':
          parsedValue = parseStringValue(rawValue);
          break;
        case 'number':
          parsedValue = parseNumericValue(rawValue);
          break;
        case 'boolean':
          parsedValue = parseBooleanValue(rawValue);
          break;
        case 'borders':
          parsedValue = parseBordersValue(rawValue);
          break;
      }

      if (parsedValue !== undefined) {
        setNestedValue(data, mapping.path, parsedValue);
      }
    }

    // Store in raw for anything we don't explicitly handle
    data.raw[varName] = rawValue;
  }

  return data;
}

/**
 * Parse options.rpy file to extract game metadata
 *
 * @param content - The raw content of options.rpy file
 * @returns Object with game name, author, and version if found
 */
export function parseOptionsRpy(content: string): {
  name?: string;
  author?: string;
  version?: string;
  buildName?: string;
} {
  const result: {
    name?: string;
    author?: string;
    version?: string;
    buildName?: string;
  } = {};

  // Match define config.name = "Game Name"
  const nameMatch = content.match(/define\s+config\.name\s*=\s*["'](.+?)["']/i);
  if (nameMatch) {
    result.name = nameMatch[1];
  }

  // Match define build.name = "BuildName"
  const buildMatch = content.match(/define\s+build\.name\s*=\s*["'](.+?)["']/i);
  if (buildMatch) {
    result.buildName = buildMatch[1];
  }

  // Match define config.version = "1.0"
  const versionMatch = content.match(/define\s+config\.version\s*=\s*["'](.+?)["']/i);
  if (versionMatch) {
    result.version = versionMatch[1];
  }

  // Try to extract author from gui.about or copyright
  const aboutMatch = content.match(/gui\.about\s*=\s*_?\s*p?\s*"""[\s\S]*?(?:by|author|created by|made by)[:\s]+([^"\n<]+)/i);
  if (aboutMatch) {
    result.author = aboutMatch[1].trim();
  }

  return result;
}

/**
 * Detect the base resolution of a Ren'Py project from gui.rpy
 *
 * @param guiData - Parsed GUI data
 * @returns Resolution object with width and height
 */
export function detectResolution(guiData: RenpyGuiData): { width: number; height: number } {
  // Check raw for explicit resolution settings
  const rawWidth = guiData.raw['gui.width'];
  const rawHeight = guiData.raw['gui.height'];

  if (rawWidth && rawHeight) {
    const width = parseNumericValue(String(rawWidth));
    const height = parseNumericValue(String(rawHeight));
    if (width && height) {
      return { width, height };
    }
  }

  // Try to infer from textbox height (common ratios)
  // 1920x1080: textbox ~277px
  // 1280x720: textbox ~185px
  // 1024x768: textbox ~192px
  if (guiData.textbox.height) {
    if (guiData.textbox.height >= 250) {
      return { width: 1920, height: 1080 };
    } else if (guiData.textbox.height >= 180 && guiData.textbox.height < 200) {
      return { width: 1280, height: 720 };
    }
  }

  // Default to 1920x1080 (most common for modern Ren'Py)
  return { width: 1920, height: 1080 };
}
