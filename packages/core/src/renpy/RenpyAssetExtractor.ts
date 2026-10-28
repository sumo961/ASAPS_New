/**
 * Ren'Py Asset Extractor
 *
 * Extracts fonts and UI graphics from Ren'Py project ZIP files.
 * Supports both full project exports and GUI-only folders.
 */

import JSZip from 'jszip';
import { RenpyGuiData, parseRpySources, parseOptionsRpy } from './RenpyGuiParser';

/**
 * Extracted font asset
 */
export interface RenpyFontAsset {
  /** Original filename */
  filename: string;
  /** File data as Blob */
  data: Blob;
  /** Role in the theme (uses ThemeAssetRole values) */
  role: 'dialog-font' | 'body-font' | 'title-font' | 'button-font';
  /** Full path in the ZIP */
  originalPath: string;
}

/**
 * Extracted UI graphic asset
 */
export interface RenpyGraphicAsset {
  /** Original filename */
  filename: string;
  /** File data as Blob */
  data: Blob;
  /** Role in the theme */
  role:
    | 'textbox'
    | 'namebox'
    | 'frame'
    | 'button-idle'
    | 'button-hover'
    | 'button-selected'
    | 'choice-idle'
    | 'choice-hover'
    | 'slot-idle'
    | 'slot-hover'
    /** A textbox.png the size of the screen: Ren'Py lays it over the whole
     *  screen; it is not a frame to draw around a text box. */
    | 'screen-overlay'
    | 'unknown';
  /** Full path in the ZIP */
  originalPath: string;
}

/**
 * Metadata extracted from options.rpy
 */
export interface RenpyMetadata {
  /** Game/theme name */
  name?: string;
  /** Author name */
  author?: string;
  /** Version string */
  version?: string;
  /** Build name (internal identifier) */
  buildName?: string;
  /** Detected resolution */
  resolution: { width: number; height: number };
}

/**
 * Complete bundle of extracted Ren'Py assets
 */
export interface RenpyAssetBundle {
  /** Extracted font files */
  fonts: RenpyFontAsset[];
  /** Extracted UI graphics */
  uiGraphics: RenpyGraphicAsset[];
  /** Parsed GUI data from gui.rpy */
  guiData: RenpyGuiData;
  /** Project metadata */
  metadata: RenpyMetadata;
  /** Structure type detected */
  structureType: 'full-project' | 'gui-folder' | 'flat';
  /** What the import could not take over as it is, for the import dialog */
  notices?: string[];
  /** Set when nothing in the ZIP can make a theme — why, for the import dialog */
  nothingUsable?: string;
}

/**
 * Detect the structure of a Ren'Py ZIP file
 */
function detectStructure(
  zip: JSZip
): 'full-project' | 'gui-folder' | 'flat' {
  const paths = Object.keys(zip.files);

  // Check for full project structure (game/gui/)
  if (paths.some((p) => p.startsWith('game/gui/') || p.match(/^[^/]+\/game\/gui\//))) {
    return 'full-project';
  }

  // Check for gui folder only
  if (paths.some((p) => p.startsWith('gui/') || p.match(/^[^/]+\/gui\//))) {
    return 'gui-folder';
  }

  // Flat structure (files directly in root)
  return 'flat';
}

/**
 * Find the base path for gui files in the ZIP
 */
function findGuiBasePath(zip: JSZip, structureType: string): string {
  const paths = Object.keys(zip.files);

  if (structureType === 'full-project') {
    // Look for game/gui/ or ProjectName/game/gui/
    const guiPath = paths.find(
      (p) => p.endsWith('game/gui/') || p.match(/game\/gui\/textbox\.png$/)
    );
    if (guiPath) {
      const match = guiPath.match(/^(.*)game\/gui\//);
      return match ? match[1] + 'game/gui/' : 'game/gui/';
    }
    return 'game/gui/';
  }

  if (structureType === 'gui-folder') {
    // Look for gui/ or ProjectName/gui/
    const guiPath = paths.find((p) => p.endsWith('gui/') || p.match(/gui\/textbox\.png$/));
    if (guiPath) {
      const match = guiPath.match(/^(.*)gui\//);
      return match ? match[1] + 'gui/' : 'gui/';
    }
    return 'gui/';
  }

  // Flat structure
  return '';
}

/**
 * Find the base path for game files (for options.rpy, fonts)
 */
function findGameBasePath(zip: JSZip, structureType: string): string {
  const paths = Object.keys(zip.files);

  if (structureType === 'full-project') {
    // Look for game/ or ProjectName/game/
    const gamePath = paths.find(
      (p) => p.endsWith('game/') || p.match(/game\/options\.rpy$/) || p.match(/game\/gui\.rpy$/)
    );
    if (gamePath) {
      const match = gamePath.match(/^(.*)game\//);
      return match ? match[1] + 'game/' : 'game/';
    }
    return 'game/';
  }

  // For gui-folder or flat, return empty
  return '';
}

/**
 * Map font filename to role based on gui.rpy references
 * Returns ThemeAssetRole values for consistency with theme system
 */
function mapFontRole(
  filename: string,
  guiData: RenpyGuiData
): 'dialog-font' | 'body-font' | 'title-font' | 'button-font' {
  const lowerFilename = filename.toLowerCase();

  // Check explicit mappings from gui.rpy
  // gui.text_font is typically the main dialog/body font
  if (guiData.fonts.textFont && guiData.fonts.textFont.toLowerCase().includes(lowerFilename)) {
    return 'dialog-font'; // Primary text font for dialog
  }
  // gui.interface_text_font is for UI elements (buttons, titles)
  if (
    guiData.fonts.interfaceFont &&
    guiData.fonts.interfaceFont.toLowerCase().includes(lowerFilename)
  ) {
    return 'title-font'; // Interface font often used for titles
  }
  if (guiData.button.textFont && guiData.button.textFont.toLowerCase().includes(lowerFilename)) {
    return 'button-font';
  }

  // Infer from filename patterns
  if (lowerFilename.includes('name') || lowerFilename.includes('title') || lowerFilename.includes('serif')) {
    return 'title-font';
  }
  if (lowerFilename.includes('button') || lowerFilename.includes('ui')) {
    return 'button-font';
  }

  // Default to dialog font (main body text)
  return 'body-font';
}

/**
 * Map graphic filename to role based on path and name
 */
function mapGraphicRole(
  path: string,
  filename: string
): RenpyGraphicAsset['role'] {
  const lowerPath = path.toLowerCase();
  const lowerFilename = filename.toLowerCase();

  // Textbox
  if (isTextboxName(filename)) {
    return 'textbox';
  }

  // Namebox
  if (lowerFilename === 'namebox.png' || lowerFilename.includes('namebox')) {
    return 'namebox';
  }

  // Frame
  if (lowerFilename === 'frame.png' || lowerFilename.includes('frame')) {
    return 'frame';
  }

  // Button variants
  if (lowerPath.includes('/button/') || lowerPath.includes('button_')) {
    if (lowerFilename.includes('hover')) return 'button-hover';
    if (lowerFilename.includes('selected')) return 'button-selected';
    if (lowerFilename.includes('idle') || lowerFilename.includes('background')) return 'button-idle';
    return 'button-idle';
  }

  // Choice button variants
  if (lowerPath.includes('/choice/')) {
    if (lowerFilename.includes('hover')) return 'choice-hover';
    return 'choice-idle';
  }

  // Slot button variants
  if (lowerPath.includes('/slot/')) {
    if (lowerFilename.includes('hover')) return 'slot-hover';
    return 'slot-idle';
  }

  return 'unknown';
}

/**
 * A text-box picture by its name: textbox.png, textbox_1.png, "Text & Name
 * Box.png" (picture packs name them freely) — but not the quick-menu buttons
 * drawn on it (textbox_save_button.png, textbox_menu.png).
 */
export function isTextboxName(filename: string): boolean {
  const stem = filename.toLowerCase().replace(/\.[^.]+$/, '');
  if (/button|menu|icon/.test(stem)) return false;
  const squeezed = stem.replace(/[^a-z]/g, '');
  return squeezed.includes('textbox') || /^text(and)?(name)?box/.test(squeezed);
}

/** Picture names Ren'Py GUI kits use for the parts ASAPS can take over. */
function isGuiPictureName(filename: string): boolean {
  const stem = filename.toLowerCase().replace(/\.[^.]+$/, '');
  return isTextboxName(filename) || /^(choice_)?(idle|hover)_background$/.test(stem) || stem === 'namebox';
}

/**
 * Check if a file is a font file
 */
function isFontFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['ttf', 'otf', 'woff', 'woff2'].includes(ext || '');
}

/**
 * Check if a file is an image file
 */
function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '');
}

/**
 * Extract assets from a Ren'Py project ZIP file
 *
 * @param zipFile - The ZIP file to extract from
 * @returns Promise resolving to extracted asset bundle
 *
 * @example
 * ```typescript
 * const input = document.querySelector('input[type="file"]');
 * const file = input.files[0];
 * const bundle = await extractRenpyAssets(file);
 * console.log(bundle.guiData.colors.accent);
 * console.log(bundle.fonts.length, 'fonts found');
 * ```
 */
export async function extractRenpyAssets(zipFile: File | Blob): Promise<RenpyAssetBundle> {
  const zip = await JSZip.loadAsync(zipFile);

  // Detect structure
  const structureType = detectStructure(zip);
  const guiBasePath = findGuiBasePath(zip, structureType);
  const gameBasePath = findGameBasePath(zip, structureType);

  // Initialize results
  const fonts: RenpyFontAsset[] = [];
  const uiGraphics: RenpyGraphicAsset[] = [];
  let guiData: RenpyGuiData = {
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
  let metadata: RenpyMetadata = {
    resolution: { width: 1920, height: 1080 },
  };

  // Process all files
  const entries = Object.entries(zip.files);
  const rpyFiles: Array<{ path: string; content: string }> = [];

  for (const [path, file] of entries) {
    if (file.dir) continue;

    const filename = path.split('/').pop() || '';
    const lowerPath = path.toLowerCase();

    // Skip macOS metadata files
    if (filename.startsWith('._') || path.includes('__MACOSX')) {
      continue;
    }

    // The theme's .rpy files (not renpy/common/): gui defines and styles
    if (lowerPath.endsWith('.rpy') && !lowerPath.includes('/renpy/')) {
      rpyFiles.push({ path, content: await file.async('text') });
    }

    // Parse options.rpy for metadata
    if (lowerPath.endsWith('options.rpy')) {
      const content = await file.async('text');
      const options = parseOptionsRpy(content);
      metadata = {
        ...metadata,
        name: options.name,
        author: options.author,
        version: options.version,
        buildName: options.buildName,
      };
    }

    // Extract font files
    if (isFontFile(filename)) {
      const data = await file.async('blob');
      fonts.push({
        filename,
        data,
        role: 'body-font', // Placeholder - will be mapped after gui.rpy is parsed
        originalPath: path,
      });
    }

    // Extract UI graphics from gui folder
    if (isImageFile(filename) && (lowerPath.includes('/gui/') || structureType === 'flat')) {
      const data = await file.async('blob');
      uiGraphics.push({
        filename,
        data,
        role: mapGraphicRole(path, filename),
        originalPath: path,
      });
    }
  }

  if (rpyFiles.length > 0) {
    guiData = parseRpySources(rpyFiles);
    metadata.resolution = detectResolution(guiData);
  }

  // Update font roles now that we have gui.rpy data
  for (const font of fonts) {
    font.role = mapFontRole(font.filename, guiData);
  }

  const notices = await markScreenOverlays(uiGraphics, metadata.resolution);

  // Nothing ASAPS can take over: no settings, no fonts, no frame and no
  // choice-button pictures (picture packs with full-screen text boxes and
  // buttons with their labels painted in — Blue Bubble GUI).
  const hasFrame = uiGraphics.some((g) => g.role === 'textbox');
  const hasChoicePictures = uiGraphics.some((g) => /^(choice_)?idle_background\.[a-z]+$/i.test(g.filename));
  const nothingUsable = rpyFiles.length === 0 && fonts.length === 0 && !hasFrame && !hasChoicePictures
    ? [
        'This ZIP has pictures, but none ASAPS can use for a theme:',
        uiGraphics.some((g) => g.role === 'screen-overlay')
          ? 'its text box is a full-screen picture,'
          : 'there is no text-box picture,',
        'there are no choice-button pictures (choice_idle_background.png),',
        'and there are no fonts or Ren\'Py settings (.rpy files).',
        'Pictures from it can still be used one by one in Project Settings ▸ Text Box ▸ Pictures.',
      ].join(' ')
    : undefined;

  return {
    fonts,
    uiGraphics,
    guiData,
    metadata,
    ...(notices.length > 0 ? { notices } : {}),
    ...(nothingUsable ? { nothingUsable } : {}),
    structureType,
  };
}

/** Width and height from a PNG's header, without decoding the picture. */
export async function readPngSize(data: Blob): Promise<{ width: number; height: number } | undefined> {
  try {
    const head = new Uint8Array(await data.slice(0, 24).arrayBuffer());
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (head.length < 24 || png.some((b, i) => head[i] !== b)) return undefined;
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  } catch {
    return undefined;
  }
}

/**
 * A textbox picture as large as the screen is not a frame: some templates
 * (Scribbler UI) draw their text area into a full-screen picture that Ren'Py
 * lays over the whole screen. Drawn around each text box it was squeezed
 * into a scrap; it is marked so it isn't used as the frame.
 */
async function markScreenOverlays(
  graphics: RenpyGraphicAsset[],
  screen: { width: number; height: number }
): Promise<string[]> {
  const notices: string[] = [];
  for (const g of graphics) {
    if (g.role !== 'textbox') continue;
    const size = await readPngSize(g.data);
    if (!size) continue;
    if (size.width >= screen.width * 0.9 && size.height >= screen.height * 0.6) {
      g.role = 'screen-overlay';
      notices.push(
        `${g.filename} is a full-screen picture (${size.width}×${size.height}) that Ren'Py lays over the whole screen, not a frame — it isn't used as the text-box frame. You can choose a frame in Project Settings ▸ Text Box ▸ Pictures.`
      );
    }
  }
  return notices;
}

/**
 * Helper to detect resolution from gui data
 * (Re-exported from RenpyGuiParser for convenience)
 */
function detectResolution(guiData: RenpyGuiData): { width: number; height: number } {
  // Check raw for explicit resolution settings
  const rawWidth = guiData.raw['gui.width'];
  const rawHeight = guiData.raw['gui.height'];

  if (rawWidth && rawHeight) {
    const width =
      typeof rawWidth === 'number' ? rawWidth : parseInt(String(rawWidth), 10);
    const height =
      typeof rawHeight === 'number' ? rawHeight : parseInt(String(rawHeight), 10);
    if (!isNaN(width) && !isNaN(height)) {
      return { width, height };
    }
  }

  // Try to infer from textbox height (common ratios)
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

/**
 * Extract only specific asset types from a ZIP
 *
 * @param zipFile - The ZIP file to extract from
 * @param options - Options for what to extract
 * @returns Promise resolving to partial asset bundle
 */
export async function extractRenpyAssetsPartial(
  zipFile: File | Blob,
  options: {
    extractFonts?: boolean;
    extractGraphics?: boolean;
    parseGui?: boolean;
    parseOptions?: boolean;
  }
): Promise<Partial<RenpyAssetBundle>> {
  const zip = await JSZip.loadAsync(zipFile);
  const structureType = detectStructure(zip);

  const result: Partial<RenpyAssetBundle> = {
    structureType,
  };

  if (options.extractFonts) {
    result.fonts = [];
  }
  if (options.extractGraphics) {
    result.uiGraphics = [];
  }

  // Temporary gui data for font role mapping
  let guiData: RenpyGuiData = {
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

  // First pass: the theme's .rpy files if needed
  if (options.parseGui || options.extractFonts) {
    const rpyFiles: Array<{ path: string; content: string }> = [];
    for (const [path, file] of Object.entries(zip.files)) {
      const lower = path.toLowerCase();
      if (!file.dir && lower.endsWith('.rpy') && !lower.includes('/renpy/')) {
        rpyFiles.push({ path, content: await file.async('text') });
      }
    }
    if (rpyFiles.length > 0) {
      guiData = parseRpySources(rpyFiles);
      if (options.parseGui) {
        result.guiData = guiData;
      }
    }
  }

  // Parse options.rpy
  if (options.parseOptions) {
    result.metadata = { resolution: { width: 1920, height: 1080 } };
    for (const [path, file] of Object.entries(zip.files)) {
      if (path.toLowerCase().endsWith('options.rpy')) {
        const content = await file.async('text');
        const opts = parseOptionsRpy(content);
        result.metadata = {
          ...result.metadata,
          ...opts,
          resolution: result.guiData
            ? detectResolution(result.guiData)
            : { width: 1920, height: 1080 },
        };
        break;
      }
    }
  }

  // Second pass: extract assets
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const filename = path.split('/').pop() || '';
    const lowerPath = path.toLowerCase();

    if (options.extractFonts && isFontFile(filename)) {
      const data = await file.async('blob');
      result.fonts!.push({
        filename,
        data,
        role: mapFontRole(filename, guiData),
        originalPath: path,
      });
    }

    if (
      options.extractGraphics &&
      isImageFile(filename) &&
      (lowerPath.includes('/gui/') || structureType === 'flat')
    ) {
      const data = await file.async('blob');
      result.uiGraphics!.push({
        filename,
        data,
        role: mapGraphicRole(path, filename),
        originalPath: path,
      });
    }
  }

  return result;
}

/**
 * Validate that a ZIP file contains a valid Ren'Py theme
 *
 * @param zipFile - The ZIP file to validate
 * @returns Object with validation result and details
 */
export async function validateRenpyZip(
  zipFile: File | Blob
): Promise<{
  valid: boolean;
  hasGuiRpy: boolean;
  hasTextbox: boolean;
  hasFonts: boolean;
  structureType: 'full-project' | 'gui-folder' | 'flat' | 'unknown';
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let hasGuiRpy = false;
  let hasTextbox = false;
  let hasFonts = false;

  try {
    const zip = await JSZip.loadAsync(zipFile);
    const paths = Object.keys(zip.files);
    const structureType = detectStructure(zip);

    // Check for gui.rpy
    hasGuiRpy = paths.some((p) => p.toLowerCase().endsWith('gui.rpy'));
    if (!hasGuiRpy) {
      const hasOtherRpy = paths.some((p) => p.toLowerCase().endsWith('.rpy') && !p.toLowerCase().includes('/renpy/'));
      warnings.push(hasOtherRpy
        ? 'No gui.rpy found - colours and fonts are read from the theme\'s other .rpy files where they can be; check them after importing'
        : 'No gui.rpy found - will use default theme values');
    }

    // Check for textbox
    const filenames = paths.filter((p) => !p.includes('__MACOSX') && isImageFile(p)).map((p) => p.split('/').pop() || '');
    hasTextbox = filenames.some(isTextboxName);
    if (!hasTextbox) {
      warnings.push('No text-box picture found - will use the default dialog box');
    }

    // Check for fonts
    hasFonts = paths.some((p) => isFontFile(p));
    if (!hasFonts) {
      warnings.push('No font files found - will use system fonts');
    }

    // Check for at least some gui content. Picture packs (no .rpy, pictures
    // in their own folders) count when they have Ren'Py GUI pictures.
    const hasRpy = paths.some((p) => p.toLowerCase().endsWith('.rpy'));
    const hasGuiPictures = filenames.some(isGuiPictureName);
    const hasAnyGuiContent = hasGuiRpy || hasRpy || hasTextbox || hasFonts || hasGuiPictures;
    if (!hasAnyGuiContent) {
      errors.push('ZIP does not appear to contain any Ren\'Py theme files');
    }

    return {
      valid: errors.length === 0,
      hasGuiRpy,
      hasTextbox,
      hasFonts,
      structureType: hasAnyGuiContent ? structureType : 'unknown',
      errors,
      warnings,
    };
  } catch (e) {
    return {
      valid: false,
      hasGuiRpy: false,
      hasTextbox: false,
      hasFonts: false,
      structureType: 'unknown',
      errors: [`Failed to read ZIP file: ${e instanceof Error ? e.message : String(e)}`],
      warnings: [],
    };
  }
}
