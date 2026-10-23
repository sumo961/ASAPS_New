/**
 * A number field that lets you type a negative number. A controlled
 * <input type="number"> cannot: "-" on its own is reported as an empty
 * value, the handler turns that into 0 (or React puts the old number back),
 * and "-20" never gets typed (Visual Editor X / X %, 2026-10-23).
 *
 * The text being typed is kept as it is; each time it reads as a number the
 * value is applied (clamped to min/max). Arrow keys step by `step`. On blur
 * the field shows the applied value again.
 */
import React, { useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> & {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places shown when not editing. */
  precision?: number;
};

export const DraftNumberInput: React.FC<Props> = ({ value, onCommit, min, max, step = 1, precision = 0, onFocus, onBlur, onKeyDown, ...rest }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
  const shown = Number.isFinite(value) ? String(Number(value.toFixed(precision))) : '';
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={draft ?? shown}
      onFocus={(e) => { setDraft(shown); onFocus?.(e); }}
      onBlur={(e) => { setDraft(null); onBlur?.(e); }}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = parseFloat(text.replace(',', '.'));
        if (Number.isFinite(n) && !rest.readOnly) onCommit(clamp(n));
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || rest.readOnly || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        const base = parseFloat((draft ?? shown).replace(',', '.'));
        const next = clamp((Number.isFinite(base) ? base : value) + (e.key === 'ArrowUp' ? step : -step));
        const rounded = Number(next.toFixed(Math.max(precision, (String(step).split('.')[1] ?? '').length)));
        setDraft(String(rounded));
        onCommit(rounded);
      }}
    />
  );
};
