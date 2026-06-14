/**
 * Tests for RenpyAssetExtractor — pulls fonts, UI graphics, gui.rpy data,
 * and options.rpy metadata out of a Ren'Py project ZIP.
 *
 * Fixtures are built in-memory with JSZip and loaded as a Uint8Array (which
 * JSZip.loadAsync accepts directly, avoiding any FileReader path). Image/font
 * bytes are arbitrary — the extractor only reads them out as blobs.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  extractRenpyAssets,
  extractRenpyAssetsPartial,
  validateRenpyZip,
} from '../../src/renpy/RenpyAssetExtractor';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const TTF = new Uint8Array([0x00, 0x01, 0x00, 0x00]);

/** Build a zip from a path→content map; return it as a Uint8Array. */
async function zipOf(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  // Uint8Array is accepted by JSZip.loadAsync; cast to satisfy the Blob param.
  return (await zip.generateAsync({ type: 'uint8array' })) as unknown as Blob;
}

const GUI_RPY = `
define gui.accent_color = '#ff8200'
define gui.text_font = "DejaVuSans.ttf"
define gui.width = 1280
define gui.height = 720
`;

const OPTIONS_RPY = `
define config.name = "My Game"
define config.version = "1.2"
define build.name = "MyGameBuild"
`;

/** A complete full-project Ren'Py archive. */
function fullProject(): Promise<Blob> {
  return zipOf({
    'game/gui.rpy': GUI_RPY,
    'game/options.rpy': OPTIONS_RPY,
    'game/gui/textbox.png': PNG,
    'game/gui/namebox.png': PNG,
    'game/gui/button/idle_background.png': PNG,
    'game/gui/fonts/DejaVuSans.ttf': TTF,
  });
}

describe('extractRenpyAssets', () => {
  it('detects a full-project structure', async () => {
    const bundle = await extractRenpyAssets(await fullProject());
    expect(bundle.structureType).toBe('full-project');
  });

  it('reads metadata from options.rpy', async () => {
    const bundle = await extractRenpyAssets(await fullProject());
    expect(bundle.metadata.name).toBe('My Game');
    expect(bundle.metadata.version).toBe('1.2');
    expect(bundle.metadata.buildName).toBe('MyGameBuild');
  });

  it('derives the resolution from gui.width/height', async () => {
    const bundle = await extractRenpyAssets(await fullProject());
    expect(bundle.metadata.resolution).toEqual({ width: 1280, height: 720 });
  });

  it('extracts font files with their original path', async () => {
    const bundle = await extractRenpyAssets(await fullProject());
    expect(bundle.fonts).toHaveLength(1);
    expect(bundle.fonts[0].filename).toBe('DejaVuSans.ttf');
    expect(bundle.fonts[0].originalPath).toBe('game/gui/fonts/DejaVuSans.ttf');
    // role is one of the mapped font roles
    expect(['dialog-font', 'body-font', 'title-font', 'button-font']).toContain(bundle.fonts[0].role);
  });

  it('extracts gui graphics and maps roles by filename/path', async () => {
    const bundle = await extractRenpyAssets(await fullProject());
    const byName = (n: string) => bundle.uiGraphics.find((g) => g.filename === n)!;
    expect(byName('textbox.png').role).toBe('textbox');
    expect(byName('namebox.png').role).toBe('namebox');
    expect(byName('idle_background.png').role).toBe('button-idle');
  });

  it('parses gui.rpy into guiData (raw captures gui.width)', async () => {
    const bundle = await extractRenpyAssets(await fullProject());
    expect(bundle.guiData).toBeDefined();
    expect(String(bundle.guiData.raw['gui.width'])).toBe('1280');
  });

  it('ignores macOS metadata files', async () => {
    const bundle = await extractRenpyAssets(
      await zipOf({
        'game/gui/textbox.png': PNG,
        '__MACOSX/game/gui/._textbox.png': PNG,
        'game/gui/._namebox.png': PNG,
      }),
    );
    // only the real textbox.png is picked up
    expect(bundle.uiGraphics.map((g) => g.filename)).toEqual(['textbox.png']);
  });
});

describe('detectStructure (via structureType)', () => {
  it('reports gui-folder when files live under gui/ with no game/', async () => {
    const bundle = await extractRenpyAssets(await zipOf({ 'gui/textbox.png': PNG }));
    expect(bundle.structureType).toBe('gui-folder');
  });

  it('reports flat when images sit at the root, and still extracts them', async () => {
    const bundle = await extractRenpyAssets(await zipOf({ 'textbox.png': PNG }));
    expect(bundle.structureType).toBe('flat');
    // flat structure extracts images even without a /gui/ path segment
    expect(bundle.uiGraphics.map((g) => g.filename)).toContain('textbox.png');
  });
});

describe('extractRenpyAssetsPartial', () => {
  it('extracts only fonts when asked', async () => {
    const res = await extractRenpyAssetsPartial(await fullProject(), { extractFonts: true });
    expect(res.fonts).toHaveLength(1);
    expect(res.uiGraphics).toBeUndefined();
    expect(res.guiData).toBeUndefined();
  });

  it('extracts only graphics when asked', async () => {
    const res = await extractRenpyAssetsPartial(await fullProject(), { extractGraphics: true });
    expect(res.uiGraphics!.length).toBeGreaterThan(0);
    expect(res.fonts).toBeUndefined();
  });

  it('parses options metadata when asked', async () => {
    const res = await extractRenpyAssetsPartial(await fullProject(), { parseOptions: true });
    expect(res.metadata!.name).toBe('My Game');
  });

  it('always reports the structure type', async () => {
    const res = await extractRenpyAssetsPartial(await fullProject(), {});
    expect(res.structureType).toBe('full-project');
  });
});

describe('validateRenpyZip', () => {
  it('validates a complete project with no errors', async () => {
    const v = await validateRenpyZip(await fullProject());
    expect(v.valid).toBe(true);
    expect(v.hasGuiRpy).toBe(true);
    expect(v.hasTextbox).toBe(true);
    expect(v.hasFonts).toBe(true);
    expect(v.structureType).toBe('full-project');
    expect(v.errors).toEqual([]);
  });

  it('warns (but stays valid) when only a textbox is present', async () => {
    const v = await validateRenpyZip(await zipOf({ 'gui/textbox.png': PNG }));
    expect(v.valid).toBe(true);
    expect(v.hasGuiRpy).toBe(false);
    expect(v.hasFonts).toBe(false);
    expect(v.warnings.join(' ')).toMatch(/gui\.rpy/);
    expect(v.warnings.join(' ')).toMatch(/font/i);
  });

  it('fails and reports "unknown" structure when there are no Ren\'Py files', async () => {
    const v = await validateRenpyZip(await zipOf({ 'readme.txt': 'hello' }));
    expect(v.valid).toBe(false);
    expect(v.structureType).toBe('unknown');
    expect(v.errors.length).toBeGreaterThan(0);
  });
});
