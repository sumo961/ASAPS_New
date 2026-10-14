/**
 * Markdown-lite renderer: converts a small subset of markdown syntax to HTML.
 *
 * Supported syntax:
 *   **bold** or __bold__   → <strong>bold</strong>
 *   *italic* or _italic_   → <em>italic</em>
 *   ~~strikethrough~~      → <del>strikethrough</del>
 *   ==highlight==          → <mark>highlight</mark>
 *   \* \_ \~ \= \\        → the character itself, not formatting
 *                            (so "5 \* 3" shows "5 * 3")
 *   \n (literal or real)   → <br/>
 *
 * HTML entities are escaped first to prevent XSS.
 * Nesting is supported (e.g. **bold and *italic***).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Characters a backslash turns back into plain text. `\n` stays a line break. */
const ESCAPE = /\\([\\*_~=])/g;
// Private-use characters hold escaped characters out of the formatting passes.
const HOLD_OPEN = '\uE000';
const HOLD_CLOSE = '\uE001';
const HELD = /\uE000(\d+)\uE001/g;

function holdEscapes(text: string): { text: string; held: string[] } {
  const held: string[] = [];
  return {
    text: text.replace(ESCAPE, (_m, ch: string) => {
      held.push(ch);
      return `${HOLD_OPEN}${held.length - 1}${HOLD_CLOSE}`;
    }),
    held,
  };
}

export function renderMarkdownLite(text: string): string {
  if (!text) return '';

  const { text: source, held } = holdEscapes(text);
  let html = escapeHtml(source);

  // Bold: **text** or __text__. The closer must not be followed by another
  // marker character — otherwise "**bold and *italic***" closes the bold on
  // the first two of the trailing THREE asterisks, stranding the italic's
  // closer outside and producing crossed tags (<em> closing after
  // </strong>). With the lookahead, the bold content extends to the true
  // outer pair and the italic pass then nests cleanly inside it.
  html = html.replace(/\*\*(.+?)\*\*(?!\*)/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__(?!_)/g, '<strong>$1</strong>');

  // Italic: *text* or _text_  (but not inside words for underscore)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Highlight: ==text== (a soft marker that reads on light and dark themes)
  html = html.replace(/==(.+?)==/g, '<mark style="background:rgba(250,204,21,0.35);color:inherit;padding:0 0.1em;border-radius:2px">$1</mark>');

  // Literal \n sequences → <br/>
  html = html.replace(/\\n/g, '<br/>');

  // Real newlines → <br/>
  html = html.replace(/\n/g, '<br/>');

  // Escaped characters come back as themselves.
  return html.replace(HELD, (_m, i: string) => escapeHtml(held[Number(i)] ?? ''));
}

/**
 * The text a reader sees, without markdown-lite markers: for measuring
 * wrapped lines and for speech (so "**Run!**" is not read with its
 * asterisks). Escaped characters stay; literal \n becomes a newline.
 */
export function markdownLiteToPlain(text: string): string {
  if (!text) return '';
  const { text: source, held } = holdEscapes(text);
  return source
    .replace(/\\n/g, '\n')
    .replace(/\*\*|__|~~|==|\*/g, '')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
    .replace(HELD, (_m, i: string) => held[Number(i)] ?? '');
}
