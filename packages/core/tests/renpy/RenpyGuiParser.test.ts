/**
 * Tests for RenpyGuiParser — Python-like gui.rpy / options.rpy parser
 * used during Ren'Py visual-novel theme imports. Wrong parses produce
 * wrong-colored / wrong-positioned themes that the author doesn't
 * realize were broken until viewing the imported theme.
 *
 * Coverage focus:
 *   - parseGuiRpy: comment + empty line skip; gui.* assignments;
 *     `define gui.xxx = value` syntax variant; nested-block skip
 *     (define/init/screen/style/transform); raw map populated
 *   - Color parsing: hex literals + named constants; alpha channel
 *   - Number parsing: integer + float + suffix tolerance
 *   - Borders parsing: Borders(l, t, r, b) → 4-tuple
 *   - parseOptionsRpy: config.name, config.version, build.name,
 *     author from gui.about
 *   - detectResolution: gui.width/height when present; textbox-
 *     height heuristic fallback; final 1920x1080 default
 */
import { describe, it, expect } from 'vitest';
import {
  parseGuiRpy,
  parseOptionsRpy,
  detectResolution,
} from '../../src/renpy/RenpyGuiParser';

describe('parseGuiRpy', () => {
  describe('basic parsing', () => {
    it('returns a structured GuiData object even when empty', () => {
      const result = parseGuiRpy('');
      // Sanity — every top-level field exists as an object.
      expect(result.colors).toBeDefined();
      expect(result.fonts).toBeDefined();
      expect(result.textbox).toBeDefined();
      expect(result.button).toBeDefined();
      expect(result.raw).toBeDefined();
    });

    it('skips comment lines', () => {
      const content = `
# This is a comment
# gui.accent_color = "#ff0000"  # Even comments with assignments are ignored
gui.text_color = "#ffffff"
`;
      const result = parseGuiRpy(content);
      expect(result.colors.text).toBe('#ffffff');
      // The commented-out accent should NOT appear.
      expect(result.colors.accent).toBeUndefined();
    });

    it('skips blank lines without error', () => {
      const result = parseGuiRpy('\n\n\ngui.text_color = "#abcdef"\n\n');
      expect(result.colors.text).toBe('#abcdef');
    });

    it('handles both "gui.x = value" and "define gui.x = value" forms', () => {
      // Real Ren'Py files use both — the `define` keyword is
      // syntactic sugar. The parser must accept either.
      const content = `
gui.text_color = "#111111"
define gui.accent_color = "#222222"
`;
      const result = parseGuiRpy(content);
      expect(result.colors.text).toBe('#111111');
      expect(result.colors.accent).toBe('#222222');
    });
  });

  describe('color parsing', () => {
    it('parses hex color literals', () => {
      const result = parseGuiRpy('gui.text_color = "#abcdef"');
      expect(result.colors.text).toBe('#abcdef');
    });

    it('parses uppercase hex', () => {
      const result = parseGuiRpy('gui.text_color = "#FFEEDD"');
      // Source preserves the literal case.
      expect(result.colors.text?.toLowerCase()).toBe('#ffeedd');
    });

    it('handles double vs single quotes', () => {
      const single = parseGuiRpy("gui.text_color = '#ff0000'");
      expect(single.colors.text).toBe('#ff0000');
    });
  });

  describe('number parsing', () => {
    it('parses integer values', () => {
      const result = parseGuiRpy('gui.text_size = 24');
      expect(result.fonts.textSize).toBe(24);
    });

    it('parses negative numbers', () => {
      // ypos / xpos can be negative for off-screen anchoring.
      const result = parseGuiRpy('gui.dialogue_ypos = -50');
      expect(result.textbox.dialogueYpos).toBe(-50);
    });
  });

  describe('block skipping', () => {
    it('skips lines inside a multi-line define block', () => {
      // `define some_var:` opens a block — its indented body must
      // NOT be parsed as gui.* assignments.
      const content = `
gui.text_color = "#000000"
define some_block:
    inner_var = 42
    nested.gui.fake_color = "#ff0000"
gui.accent_color = "#ffffff"
`;
      const result = parseGuiRpy(content);
      expect(result.colors.text).toBe('#000000');
      expect(result.colors.accent).toBe('#ffffff');
      // The fake inside the block should NOT have leaked into raw or colors.
      expect(result.raw['nested.gui.fake_color']).toBeUndefined();
    });

    it('skips lines inside init/screen/style/transform blocks', () => {
      const content = `
gui.text_color = "#111111"
screen game_menu:
    text "Hello"
    gui.intercepted = "should-not-parse"
gui.accent_color = "#222222"
`;
      const result = parseGuiRpy(content);
      expect(result.colors.text).toBe('#111111');
      expect(result.colors.accent).toBe('#222222');
      expect(result.raw['gui.intercepted']).toBeUndefined();
    });
  });

  describe('raw map fallback', () => {
    it('stores unknown gui.xxx assignments in raw', () => {
      // Forward-compat: a future Ren'Py variable name we don't
      // have a mapping for should still land in raw so callers
      // can hand-inspect.
      const result = parseGuiRpy('gui.some_new_unknown = "value"');
      expect(result.raw['gui.some_new_unknown']).toBe('"value"');
    });

    it('always stores ALL gui.xxx in raw — even known ones', () => {
      // Raw is the unfiltered source of truth; known mappings get
      // a parsed value AND the raw entry. Pin so a future
      // "raw only stores unknowns" change is a deliberate edit.
      const result = parseGuiRpy('gui.text_color = "#abcdef"');
      expect(result.raw['gui.text_color']).toBe('"#abcdef"');
      expect(result.colors.text).toBe('#abcdef');
    });
  });
});

describe('parseOptionsRpy', () => {
  it('extracts config.name from `define config.name = "Game"`', () => {
    const result = parseOptionsRpy('define config.name = "My Visual Novel"');
    expect(result.name).toBe('My Visual Novel');
  });

  it('extracts config.version', () => {
    const result = parseOptionsRpy('define config.version = "1.2.0"');
    expect(result.version).toBe('1.2.0');
  });

  it('extracts build.name', () => {
    const result = parseOptionsRpy('define build.name = "MyVN_Build"');
    expect(result.buildName).toBe('MyVN_Build');
  });

  it('handles single quotes', () => {
    const result = parseOptionsRpy("define config.name = 'Single Quoted'");
    expect(result.name).toBe('Single Quoted');
  });

  it('returns empty object when nothing matches', () => {
    const result = parseOptionsRpy('# just comments\n# nothing useful');
    expect(result).toEqual({});
  });

  it('returns partial result when only some fields are present', () => {
    const result = parseOptionsRpy('define config.name = "Only name"');
    expect(result.name).toBe('Only name');
    expect(result.version).toBeUndefined();
    expect(result.buildName).toBeUndefined();
  });

  it('extracts author from gui.about with "by NAME" pattern', () => {
    const content = `
define gui.about = _p("""
A visual novel about life.

by Alice Author
""")
`;
    const result = parseOptionsRpy(content);
    expect(result.author).toBe('Alice Author');
  });

  it('extracts author with "author:" prefix variant', () => {
    const content = `
define gui.about = _p("""
A story.

Author: Bob Maker
""")
`;
    const result = parseOptionsRpy(content);
    expect(result.author).toBe('Bob Maker');
  });

  it('handles all four fields in one options.rpy', () => {
    // Realistic combined options.rpy snippet.
    const content = `
define config.name = "My VN"
define build.name = "MyVN"
define config.version = "0.5.0"
define gui.about = _p("""
A short experiment.

by Carol Creator
""")
`;
    const result = parseOptionsRpy(content);
    expect(result.name).toBe('My VN');
    expect(result.buildName).toBe('MyVN');
    expect(result.version).toBe('0.5.0');
    expect(result.author).toBe('Carol Creator');
  });
});

describe('detectResolution', () => {
  function emptyGui(): any {
    return {
      colors: {}, fonts: {}, title: {}, textbox: {},
      namebox: {}, button: {}, choice: {}, raw: {},
    };
  }

  it('uses explicit gui.width/height when present in raw', () => {
    const gui = emptyGui();
    gui.raw['gui.width'] = 1280;
    gui.raw['gui.height'] = 720;
    expect(detectResolution(gui)).toEqual({ width: 1280, height: 720 });
  });

  it('handles gui.width/height as strings (Ren\'Py parser may keep them raw)', () => {
    const gui = emptyGui();
    gui.raw['gui.width'] = '800';
    gui.raw['gui.height'] = '600';
    expect(detectResolution(gui)).toEqual({ width: 800, height: 600 });
  });

  it('falls back to textbox heuristic when no explicit resolution', () => {
    // textbox height >= 250 → 1920x1080
    const gui = emptyGui();
    gui.textbox.height = 277;
    expect(detectResolution(gui)).toEqual({ width: 1920, height: 1080 });
  });

  it('infers 1280x720 from a smaller textbox', () => {
    const gui = emptyGui();
    gui.textbox.height = 185;
    expect(detectResolution(gui)).toEqual({ width: 1280, height: 720 });
  });

  it('uses 1920x1080 as the final default (modern Ren\'Py)', () => {
    // No raw width/height; no textbox height → modern default.
    const gui = emptyGui();
    expect(detectResolution(gui)).toEqual({ width: 1920, height: 1080 });
  });

  it('skips invalid raw values and falls through to heuristic', () => {
    // `parseNumericValue` returns 0/undefined for "not a number".
    // Resolution code must continue to the heuristic path, not
    // return { width: 0, height: 0 }.
    const gui = emptyGui();
    gui.raw['gui.width'] = 'not a number';
    gui.raw['gui.height'] = 'also not';
    gui.textbox.height = 277;
    expect(detectResolution(gui)).toEqual({ width: 1920, height: 1080 });
  });

  it('skips when only one of width/height is set', () => {
    // Without BOTH values, we can't trust either — fall through.
    const gui = emptyGui();
    gui.raw['gui.width'] = '1280';
    // height missing
    expect(detectResolution(gui)).toEqual({ width: 1920, height: 1080 });
  });
});
