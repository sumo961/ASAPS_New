/**
 * Markdown-lite renderer: converts a small subset of markdown syntax to HTML.
 *
 * Supported syntax:
 *   **bold** or __bold__   → <strong>bold</strong>
 *   *italic* or _italic_   → <em>italic</em>
 *   ~~strikethrough~~      → <del>strikethrough</del>
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

export function renderMarkdownLite(text: string): string {
  if (!text) return '';

  let html = escapeHtml(text);

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

  // Literal \n sequences → <br/>
  html = html.replace(/\\n/g, '<br/>');

  // Real newlines → <br/>
  html = html.replace(/\n/g, '<br/>');

  return html;
}
