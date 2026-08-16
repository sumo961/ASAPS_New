/**
 * Tripwires for the two remaining hand-maintained mirrors.
 *
 * Both are documented as "must be kept in sync" and, until now, the check was
 * a human remembering. The link-extraction consolidation showed how that ends:
 * the seventh copy was found by a tripwire, not by the survey.
 *
 * 1. AFFECT_CATALOG — the MCP desktop server embeds a copy of the affect
 *    catalog from core, because it must run standalone under Claude Desktop
 *    with no workspace imports. mcp-server-desktop is not an npm workspace, so
 *    a test THERE would never run in CI; this one lives in builder's suite and
 *    reads both files from the repo.
 *
 * 2. Translation extractors — StoryTranslator.extractTranslatableStrings has
 *    an ES5 twin embedded in the export HTML template (the shipped player
 *    re-extracts at runtime for the language switcher). A new player-facing
 *    string added to one and not the other is silently untranslatable. Rather
 *    than compare source text across dialects, both extractors RUN against one
 *    fixture and their key sets are compared.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractTranslatableStrings } from '../../export/StoryTranslator';

const REPO = join(__dirname, '..', '..', '..', '..', '..');

describe('AFFECT_CATALOG mirror', () => {
  it('is byte-identical between core and the MCP desktop server', () => {
    const grab = (src: string) => {
      const m = src.match(/const AFFECT_CATALOG = `([\s\S]*?)`;/);
      if (!m) throw new Error('AFFECT_CATALOG block not found');
      return m[1];
    };
    const core = grab(readFileSync(join(REPO, 'packages/core/src/prompts/affectPrompt.ts'), 'utf8'));
    const mcp = grab(readFileSync(join(REPO, 'mcp-server-desktop/src/index.ts'), 'utf8'));
    // If this fails: packages/core/src/prompts/affectPrompt.ts changed. Copy
    // the block verbatim into mcp-server-desktop/src/index.ts — the sync
    // arrow points from core to the server, never the other way.
    expect(mcp).toBe(core);
  });
});

describe('translation extractor mirror', () => {
  /**
   * One beat per type, because the export-time extractor is TYPE-GATED — it
   * reads restartText only from an endScreen, placeholder only from an
   * inputText — while the player side reads generously from any beat. A
   * single-beat fixture sails through the gates and proves nothing.
   */
  const beats = [
    { id: 'b1', type: 'infoText', parameters: { text: 'body', buttonText: 'go', title: 't', textVariations: ['v1'] } },
    { id: 'b2', type: 'endScreen', parameters: { message: 'm', restartText: 'r', creditsText: 'c', creditsPageTitle: 'ct', creditsPageBody: 'cb', creditsCloseText: 'cc' } },
    { id: 'b3', type: 'inputText', parameters: { question: 'q', placeholder: 'ph' } },
    { id: 'b4', type: 'inputImage', parameters: { cancelButtonText: 'x', fallbackValue: 'fv' } },
    { id: 'b5', type: 'keypad', parameters: { clearButtonText: 'cl' } },
    { id: 'b6', type: 'qrScan', parameters: { helperText: 'h', cancelButtonText: 'x' } },
    { id: 'b7', type: 'arBeat', parameters: { anchors: [{ label: 'a' }] } },
    { id: 'b8', type: 'webView', parameters: { doneButtonText: 'd' } },
    { id: 'b9', type: 'hyperText', parameters: { hyperlinks: [{ word: 'letter' }] } },
    { id: 'b10', type: 'panorama', parameters: { hotspots: [{ name: 'North door' }] } },
    { id: 'b11', type: 'videoBeat', parameters: { captions: [{ text: 'cue' }] } },
    { id: 'b12', type: 'movementChoice', parameters: { choices: [{ displayText: 'Move' }] } },
    { id: 'b13', type: 'pickProp', parameters: { props: [{ name: 'key', displayName: 'Brass key', description: 's' }] } },
    { id: 'b14', type: 'dialogTree', parameters: { dialogTree: { speaker: 'S', text: 'x', choices: [{ text: 'c', dialogNode: { text: 'n', choices: [] } }] } } },
    { id: 'b15', type: 'aiDialogTree', parameters: { npcName: 'n' } },
    { id: 'b16', type: 'onlineContent', parameters: { displayTemplate: 'dt', errorMessage: 'e' } },
    { id: 'b17', type: 'aiInfoText', parameters: { fallbackText: 'fb' } },
    { id: 'b18', type: 'aiConversation', parameters: { openingLine: 'ol', helperText: 'h', doneButtonText: 'd' } },
  ];
  const fixture = { project: { globalSettings: {}, story: { beats } } };

  /**
   * The field family after ".parameters." — the part that must agree.
   *
   * uiStrings are deliberately excluded: the export-time extractor SEEDS the
   * full default catalog so every UI string is offered for translation, and
   * those defaults are then written into the exported project's
   * globalSettings — by the time the player extractor runs, they are project
   * data. Only the per-beat extraction is a true mirror.
   */
  const fieldOf = (key: string): string | null =>
    key.match(/\.parameters\.([A-Za-z]+)/)?.[1] ?? null;

  it('both extractors know exactly the same beat-parameter fields', () => {
    // Export-time side: the real function.
    const exportKeys = Object.keys(extractTranslatableStrings(fixture));

    // Player side: slice the two functions out of the template and run them.
    const template = readFileSync(join(REPO, 'packages/builder/src/export/HtmlExporter.ts'), 'utf8');
    const start = template.indexOf('function extractStrings(project)');
    const end = template.indexOf('// Apply translations to a deep clone');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const embeddedSrc = template.slice(start, end);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const embedded = new Function(`${embeddedSrc}; return extractStrings;`)() as (p: any) => Record<string, string>;
    const playerKeys = Object.keys(embedded(fixture));

    const exportFields = new Set(exportKeys.map(fieldOf).filter(Boolean) as string[]);
    const playerFields = new Set(playerKeys.map(fieldOf).filter(Boolean) as string[]);

    // Bidirectional. A field only the exporter knows produces a translation
    // the shipped player never applies; a field only the player knows is a
    // string the author was never offered to translate. Both are the same
    // drift, one release apart.
    const missingInPlayer = [...exportFields].filter(f => !playerFields.has(f));
    const missingInExport = [...playerFields].filter(f => !exportFields.has(f));
    expect({ missingInPlayer, missingInExport }).toEqual({ missingInPlayer: [], missingInExport: [] });
  });
});
