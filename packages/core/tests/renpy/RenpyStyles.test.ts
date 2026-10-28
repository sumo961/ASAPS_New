/**
 * Ren'Py themes that don't keep everything in gui.rpy (2026-10-28):
 * Scribbler UI defines its fonts with gui.preference(...) in styles.rpy,
 * colours only in styles, and its textbox.png is a full-screen picture;
 * Astrology UI writes `"fonts/Times.ttf" #"DejaVuSans.ttf"`.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseGuiRpy, parseRpySources, parseRpyStyles } from '../../src/renpy/RenpyGuiParser';
import { extractRenpyAssets, readPngSize } from '../../src/renpy/RenpyAssetExtractor';
import { convertRenpyToTheme } from '../../src/renpy/RenpyThemeConverter';

/** A PNG header saying width × height (the extractor never decodes more). */
function pngOf(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

async function zipOf(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return (await zip.generateAsync({ type: 'uint8array' })) as unknown as Blob;
}

const SCRIBBLER_STYLES = `
init python:
    gui.init(1920, 1080)

define gui.text_font = gui.preference("font", "MonaspaceNeon-Regular.otf")
define gui.interface_text_font = gui.preference("interface_font", "MonaspaceNeon-Regular.otf")
define gui.text_size = gui.preference("size", 33)

style default:
    font gui.text_font
    size gui.text_size

style gui_text:
    color '#00B1E1'
    font gui.interface_text_font

style button_text:
    is gui_text
    font "MonaspaceNeon-Regular.otf"
    selected_color '#D26143'
    idle_color "#00B1E1"
    insensitive_color "#778288"
    hover_color "#E99067"

style label_text:
    is gui_text
    color '#D26143'
`;

const SCRIBBLER_SAY = `
screen say(who, what):
    add "gui/textbox.png"
    window:
        id "window"
        text what id "what"

style say_dialogue:
    ypos 50
    color "#D26143"
    outlines [ (absolute(2), "#ffffffff", 0, 0) ]
    font "MonaspaceNeon-Regular.otf"
`;

describe('gui defines the parser used to miss', () => {
  it('reads gui.preference(...) defaults, trailing comments and gui.* references', () => {
    const data = parseGuiRpy(`
define gui.text_font = gui.preference("font", "MonaspaceNeon-Regular.otf")
define gui.interface_text_font = "fonts/Times.ttf" #"DejaVuSans.ttf"
define gui.button_text_font = gui.interface_text_font
define gui.text_size = gui.preference("size", 33)
`);
    expect(data.fonts.textFont).toBe('MonaspaceNeon-Regular.otf');
    expect(data.fonts.interfaceFont).toBe('fonts/Times.ttf');
    expect(data.button.textFont).toBe('fonts/Times.ttf');
    expect(data.fonts.textSize).toBe(33);
  });

  it('reads the screen size from gui.init inside init python', () => {
    const data = parseGuiRpy('init python:\n    gui.init(1280, 720)\n');
    expect(data.raw['gui.width']).toBe('1280');
    expect(data.raw['gui.height']).toBe('720');
  });
});

describe('styles', () => {
  it('collects plain properties of style blocks', () => {
    const styles = parseRpyStyles(SCRIBBLER_SAY);
    expect(styles.say_dialogue.color).toBe('"#D26143"');
    expect(styles.say_dialogue.font).toBe('"MonaspaceNeon-Regular.otf"');
  });

  it('dialogue colour and font, button colours and the label accent come from the styles', () => {
    const data = parseRpySources([
      { path: 'game/styles.rpy', content: SCRIBBLER_STYLES },
      { path: 'game/screens/dialogue_screens.rpy', content: SCRIBBLER_SAY },
    ]);
    expect(data.colors.text).toBe('#d26143');
    expect(data.fonts.textFont).toBe('MonaspaceNeon-Regular.otf');
    expect(data.button.textIdleColor).toBe('#00b1e1');
    expect(data.button.textHoverColor).toBe('#e99067');
    expect(data.button.textInsensitiveColor).toBe('#778288');
    expect(data.colors.accent).toBe('#d26143');
  });

  it('gui.rpy wins over defines elsewhere, and its accent over the label colour', () => {
    const data = parseRpySources([
      { path: 'game/gui.rpy', content: 'define gui.accent_color = "#112233"\ndefine gui.text_font = "A.ttf"\n' },
      { path: 'game/styles.rpy', content: 'define gui.text_font = "B.ttf"\nstyle label_text:\n    color "#d26143"\n' },
    ]);
    expect(data.fonts.textFont).toBe('A.ttf');
    expect(data.colors.accent).toBe('#112233');
  });
});

describe('a full-screen textbox.png', () => {
  it('reads PNG sizes from the header', async () => {
    expect(await readPngSize(new Blob([pngOf(1920, 310)]))).toEqual({ width: 1920, height: 310 });
    expect(await readPngSize(new Blob([new Uint8Array([1, 2, 3])]))).toBeUndefined();
  });

  it('is not used as the text-box frame, and the import says so', async () => {
    const bundle = await extractRenpyAssets(await zipOf({
      'game/styles.rpy': SCRIBBLER_STYLES,
      'game/screens/dialogue_screens.rpy': SCRIBBLER_SAY,
      'game/screens/choice_screen.rpy': 'style choice_button_text:\n    is default\n    idle_color "#008DBF"\n    hover_color "#E99067"\n',
      'game/gui/textbox.png': pngOf(1920, 1080),
      'game/gui/namebox.png': pngOf(300, 60),
      'game/fonts/RandoSharpie.ttf': new Uint8Array([0, 1, 0, 0]),
      'game/fonts/MonaspaceNeon-Regular.otf': new Uint8Array([0, 1, 0, 0]),
    }));
    expect(bundle.uiGraphics.find((g) => g.filename === 'textbox.png')?.role).toBe('screen-overlay');
    expect(bundle.notices?.[0]).toMatch(/textbox\.png is a full-screen picture \(1920×1080\)/);

    const { theme } = convertRenpyToTheme(bundle, { themeName: 'Scribbler' });
    expect(theme.textBox.frameAssetId).toBeUndefined();       // neither the overlay nor the namebox
    expect(theme.fonts.body.family).toBe('Monaspace Neon Regular');
    expect(theme.fonts.title.family).toBe('Monaspace Neon Regular');
    expect(theme.colors.primary.hex).toBe('#d26143');
    expect(theme.colors.accent.hex).toBe('#d26143');
    expect(theme.colors.buttonText.hex).toBe('#008dbf');   // the choice text, not the menu buttons'
  });

  it('a frame-sized textbox.png stays the frame', async () => {
    const bundle = await extractRenpyAssets(await zipOf({
      'game/gui.rpy': 'define gui.text_font = "A.ttf"\n',
      'game/gui/textbox.png': pngOf(1920, 310),
    }));
    expect(bundle.uiGraphics[0].role).toBe('textbox');
    expect(bundle.notices).toBeUndefined();
    const { theme, graphicAssets } = convertRenpyToTheme(bundle, { themeName: 'Kit' });
    expect(theme.textBox.frameAssetId).toBe(graphicAssets[0].id);
  });
});

describe('picture packs (no .rpy, pictures in their own folders)', () => {
  it('names text boxes the way packs do, but not the quick-menu buttons on them', async () => {
    const { isTextboxName } = await import('../../src/renpy/RenpyAssetExtractor');
    expect(isTextboxName('Text & Name Box.png')).toBe(true);
    expect(isTextboxName('textbox_1.png')).toBe(true);
    expect(isTextboxName('textbox.png')).toBe(true);
    expect(isTextboxName('textbox_save_button.png')).toBe(false);
    expect(isTextboxName('textbox_menu.png')).toBe(false);
  });

  it('a pack with a frame and choice pictures is a theme (Night Sky)', async () => {
    const { validateRenpyZip } = await import('../../src/renpy/RenpyAssetExtractor');
    const zip = await zipOf({
      'Night Sky/Text & Name Box.png': pngOf(1157, 351),
      'Night Sky/Button/choice_idle_background.png': pngOf(1185, 52),
      'Night Sky/Button/choice_hover_background.png': pngOf(1185, 52),
      'Night Sky/Custom Cursors/Moon V1.png': pngOf(32, 32),
    });
    expect((await validateRenpyZip(zip)).valid).toBe(true);
    const bundle = await extractRenpyAssets(zip);
    expect(bundle.nothingUsable).toBeUndefined();
    const { theme, graphicAssets } = convertRenpyToTheme(bundle, { themeName: 'Night Sky' });
    const frame = graphicAssets.find((g) => g.id === theme.textBox.frameAssetId);
    expect(frame?.asset.filename).toBe('Text & Name Box.png');
  });

  it('a pack with nothing ASAPS can use says so (Blue Bubble)', async () => {
    const { validateRenpyZip } = await import('../../src/renpy/RenpyAssetExtractor');
    const zip = await zipOf({
      'Blue Bubble GUI/TextBox/textbox_1.png': pngOf(1920, 1080),
      'Blue Bubble GUI/TextBox/textbox_save_button.png': pngOf(80, 40),
      'Blue Bubble GUI/TextBox/namebox.png': pngOf(288, 87),
      'Blue Bubble GUI/Main Menu/mm_button_start.png': pngOf(300, 80),
      'Blue Bubble GUI/README.txt': 'The font used in this GUI is "Quicksand"',
    });
    expect((await validateRenpyZip(zip)).valid).toBe(true);
    const bundle = await extractRenpyAssets(zip);
    expect(bundle.nothingUsable).toMatch(/none ASAPS can use.*full-screen picture.*choice-button pictures/);
  });
});
