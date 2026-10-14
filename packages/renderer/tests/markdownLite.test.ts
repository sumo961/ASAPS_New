/**
 * markdown-lite — the formatting contract for player-facing prose.
 *
 * The subset is deliberately small: **bold**, *italic*, ~~strikethrough~~,
 * and line breaks. It applies to body text, titles, and chat bubbles; button
 * labels and hyperText bodies stay plain (labels are UI, and the hyperlink
 * splitter matches literal words). These tests pin the syntax so the toolbar,
 * the User Guide, and the renderer stay in agreement about what formats.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdownLite, markdownLiteToPlain } from '../src/utils/markdownLite';

describe('renderMarkdownLite', () => {
  it('formats the documented subset', () => {
    expect(renderMarkdownLite('**bold**')).toBe('<strong>bold</strong>');
    expect(renderMarkdownLite('__bold__')).toBe('<strong>bold</strong>');
    expect(renderMarkdownLite('*italic*')).toBe('<em>italic</em>');
    expect(renderMarkdownLite('_italic_')).toBe('<em>italic</em>');
    expect(renderMarkdownLite('~~gone~~')).toBe('<del>gone</del>');
  });

  it('converts real and literal newlines to <br/>', () => {
    expect(renderMarkdownLite('a\nb')).toBe('a<br/>b');
    expect(renderMarkdownLite('a\\nb')).toBe('a<br/>b');
  });

  it('supports nesting bold around italic', () => {
    expect(renderMarkdownLite('**bold and *italic***'))
      .toBe('<strong>bold and <em>italic</em></strong>');
  });

  it('does not italicize snake_case words', () => {
    // The underscore form only matches at word boundaries, so identifiers
    // and file names authors paste into text stay intact.
    expect(renderMarkdownLite('beat_talk and beat_walk'))
      .toBe('beat_talk and beat_walk');
  });

  it('escapes HTML before formatting — authored angle brackets are text, not markup', () => {
    expect(renderMarkdownLite('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(renderMarkdownLite('**<b>**')).toBe('<strong>&lt;b&gt;</strong>');
  });

  it('leaves unpaired markers literal', () => {
    // Mid-typewriter the closer has not been revealed yet; an unpaired
    // marker must show as typed, not vanish.
    expect(renderMarkdownLite('**bo')).toBe('**bo');
    expect(renderMarkdownLite('~~half')).toBe('~~half');
  });

  it('handles empty and missing input', () => {
    expect(renderMarkdownLite('')).toBe('');
    expect(renderMarkdownLite(undefined as unknown as string)).toBe('');
  });
});

describe('markdown-lite escapes and highlight', () => {
  it('a backslash shows the marker itself', () => {
    expect(renderMarkdownLite('5 \\* 3 = 15')).toBe('5 * 3 = 15');
    expect(renderMarkdownLite('\\*not italic\\*')).toBe('*not italic*');
    expect(renderMarkdownLite('a \\_b\\_ \\~\\~c\\~\\~')).toBe('a _b_ ~~c~~');
    expect(renderMarkdownLite('**bold with a \\* inside**')).toBe('<strong>bold with a * inside</strong>');
    expect(renderMarkdownLite('C:\\\\path')).toBe('C:\\path');
  });

  it('keeps \\n as a line break', () => {
    expect(renderMarkdownLite('one\\ntwo')).toBe('one<br/>two');
  });

  it('==highlight==', () => {
    expect(renderMarkdownLite('a ==key== word')).toMatch(/^a <mark [^>]*>key<\/mark> word$/);
    expect(renderMarkdownLite('a \\=\\=no\\=\\= mark')).toBe('a ==no== mark');
  });

  it('plain text for speech and measuring', () => {
    expect(markdownLiteToPlain('**Run!** said *she*, 5 \\* 3, ==now==.')).toBe('Run! said she, 5 * 3, now.');
    expect(markdownLiteToPlain('one\\ntwo')).toBe('one\ntwo');
  });
});
