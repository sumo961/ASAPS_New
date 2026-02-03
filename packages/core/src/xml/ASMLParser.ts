import { Story } from '../engine/Story';
import { Beat } from '../beats/Beat';
import { BeatTypeRegistry } from '../beats/BeatRegistry';
import { DialogTreeBeat } from '../beats/DialogTreeBeat';
import { calculateTreeLayout, type LayoutEdge } from '../layout';
import type {
  BeatConfig,
  Transition,
  Sound,
  Location,
  Connection,
  Condition,
  Effect
} from '../types';
import type { DialogNode, DialogChoice } from '../generated/beat-types';

// ============================================
// Asset Manifest Types for ASML Import
// ============================================

/**
 * Represents an asset file reference extracted from ASML
 */
export interface AssetReference {
  /** Asset name (used for linking to beats) */
  name: string;
  /** File path from ASML fPath attribute */
  fPath: string;
  /** Original ASML element ID */
  id: string;
}

/**
 * Character state with file path
 */
export interface CharacterStateReference {
  /** State kind (e.g., 'default', 'happy', 'right') */
  kind: string;
  /** File path for this state's image */
  fPath: string;
}

/**
 * Character definition from ASML with graphics states
 */
export interface CharacterReference {
  /** Character ID from ASML */
  id: string;
  /** Character name */
  name: string;
  /** Character role (e.g., 'interactor' for player) */
  role?: string;
  /** Graphics states with file paths */
  states: CharacterStateReference[];
  /** Counter definitions */
  counters?: Array<{ name: string; value: number }>;
  /** Initial inventory items */
  inventory?: string[];
}

/**
 * Complete manifest of all assets referenced in an ASML file
 */
export interface AssetManifest {
  /** Background images (from <environment>/<node>) */
  backgrounds: AssetReference[];
  /** Props/interactive objects (from <environment>/<prop>) */
  props: AssetReference[];
  /** Sound effects (from <environment>/<sound>) */
  sounds: AssetReference[];
  /** Characters with their graphic states (from <chars>) */
  characters: CharacterReference[];

  /**
   * Check if this manifest has any assets to import
   */
  hasAssets(): boolean;

  /**
   * Get total count of asset files
   */
  getTotalFileCount(): number;

  /**
   * Get all unique file paths
   */
  getAllFilePaths(): string[];
}

/**
 * Create an empty asset manifest (used for error cases)
 */
function createEmptyManifest(): AssetManifest {
  return {
    backgrounds: [],
    props: [],
    sounds: [],
    characters: [],
    hasAssets() { return false; },
    getTotalFileCount() { return 0; },
    getAllFilePaths() { return []; }
  };
}

/**
 * Maps legacy ASML beat type names to modern equivalents.
 * This ensures old story files are properly converted on import.
 */
const LEGACY_TYPE_MAP: Record<string, string> = {
  'conversationChoice': 'dialogTree',
  'conditionCheck': 'conditionBeat',
  'setGlobal': 'setVariable',
  'globalTimer': 'setTimer',
  'introText': 'infoText',  // Renamed in v2.3
};

// ============================================
// Import-time auto-sizing utilities
// ============================================

const DEFAULT_FONT_SIZE = 16;
const TITLE_FONT_SIZE = 32;
const AUTHOR_FONT_SIZE = 20;
const MIN_FONT_SIZE = 12;
const MAX_BUTTON_WIDTH_RATIO = 0.4;  // 40% of canvas
const MAX_TEXT_WIDTH_RATIO = 0.9;    // 90% of canvas
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 768;

/**
 * Calculate ideal text box dimensions at a given font size
 * Uses tight padding to avoid oversized boxes
 */
function calculateIdealDimensions(
  content: string,
  fontSize: number,
  maxWidth: number,
  elementType: 'button' | 'text'
): { width: number; height: number; lines: number } {
  if (!content || content.length === 0) {
    return { width: 100, height: fontSize * 1.4 + 20, lines: 1 };
  }

  const charWidth = fontSize * 0.55; // Average character width ratio
  const lineHeight = fontSize * 1.4;

  // Padding: more generous for buttons to avoid cramped look
  // paddingX is horizontal (left + right), paddingY is vertical (top + bottom)
  const paddingX = elementType === 'button' ? 24 : 24;
  const paddingY = elementType === 'button' ? 20 : 16; // Increased button vertical padding

  const textWidth = content.length * charWidth;

  // Check if single line fits within max width
  if (textWidth + paddingX <= maxWidth) {
    // Single line
    return {
      width: textWidth + paddingX,
      height: lineHeight + paddingY,
      lines: 1
    };
  }

  // Multi-line: calculate how many lines at max width
  const availableWidth = maxWidth - paddingX;
  const charsPerLine = Math.max(Math.floor(availableWidth / charWidth), 10);
  const numLines = Math.ceil(content.length / charsPerLine);

  // For multiline buttons, add extra vertical padding per line for breathing room
  const extraPaddingPerLine = elementType === 'button' ? 4 : 0;
  const totalHeight = (numLines * lineHeight) + paddingY + (numLines > 1 ? extraPaddingPerLine * numLines : 0);

  return {
    width: maxWidth,
    height: totalHeight,
    lines: numLines
  };
}

/**
 * Fit text content to a box, with font size based on element type
 * Returns ideal dimensions and fontSize
 *
 * Strategy:
 * 1. Determine starting font size based on location name (title=32, author=20, default=16)
 * 2. Calculate ideal box size
 * 3. If ideal width exceeds max or too many lines, reduce font size
 * 4. Use the IDEAL dimensions (not legacy scaled dimensions)
 */
function fitTextToBox(
  content: string,
  scaledWidth: number,
  scaledHeight: number,
  elementType: 'button' | 'text',
  locationName?: string
): { fontSize: number; width: number; height: number } {
  // Determine starting font size based on location name
  const nameLower = locationName?.toLowerCase() || '';
  let startingFontSize = DEFAULT_FONT_SIZE;
  if (nameLower.includes('title') && !nameLower.includes('screen')) {
    startingFontSize = TITLE_FONT_SIZE;
  } else if (nameLower.includes('author')) {
    startingFontSize = AUTHOR_FONT_SIZE;
  }

  if (!content || content.length === 0) {
    // Empty content: use minimal default size
    const minWidth = elementType === 'button' ? 100 : 150;
    const minHeight = elementType === 'button' ? 40 : 50;
    return { fontSize: startingFontSize, width: minWidth, height: minHeight };
  }

  const maxWidth = elementType === 'button'
    ? CANVAS_WIDTH * MAX_BUTTON_WIDTH_RATIO  // 410px
    : CANVAS_WIDTH * MAX_TEXT_WIDTH_RATIO;   // 922px

  // Start with the appropriate font size for this element type
  let fontSize = startingFontSize;
  let dims = calculateIdealDimensions(content, fontSize, maxWidth, elementType);

  // Only reduce font size if we're hitting the width limit AND text is very long
  // This prevents unnecessary font reduction
  while (dims.lines > 4 && fontSize > MIN_FONT_SIZE) {
    fontSize--;
    dims = calculateIdealDimensions(content, fontSize, maxWidth, elementType);
  }

  // Return ideal dimensions (ignore legacy scaled dimensions)
  return {
    fontSize,
    width: Math.round(dims.width),
    height: Math.round(dims.height)
  };
}

/**
 * Get text content for a location based on beat type and parameters
 */
function getContentForLocation(
  location: Location,
  beatType: string,
  parameters: any,
  allLocations?: Location[]
): string {
  const kind = location.kind;
  const name = location.name || '';

  // Text boxes: get from beat's text/question/message/prompt field
  if (kind === 'text') {
    // Try various text fields
    return parameters.text ||
           parameters.question ||
           parameters.message ||
           parameters.prompt ||
           parameters.title ||
           parameters.dialogTree?.text ||
           '';
  }

  // Buttons: look up choice text by name or index
  if (kind === 'button') {
    // For infoText/titleScreen - single button beats (also handles legacy introText)
    if (beatType === 'infoText' || beatType === 'introText' || beatType === 'titleScreen') {
      return parameters.buttonText || 'Continue';
    }

    // For endScreen
    if (beatType === 'endScreen') {
      if (name.toLowerCase().includes('restart') || name.toLowerCase().includes('play')) {
        return parameters.restartText || 'Play Again';
      }
      if (name.toLowerCase().includes('credit')) {
        return parameters.creditsText || 'Credits';
      }
      // Default for endScreen buttons
      return parameters.restartText || 'Play Again';
    }

    // For dialogTree/conversationChoice
    if (parameters.dialogTree?.choices && parameters.dialogTree.choices.length > 0) {
      const choices = parameters.dialogTree.choices;

      // Try matching by choice text or ID
      const choice = choices.find(
        (c: any) => c.text === name || c.id === name
      );
      if (choice) return choice.text || '';

      // Try index-based matching (button1 -> choices[0])
      const indexMatch = name.match(/button(\d+)/i);
      if (indexMatch) {
        const index = parseInt(indexMatch[1]) - 1;
        if (choices[index]) {
          return choices[index].text || '';
        }
      }

      // Fallback: match by button position in locations array
      if (allLocations) {
        const buttonLocations = allLocations.filter(l => l.kind === 'button');
        const buttonIndex = buttonLocations.indexOf(location);
        if (buttonIndex >= 0 && choices[buttonIndex]) {
          return choices[buttonIndex].text || '';
        }
      }

      // Last resort: return first choice
      if (choices[0]) {
        return choices[0].text || '';
      }
    }

    // For movementChoice
    if (parameters.choices && parameters.choices.length > 0) {
      const choices = parameters.choices;
      const choice = choices.find(
        (c: any) => c.text === name || c.id === name || c.location === name
      );
      if (choice) return choice.text || '';

      // Fallback: match by button position
      if (allLocations) {
        const buttonLocations = allLocations.filter(l => l.kind === 'button');
        const buttonIndex = buttonLocations.indexOf(location);
        if (buttonIndex >= 0 && choices[buttonIndex]) {
          return choices[buttonIndex].text || '';
        }
      }
    }

    // Default: use location name if nothing else matches
    return name || 'Button';
  }

  return '';
}

/**
 * Check if two rectangles overlap
 */
function rectanglesOverlap(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number },
  margin: number = 5
): boolean {
  return !(
    r1.x + r1.width + margin <= r2.x ||
    r2.x + r2.width + margin <= r1.x ||
    r1.y + r1.height + margin <= r2.y ||
    r2.y + r2.height + margin <= r1.y
  );
}

/**
 * Prevent overlaps between text boxes, buttons, and character placeholders
 * Repositions moveable elements (buttons) to avoid collisions with fixed elements (text, characters)
 */
function preventOverlaps(locations: Location[]): void {
  // Separate element types
  // Text boxes and character placeholders are "fixed" - buttons move around them
  const fixedElements = locations.filter(l => l.kind === 'text' || l.kind === 'character');
  const buttons = locations.filter(l => l.kind === 'button');

  // Minimum gap between elements
  const GAP = 10;

  // Move buttons away from fixed elements (text boxes and character placeholders)
  for (const button of buttons) {
    for (const fixed of fixedElements) {
      if (!rectanglesOverlap(button, fixed, GAP)) continue;

      // Calculate overlap amounts
      const buttonRight = button.x + button.width;
      const buttonBottom = button.y + button.height;
      const fixedRight = fixed.x + fixed.width;
      const fixedBottom = fixed.y + fixed.height;

      // Calculate how much we'd need to move in each direction
      const moveLeft = buttonRight - fixed.x + GAP;
      const moveRight = fixedRight - button.x + GAP;
      const moveUp = buttonBottom - fixed.y + GAP;
      const moveDown = fixedBottom - button.y + GAP;

      // Choose the smallest movement that resolves the overlap
      const moves = [
        { dir: 'down', amount: moveDown, newX: button.x, newY: fixedBottom + GAP },
        { dir: 'up', amount: moveUp, newX: button.x, newY: fixed.y - button.height - GAP },
        { dir: 'right', amount: moveRight, newX: fixedRight + GAP, newY: button.y },
        { dir: 'left', amount: moveLeft, newX: fixed.x - button.width - GAP, newY: button.y }
      ];

      // Filter out moves that would put button off-screen
      const validMoves = moves.filter(m =>
        m.newX >= 10 &&
        m.newX + button.width <= CANVAS_WIDTH - 10 &&
        m.newY >= 10 &&
        m.newY + button.height <= CANVAS_HEIGHT - 10
      );

      // Prefer moving down (natural flow), then right, then up, then left
      // But only if the move amount is reasonable
      const preferredOrder = ['down', 'right', 'up', 'left'];
      let bestMove = null;

      for (const preferred of preferredOrder) {
        const move = validMoves.find(m => m.dir === preferred);
        if (move) {
          bestMove = move;
          break;
        }
      }

      // If no preferred move works, take the smallest valid move
      if (!bestMove && validMoves.length > 0) {
        validMoves.sort((a, b) => a.amount - b.amount);
        bestMove = validMoves[0];
      }

      if (bestMove) {
        button.x = bestMove.newX;
        button.y = bestMove.newY;
      }
    }
  }

  // Stack buttons vertically if they overlap each other
  // Sort by Y position first, then X position for same row
  buttons.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) < 20) return a.x - b.x; // Same row, sort by X
    return yDiff;
  });

  for (let i = 1; i < buttons.length; i++) {
    const prevButton = buttons[i - 1];
    const currButton = buttons[i];

    if (!rectanglesOverlap(currButton, prevButton, GAP)) continue;

    const prevBottom = prevButton.y + prevButton.height;
    const prevRight = prevButton.x + prevButton.width;

    // Check if they're roughly on the same row
    const sameRow = Math.abs(prevButton.y - currButton.y) < 20;

    if (sameRow) {
      // Side-by-side buttons - move current button to the right
      currButton.x = prevRight + GAP;
    } else {
      // Stacked buttons - move current button below
      currButton.y = prevBottom + GAP;
    }
  }

  // Final pass: check buttons against fixed elements again after button stacking
  // This handles cases where button stacking pushed a button into a fixed element
  for (const button of buttons) {
    for (const fixed of fixedElements) {
      if (!rectanglesOverlap(button, fixed, GAP)) continue;

      // Simply move button below the fixed element
      button.y = fixed.y + fixed.height + GAP;
    }
  }
}

/**
 * Clamp element positions to ensure they stay within the canvas bounds
 * Prevents buttons and text boxes from overrunning the edges
 */
function clampToCanvas(locations: Location[]): void {
  const MARGIN = 10; // Minimum margin from canvas edges
  const MAX_X = CANVAS_WIDTH - MARGIN;
  const MAX_Y = CANVAS_HEIGHT - MARGIN;

  for (const loc of locations) {
    // Skip non-visual elements
    if (loc.kind !== 'text' && loc.kind !== 'button') continue;

    // Clamp right edge: if x + width exceeds canvas, move element left
    const rightEdge = loc.x + loc.width;
    if (rightEdge > MAX_X) {
      // First try to move the element left
      const newX = MAX_X - loc.width;
      if (newX >= MARGIN) {
        loc.x = newX;
      } else {
        // Element is too wide - clamp to margin and potentially shrink width
        loc.x = MARGIN;
        if (loc.width > CANVAS_WIDTH - 2 * MARGIN) {
          loc.width = CANVAS_WIDTH - 2 * MARGIN;
        }
      }
    }

    // Clamp left edge
    if (loc.x < MARGIN) {
      loc.x = MARGIN;
    }

    // Clamp bottom edge: if y + height exceeds canvas, move element up
    const bottomEdge = loc.y + loc.height;
    if (bottomEdge > MAX_Y) {
      const newY = MAX_Y - loc.height;
      if (newY >= MARGIN) {
        loc.y = newY;
      } else {
        loc.y = MARGIN;
        if (loc.height > CANVAS_HEIGHT - 2 * MARGIN) {
          loc.height = CANVAS_HEIGHT - 2 * MARGIN;
        }
      }
    }

    // Clamp top edge
    if (loc.y < MARGIN) {
      loc.y = MARGIN;
    }
  }
}

export class ASMLParser {
  private beatTypeRegistry: BeatTypeRegistry;
  private warnings: string[] = [];
  private errors: string[] = [];

  constructor() {
    this.beatTypeRegistry = BeatTypeRegistry.getInstance();
  }

  /**
   * Extract asset manifest from ASML XML without full parsing.
   * Use this to discover required assets before importing a story.
   *
   * @param xmlContent - Raw ASML XML string
   * @returns AssetManifest with all referenced asset files
   */
  static getAssetManifest(xmlContent: string): AssetManifest {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const backgrounds: AssetReference[] = [];
    const props: AssetReference[] = [];
    const sounds: AssetReference[] = [];
    const characters: CharacterReference[] = [];

    // Check for XML parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      console.error('[ASMLParser.getAssetManifest] XML parsing error:', parserError.textContent);
      return createEmptyManifest();
    }

    // Parse environment section for backgrounds, props, and sounds
    const environmentElement = xmlDoc.querySelector('environment');
    if (environmentElement) {
      // Parse nodes (backgrounds)
      const nodeElements = environmentElement.querySelectorAll('node');
      nodeElements.forEach(nodeEl => {
        const fPath = nodeEl.getAttribute('fPath');
        if (fPath) {
          backgrounds.push({
            name: nodeEl.getAttribute('name') || '',
            fPath,
            id: nodeEl.getAttribute('id') || ''
          });
        }
      });

      // Parse props
      const propElements = environmentElement.querySelectorAll('prop');
      propElements.forEach(propEl => {
        const fPath = propEl.getAttribute('fPath');
        if (fPath) {
          props.push({
            name: propEl.getAttribute('name') || '',
            fPath,
            id: propEl.getAttribute('id') || ''
          });
        }
      });

      // Parse sounds
      const soundElements = environmentElement.querySelectorAll('sound');
      soundElements.forEach(soundEl => {
        const fPath = soundEl.getAttribute('fPath');
        if (fPath) {
          sounds.push({
            name: soundEl.getAttribute('name') || '',
            fPath,
            id: soundEl.getAttribute('id') || ''
          });
        }
      });
    }

    // Parse characters section
    const charsElement = xmlDoc.querySelector('chars');
    if (charsElement) {
      const charElements = charsElement.querySelectorAll('char');
      charElements.forEach(charEl => {
        const charRef: CharacterReference = {
          id: '',
          name: '',
          states: [],
          counters: [],
          inventory: []
        };

        // Get character ID
        const idEl = charEl.querySelector('id');
        if (idEl) {
          charRef.id = idEl.textContent || '';
        }

        // Get character name
        const nameEl = charEl.querySelector('name');
        if (nameEl) {
          charRef.name = nameEl.textContent || '';
        }

        // Get role from <role> element
        const roleEl = charEl.querySelector('role');
        if (roleEl) {
          charRef.role = roleEl.getAttribute('kind') || undefined;
        }

        // Parse graphics/states
        const graphicsEl = charEl.querySelector('graphics');
        if (graphicsEl) {
          const stateElements = graphicsEl.querySelectorAll('state');
          stateElements.forEach(stateEl => {
            const fPath = stateEl.getAttribute('fPath');
            if (fPath) {
              charRef.states.push({
                kind: stateEl.getAttribute('kind') || 'default',
                fPath
              });
            }
          });
        }

        // Parse counters
        const countersEl = charEl.querySelector('counters');
        if (countersEl) {
          const counterElements = countersEl.querySelectorAll('counter');
          counterElements.forEach(counterEl => {
            const name = counterEl.getAttribute('name');
            const val = counterEl.getAttribute('val');
            if (name) {
              charRef.counters!.push({
                name,
                value: parseInt(val || '0')
              });
            }
          });
        }

        // Parse inventory
        const inventoryEl = charEl.querySelector('inventory');
        if (inventoryEl) {
          const itemElements = inventoryEl.querySelectorAll('item');
          itemElements.forEach(itemEl => {
            const itemName = itemEl.getAttribute('name');
            if (itemName) {
              charRef.inventory!.push(itemName);
            }
          });
        }

        characters.push(charRef);
      });
    }

    // Create manifest object with helper methods
    const manifest: AssetManifest = {
      backgrounds,
      props,
      sounds,
      characters,

      hasAssets(): boolean {
        return (
          this.backgrounds.length > 0 ||
          this.props.length > 0 ||
          this.sounds.length > 0 ||
          this.characters.some(c => c.states.length > 0)
        );
      },

      getTotalFileCount(): number {
        const imageCount = this.backgrounds.length + this.props.length;
        const audioCount = this.sounds.length;
        const characterImageCount = this.characters.reduce(
          (sum, char) => sum + char.states.length,
          0
        );
        return imageCount + audioCount + characterImageCount;
      },

      getAllFilePaths(): string[] {
        const paths = new Set<string>();

        this.backgrounds.forEach(b => paths.add(b.fPath));
        this.props.forEach(p => paths.add(p.fPath));
        this.sounds.forEach(s => paths.add(s.fPath));
        this.characters.forEach(c => {
          c.states.forEach(state => paths.add(state.fPath));
        });

        return Array.from(paths);
      }
    };

    console.log('[ASMLParser.getAssetManifest] Found:', {
      backgrounds: backgrounds.length,
      props: props.length,
      sounds: sounds.length,
      characters: characters.length,
      totalFiles: manifest.getTotalFileCount()
    });

    return manifest;
  }

  /**
   * Parse ASML XML content into a Story object
   */
  async parse(xmlContent: string): Promise<{
    success: boolean;
    story?: Story;
    errors: string[];
    warnings: string[];
  }> {
    console.warn('[ASMLParser] ★★★ PARSE CALLED ★★★ - If you see this, ASMLParser is running');
    this.warnings = [];
    this.errors = [];

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      // Check for XML parsing errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        this.errors.push(`XML parsing error: ${parserError.textContent}`);
        return { success: false, errors: this.errors, warnings: this.warnings };
      }

      const storyElement = xmlDoc.querySelector('story');
      if (!storyElement) {
        this.errors.push('No <story> element found');
        return { success: false, errors: this.errors, warnings: this.warnings };
      }

      const story = new Story();

      // Parse metadata (title may be updated later from titleScreen beat)
      const metadata = {
        title: storyElement.getAttribute('title') || '',
        author: storyElement.getAttribute('author') || 'Unknown',
        version: storyElement.getAttribute('version') || '1.0.0'
      };
      story.setMetadata(metadata);

      // Parse settings
      const settingsElement = storyElement.querySelector('settings');
      if (settingsElement) {
        story.setSettings(this.parseSettings(settingsElement));
      }

      // Parse environment
      const environmentElement = storyElement.querySelector('environment');
      if (environmentElement) {
        story.setEnvironment(this.parseEnvironment(environmentElement));
      }

      // Parse characters
      const charactersElement = storyElement.querySelector('characters');
      if (charactersElement) {
        story.setCharacters(this.parseCharacters(charactersElement));
      }

      // Parse plot (beats and clusters)
      const plotElement = storyElement.querySelector('plot');
      if (plotElement) {
        let { clusters, beats } = this.parsePlot(plotElement);

        // Combine consecutive dialogTree beats into nested dialogs
        beats = this.combineConsecutiveDialogTrees(beats);

        // Apply layout to beats before adding to story
        this.applyLayout(beats);

        // Add all beats to the story
        beats.forEach(beat => {
          if (beat) {
            story.addBeat(beat);
          }
        });

        // Add clusters to the story
        if (clusters && clusters.length > 0) {
          story.setClusters(clusters);
        }

        // If story title is still empty, try to extract from titleScreen beat
        const currentMetadata = story.getMetadata();
        if (!currentMetadata.title) {
          // Look for a titleScreen beat and extract its title
          const titleScreenBeat = beats.find(b => b.type === 'titleScreen');
          if (titleScreenBeat) {
            const params = titleScreenBeat.getParameters?.() || {};
            if (params.title) {
              story.setMetadata({
                ...currentMetadata,
                title: params.title
              });
            } else {
              story.setMetadata({
                ...currentMetadata,
                title: 'Untitled Story'
              });
            }
          } else {
            story.setMetadata({
              ...currentMetadata,
              title: 'Untitled Story'
            });
          }
        }
      }

      return {
        success: true,
        story,
        errors: this.errors,
        warnings: this.warnings
      };
    } catch (error: any) {
      this.errors.push(`Fatal error: ${error.message}`);
      return { success: false, errors: this.errors, warnings: this.warnings };
    }
  }

  /**
   * Apply tree layout to imported beats using the same algorithm as auto-arrange.
   * Only positions beats that don't already have saved positions.
   * Uses the Reingold-Tilford algorithm from @asaps/core/layout.
   */
  private applyLayout(beats: Beat[]): void {
    if (beats.length === 0) return;

    // Separate beats into positioned and unpositioned
    const positionedBeats = beats.filter(beat =>
      beat.x !== undefined && beat.y !== undefined
    );
    const unpositionedBeats = beats.filter(beat =>
      beat.x === undefined || beat.y === undefined
    );

    // If all beats are positioned, skip auto-layout
    if (unpositionedBeats.length === 0) {
      console.log('[ASMLParser] All beats have saved positions, skipping auto-layout');
      return;
    }

    // If only some beats are positioned, only layout the unpositioned ones
    if (positionedBeats.length > 0) {
      console.log(`[ASMLParser] ${positionedBeats.length} beats have saved positions, ` +
                  `applying auto-layout to ${unpositionedBeats.length} unpositioned beats`);
    }

    // Determine which beats to layout
    const beatsToLayout = unpositionedBeats.length > 0 ? unpositionedBeats : beats;

    console.log('[ASMLParser] Starting tree layout for', beatsToLayout.length, 'beats');

    // Build edges from beat connections
    const edges: LayoutEdge[] = [];
    const beatIdSet = new Set(beatsToLayout.map(b => b.id));

    beatsToLayout.forEach(beat => {
      const connections = beat.getConnections();
      connections.forEach(conn => {
        // Only include edges where both source and target are in beats to layout
        if (beatIdSet.has(conn.targetId)) {
          edges.push({ source: beat.id, target: conn.targetId });
        }
      });
    });

    // Create nodes for layout
    const nodes = beatsToLayout.map(beat => ({ id: beat.id }));

    // Calculate positions using tree layout algorithm
    const { positions } = calculateTreeLayout(nodes, edges, {
      nodeSpacingX: 200,
      nodeSpacingY: 150,
      startX: 100,
      startY: 50,
    });

    // Apply positions to beats
    positions.forEach((pos, beatId) => {
      const beat = beatsToLayout.find(b => b.id === beatId);
      if (beat) {
        beat.x = pos.x;
        beat.y = pos.y;
        console.log(`[ASMLParser] Positioned beat ${beat.id} (${beat.name}) at (${pos.x}, ${pos.y})`);
      }
    });

    console.log('[ASMLParser] Layout complete');
  }

  /**
   * Combine consecutive dialogTree beats into nested dialog structures.
   *
   * When beat A is a dialogTree with a single choice that leads to beat B (also a dialogTree),
   * and beat B has no other incoming connections, merge B into A as a nested dialogNode.
   *
   * This reduces the number of beats in the flowchart while preserving the conversation flow.
   */
  private combineConsecutiveDialogTrees(beats: Beat[]): Beat[] {
    console.log(`[ASMLParser] Starting dialog tree combination with ${beats.length} beats`);

    // Build a map of beat ID to beat for quick lookup
    const beatMap = new Map<string, Beat>();
    beats.forEach(beat => beatMap.set(beat.id, beat));

    // Build incoming connection count for each beat
    const incomingCount = new Map<string, number>();
    beats.forEach(beat => incomingCount.set(beat.id, 0));

    beats.forEach(beat => {
      const connections = beat.getConnections();
      connections.forEach(conn => {
        const currentCount = incomingCount.get(conn.targetId) || 0;
        incomingCount.set(conn.targetId, currentCount + 1);
      });
    });

    // Track which beats have been merged into others
    const mergedBeats = new Set<string>();
    let mergeCount = 0;

    // Helper to check if a beat is a dialogTree
    const isDialogTree = (beat: Beat): beat is DialogTreeBeat => {
      return beat.type === 'dialogTree';
    };

    // Keep merging until no more merges are possible
    let madeChange = true;
    while (madeChange) {
      madeChange = false;

      for (const beat of beats) {
        if (mergedBeats.has(beat.id)) continue;
        if (!isDialogTree(beat)) continue;

        const dialogBeat = beat as DialogTreeBeat;
        const dialogTree = dialogBeat.dialogTree;
        if (!dialogTree || !dialogTree.choices) continue;

        // Check each choice for potential merge candidates
        for (const choice of dialogTree.choices) {
          // Skip if choice already has a nested dialogNode
          if (choice.dialogNode) continue;

          // Skip if choice has no target (ends dialog)
          if (!choice.target) continue;

          const targetBeat = beatMap.get(choice.target);
          if (!targetBeat) continue;
          if (mergedBeats.has(targetBeat.id)) continue;
          if (!isDialogTree(targetBeat)) continue;

          // Check if target has only one incoming connection (from this beat)
          const targetIncoming = incomingCount.get(targetBeat.id) || 0;
          if (targetIncoming !== 1) continue;

          // Found a merge candidate!
          // Convert target's dialogTree to be a nested dialogNode
          const targetDialogBeat = targetBeat as DialogTreeBeat;
          const targetDialogTree = targetDialogBeat.dialogTree;

          if (targetDialogTree) {
            console.log(`[ASMLParser] Merging beat "${targetBeat.name}" into "${beat.name}" via choice "${choice.text}"`);

            // Create a copy of the target's dialogTree as the nested dialogNode
            const nestedNode: DialogNode = {
              id: targetDialogTree.id || `nested_${targetBeat.id}`,
              speaker: targetDialogTree.speaker,
              text: targetDialogTree.text,
              emotion: targetDialogTree.emotion,
              conditions: targetDialogTree.conditions,
              effects: targetDialogTree.effects,
              choices: targetDialogTree.choices.map(c => ({ ...c })) // Deep copy choices
            };

            // Set the nested node and remove the target reference
            choice.dialogNode = nestedNode;
            delete choice.target;

            // Mark the target beat as merged
            mergedBeats.add(targetBeat.id);
            mergeCount++;
            madeChange = true;

            // Update incoming counts for beats that were targeted by the merged beat
            targetDialogTree.choices.forEach(c => {
              if (c.target) {
                const count = incomingCount.get(c.target) || 0;
                if (count > 0) {
                  // Don't decrement below 0, and note that the target now has incoming from the merged structure
                  incomingCount.set(c.target, count);
                }
              }
            });
          }
        }
      }
    }

    // Filter out merged beats
    const remainingBeats = beats.filter(beat => !mergedBeats.has(beat.id));

    console.log(`[ASMLParser] Dialog tree combination complete: merged ${mergeCount} beats, ${remainingBeats.length} beats remaining`);

    // Add info message so users understand the beat count reduction
    if (mergeCount > 0) {
      this.warnings.push(`Combined ${mergeCount} consecutive dialog beats into nested dialogs (${beats.length} → ${remainingBeats.length} beats). This is normal behavior that creates proper dialog structures.`);
    }

    return remainingBeats;
  }

  /**
   * Parse settings element
   */
  private parseSettings(settingsElement: Element): any {
    const settings: any = {};

    // Debug: log all child elements of settings and persist to localStorage
    const debugLog: string[] = [];
    const logDebug = (msg: string) => {
      console.log(msg);
      debugLog.push(msg);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('asml_import_debug', debugLog.join('\n'));
      }
    };

    logDebug('[ASMLParser] Settings element children: ' + Array.from(settingsElement.children).map(c => c.tagName).join(', '));
    logDebug('[ASMLParser] Settings XML: ' + settingsElement.outerHTML.substring(0, 1500));

    // Debug settings
    const debugElement = settingsElement.querySelector('debug');
    if (debugElement) {
      settings.debug = {
        firstbeat: debugElement.getAttribute('firstbeat') || '0',
        showvals: debugElement.getAttribute('showvals') === 'on'
      };
    }

    // Helper to convert ASML color format (0xRRGGBB) to CSS (#RRGGBB)
    const convertColor = (color: string | null): string | null => {
      if (!color) return null;
      // Convert 0xRRGGBB to #RRGGBB
      if (color.startsWith('0x') || color.startsWith('0X')) {
        return '#' + color.substring(2);
      }
      // Already in #RRGGBB or other format
      return color;
    };

    // Colors - parse all available color settings
    const colorsElement = settingsElement.querySelector('colors');
    if (colorsElement) {
      settings.colors = {
        pcolor: convertColor(colorsElement.getAttribute('pcolor')),
        palpha: parseInt(colorsElement.getAttribute('palpha') || '100'),
        // Additional color settings from ASML
        nonpcolor: convertColor(colorsElement.getAttribute('nonpcolor')),
        nonpalpha: parseInt(colorsElement.getAttribute('nonpalpha') || '100'),
        bgColor: convertColor(colorsElement.getAttribute('bgColor') || colorsElement.getAttribute('bgcolor')),
      };
      logDebug('[ASMLParser] Parsed colors: ' + JSON.stringify(settings.colors));
    }

    // Fonts - parse all font settings
    const fontsElement = settingsElement.querySelector('fonts');
    if (fontsElement) {
      settings.fonts = {
        titleFont: fontsElement.getAttribute('titleFont'),
        textFont: fontsElement.getAttribute('textFont'),
        buttonFont: fontsElement.getAttribute('buttonFont') || fontsElement.getAttribute('btnFont'),
      };
    }

    // Textbox - parse all textbox styling settings
    const textboxElement = settingsElement.querySelector('textbox');
    if (textboxElement) {
      // Debug: log all textbox attributes
      logDebug('[ASMLParser] Textbox element attributes: ' + Array.from(textboxElement.attributes).map(a => `${a.name}="${a.value}"`).join(', '));

      settings.textbox = {
        radius: parseInt(textboxElement.getAttribute('radius') || '0'),
        // Background color for textboxes
        bgcolor: textboxElement.getAttribute('bgcolor') || textboxElement.getAttribute('bgColor') || textboxElement.getAttribute('color'),
        // Border color for textboxes
        bordercolor: textboxElement.getAttribute('bordercolor') || textboxElement.getAttribute('borderColor'),
        // Opacity (0-100)
        opacity: parseInt(textboxElement.getAttribute('opacity') || '90'),
        // Padding
        padding: parseInt(textboxElement.getAttribute('padding') || '20'),
        // Border width
        borderWidth: parseInt(textboxElement.getAttribute('borderWidth') || textboxElement.getAttribute('border') || '2'),
      };
      logDebug('[ASMLParser] Parsed textbox settings: ' + JSON.stringify(settings.textbox));
    }

    // Button styling - parse if present
    const buttonElement = settingsElement.querySelector('button') || settingsElement.querySelector('buttons');
    if (buttonElement) {
      settings.button = {
        bgcolor: buttonElement.getAttribute('bgcolor') || buttonElement.getAttribute('bgColor') || buttonElement.getAttribute('color'),
        textcolor: buttonElement.getAttribute('textcolor') || buttonElement.getAttribute('textColor'),
        bordercolor: buttonElement.getAttribute('bordercolor') || buttonElement.getAttribute('borderColor'),
        borderWidth: parseInt(buttonElement.getAttribute('borderWidth') || buttonElement.getAttribute('border') || '1'),
        borderRadius: parseInt(buttonElement.getAttribute('radius') || buttonElement.getAttribute('borderRadius') || '4'),
        hoverBgcolor: buttonElement.getAttribute('hoverBgcolor') || buttonElement.getAttribute('hoverbgcolor'),
      };
    }

    // Background sound/music
    const bgSoundElement = settingsElement.querySelector('backgroundsound');
    if (bgSoundElement) {
      settings.sound = {
        backgroundMusic: bgSoundElement.getAttribute('name') || '',
        backgroundVolume: parseInt(bgSoundElement.getAttribute('volume') || '70'),
        mute: bgSoundElement.getAttribute('mute') === 'true'
      };
    }

    return settings;
  }

  /**
   * Parse environment element
   */
  private parseEnvironment(environmentElement: Element): any {
    const environment: any = {
      props: [],
      nodes: []
    };

    // Parse props
    const propElements = environmentElement.querySelectorAll('prop');
    propElements.forEach(propEl => {
      environment.props.push({
        id: propEl.getAttribute('id'),
        name: propEl.getAttribute('name'),
        file: propEl.getAttribute('file'),
        description: propEl.textContent || ''
      });
    });

    // Parse nodes (backgrounds)
    const nodeElements = environmentElement.querySelectorAll('node');
    nodeElements.forEach(nodeEl => {
      environment.nodes.push({
        id: nodeEl.getAttribute('id'),
        name: nodeEl.getAttribute('name'),
        file: nodeEl.getAttribute('file')
      });
    });

    return environment;
  }

  /**
   * Parse characters element - ENHANCED to import all character properties
   */
  private parseCharacters(charactersElement: Element): any[] {
    const characters: any[] = [];

    const characterElements = charactersElement.querySelectorAll('character');
    characterElements.forEach(charEl => {
      const character: any = {
        id: charEl.getAttribute('id'),
        name: charEl.getAttribute('name'),
        displayName: charEl.getAttribute('displayName') || charEl.getAttribute('name'),
        role: charEl.getAttribute('role') || 'npc',
        color: charEl.getAttribute('color'),
        defaultState: charEl.getAttribute('defaultState') || 'default',
        createdAt: charEl.getAttribute('createdAt') || new Date().toISOString(),
        updatedAt: charEl.getAttribute('updatedAt') || new Date().toISOString(),
        visual: { type: 'static' },
        states: [],
        counters: [],
        inventory: []
      };

      // Parse description
      const descriptionEl = charEl.querySelector('description');
      if (descriptionEl) {
        character.description = descriptionEl.textContent || '';
      }

      // Parse tags
      const tagsEl = charEl.querySelector('tags');
      if (tagsEl) {
        const tagsText = tagsEl.textContent || '';
        character.tags = tagsText.split(',').map(t => t.trim()).filter(t => t);
      }

      // Parse visual configuration
      const visualEl = charEl.querySelector('visual');
      if (visualEl) {
        character.visual = {
          type: visualEl.getAttribute('type') || 'static',
          defaultImage: visualEl.getAttribute('defaultImage')
        };

        // Parse sprite sheet if present
        const spriteSheetEl = visualEl.querySelector('spriteSheet');
        if (spriteSheetEl) {
          character.visual.spriteSheet = {
            url: spriteSheetEl.getAttribute('url') || '',
            frameWidth: parseInt(spriteSheetEl.getAttribute('frameWidth') || '32'),
            frameHeight: parseInt(spriteSheetEl.getAttribute('frameHeight') || '32'),
            animations: [] // TODO: Parse animations when implemented
          };
        }
      } else if (charEl.getAttribute('image')) {
        // Backward compatibility with old format
        character.visual.defaultImage = charEl.getAttribute('image');
      }

      // Parse states
      const statesEl = charEl.querySelector('states');
      if (statesEl) {
        const stateElements = statesEl.querySelectorAll('state');
        stateElements.forEach(stateEl => {
          const state: any = {
            id: stateEl.getAttribute('id'),
            name: stateEl.getAttribute('name'),
            displayName: stateEl.getAttribute('displayName') || stateEl.getAttribute('name'),
            visual: {}
          };

          // Parse state visual
          const stateVisualEl = stateEl.querySelector('visual');
          if (stateVisualEl) {
            state.visual.image = stateVisualEl.getAttribute('image');
            state.visual.animation = stateVisualEl.getAttribute('animation');
          }

          character.states.push(state);
        });
      }

      // Ensure at least one default state exists
      if (character.states.length === 0) {
        character.states.push({
          id: 'default',
          name: 'default',
          displayName: 'Default',
          visual: {}
        });
      }

      // Parse counters (enhanced)
      const countersEl = charEl.querySelector('counters');
      if (countersEl) {
        const counterElements = countersEl.querySelectorAll('counter');
        counterElements.forEach(counterEl => {
          character.counters.push({
            name: counterEl.getAttribute('name'),
            displayName: counterEl.getAttribute('displayName') || counterEl.getAttribute('name'),
            value: parseInt(counterEl.getAttribute('value') || '0'),
            min: counterEl.hasAttribute('min') ? parseInt(counterEl.getAttribute('min')!) : undefined,
            max: counterEl.hasAttribute('max') ? parseInt(counterEl.getAttribute('max')!) : undefined,
            visible: counterEl.getAttribute('visible') !== 'false',
            icon: counterEl.getAttribute('icon'),
            color: counterEl.getAttribute('color')
          });
        });
      } else {
        // Backward compatibility - check for old-style counters directly under character
        const oldCounterElements = charEl.querySelectorAll(':scope > counter');
        oldCounterElements.forEach(counterEl => {
          character.counters.push({
            name: counterEl.getAttribute('name'),
            displayName: counterEl.getAttribute('name'),
            value: parseInt(counterEl.getAttribute('value') || '0'),
            min: counterEl.hasAttribute('min') ? parseInt(counterEl.getAttribute('min')!) : 0,
            max: counterEl.hasAttribute('max') ? parseInt(counterEl.getAttribute('max')!) : 100,
            visible: true
          });
        });
      }

      // Parse inventory
      const inventoryEl = charEl.querySelector('inventory');
      if (inventoryEl) {
        const itemElements = inventoryEl.querySelectorAll('item');
        itemElements.forEach(itemEl => {
          const item: any = {
            id: itemEl.getAttribute('id'),
            name: itemEl.getAttribute('name'),
            displayName: itemEl.getAttribute('displayName') || itemEl.getAttribute('name'),
            icon: itemEl.getAttribute('icon') || '',
            quantity: parseInt(itemEl.getAttribute('quantity') || '1'),
            stackable: itemEl.getAttribute('stackable') === 'true',
            category: itemEl.getAttribute('category') || 'misc',
            maxStack: itemEl.hasAttribute('maxStack') ? 
              parseInt(itemEl.getAttribute('maxStack')!) : undefined
          };

          // Parse item description
          const itemDescEl = itemEl.querySelector('description');
          if (itemDescEl) {
            item.description = itemDescEl.textContent || '';
          } else {
            item.description = '';
          }

          character.inventory.push(item);
        });
      }

      characters.push(character);
    });

    return characters;
  }

  /**
   * Parse plot element containing beats
   */
  private parsePlot(plotElement: Element): { clusters: any[], beats: Beat[] } {
    const clusters: any[] = [];
    const beats: Beat[] = [];

    // Parse clusters - support both old and new formats
    const clustersElement = plotElement.querySelector('clusters');
    if (clustersElement) {
      // New format: <cluster id="..." name="..." type="..." />
      const clusterElements = clustersElement.querySelectorAll('cluster');
      if (clusterElements.length > 0) {
        clusterElements.forEach(clusterEl => {
          const cluster: any = {
            id: clusterEl.getAttribute('id'),
            name: clusterEl.getAttribute('name') || 'Unnamed Cluster',
            type: clusterEl.getAttribute('type') || 'organizational',
            isExpanded: clusterEl.getAttribute('expanded') === 'true',
          };

          // Optional attributes
          const mapAssetId = clusterEl.getAttribute('mapAssetId');
          if (mapAssetId) cluster.mapAssetId = mapAssetId;

          const mapScale = clusterEl.getAttribute('mapScale');
          if (mapScale) cluster.mapScale = parseFloat(mapScale);

          const mapOpacity = clusterEl.getAttribute('mapOpacity');
          if (mapOpacity) cluster.mapOpacity = parseFloat(mapOpacity);

          const color = clusterEl.getAttribute('color');
          if (color) cluster.color = color;

          // Parse container position
          const posEl = clusterEl.querySelector('containerPosition');
          if (posEl) {
            cluster.containerPosition = {
              x: parseFloat(posEl.getAttribute('x') || '0'),
              y: parseFloat(posEl.getAttribute('y') || '0')
            };
          } else {
            // Default position
            cluster.containerPosition = { x: 100, y: 100 };
          }

          // Parse container bounds
          const boundsEl = clusterEl.querySelector('containerBounds');
          if (boundsEl) {
            cluster.containerBounds = {
              width: parseFloat(boundsEl.getAttribute('width') || '400'),
              height: parseFloat(boundsEl.getAttribute('height') || '300')
            };
          } else {
            // Default bounds
            cluster.containerBounds = { width: 400, height: 300 };
          }

          // Parse cluster ambient sound
          const soundEl = clusterEl.querySelector('sound');
          if (soundEl) {
            const soundFile = soundEl.getAttribute('file');
            if (soundFile) {
              cluster.sound = {
                file: soundFile,
                volume: parseFloat(soundEl.getAttribute('volume') || '0.5'),
                loop: true // Cluster sounds always loop
              };
            }
          }

          clusters.push(cluster);
        });
      } else {
        // Legacy format: <clusters cluster1="Mom's House" cluster2="Forest" />
        // IMPORTANT: Use cluster name as ID since beats reference clusters by name
        const attributes = Array.from(clustersElement.attributes);
        attributes.forEach((attr, index) => {
          if (attr.name.startsWith('cluster')) {
            const clusterName = attr.value;
            clusters.push({
              id: clusterName, // Use name as ID - beats reference clusters by name
              name: clusterName,
              type: 'organizational',
              isExpanded: true,
              containerPosition: { x: 100 + index * 450, y: 100 },
              containerBounds: { width: 400, height: 300 }
            });
          }
        });
      }
    }

    // Parse beats
    const beatElements = plotElement.querySelectorAll('beat');
    console.log(`[ASMLParser] Found ${beatElements.length} beat elements in XML`);
    let skippedBeats = 0;
    beatElements.forEach(beatElement => {
      try {
        const beat = this.parseBeat(beatElement);
        if (beat) {
          beats.push(beat);
        } else {
          skippedBeats++;
        }
      } catch (error: any) {
        skippedBeats++;
        this.warnings.push(`Failed to parse beat: ${error.message}`);
      }
    });
    console.log(`[ASMLParser] Successfully parsed ${beats.length} beats, skipped ${skippedBeats}`);
    if (skippedBeats > 0) {
      console.warn(`[ASMLParser] Check warnings for details on skipped beats:`, this.warnings);
    }

    return { clusters, beats };
  }

  /**
   * Parse individual beat element
   */
  private parseBeat(beatElement: Element): Beat | null {
    // Read position attributes from beat element (if present)
    const xAttr = beatElement.getAttribute('x');
    const yAttr = beatElement.getAttribute('y');
    
    // Get beat ID and metadata
    const idElement = beatElement.querySelector('id');
    if (!idElement) {
      this.warnings.push('Beat missing ID element');
      return null;
    }

    const id = idElement.getAttribute('id') || '';
    const name = idElement.getAttribute('name') || `Beat ${id}`;
    const clusterAttr = idElement.getAttribute('cluster');
    // Ensure cluster is properly undefined if not set, not the string "undefined"
    const cluster = (clusterAttr && clusterAttr !== 'undefined' && clusterAttr !== 'null') ? clusterAttr : undefined;

    // Get beat function/type
    const functionElement = beatElement.querySelector('function');
    if (!functionElement) {
      this.warnings.push(`Beat ${id} missing function element`);
      return null;
    }

    const rawBeatType = functionElement.getAttribute('kind') || '';
    // Convert legacy beat types to modern equivalents
    const beatType = LEGACY_TYPE_MAP[rawBeatType] || rawBeatType;

    // Create beat configuration
    const config: BeatConfig = {
      id,
      name,
      type: beatType,
      cluster
    };

    // Parse transition
    const transitionElement = beatElement.querySelector('transition');
    if (transitionElement) {
      config.transition = this.parseTransition(transitionElement);
    }

    // Parse sound
    const soundElement = beatElement.querySelector('sound');
    if (soundElement) {
      const parsedSound = this.parseSound(soundElement);
      if (parsedSound) {
        config.sound = parsedSound;
      }
    }

    // Parse node (background) - this is at the beat level, not inside function
    const nodeElement = beatElement.querySelector('node');
    if (nodeElement && nodeElement.textContent) {
      // Store as top-level config property for later use
      (config as any).node = nodeElement.textContent;
      console.log(`[ASMLParser] Beat ${id}: Found <node> element at beat level: "${nodeElement.textContent}"`);
    } else {
      console.log(`[ASMLParser] Beat ${id}: NO <node> element found at beat level`);
    }

    // Parse notes (author notes not shown to player)
    const notesElement = beatElement.querySelector('notes');
    if (notesElement && notesElement.textContent) {
      config.notes = notesElement.textContent;
    }

    // Parse locations
    const locsElement = beatElement.querySelector('locs');
    if (locsElement) {
      config.locations = this.parseLocations(locsElement);
    }

    // Parse default target (legacy)
    const defaultTargetElement = beatElement.querySelector('defaulttarget');
    if (defaultTargetElement) {
      const targetBeat = defaultTargetElement.getAttribute('targetBeat');
      // Filter out literal string "undefined" from legacy ASML files
      config.defaultTarget = (targetBeat && targetBeat !== 'undefined') ? targetBeat : undefined;

      // Parse delay (val attribute)
      // Legacy ASML uses milliseconds, modern uses seconds - convert if value > 100 (heuristic)
      const valAttr = defaultTargetElement.getAttribute('val');
      if (valAttr) {
        const rawDelay = parseInt(valAttr);
        if (!isNaN(rawDelay) && rawDelay > 0) {
          const delay = rawDelay > 100 ? rawDelay / 1000 : rawDelay;
          (config as any).defaultTargetDelay = delay;
        }
      }

      // Parse showTimer attribute
      const showTimerAttr = defaultTargetElement.getAttribute('showTimer');
      if (showTimerAttr === 'true') {
        (config as any).showTimer = true;
      }
    }

    // Parse beat-specific parameters and connections
    // Pass rawBeatType so we can parse legacy formats correctly
    const { parameters, connections } = this.parseBeatFunction(functionElement, rawBeatType, config);

    // CRITICAL: Transfer node from config to parameters (node is at beat level, not inside function)
    console.log(`[ASMLParser] Beat ${id} (${beatType}): config.node="${(config as any).node}", parameters.node="${parameters.node}"`);
    if ((config as any).node && !parameters.node) {
      parameters.node = (config as any).node;
      console.log(`[ASMLParser] Beat ${id}: Transferred beat-level node "${parameters.node}" to parameters`);
    }
    console.log(`[ASMLParser] Beat ${id}: FINAL parameters.node="${parameters.node}"`);


    config.parameters = parameters;

    // Apply import-time auto-sizing to locations BEFORE beat creation
    // This ensures the beat is created with correct dimensions
    if (config.locations && config.locations.length > 0) {
      const allLocations = config.locations;
      console.log(`[ASMLParser] Sizing ${allLocations.length} locations for beat ${id} (${beatType})`);

      // Helper to detect if a location is actually a button (legacy ASML uses kind="text" for buttons)
      const isButtonLocation = (loc: Location): boolean => {
        if (loc.kind === 'button') return true;
        const nameLower = (loc.name || '').toLowerCase();
        return nameLower.includes('button') ||
               nameLower.includes('start') ||
               nameLower.includes('continue') ||
               nameLower.includes('restart') ||
               nameLower.includes('credits') ||
               nameLower.includes('submit') ||
               nameLower.includes('skip') ||
               nameLower.includes('play');
      };

      allLocations.forEach((location: Location) => {
        // Process ALL text and button elements - always calculate proper dimensions
        if (location.kind === 'text' || location.kind === 'button') {
          // Determine actual element type (legacy ASML uses kind="text" for buttons)
          const isButton = isButtonLocation(location);
          const elementType: 'button' | 'text' = isButton ? 'button' : 'text';

          // Update kind to 'button' if it's actually a button (for consistent handling later)
          if (isButton && location.kind !== 'button') {
            location.kind = 'button';
          }

          const content = getContentForLocation(location, beatType, parameters, allLocations);
          console.log(`[ASMLParser] Location "${location.name}" (${elementType}): content="${content?.substring(0, 30)}...", original size=${location.width}x${location.height}`);
          if (content) {
            const fit = fitTextToBox(
              content,
              location.width,
              location.height,
              elementType,
              location.name
            );
            console.log(`[ASMLParser] -> fitTextToBox result: fontSize=${fit.fontSize}, size=${fit.width}x${fit.height}`);
            // Always set fontSize and dimensions
            location.fontSize = fit.fontSize;
            location.width = fit.width;
            location.height = fit.height;
          } else {
            console.log(`[ASMLParser] -> No content found, using defaults`);
            // No content found, set default fontSize and reasonable size
            location.fontSize = location.fontSize ?? DEFAULT_FONT_SIZE;
            if (isButton) {
              location.width = Math.min(location.width, 150);
              location.height = Math.min(location.height, 40);
            }
          }
        }
      });

      // Prevent overlaps between elements
      preventOverlaps(allLocations);

      // Clamp all elements to canvas bounds (prevent overrunning edges)
      clampToCanvas(allLocations);
      console.log(`[ASMLParser] After overlap prevention and clamping:`, allLocations.map(l => ({ name: l.name, kind: l.kind, x: l.x, y: l.y, w: l.width, h: l.height })));
    }

    // Create beat instance
    let beat: Beat;
    try {
      beat = this.beatTypeRegistry.createBeat(beatType, config);

      // DEBUG: Log locations after beat creation
      console.log(`[ASMLParser] Beat ${id} created with ${beat.locations.size} locations:`);
      beat.locations.forEach((loc, key) => {
        console.log(`[ASMLParser]   - ${key}: x=${loc.x}, y=${loc.y}, size=${(loc as any).size}`);
      });

      // Store parameters on the beat using updateParameters to ensure proper handling
      if (parameters && beat.updateParameters) {
        console.log(`[ASMLParser] Beat ${id}: About to update with parameters.node="${parameters.node}"`);
        beat.updateParameters(parameters);
        const afterParams = beat.getParameters?.() || {};
        console.log(`[ASMLParser] Beat ${id}: AFTER updateParameters - getParameters().node="${afterParams.node}"`);
      } else {
        console.log('[ASMLParser] No parameters or updateParameters method. Parameters:', parameters);
      }
      
      // Apply saved position if available (prevents auto-layout from overwriting)
      if (xAttr !== null) {
        beat.x = parseInt(xAttr);
      }
      if (yAttr !== null) {
        beat.y = parseInt(yAttr);
      }
      
      // Add connections to the beat
      connections.forEach(conn => beat.addConnection(conn));

      return beat;
    } catch (error: any) {
      this.warnings.push(`Failed to create beat ${id} of type ${beatType}: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse beat function element and extract parameters and connections
   */
  private parseBeatFunction(functionElement: Element, beatType: string, config: any): {
    parameters: any;
    connections: Connection[];
  } {
    const parameters: any = {};
    const connections: Connection[] = [];

    // Get simple attributes as parameters
    Array.from(functionElement.attributes).forEach(attr => {
      if (attr.name !== 'kind') {
        // Try to parse as boolean or number if applicable
        let value: any = attr.value;
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(Number(value)) && value !== '') value = Number(value);
        
        parameters[attr.name] = value;
      }
    });

    // Parse nested elements based on beat type
    switch (beatType) {
      case 'titleScreen': {
        // Parse titleScreen-specific elements
        const titleEl = functionElement.querySelector('title');
        if (titleEl) {
          parameters.title = titleEl.textContent || '';
        }
        const authorEl = functionElement.querySelector('author');
        if (authorEl) {
          parameters.author = authorEl.textContent || '';
        }
        // Button text parsed below in generic section
        // Parse connection element if present
        const titleConnectionEl = functionElement.querySelector('connection');
        if (titleConnectionEl) {
          connections.push(this.parseConnection(titleConnectionEl));
        }
        break;
      }

      case 'durScreen':
        // Parse durScreen-specific elements
        const durTextEl = functionElement.querySelector('text');
        if (durTextEl) {
          parameters.text = durTextEl.textContent || '';
        }
        const durationEl = functionElement.querySelector('duration');
        if (durationEl) {
          parameters.duration = parseInt(durationEl.textContent || '3000');
        }
        // Connection handled at end via <target> element
        break;

      case 'infoText':
      case 'setVariable':
      case 'setCounter':
      case 'videoBeat':
        // These beats have single connections nested in function
        const connectionEl = functionElement.querySelector('connection');
        if (connectionEl) {
          connections.push(this.parseConnection(connectionEl));
        }
        break;

      case 'endScreen':
        // Parse title (maps to message) and button text
        const endTitleEl = functionElement.querySelector('title');
        if (endTitleEl && endTitleEl.textContent) {
          parameters.message = endTitleEl.textContent;
          parameters.text = endTitleEl.textContent; // Also set text for compatibility
        }
        const endButtonEl = functionElement.querySelector('button');
        if (endButtonEl && endButtonEl.textContent) {
          parameters.buttonText = endButtonEl.textContent;
        }
        // Parse target for restart connection
        const endTargetEl = functionElement.querySelector('target');
        if (endTargetEl) {
          const targetBeat = endTargetEl.getAttribute('targetBeat');
          if (targetBeat && targetBeat !== '0' && targetBeat !== 'undefined') {
            parameters.restartTarget = targetBeat;
            connections.push({
              targetId: targetBeat,
              label: 'Restart'
            });
          }
        }
        // Also check for connection element
        const endConnectionEl = functionElement.querySelector('connection');
        if (endConnectionEl) {
          connections.push(this.parseConnection(endConnectionEl));
        }
        break;

      case 'setGlobal':
        // Legacy beat type - convert to setVariable format
        // Legacy format: <global name="..." val="..."/>, <target targetBeat="..."/>
        const globalEl = functionElement.querySelector('global');
        if (globalEl) {
          parameters.variable = globalEl.getAttribute('name');
          parameters.value = globalEl.getAttribute('val');
          // Convert "true"/"false" strings to booleans for display
          if (parameters.value === 'true') parameters.value = true;
          else if (parameters.value === 'false') parameters.value = false;
        }
        // Parse target for next beat
        const setGlobalTargetEl = functionElement.querySelector('target');
        if (setGlobalTargetEl) {
          const targetBeat = setGlobalTargetEl.getAttribute('targetBeat');
          if (targetBeat) {
            parameters.target = targetBeat;
            connections.push({
              targetId: targetBeat
            });
          }
        }
        break;
        
      case 'globalTimer':  // Legacy name - fall through to setTimer
      case 'setTimer':
        // Parse timer element for timer-specific parameters
        const timerEl = functionElement.querySelector('timer');
        if (timerEl) {
          parameters.timerName = timerEl.getAttribute('name');
          parameters.name = timerEl.getAttribute('name'); // Compatibility
          // Legacy ASML uses milliseconds, modern uses seconds - convert if value > 100 (heuristic)
          const rawTimerValue = parseInt(timerEl.getAttribute('val') || '0');
          const convertedValue = rawTimerValue > 100 ? rawTimerValue / 1000 : rawTimerValue;
          parameters.value = convertedValue;
          parameters.timerValue = convertedValue; // Compatibility with SetTimerBeat
          // Filter out literal string "undefined" from legacy ASML files
          const timerTarget = timerEl.getAttribute('target');
          if (timerTarget && timerTarget !== 'undefined') {
            // Only set timerTarget, NOT target (target is for continueTarget in updateParameters)
            parameters.timerTarget = timerTarget;
          }
        }

        // Legacy format: <timedtarget targetBeat="..."/> for timer expiry target
        const timedTargetEl = functionElement.querySelector('timedtarget');
        if (timedTargetEl) {
          const timedTargetBeat = timedTargetEl.getAttribute('targetBeat');
          if (timedTargetBeat && timedTargetBeat !== 'undefined') {
            // Only set timerTarget, NOT target (target is for continueTarget in updateParameters)
            parameters.timerTarget = timedTargetBeat;
          }
        }

        // The timer target needs a connection for graph visualization
        if (parameters.timerTarget) {
          connections.push({
            targetId: parameters.timerTarget,
            label: 'Timer Target'
          });
        }

        // Legacy format: <target targetBeat="..."/> for immediate next beat
        const timerNextEl = functionElement.querySelector('target');
        if (timerNextEl) {
          const nextBeat = timerNextEl.getAttribute('targetBeat');
          if (nextBeat && nextBeat !== 'undefined') {
            connections.push({
              targetId: nextBeat,
              label: ''
            });
          }
        }

        // Also parse regular connection for immediate next beat (modern format)
        const normalConnectionEl = functionElement.querySelector('connection');
        if (normalConnectionEl) {
          connections.push(this.parseConnection(normalConnectionEl));
        }
        break;

      case 'movementChoice':
        // Parse question element for display text
        const movementQuestionEl = functionElement.querySelector('question');
        if (movementQuestionEl) {
          // Store as 'question' - VisualWorkspace looks for this parameter
          parameters.question = movementQuestionEl.textContent || '';
          // Also store as 'text' for consistency with other beat types
          parameters.text = movementQuestionEl.textContent || '';
        }

        // Parse questioner element (character asking the question)
        const movementQuestionerEl = functionElement.querySelector('questioner');
        if (movementQuestionerEl) {
          parameters.questioner = movementQuestionerEl.textContent || '';
        }

        // Parse delay element if present
        const movementDelayEl = functionElement.querySelector('delay');
        if (movementDelayEl) {
          const val = movementDelayEl.getAttribute('val') || movementDelayEl.textContent;
          if (val) {
            const delay = parseFloat(val);
            if (!isNaN(delay) && delay > 0) {
              // ASML stores delay in milliseconds, convert to seconds
              // If delay > 100, assume it's milliseconds
              parameters.choiceDelay = delay > 100 ? delay / 1000 : delay;
            }
          }
        }

        // Parse choices which contain targets
        const choices: any[] = [];
        const choiceElements = functionElement.querySelectorAll('choice');
        choiceElements.forEach(choiceEl => {
          // Parse counter attribute: format is "counterName,value" (e.g., "friendly,02")
          const counterAttr = choiceEl.getAttribute('counter');
          let counterName: string | undefined;
          let counterValue: number | undefined;
          if (counterAttr && counterAttr.includes(',')) {
            const [name, value] = counterAttr.split(',');
            counterName = name;
            counterValue = parseInt(value, 10);
            if (isNaN(counterValue)) counterValue = 0;
          } else if (counterAttr) {
            counterName = counterAttr;
          }

          // Filter out literal string "undefined" from legacy ASML files
          const rawTarget = choiceEl.getAttribute('target') || choiceEl.getAttribute('targetBeat');
          const choice = {
            id: choiceEl.getAttribute('id'),
            text: choiceEl.getAttribute('text'),
            // Legacy ASML uses 'loc', modern uses 'location'
            location: choiceEl.getAttribute('location') || choiceEl.getAttribute('loc'),
            // Legacy ASML uses 'targetBeat', modern uses 'target'
            target: (rawTarget && rawTarget !== 'undefined') ? rawTarget : undefined,
            counter: counterName,
            counterOperation: counterName ? 'change' : undefined,
            counterValue: counterValue
          };
          choices.push(choice);

          // Import buttonsound attribute → add/update location with sound
          const buttonsound = choiceEl.getAttribute('buttonsound');
          if (buttonsound && choice.location && config.locations) {
            // Find existing location by name and add sound to it
            const existingLoc = config.locations.find((loc: any) => loc.name === choice.location);
            if (existingLoc) {
              existingLoc.sound = buttonsound;
            } else {
              // Create a minimal location for this choice with sound
              config.locations.push({
                kind: 'hotspot',
                name: choice.location,
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                sound: buttonsound
              });
            }
          }

          // Add connection for this choice
          if (choice.target) {
            connections.push({
              targetId: choice.target,
              label: choice.text || undefined
            });
          }
        });
        parameters.choices = choices;
        break;

      case 'pickProp':
        // Parse delay element if present
        const pickPropDelayEl = functionElement.querySelector('delay');
        if (pickPropDelayEl) {
          const val = pickPropDelayEl.getAttribute('val');
          if (val) {
            const delay = parseFloat(val);
            if (!isNaN(delay) && delay > 0) {
              // ASML stores delay in milliseconds, convert to seconds
              // If delay > 100, assume it's milliseconds
              parameters.choiceDelay = delay > 100 ? delay / 1000 : delay;
            }
          }
        }

        // Parse question element (child element in real ASML)
        const pickPropQuestionEl = functionElement.querySelector('question');
        if (pickPropQuestionEl) {
          parameters.question = pickPropQuestionEl.textContent || '';
          parameters.text = pickPropQuestionEl.textContent || '';
        }
        // Also check for question attribute (alternative format)
        const pickPropQuestionAttr = functionElement.getAttribute('question');
        if (pickPropQuestionAttr && !parameters.question) {
          parameters.question = pickPropQuestionAttr;
          parameters.text = pickPropQuestionAttr;
        }

        // Parse questioner element
        const pickPropQuestionerEl = functionElement.querySelector('questioner');
        if (pickPropQuestionerEl) {
          parameters.questioner = pickPropQuestionerEl.textContent || '';
        }

        // Parse props - try both <prop> elements (old format) and <choice> elements (ASML format)
        const props: any[] = [];

        // First try <prop> elements (old/test format)
        const propElements = functionElement.querySelectorAll('prop');
        propElements.forEach(propEl => {
          // Filter out literal string "undefined" from legacy ASML files
          const rawTarget = propEl.getAttribute('target') || propEl.getAttribute('targetBeat');
          const prop = {
            id: propEl.getAttribute('id'),
            name: propEl.getAttribute('name'),
            description: propEl.getAttribute('description') || propEl.getAttribute('desc'),
            target: (rawTarget && rawTarget !== 'undefined') ? rawTarget : undefined
          };
          props.push(prop);

          // Import buttonsound attribute → add/update location with sound
          const buttonsound = propEl.getAttribute('buttonsound');
          if (buttonsound && prop.name && config.locations) {
            const existingLoc = config.locations.find((loc: any) => loc.name === prop.name);
            if (existingLoc) {
              existingLoc.sound = buttonsound;
            }
          }

          // Add connection for this prop
          if (prop.target) {
            connections.push({
              targetId: prop.target,
              label: prop.name || undefined
            });
          }
        });

        // Then try <choice> elements (real ASML format)
        // Only process if we didn't find <prop> elements
        if (props.length === 0) {
          const choiceElements = functionElement.querySelectorAll('choice');
          choiceElements.forEach(choiceEl => {
            const locName = choiceEl.getAttribute('loc');

            // Parse counter attribute: format is "counterName,value" (e.g., "friendly,02")
            const counterAttr = choiceEl.getAttribute('counter');
            let counterName: string | undefined;
            let counterValue: number | undefined;
            if (counterAttr && counterAttr.includes(',')) {
              const [name, value] = counterAttr.split(',');
              counterName = name;
              counterValue = parseInt(value, 10);
              if (isNaN(counterValue)) counterValue = 0;
            } else if (counterAttr) {
              counterName = counterAttr;
            }

            // Filter out literal string "undefined" from legacy ASML files
            const rawTarget = choiceEl.getAttribute('targetBeat') || choiceEl.getAttribute('target');
            const prop = {
              id: choiceEl.getAttribute('id'),
              name: locName, // 'loc' attribute is the prop/location name
              description: choiceEl.getAttribute('desc') || choiceEl.getAttribute('description'),
              target: (rawTarget && rawTarget !== 'undefined') ? rawTarget : undefined,
              counter: counterName,
              counterOperation: counterName ? 'change' : undefined,
              counterValue: counterValue
            };
            props.push(prop);

            // Import buttonsound attribute → add/update location with sound
            const buttonsound = choiceEl.getAttribute('buttonsound');
            console.log(`[ASMLParser] pickProp choice: loc="${locName}", buttonsound="${buttonsound}", locations available:`, config.locations?.map((l: any) => l.name));
            if (buttonsound && locName && config.locations) {
              const existingLoc = config.locations.find((loc: any) => loc.name === locName);
              if (existingLoc) {
                existingLoc.sound = buttonsound;
                console.log(`[ASMLParser] Added sound "${buttonsound}" to location "${locName}"`);
              } else {
                console.log(`[ASMLParser] WARNING: No location found with name "${locName}"`);
              }
            }

            // Add connection for this prop choice
            if (prop.target) {
              connections.push({
                targetId: prop.target,
                label: prop.description || prop.name || undefined
              });
            }
          });
        }

        parameters.props = props;
        break;

      case 'dialogTree':
        // Parse delay element if present
        const dialogDelayEl = functionElement.querySelector('delay');
        if (dialogDelayEl) {
          const val = dialogDelayEl.getAttribute('val');
          if (val) {
            const delay = parseFloat(val);
            if (!isNaN(delay) && delay > 0) {
              // ASML stores delay in milliseconds, convert to seconds
              // If delay > 100, assume it's milliseconds
              parameters.choiceDelay = delay > 100 ? delay / 1000 : delay;
            }
          }
        }

        // Parse dialog tree - the function element IS the dialog tree
        parameters.dialogTree = this.parseDialogTree(functionElement, config);

        // Extract connections from dialog choices
        this.extractDialogConnections(parameters.dialogTree, connections);

        // Also check for default connection after dialog
        const defaultConnEl = functionElement.querySelector(':scope > connection');
        if (defaultConnEl) {
          connections.push(this.parseConnection(defaultConnEl));
        }
        break;

      case 'conditionBeat':
        // Parse condition
        const conditionEl = functionElement.querySelector('condition');
        if (conditionEl) {
          parameters.condition = this.parseCondition(conditionEl);
        }
        
        // Parse true/false targets
        const trueTargetEl = functionElement.querySelector('trueTarget');
        const falseTargetEl = functionElement.querySelector('falseTarget');
        
        if (trueTargetEl) {
          const targetBeat = trueTargetEl.getAttribute('targetBeat');
          if (targetBeat) {
            connections.push({
              targetId: targetBeat,
              label: 'true'
            });
            parameters.trueTarget = targetBeat;
          }
        }
        
        if (falseTargetEl) {
          const targetBeat = falseTargetEl.getAttribute('targetBeat');
          if (targetBeat) {
            connections.push({
              targetId: targetBeat,
              label: 'false'
            });
            parameters.falseTarget = targetBeat;
          }
        }
        break;

      case 'conditionCheck':
        // Legacy beat type - convert to conditionBeat format
        // Legacy format: <method val="type"/>, <cond NoTargetBeat="..." YesTargetBeat="..." .../>
        const methodEl = functionElement.querySelector('method');
        const condMethod = methodEl?.getAttribute('val') || 'global';

        // Handle different condition check formats
        if (condMethod === 'idClicked') {
          // Multiple targets based on clicked button ID
          // <cond targetBeat="9" val="1"/> means if button 1 clicked, go to beat 9
          const idCondElements = functionElement.querySelectorAll('cond');
          const idChoices: any[] = [];
          idCondElements.forEach(condEl => {
            const targetBeat = condEl.getAttribute('targetBeat');
            const buttonVal = condEl.getAttribute('val');
            if (targetBeat) {
              idChoices.push({
                buttonId: buttonVal,
                target: targetBeat
              });
              connections.push({
                targetId: targetBeat,
                label: `Button ${buttonVal}`
              });
            }
          });
          parameters.condition = {
            type: 'idClicked',
            choices: idChoices
          };
        } else {
          // Single condition with Yes/No targets (inventory, global, counter)
          const singleCondEl = functionElement.querySelector('cond');
          if (singleCondEl) {
            const yesTarget = singleCondEl.getAttribute('YesTargetBeat');
            const noTarget = singleCondEl.getAttribute('NoTargetBeat');

            // Build condition based on method type
            if (condMethod === 'inventory') {
              parameters.condition = {
                type: 'inventory',
                character: singleCondEl.getAttribute('char'),
                item: singleCondEl.getAttribute('val')
              };
            } else if (condMethod === 'global') {
              const varName = singleCondEl.getAttribute('name') || '';
              const varValue = singleCondEl.getAttribute('val');
              parameters.condition = {
                type: 'variable',
                // Use canonical field name AND legacy fields for compatibility
                variableName: varName,
                left: varName,
                operator: '==',
                value: varValue === 'true' ? true : varValue === 'false' ? false : varValue,
                right: varValue === 'true' ? true : varValue === 'false' ? false : varValue
              };
            } else if (condMethod === 'counter') {
              const counterOp = singleCondEl.getAttribute('operator') || 'equal';
              // Convert legacy operator names to modern format
              let operator = '==';
              if (counterOp === 'over') operator = '>';
              else if (counterOp === 'under') operator = '<';
              else if (counterOp === 'equal') operator = '==';
              else if (counterOp === 'notEqual') operator = '!=';

              const counterName = singleCondEl.getAttribute('name') || '';
              const counterVal = parseInt(singleCondEl.getAttribute('val') || '0');
              parameters.condition = {
                type: 'counter',
                // Use both canonical and legacy field names
                variableName: counterName,
                left: counterName,
                operator: operator,
                value: counterVal,
                right: counterVal
              };
            }

            // Set true/false targets
            if (yesTarget) {
              parameters.trueTarget = yesTarget;
              connections.push({
                targetId: yesTarget,
                label: 'true'
              });
            }
            if (noTarget) {
              parameters.falseTarget = noTarget;
              connections.push({
                targetId: noTarget,
                label: 'false'
              });
            }
          }
        }
        break;

      case 'conversationChoice':
        // Legacy beat type - convert to dialogTree format
        const convQuestioner = functionElement.querySelector('questioner');
        const convQuestion = functionElement.querySelector('question');
        const convDelayEl = functionElement.querySelector('delay');

        // Parse choice delay
        if (convDelayEl) {
          const delayVal = convDelayEl.textContent || convDelayEl.getAttribute('val');
          if (delayVal) {
            const delay = parseFloat(delayVal);
            if (!isNaN(delay) && delay > 0) {
              // ASML stores delay in milliseconds, convert to seconds
              // If delay > 100, assume it's milliseconds
              parameters.choiceDelay = delay > 100 ? delay / 1000 : delay;
            }
          }
        }

        // Build dialogTree structure (same format as modern dialogTree beats)
        const convDialogTree: any = {
          speaker: convQuestioner?.textContent || 'Character',
          text: convQuestion?.textContent || '',
          choices: []
        };

        // Parse choices with proper attributes
        const convChoiceElements = functionElement.querySelectorAll('choice');
        convChoiceElements.forEach((choiceEl, index) => {
          // In old ASML, 'content' attribute has the text, NOT textContent
          const choiceText = choiceEl.getAttribute('content') || choiceEl.textContent || '';
          const rawTarget = choiceEl.getAttribute('targetBeat') || choiceEl.getAttribute('target');
          // Filter out literal string "undefined" from legacy ASML files
          const choiceTarget = (rawTarget && rawTarget !== 'undefined') ? rawTarget : undefined;
          const choiceId = choiceEl.getAttribute('id') || `choice_${index + 1}`;
          const counterAttr = choiceEl.getAttribute('counter');
          const buttonsound = choiceEl.getAttribute('buttonsound');

          const choice: any = {
            id: choiceId,
            text: choiceText,
            target: choiceTarget
          };

          // Parse counter attribute (format: "counterName,value" e.g. "friendly,02")
          if (counterAttr && counterAttr !== 'undefined,00') {
            const [counterName, counterVal] = counterAttr.split(',');
            if (counterName && counterName !== 'undefined') {
              const counterValue = parseInt(counterVal) || 0;
              // Set both formats for compatibility:
              // - effects array (for execution/export)
              // - direct fields (for DialogTreeEditor UI)
              choice.effects = [{
                type: 'counter',
                counter: counterName,
                operation: 'add',
                value: counterValue
              }];
              choice.counter = counterName;
              choice.counterOperation = 'change';
              choice.counterValue = counterValue;
            }
          }

          convDialogTree.choices.push(choice);

          // Add connection for graph visualization
          if (choiceTarget) {
            connections.push({
              targetId: choiceTarget,
              label: choiceText || undefined
            });
          }

          // Add buttonsound to locations if present
          if (buttonsound && buttonsound !== 'undefined' && config.locations) {
            const buttonName = choiceText || `Choice ${index + 1}`;
            // Check if a button/text element already exists for this choice:
            // 1. By exact name match (for buttons with choice text as name)
            // 2. By index pattern (button1 → choice 0, button2 → choice 1)
            const expectedIndexName = `button${index + 1}`;
            const existingButton = config.locations.find(
              (loc: any) => {
                // Match by name (choice text)
                if (loc.name === buttonName) return true;
                // Match by index pattern (button1, button2, etc.) - these will be converted to buttons later
                if (loc.name?.toLowerCase() === expectedIndexName) return true;
                return false;
              }
            );
            if (existingButton) {
              // Just add the sound to the existing button
              existingButton.sound = buttonsound;
            } else {
              // Create a new button location
              config.locations.push({
                kind: 'button',
                name: buttonName,
                x: 0, y: 0, width: 100, height: 50,
                sound: buttonsound
              });
            }
          }
        });

        parameters.dialogTree = convDialogTree;
        // Also set speaker and text at top level for compatibility
        parameters.speaker = convDialogTree.speaker;
        parameters.text = convDialogTree.text;
        break;

      case 'randomTarget':
        // Parse random target choices
        const randomChoices: string[] = [];
        const randomChoiceElements = functionElement.querySelectorAll('choice');
        randomChoiceElements.forEach(choiceEl => {
          const targetBeat = choiceEl.getAttribute('targetBeat');
          if (targetBeat) {
            randomChoices.push(targetBeat);
            // Add connection for visualization
            connections.push({
              targetId: targetBeat,
              label: `Random ${randomChoices.length}`
            });
          }
        });
        parameters.choices = randomChoices;
        break;
        
      default:
        // For unknown beat types, try to parse generic connection
        const genericConnEl = functionElement.querySelector('connection');
        if (genericConnEl) {
          connections.push(this.parseConnection(genericConnEl));
        }
        break;
    }

    // Also parse any intro, button, buttonsound, target elements (legacy format)
    const introEl = functionElement.querySelector('intro');
    if (introEl) {
      parameters.text = introEl.textContent;
    }

    const buttonEl = functionElement.querySelector('button');
    if (buttonEl) {
      parameters.buttonText = buttonEl.textContent;
    }

    // Parse <buttonsound name="..."/> element (legacy format)
    const buttonsoundEl = functionElement.querySelector('buttonsound');
    if (buttonsoundEl) {
      const soundName = buttonsoundEl.getAttribute('name');
      if (soundName && soundName !== 'undefined') {
        // Ensure config.locations array exists
        if (!config.locations) {
          config.locations = [];
        }
        // Find the button location and add sound to it
        const buttonLoc = config.locations.find((loc: any) =>
          loc.kind === 'button' ||
          (loc.name && loc.name.toLowerCase().includes('button'))
        );
        if (buttonLoc) {
          buttonLoc.sound = soundName;
          console.log(`[ASMLParser] Added buttonsound "${soundName}" to button location "${buttonLoc.name}"`);
        } else {
          // Create a button location with sound if none exists
          config.locations.push({
            kind: 'button',
            name: 'button',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            sound: soundName
          });
          console.log(`[ASMLParser] Created button location with buttonsound "${soundName}"`);
        }
      }
    }

    const targetEl = functionElement.querySelector('target');
    if (targetEl && connections.length === 0) {
      const targetBeat = targetEl.getAttribute('targetBeat');
      if (targetBeat && targetBeat !== 'undefined') {
        connections.push({
          targetId: targetBeat,
          label: parameters.buttonText || undefined
        });
      }
    }

    // Import buttonsound from connection elements for single-connection beats
    const connectionEl = functionElement.querySelector('connection');
    if (connectionEl) {
      const buttonsound = connectionEl.getAttribute('buttonsound');
      if (buttonsound) {
        // Ensure config.locations array exists (might not if no <locs> element in XML)
        if (!config.locations) {
          config.locations = [];
        }
        // Create or update a button location with the sound
        const existingButtonLoc = config.locations.find((loc: any) => loc.kind === 'button');
        if (existingButtonLoc) {
          existingButtonLoc.sound = buttonsound;
        } else {
          // Create a button location with sound
          config.locations.push({
            kind: 'button',
            name: 'button',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            sound: buttonsound
          });
        }
      }
    }

    // Handle arbitrary nested elements (like <node>) for all beat types
    // This is a catch-all for elements not handled in the switch cases
    functionElement.querySelectorAll(':scope > *').forEach(childEl => {
      const tagName = childEl.tagName.toLowerCase();
      // Skip elements already handled in switch cases
      if (['connection', 'choice', 'prop', 'button', 'buttonsound', 'target', 'condition', 'truetarget', 'falsetarget', 'set', 'addmarker', 'removemarker', 'capture', 'questioner', 'question', 'variable', 'timer', 'itemaction', 'score', 'lives', 'image'].includes(tagName)) {
        return;
      }

      // Handle <node> element for background asset
      if (tagName === 'node' && childEl.textContent) {
        parameters.node = childEl.textContent;
        console.log('[ASMLParser.parseBeatFunction] Found <node> element with value:', parameters.node);
      }
      // Could add other generic handlers here if needed
    });

    console.log('[ASMLParser.parseBeatFunction] FINAL parameters:', parameters);

    return { parameters, connections };
  }

  /**
   * Parse dialog tree structure
   * Supports both new simplified format and old format for backward compatibility:
   * - New format: <choice><dialogTree>...</dialogTree></choice>
   * - Old format: <choice><target><dialogTree>...</dialogTree></target></choice>
   */
  private parseDialogTree(dialogTreeEl: Element, config?: any): any {
    const dialogNode: any = {
      id: dialogTreeEl.getAttribute('id'),
      speaker: dialogTreeEl.getAttribute('speaker'),
      text: dialogTreeEl.getAttribute('text'),
      emotion: dialogTreeEl.getAttribute('emotion'),
      choices: []
    };

    // Parse choices
    const choiceElements = dialogTreeEl.querySelectorAll(':scope > choice');
    choiceElements.forEach(choiceEl => {
      const choice: any = {
        id: choiceEl.getAttribute('id'),
        text: choiceEl.getAttribute('text'),
        // Parse counter effects
        counter: choiceEl.getAttribute('counter'),
        counterOperation: choiceEl.getAttribute('operation'),
        counterValue: choiceEl.getAttribute('val') ?
          parseInt(choiceEl.getAttribute('val')!) : undefined
      };

      // target attribute is always a beat ID string (new format)
      // Filter out literal string "undefined" from legacy ASML files
      const targetAttr = choiceEl.getAttribute('target');
      if (targetAttr && targetAttr !== 'undefined') {
        choice.target = targetAttr;
      }

      // Import buttonsound attribute → add/update location with sound
      const buttonsound = choiceEl.getAttribute('buttonsound');
      if (buttonsound && choice.text && config?.locations) {
        // For dialog choices, the location name matches the choice text
        const existingLoc = config.locations.find((loc: any) => loc.name === choice.text);
        if (existingLoc) {
          existingLoc.sound = buttonsound;
        } else {
          // Create a minimal location for this dialog choice with sound
          config.locations.push({
            kind: 'dialog',
            name: choice.text,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            sound: buttonsound
          });
        }
      }

      // NEW FORMAT: Direct <dialogTree> inside choice (no <target> wrapper)
      const directDialogEl = choiceEl.querySelector(':scope > dialogTree');
      if (directDialogEl) {
        choice.dialogNode = this.parseDialogTree(directDialogEl, config);
      }

      // OLD FORMAT: <target><dialogTree>...</dialogTree></target>
      // (backward compatibility - convert to new format)
      const targetEl = choiceEl.querySelector(':scope > target');
      if (targetEl) {
        const nestedDialogEl = targetEl.querySelector(':scope > dialogTree');
        if (nestedDialogEl) {
          choice.dialogNode = this.parseDialogTree(nestedDialogEl, config);
        }
      }

      // Parse condition if present
      const conditionEl = choiceEl.querySelector(':scope > condition');
      if (conditionEl) {
        choice.conditions = [this.parseCondition(conditionEl)];
      }

      // Parse effects if present
      const effectElements = choiceEl.querySelectorAll(':scope > effect');
      if (effectElements.length > 0) {
        choice.effects = Array.from(effectElements).map(el => this.parseEffect(el));
      }

      // OLD FORMAT: <next> element (backward compatibility - convert to dialogNode)
      const nextEl = choiceEl.querySelector(':scope > next');
      if (nextEl) {
        const nextTarget = nextEl.getAttribute('target');
        if (nextTarget && !choice.target) {
          // next with target becomes the choice's target
          choice.target = nextTarget;
        } else {
          // Nested dialog in next becomes dialogNode
          const nextDialogEl = nextEl.querySelector(':scope > dialogTree');
          if (nextDialogEl && !choice.dialogNode) {
            choice.dialogNode = this.parseDialogTree(nextDialogEl, config);
          }
        }
      }

      dialogNode.choices.push(choice);
    });

    // OLD FORMAT: Direct <next> element on dialogTree (backward compatibility)
    // Convert to a [Continue] choice
    const directNextEl = dialogTreeEl.querySelector(':scope > next');
    console.log(`[ASMLParser.parseDialogTree] id=${dialogNode.id}, found <next>:`, !!directNextEl);
    if (directNextEl) {
      const nextTarget = directNextEl.getAttribute('target');
      console.log(`[ASMLParser.parseDialogTree] <next> target attr:`, nextTarget);
      if (nextTarget) {
        dialogNode.choices.push({
          id: 'auto_continue',
          text: '[Continue]',
          target: nextTarget
        });
        console.log(`[ASMLParser.parseDialogTree] Added [Continue] choice with target:`, nextTarget);
      } else {
        const nextDialogEl = directNextEl.querySelector(':scope > dialogTree');
        console.log(`[ASMLParser.parseDialogTree] <next> has nested <dialogTree>:`, !!nextDialogEl);
        if (nextDialogEl) {
          const nestedNode = this.parseDialogTree(nextDialogEl, config);
          dialogNode.choices.push({
            id: 'auto_continue',
            text: '[Continue]',
            dialogNode: nestedNode
          });
          console.log(`[ASMLParser.parseDialogTree] Added [Continue] choice with nested dialogNode:`, nestedNode.id);
        }
      }
    }

    console.log(`[ASMLParser.parseDialogTree] Final dialogNode id=${dialogNode.id} has ${dialogNode.choices.length} choices`);
    return dialogNode;
  }

  /**
   * Extract connections from dialog tree (new format uses dialogNode, old used target as object)
   */
  private extractDialogConnections(dialogNode: any, connections: Connection[]): void {
    if (!dialogNode) return;

    if (dialogNode.choices) {
      dialogNode.choices.forEach((choice: any) => {
        // New format: target is string (beat ID)
        if (typeof choice.target === 'string' && choice.target) {
          connections.push({
            targetId: choice.target,
            label: choice.text || undefined
          });
        }
        // Recurse into nested dialogNode
        if (choice.dialogNode) {
          this.extractDialogConnections(choice.dialogNode, connections);
        }
      });
    }
  }

  /**
   * Parse transition element
   */
  private parseTransition(transitionElement: Element): Transition {
    return {
      type: (transitionElement.getAttribute('type') || 'none') as any,
      duration: parseFloat(transitionElement.getAttribute('duration') || '500'), // Convert to ms
      direction: (transitionElement.getAttribute('direction') || 'in') as any,
      easing: (transitionElement.getAttribute('easing') || 'ease-in-out') as any
    };
  }

  /**
   * Parse sound element
   */
  private parseSound(soundElement: Element): Sound | null {
    // Filter out literal string "undefined" from legacy ASML files
    const soundName = soundElement.getAttribute('name') || soundElement.getAttribute('file');
    if (!soundName || soundName === 'undefined') {
      return null;
    }
    return {
      file: soundName,
      volume: parseFloat(soundElement.getAttribute('volume') || '1'),
      loop: soundElement.getAttribute('loop') === 'true',
      fadeIn: parseFloat(soundElement.getAttribute('fadeIn') || '0'),
      fadeOut: parseFloat(soundElement.getAttribute('fadeOut') || '0')
    };
  }

  /**
   * Parse locations
   * Scales coordinates from legacy 800x600 to modern 1024x768
   */
  private parseLocations(locsElement: Element): Location[] {
    // Use console.warn for visibility - won't get lost in regular logs
    console.warn('[ASMLParser] ========== SCALING LOCATIONS (800x600 → 1024x768) ==========');
    const locations: Location[] = [];

    // Legacy ASML uses 800x600, modern uses 1024x768
    // Scale factors for proportional scaling
    const SCALE_X = 1024 / 800;  // 1.28
    const SCALE_Y = 768 / 600;   // 1.28
    console.warn(`[ASMLParser] Scale factors: X=${SCALE_X}, Y=${SCALE_Y}`);

    const locElements = locsElement.querySelectorAll('loc');
    locElements.forEach(locEl => {
      // Normalize legacy kind values
      let kind = locEl.getAttribute('kind') || 'text';
      if (kind === 'char') kind = 'character'; // Legacy ASML uses 'char' instead of 'character'
      if (kind === 'prop') kind = 'prop'; // Props are already correct

      // Parse raw coordinates
      const rawX = parseInt(locEl.getAttribute('x') || '0');
      const rawY = parseInt(locEl.getAttribute('y') || '0');
      let rawWidth = locEl.getAttribute('width') ? parseInt(locEl.getAttribute('width')!) : null;
      let rawHeight = locEl.getAttribute('height') ? parseInt(locEl.getAttribute('height')!) : null;

      // For props (and other non-character types), 'size' attribute specifies square dimensions
      // Characters use 'size' as a scale percentage, but props use it as pixel dimensions
      if (kind === 'prop' && rawWidth === null && rawHeight === null) {
        const sizeAttr = locEl.getAttribute('size');
        if (sizeAttr) {
          const sizeValue = parseInt(sizeAttr);
          rawWidth = sizeValue;
          rawHeight = sizeValue;
          console.warn(`[ASMLParser] Prop "${locEl.getAttribute('name')}" using size attr: ${sizeValue}x${sizeValue}`);
        }
      }

      // Always scale ASML imports - they are always legacy 800x600 format
      // Scale x and width by SCALE_X, y and height by SCALE_Y
      const scaledX = Math.round(rawX * SCALE_X);
      const scaledY = Math.round(rawY * SCALE_Y);
      const scaledWidth = rawWidth !== null ? Math.round(rawWidth * SCALE_X) : undefined;
      const scaledHeight = rawHeight !== null ? Math.round(rawHeight * SCALE_Y) : undefined;

      console.warn(`[ASMLParser] Scaling ${kind}/${locEl.getAttribute('name')}: (${rawX},${rawY}) → (${scaledX},${scaledY}), size: ${rawWidth}x${rawHeight} → ${scaledWidth}x${scaledHeight}`);

      // Scale all dimensions uniformly for legacy imports
      const location: Location = {
        kind: kind as any,
        name: locEl.getAttribute('name') || '',
        x: scaledX,
        y: scaledY,
        width: scaledWidth ?? 100,
        height: scaledHeight ?? 100,
        zIndex: parseInt(locEl.getAttribute('z') || locEl.getAttribute('zIndex') || '0')
      };

      // Parse optional properties
      const assetId = locEl.getAttribute('assetId');
      if (assetId) location.assetId = assetId;

      // Parse sound: prefer 'sound' attribute, fallback to 'buttonsound' (legacy format)
      const sound = locEl.getAttribute('sound') || locEl.getAttribute('buttonsound');
      if (sound) {
        location.sound = sound;
        console.log(`[ASMLParser] Found sound "${sound}" on location "${location.name}"`);
      }

      // Parse font properties
      const font = locEl.getAttribute('font');
      if (font) location.font = font;

      const fontSize = locEl.getAttribute('fontSize');
      if (fontSize) {
        // Scale font size proportionally (average of X and Y scale factors)
        const fontSizeScale = (SCALE_X + SCALE_Y) / 2;
        location.fontSize = Math.round(parseInt(fontSize) * fontSizeScale);
        console.warn(`[ASMLParser] Scaling fontSize: ${fontSize} → ${location.fontSize}`);
      }

      const textAlign = locEl.getAttribute('textAlign') as 'left' | 'center' | 'right';
      if (textAlign) location.textAlign = textAlign;

      const autosize = locEl.getAttribute('autosize');
      if (autosize) location.autosize = autosize === 'true';

      // Parse character-specific properties (for kind='character')
      if (location.kind === 'character') {
        const characterId = locEl.getAttribute('characterId');
        if (characterId) location.characterId = characterId;

        // characterName can come from 'characterName' attr or fall back to 'name' for legacy ASML
        const characterName = locEl.getAttribute('characterName');
        if (characterName) {
          location.characterName = characterName;
        } else if (location.name) {
          // Legacy ASML uses 'name' for character name
          location.characterName = location.name;
        }

        // stateId comes from 'state' attribute
        const stateId = locEl.getAttribute('state');
        if (stateId) location.stateId = stateId;

        // size is scale percentage - also needs to scale for larger stage
        const size = locEl.getAttribute('size');
        if (size) {
          const rawSize = parseInt(size);
          // Scale size proportionally (average of X and Y scale factors)
          const sizeScale = (SCALE_X + SCALE_Y) / 2;
          location.size = Math.round(rawSize * sizeScale);
          console.log(`[ASMLParser] Scaling character size: ${rawSize}% -> ${location.size}%`);
        }
      }

      locations.push(location);
    });

    return locations;
  }

  /**
   * Parse connection element
   */
  private parseConnection(connectionElement: Element): Connection {
    const target = connectionElement.getAttribute('target');
    // Filter out literal string "undefined" from legacy ASML files
    return {
      targetId: (target && target !== 'undefined') ? target : '',
      label: connectionElement.getAttribute('label') || undefined
    };
  }

  /**
   * Parse effect element
   */
  private parseEffect(effectElement: Element): Effect {
    const effectType = effectElement.getAttribute('type') || 'setVariable';
    const target = effectElement.getAttribute('target') || '';
    const value = this.parseConditionValue(effectElement.getAttribute('value'));

    return {
      type: effectType as Effect['type'],
      target,
      value
    };
  }

  /**
   * Parse condition element with proper ASML attribute mapping
   */
  private parseCondition(conditionElement: Element): Condition {
    // Support both 'right' and 'val' attributes for backward compatibility
    const rightValue = conditionElement.getAttribute('right');
    const valValue = conditionElement.getAttribute('val');
    
    const conditionType = conditionElement.getAttribute('type') || 'variable';
    let leftValue: string;
    
    // Map attributes based on condition type following ASML standards
    switch (conditionType) {
      case 'counter':
        leftValue = conditionElement.getAttribute('counter') || conditionElement.getAttribute('left') || '';
        break;
      case 'inventory':
        leftValue = conditionElement.getAttribute('character') || conditionElement.getAttribute('left') || '';
        break;
      case 'variable':
        leftValue = conditionElement.getAttribute('name') || conditionElement.getAttribute('left') || '';
        break;
      case 'counterCompare':
        // Special case: counterCompare uses counter1 and counter2, no val needed
        const condition: any = {
          type: conditionType as any,
          operator: (conditionElement.getAttribute('operator') || '==') as any,
          counter1: conditionElement.getAttribute('counter1') || '',
          counter2: conditionElement.getAttribute('counter2') || ''
        };
        return condition;
      default:
        leftValue = conditionElement.getAttribute('left') || '';
        break;
    }
    
    return {
      type: conditionType as any,
      operator: (conditionElement.getAttribute('operator') || '==') as any,
      left: leftValue,
      right: this.parseConditionValue(valValue || rightValue)
    };
  }

  /**
   * Parse condition value (could be string, number, boolean)
   */
  private parseConditionValue(value: string | null): any {
    if (value === null) return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value)) && value !== '') return Number(value);
    return value;
  }
}