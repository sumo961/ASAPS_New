/**
 * Markdown-lite formatting bar for player-facing prose fields.
 *
 * The renderer has formatted **bold** / *italic* / ~~strikethrough~~ since
 * v0.9.30, but the syntax was invisible — nothing in the authoring UI said it
 * existed, so it was used exactly as often as authors happened to guess it.
 * This bar makes the contract visible: three buttons that wrap (or unwrap)
 * the selection in the markers the renderer actually understands.
 *
 * Deliberately NOT a rich-text editor: the stored value stays plain text with
 * markers, exactly what the author sees in the textarea — no hidden state,
 * nothing to migrate, translation strings keep working as strings.
 */
import React from 'react';

/**
 * Wrap the selection in `marker`, or unwrap it when already wrapped (either
 * just inside or just outside the selection). With an empty selection, insert
 * a marker pair and place the caret between them. Returns the new value and
 * selection so the caller can restore focus deterministically.
 */
export function toggleWrap(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
): { value: string; selStart: number; selEnd: number } {
  const m = marker.length;
  const selected = value.slice(selStart, selEnd);

  // Selection includes the markers: **bold** selected in full → unwrap.
  if (
    selected.length >= 2 * m &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(m, selected.length - m);
    return {
      value: value.slice(0, selStart) + inner + value.slice(selEnd),
      selStart,
      selEnd: selEnd - 2 * m,
    };
  }

  // Markers sit just outside the selection: bold selected inside **bold**.
  if (
    value.slice(selStart - m, selStart) === marker &&
    value.slice(selEnd, selEnd + m) === marker
  ) {
    return {
      value: value.slice(0, selStart - m) + selected + value.slice(selEnd + m),
      selStart: selStart - m,
      selEnd: selEnd - m,
    };
  }

  // Wrap. Empty selection gets the caret between the fresh markers.
  return {
    value: value.slice(0, selStart) + marker + selected + marker + value.slice(selEnd),
    selStart: selStart + m,
    selEnd: selEnd + m,
  };
}

const BUTTONS: Array<{ marker: string; title: string; label: React.ReactNode }> = [
  { marker: '**', title: 'Bold — **text**', label: <strong>B</strong> },
  { marker: '*', title: 'Italic — *text*', label: <em>I</em> },
  { marker: '~~', title: 'Strikethrough — ~~text~~', label: <del>S</del> },
];

export const FormattingToolbar: React.FC<{
  /** Resolve the textarea this bar formats, at click time — selection is
   *  read from and restored to it. A getter rather than a ref so the bar
   *  never holds a stale node across re-renders of a mapped field list. */
  getTextarea: () => HTMLTextAreaElement | null;
  onChange: (value: string) => void;
}> = ({ getTextarea, onChange }) => {
  const apply = (marker: string) => {
    const ta = getTextarea();
    if (!ta) return;
    const next = toggleWrap(ta.value, ta.selectionStart ?? 0, ta.selectionEnd ?? 0, marker);
    onChange(next.value);
    // Restore focus + selection after React re-renders the textarea.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(next.selStart, next.selEnd);
    });
  };

  return (
    <div className="flex items-center gap-1 mb-1">
      {BUTTONS.map((b) => (
        <button
          key={b.marker}
          type="button"
          title={b.title}
          // Keep the textarea's selection alive — a mousedown would blur it
          // and collapse the selection before the click handler reads it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => apply(b.marker)}
          className="w-6 h-6 flex items-center justify-center text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          {b.label}
        </button>
      ))}
    </div>
  );
};
