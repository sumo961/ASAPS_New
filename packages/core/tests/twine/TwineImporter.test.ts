/**
 * General TwineImporter coverage — complements TwineImporter.harlowe.test.ts
 * (which focuses on Harlowe macros). This file covers the SugarCube path, the
 * static validate()/preview() helpers, format detection, metadata extraction,
 * import options, the JavaScript warning, and counter-vs-variable inference.
 */
import { describe, it, expect } from 'vitest';
import { TwineImporter } from '../../src/twine/TwineImporter';

// A SugarCube archive with: a StoryTitle/StoryAuthor override, a StoryInit
// with a numeric and a boolean set (counter vs variable), a two-link hub
// (→ choice), and an ending-tagged passage.
const sugarCubeHtml = `<!DOCTYPE html><html><body>
<tw-storydata name="Storydata Name" startnode="1" creator="Twine" creator-version="2.9" format="SugarCube" format-version="2.36.1" ifid="sc-uuid">
<tw-passagedata pid="1" name="Start" tags="" position="100,100">You wake in a cell.
[[Look around|Hub]]</tw-passagedata>
<tw-passagedata pid="2" name="Hub" tags="" position="200,100">Two exits.
[[North door|Door]]
[[South pit|End]]</tw-passagedata>
<tw-passagedata pid="3" name="Door" tags="" position="300,100">A corridor.
[[Continue|End]]</tw-passagedata>
<tw-passagedata pid="4" name="End" tags="ending" position="400,100">Freedom. THE END</tw-passagedata>
<tw-passagedata pid="5" name="StoryInit" tags="" position="0,0">&lt;&lt;set $score to 5&gt;&gt;
&lt;&lt;set $hasKey to true&gt;&gt;</tw-passagedata>
<tw-passagedata pid="6" name="StoryTitle" tags="" position="0,50">The Real Title</tw-passagedata>
<tw-passagedata pid="7" name="StoryAuthor" tags="" position="0,100">Jane Doe</tw-passagedata>
</tw-storydata>
</body></html>`;

// A minimal SugarCube archive with NO StoryInit (so the first beat is the
// start passage, not an init beat).
const simpleHtml = `<!DOCTYPE html><html><body>
<tw-storydata name="Simple" startnode="1" format="SugarCube" ifid="x">
<tw-passagedata pid="1" name="Begin" tags="" position="0,0">Hello.
[[Next|Finish]]</tw-passagedata>
<tw-passagedata pid="2" name="Finish" tags="ending" position="100,0">Bye.</tw-passagedata>
</tw-storydata>
</body></html>`;

describe('TwineImporter.validate', () => {
  it('accepts a well-formed archive', () => {
    const res = TwineImporter.validate(sugarCubeHtml);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('rejects html with no tw-storydata element', () => {
    const res = TwineImporter.validate('<html><body>not twine</body></html>');
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/Missing tw-storydata/);
  });

  it('flags an archive with no passages', () => {
    const res = TwineImporter.validate(
      '<tw-storydata name="Empty" startnode="1"></tw-storydata>',
    );
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/No passages/);
  });

  it('flags a startnode that references no passage', () => {
    const res = TwineImporter.validate(
      '<tw-storydata name="Bad" startnode="99"><tw-passagedata pid="1" name="A">x</tw-passagedata></tw-storydata>',
    );
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/Start node.*99/);
  });
});

describe('TwineImporter.preview (no beats created)', () => {
  it('detects the SugarCube format and surfaces metadata + analysis', () => {
    const p = TwineImporter.preview(sugarCubeHtml);
    expect(p.format).toBe('sugarcube');
    expect(p.title).toBe('The Real Title');
    expect(p.author).toBe('Jane Doe');
    // analysis covers the regular (non-special) passages: Start, Hub, Door, End
    expect(p.analysis.passages.length).toBe(4);
    // preview returns the parsed story without building beats
    expect(p.story.passages.length).toBeGreaterThan(0);
    expect((p as any).beats).toBeUndefined();
  });

  it('detects Harlowe via the format attribute', () => {
    const html =
      '<tw-storydata name="H" startnode="1" format="Harlowe"><tw-passagedata pid="1" name="A">hi</tw-passagedata></tw-storydata>';
    expect(TwineImporter.preview(html).format).toBe('harlowe');
  });

  it("reports 'unknown' for an unrecognized format", () => {
    const html =
      '<tw-storydata name="U" startnode="1" format="Snowman"><tw-passagedata pid="1" name="A">hi</tw-passagedata></tw-storydata>';
    expect(TwineImporter.preview(html).format).toBe('unknown');
  });
});

describe('TwineImporter.import — SugarCube', () => {
  it('extracts title and author from the special passages', () => {
    const r = new TwineImporter().import(sugarCubeHtml);
    expect(r.title).toBe('The Real Title');
    expect(r.author).toBe('Jane Doe');
  });

  it('creates a beat per regular passage and tags endings as endScreen', () => {
    const r = new TwineImporter().import(sugarCubeHtml);
    const byName = (n: string) => r.beats.find((b) => b.name === n);
    expect(byName('Start')).toBeDefined();
    expect(byName('Hub')).toBeDefined();
    expect(byName('Door')).toBeDefined();
    expect(byName('End')!.type).toBe('endScreen');
  });

  it('turns a two-link passage into a beat with two connections', () => {
    const r = new TwineImporter().import(sugarCubeHtml);
    const hub = r.beats.find((b) => b.name === 'Hub')!;
    const door = r.beats.find((b) => b.name === 'Door')!;
    const end = r.beats.find((b) => b.name === 'End')!;
    const targets = hub.connections.map((c) => c.targetId);
    expect(hub.connections.length).toBe(2);
    expect(targets).toEqual(expect.arrayContaining([door.id, end.id]));
  });

  it('infers counter vs variable for StoryInit sets', () => {
    const r = new TwineImporter().import(sugarCubeHtml);
    // Init beats are named `Init: <var>` (createStoryInitBeats).
    const score = r.beats.find((b) => b.name === 'Init: score')!;
    const hasKey = r.beats.find((b) => b.name === 'Init: hasKey')!;
    expect(score).toBeDefined();
    expect(hasKey).toBeDefined();
    // A numeric set → counter; a boolean set → variable. Values parse to the
    // real JS type (not strings).
    expect(score.getParameters()).toMatchObject({ type: 'counter', value: 5 });
    expect(hasKey.getParameters()).toMatchObject({ type: 'variable', value: true });
  });

  it('makes the first StoryInit beat the story start', () => {
    const r = new TwineImporter().import(sugarCubeHtml);
    const init = r.beats.filter((b) => b.name.startsWith('Init:'));
    expect(r.firstBeatId).toBe(init[0].id);
  });

  it('starts at the start passage when there is no StoryInit', () => {
    const r = new TwineImporter().import(simpleHtml);
    const begin = r.beats.find((b) => b.name === 'Begin')!;
    expect(r.firstBeatId).toBe(begin.id);
  });

  it('leaves no orphan beats (every non-first beat is reachable)', () => {
    const r = new TwineImporter().import(sugarCubeHtml);
    const reachable = new Set<string>([r.firstBeatId]);
    for (const b of r.beats) {
      for (const c of b.connections) if (c.targetId) reachable.add(c.targetId);
      if (b.defaultTarget) reachable.add(b.defaultTarget);
    }
    const orphans = r.beats.filter((b) => !reachable.has(b.id));
    expect(orphans).toEqual([]);
  });
});

describe('TwineImporter — options & warnings', () => {
  it('honors a custom idPrefix', () => {
    const r = new TwineImporter({ idPrefix: 'tw_' }).import(simpleHtml);
    expect(r.beats.length).toBeGreaterThan(0);
    expect(r.beats.every((b) => b.id.startsWith('tw_'))).toBe(true);
  });

  it('warns when the story carries JavaScript', () => {
    const withJs = sugarCubeHtml.replace(
      '</tw-storydata>',
      '<script type="text/twine-javascript">window.x = 1;</script></tw-storydata>',
    );
    const r = new TwineImporter().import(withJs);
    expect(r.warnings.join(' ')).toMatch(/JavaScript/);
  });

  it('returns analysis stats alongside the beats', () => {
    const r = new TwineImporter().import(sugarCubeHtml);
    expect(r.stats).toBeDefined();
    expect(typeof r.stats).toBe('object');
  });
});
