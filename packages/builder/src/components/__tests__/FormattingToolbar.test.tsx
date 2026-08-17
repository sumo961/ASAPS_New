/**
 * Formatting bar for markdown-lite prose fields — the toggle must be an
 * involution (apply twice = original text) in both directions the selection
 * can relate to existing markers: markers inside the selection, or markers
 * just outside it. The stored value stays plain text with markers; there is
 * no hidden rich-text state.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { FormattingToolbar, toggleWrap } from '../FormattingToolbar';

describe('toggleWrap', () => {
  it('wraps a selection and keeps it selected inside the markers', () => {
    const r = toggleWrap('make this bold now', 5, 9, '**');
    expect(r.value).toBe('make **this** bold now');
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('this');
  });

  it('unwraps when the selection includes the markers', () => {
    const r = toggleWrap('a **bold** word', 2, 10, '**');
    expect(r.value).toBe('a bold word');
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('bold');
  });

  it('unwraps when the markers sit just outside the selection', () => {
    const r = toggleWrap('a **bold** word', 4, 8, '**');
    expect(r.value).toBe('a bold word');
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('bold');
  });

  it('is an involution: wrap then unwrap restores the original', () => {
    const once = toggleWrap('emphasis here', 0, 8, '*');
    const twice = toggleWrap(once.value, once.selStart, once.selEnd, '*');
    expect(twice.value).toBe('emphasis here');
  });

  it('empty selection inserts a marker pair with the caret between', () => {
    const r = toggleWrap('type ', 5, 5, '~~');
    expect(r.value).toBe('type ~~~~');
    expect(r.selStart).toBe(7);
    expect(r.selEnd).toBe(7);
  });
});

describe('FormattingToolbar', () => {
  it('wraps the textarea selection and reports the new value', () => {
    const onChange = vi.fn();
    const ta = document.createElement('textarea');
    ta.value = 'a plain claim';
    document.body.appendChild(ta);
    ta.setSelectionRange(2, 7);

    const { getByTitle } = render(
      <FormattingToolbar getTextarea={() => ta} onChange={onChange} />,
    );
    fireEvent.click(getByTitle('Bold — **text**'));
    expect(onChange).toHaveBeenCalledWith('a **plain** claim');
    ta.remove();
  });

  it('does nothing without a textarea', () => {
    const onChange = vi.fn();
    const { getByTitle } = render(
      <FormattingToolbar getTextarea={() => null} onChange={onChange} />,
    );
    fireEvent.click(getByTitle('Italic — *text*'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
