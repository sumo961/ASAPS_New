/**
 * Tests for HtmlExporter — turns a stored project into a standalone HTML
 * player (single-file or folder zip), with optional multi-language bundling.
 *
 * Strategy: the storage layer, the zip manager (dynamically imported), the
 * translator, and the font bundler are mocked, so these tests pin
 * HtmlExporter's OWN logic — template substitution, AI/TTS config assembly,
 * mode branching, filename sanitization, and the player-bundle fetch
 * fallback — not the collaborators.
 *
 * jsdom notes: its Blob lacks arrayBuffer(), so single-file fixtures use a
 * blob-like with an arrayBuffer() method; folder fixtures use a Uint8Array
 * (JSZip accepts it directly). getPlayerScript() fetches /player-web.js — we
 * stub fetch per test (reject → the "bundle missing" fallback; ok → inlined
 * base64 bundle).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../storage/StorageManager', () => ({ getStorageManager: vi.fn() }));
vi.mock('../../utils/projectZipManager', () => ({
  exportProjectAsZip: vi.fn(),
  getProjectDataForExport: vi.fn(),
}));
vi.mock('../StoryTranslator', () => ({ applyTranslationResource: vi.fn((d) => d) }));
vi.mock('../fontBundler', () => ({ downloadAndInlineFonts: vi.fn(async () => '') }));

import {
  exportAsHtml,
  previewStoryZip,
  downloadHtmlExport,
  type HtmlExportOptions,
} from '../HtmlExporter';
import { getStorageManager } from '../../storage/StorageManager';
import { exportProjectAsZip } from '../../utils/projectZipManager';

// Capture the genuine createElement ONCE, before any test spies on it — so the
// download-path spy delegates to the real impl instead of recursing into a
// prior test's still-installed spy.
const REAL_CREATE_ELEMENT = document.createElement.bind(document);

// ---- fixtures -------------------------------------------------------------

function makeProject(over: any = {}) {
  return {
    id: 'p1',
    name: 'My Story',
    story: { metadata: { author: 'Ada' } },
    globalSettings: {},
    ...over,
  };
}

function mockProject(project: any = makeProject()) {
  (getStorageManager as any).mockReturnValue({
    getProject: vi.fn().mockResolvedValue({ success: true, data: project }),
  });
}

// A single-file fixture only needs arrayBuffer(); folder mode hands the blob
// straight to JSZip, which accepts a Uint8Array.
const sfZip = () =>
  ({ arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer, size: 4, type: 'application/zip' }) as unknown as Blob;
const folderZip = () => new Uint8Array([1, 2, 3, 4]) as unknown as Blob;

const baseOpts = (over: Partial<HtmlExportOptions> = {}): HtmlExportOptions => ({
  mode: 'single-file',
  responsive: true,
  enableAI: false,
  showApiKeyPrompt: false,
  ...over,
});

beforeEach(() => {
  mockProject();
  // Default: player bundle fetch fails → getPlayerScript returns the fallback.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no server')));
});

afterEach(() => {
  vi.restoreAllMocks(); // restore spies (e.g. document.createElement) to originals
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('exportAsHtml — single-file', () => {
  it('substitutes title and author (HTML-escaped) into the template', async () => {
    mockProject(makeProject({ name: 'Tom & <b>Jerry</b>', story: { metadata: { author: 'A "Q"' } } }));
    const res = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(res.mode).toBe('single-file');
    expect(res.html).toContain('Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;');
    expect(res.html).toContain('A &quot;Q&quot;');
  });

  it('inlines the story data as base64 and leaves STORY_URL empty', async () => {
    const res = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    // arrayBufferToBase64 of [1,2,3,4] === btoa("\x01\x02\x03\x04")
    const expected = btoa(String.fromCharCode(1, 2, 3, 4));
    expect(res.html).toContain(`'${expected}'`);
    expect(res.html).not.toContain('{{STORY_DATA}}');
    expect(res.html).not.toContain('{{STORY_URL}}');
  });

  it('emits AI_CONFIG=null when no provider/key, and a JSON object when both set', async () => {
    const off = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    // The template line is `aiConfig: {{AI_CONFIG}},` → `aiConfig: null,`.
    expect(off.html).toContain('aiConfig: null');

    const on = await exportAsHtml(
      'p1',
      baseOpts({ precomputedStoryZip: sfZip(), aiProvider: 'anthropic', aiApiKey: 'sk-x', aiModel: 'claude-sonnet-4-6' }),
    );
    expect(on.html).toContain('"provider":"anthropic"');
    expect(on.html).toContain('"apiKey":"sk-x"');
    expect(on.html).toContain('"model":"claude-sonnet-4-6"');
  });

  it('builds a web-speech TTS config distinctly from a keyed provider', async () => {
    const web = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip(), ttsProvider: 'web-speech' }));
    expect(web.html).toContain('"provider":"web-speech"');

    const keyed = await exportAsHtml(
      'p1',
      baseOpts({ precomputedStoryZip: sfZip(), ttsProvider: 'openai', ttsApiKey: 'tk', ttsModel: 'tts-1' }),
    );
    expect(keyed.html).toContain('"provider":"openai"');
    expect(keyed.html).toContain('"apiKey":"tk"');
  });

  it('honors the ttsEnabled flag (defaults true)', async () => {
    const def = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip(), ttsProvider: 'web-speech' }));
    expect(def.html).toContain('"enabled":true');
    const off = await exportAsHtml(
      'p1',
      baseOpts({ precomputedStoryZip: sfZip(), ttsProvider: 'web-speech', ttsEnabled: false }),
    );
    expect(off.html).toContain('"enabled":false');
  });

  it('reads mobile scaling settings from the project (with defaults)', async () => {
    const def = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(def.html).not.toContain('{{MOBILE_SCALING_MODE}}');
    expect(def.html).not.toContain('{{MOBILE_FONT_SCALE}}');

    mockProject(makeProject({ globalSettings: { project: { mobileScalingMode: 'fixed', mobileFontScale: 1.5 } } }));
    const custom = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(custom.html).toContain('fixed');
    expect(custom.html).toContain('1.5');
  });

  it('falls back to "ASAPS Creator" author and "ASAPS Story" title when unset', async () => {
    mockProject(makeProject({ name: undefined, story: {}, globalSettings: {} }));
    const res = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(res.html).toContain('ASAPS Story');
    expect(res.html).toContain('ASAPS Creator');
  });

  it('prefers globalSettings.author when story metadata has none', async () => {
    mockProject(makeProject({ story: {}, globalSettings: { author: 'Grace' } }));
    const res = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(res.html).toContain('Grace');
  });

  it('emits the fallback player script when the bundle fetch fails', async () => {
    const res = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(res.html).toContain('Player Bundle Missing');
  });

  it('inlines the player bundle as base64 when the fetch succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'PLAYER_BUNDLE' }));
    const res = await exportAsHtml('p1', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(res.html).toContain('data:text/javascript;base64,');
    expect(res.html).toContain('data:text/css;base64,');
    expect(res.html).not.toContain('Player Bundle Missing');
  });
});

describe('relay mode (hide the API key)', () => {
  it('embeds proxyUrl and NO key when aiProxyUrl is set', async () => {
    const res = await exportAsHtml(
      'p1',
      baseOpts({
        precomputedStoryZip: sfZip(),
        aiProvider: 'anthropic',
        aiApiKey: 'sk-should-never-ship',
        aiProxyUrl: '/.netlify/functions/asaps-ai',
      }),
    );
    expect(res.html).toContain('"proxyUrl":"/.netlify/functions/asaps-ai"');
    expect(res.html).toContain('"provider":"anthropic"');
    // The whole point: the key must not appear anywhere in the page.
    expect(res.html).not.toContain('sk-should-never-ship');
  });

  it('the on-page AI translation template carries the relay branch', async () => {
    // callAI lives in the translations/on-the-fly export flavor; pin the
    // template source so the relay branch (and the no-key contract) can't
    // silently vanish from it.
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(join(__dirname, '../HtmlExporter.ts'), 'utf-8');
    expect(src).toContain('if (config.proxyUrl) {');
    expect(src).toContain("provider: config.provider === 'anthropic' ? 'anthropic' : 'openai'");
  });

  it('folder export bundles the relay function + README when relay mode is on', async () => {
    const res = await exportAsHtml(
      'p1',
      baseOpts({
        mode: 'folder',
        precomputedStoryZip: folderZip(),
        aiProvider: 'openai',
        aiProxyUrl: '/.netlify/functions/asaps-ai',
      }),
    );
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(res.zip!);
    expect(zip.file('netlify/functions/asaps-ai.mjs'), 'relay function missing').toBeTruthy();
    expect(zip.file('netlify.toml'), 'netlify.toml missing (CLI deploys need it explicit)').toBeTruthy();
    expect(zip.file('README-RELAY.md'), 'relay README missing').toBeTruthy();
    const readme = await zip.file('README-RELAY.md')!.async('string');
    // Drop can't deploy functions — the README must warn and offer the
    // no-terminal GitHub path, the CLI path, and the shared-relay path.
    expect(readme).toContain('does NOT deploy the relay function');
    expect(readme).toContain('Path A — all in the browser');
    expect(readme).toContain('netlify-cli deploy --prod');
    expect(readme).toContain('ALLOWED_ORIGINS');
    const fn = await zip.file('netlify/functions/asaps-ai.mjs')!.async('string');
    // Fixed upstreams + env-var keys are the security posture — pin them.
    expect(fn).toContain("anthropic: 'https://api.anthropic.com/v1/messages'");
    expect(fn).toContain("openai: 'https://api.openai.com/v1/chat/completions'");
    expect(fn).toContain('ANTHROPIC_API_KEY');
    expect(fn).toContain('OPENAI_API_KEY');
    // CORS is opt-in via ALLOWED_ORIGINS: unset ⇒ no CORS headers emitted
    // (same-origin only); set ⇒ only listed origins (exact or *.suffix).
    expect(fn).toContain('ALLOWED_ORIGINS');
    expect(fn).toContain("if (!raw || !origin) return null");
    expect(fn).toContain('access-control-allow-origin');
  });

  it('folder export omits the relay kit when relay mode is off', async () => {
    const res = await exportAsHtml(
      'p1',
      baseOpts({ mode: 'folder', precomputedStoryZip: folderZip(), aiProvider: 'openai', aiApiKey: 'sk-x' }),
    );
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(res.zip!);
    expect(zip.file('netlify/functions/asaps-ai.mjs')).toBeNull();
  });
});

describe('exportAsHtml — folder', () => {
  it('returns a non-empty zip blob in folder mode', async () => {
    const res = await exportAsHtml('p1', baseOpts({ mode: 'folder', precomputedStoryZip: folderZip() }));
    expect(res.mode).toBe('folder');
    expect(res.zip).toBeDefined();
    expect(res.zip!.size).toBeGreaterThan(0);
    expect(res.html).toBeUndefined();
  });
});

describe('exportAsHtml — errors & zip sourcing', () => {
  it('throws when the project is not found', async () => {
    (getStorageManager as any).mockReturnValue({
      getProject: vi.fn().mockResolvedValue({ success: false }),
    });
    await expect(exportAsHtml('ghost', baseOpts({ precomputedStoryZip: sfZip() }))).rejects.toThrow(/not found/i);
  });

  it('builds the story zip via the zip manager when none is precomputed', async () => {
    (exportProjectAsZip as any).mockResolvedValue(sfZip());
    await exportAsHtml('p1', baseOpts({ startBeatId: 'beat_3' }));
    expect(exportProjectAsZip).toHaveBeenCalledWith('p1', { overrideFirstBeatId: 'beat_3' });
  });
});

describe('previewStoryZip', () => {
  it('delegates to the zip manager, forwarding the startBeatId override', async () => {
    const blob = folderZip();
    (exportProjectAsZip as any).mockResolvedValue(blob);
    const out = await previewStoryZip('p1', 'beat_9');
    expect(out).toBe(blob);
    expect(exportProjectAsZip).toHaveBeenCalledWith('p1', { overrideFirstBeatId: 'beat_9' });
  });

  it('passes undefined options when no startBeatId is given', async () => {
    (exportProjectAsZip as any).mockResolvedValue(folderZip());
    await previewStoryZip('p1');
    expect(exportProjectAsZip).toHaveBeenCalledWith('p1', undefined);
  });
});

describe('downloadHtmlExport (standard path)', () => {
  let anchors: HTMLAnchorElement[];

  beforeEach(() => {
    anchors = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const el = REAL_CREATE_ELEMENT(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('downloads a single .html file with a sanitized filename', async () => {
    await downloadHtmlExport('p1', 'My Story: Episode 1!', baseOpts({ precomputedStoryZip: sfZip() }));
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe('My_Story__Episode_1_.html');
  });

  it('downloads a _html.zip in folder mode', async () => {
    await downloadHtmlExport('p1', 'Demo', baseOpts({ mode: 'folder', precomputedStoryZip: folderZip() }));
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe('Demo_html.zip');
  });
});
