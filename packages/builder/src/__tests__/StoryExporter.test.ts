/**
 * Tests for StoryExporter — story export to a single ASML XML string and to a
 * zip with a foldered asset layout. Uses a real @asaps/core Story + beat.
 * getFileExtension is the pure mime/type→ext mapping; exportAsZip's value is
 * the asset-folder routing (image-bg→nodes, character→characters, prop→props,
 * audio→audio, font→fonts) — we reload the produced zip via blob.arrayBuffer()
 * (NOT FileReader, which the builder setup mocks to a fixed buffer).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { StoryExporter } from '../StoryExporter';
import { Story, BeatTypeRegistry } from '@asaps/core';

// jsdom's Blob has no arrayBuffer(), and the builder setup mocks FileReader to
// a fixed buffer — so we can't reload the produced zip blob. Instead, capture
// the in-memory JSZip instance right before it serializes (full-path registry).
let capturedZip: any = null;
const origGenerate = JSZip.prototype.generateAsync;
afterEach(() => {
  capturedZip = null;
  vi.restoreAllMocks();
});
function captureZip() {
  vi.spyOn(JSZip.prototype, 'generateAsync').mockImplementation(function (this: any, ...args: any[]) {
    capturedZip = this;
    return origGenerate.apply(this, args);
  });
}

const makeStory = () => {
  const story = new Story({ title: 'My Title', author: 'Ada', firstBeatId: 'start' });
  const beat = BeatTypeRegistry.getInstance().createBeat('titleScreen', {
    id: 'start',
    name: 'Start',
    type: 'titleScreen',
    parameters: { title: 'My Title' },
    connections: [],
  });
  story.addBeat(beat);
  return story;
};

const asset = (over: any) => ({
  id: over.id,
  name: over.name,
  type: over.type,
  subType: over.subType,
  url: over.url ?? `blob:${over.id}`,
  file: new Blob(['data'], { type: over.mime ?? 'application/octet-stream' }),
});

describe('StoryExporter.getFileExtension', () => {
  const ext = (t: string, m: string) => (StoryExporter as any).getFileExtension(t, m);

  it('maps known MIME types', () => {
    expect(ext('image', 'image/png')).toBe('png');
    expect(ext('image', 'image/jpeg')).toBe('jpg');
    expect(ext('audio', 'audio/mpeg')).toBe('mp3');
    expect(ext('font', 'font/woff2')).toBe('woff2');
    expect(ext('video', 'video/quicktime')).toBe('mov');
  });

  it('falls back by asset type for unknown MIME, then to bin', () => {
    expect(ext('image', 'application/x-weird')).toBe('png');
    expect(ext('audio', '')).toBe('mp3');
    expect(ext('font', '')).toBe('ttf');
    expect(ext('mystery', 'application/x-weird')).toBe('bin');
  });
});

describe('StoryExporter.exportAsXML', () => {
  it('produces an ASML XML string carrying the story metadata', () => {
    const xml = StoryExporter.exportAsXML(makeStory(), [], []);
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);
    expect(xml).toContain('<');
    expect(xml).toContain('My Title');
  });
});

describe('StoryExporter.exportAsZip', () => {
  it('routes assets into type-specific folders and writes story.xml', async () => {
    const assets = [
      asset({ id: 'bg', name: 'bg.png', type: 'image', subType: 'background', mime: 'image/png' }),
      asset({ id: 'hero', name: 'hero.png', type: 'image', subType: 'character', mime: 'image/png' }),
      asset({ id: 'box', name: 'box.png', type: 'image', subType: 'prop', mime: 'image/png' }),
      asset({ id: 'theme', name: 'theme.mp3', type: 'audio', subType: undefined, mime: 'audio/mpeg' }),
      asset({ id: 'font', name: 'font.ttf', type: 'font', subType: undefined, mime: 'font/ttf' }),
    ];

    captureZip();
    const blob = await StoryExporter.exportAsZip(makeStory(), assets, [], 'My Title');
    expect(blob).toBeInstanceOf(Blob);

    const paths = Object.keys(capturedZip.files);
    expect(paths).toContain('my_title/story.xml');
    expect(paths.some((p) => p.startsWith('my_title/assets/nodes/'))).toBe(true); // background
    expect(paths.some((p) => p.startsWith('my_title/assets/characters/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('my_title/assets/props/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('my_title/assets/audio/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('my_title/assets/fonts/'))).toBe(true);

    const xml = await capturedZip.file('my_title/story.xml')!.async('string');
    expect(xml).toContain('My Title');
  });

  it('sanitizes the story folder name', async () => {
    captureZip();
    await StoryExporter.exportAsZip(makeStory(), [], [], 'Wild/Name?! 2');
    // every non-alphanumeric run becomes underscores, lowercased
    expect(Object.keys(capturedZip.files).some((p) => /^wild_name_+2\//.test(p))).toBe(true);
  });
});
