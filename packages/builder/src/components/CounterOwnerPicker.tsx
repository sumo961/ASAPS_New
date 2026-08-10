import React, { useMemo, useState } from 'react';
import type { AvailableCounter } from '../hooks/useAvailableCountersAndVariables';

export interface CounterOwnerPickerCharacter {
  id: string;
  name?: string;
  displayName?: string;
}

interface CounterOwnerPickerProps {
  /** All character-scoped counters declared on characters. */
  counters: AvailableCounter[];
  /** Defined characters — used for the "type a new name → scope" path. */
  characters: CounterOwnerPickerCharacter[];
  /** Current counter name. */
  name: string;
  /** Current owner id. '' = story-global. */
  character: string;
  /** Sets BOTH the counter name and its owner together. */
  onChange: (name: string, character: string) => void;
  /**
   * counterCompare second operand: force this owner, hide the scope choice,
   * and only offer that owner's counters. Pass undefined for the normal
   * (owner-selecting) picker. '' means "locked to story-global".
   */
  lockedCharacter?: string | undefined;
  label: string;
  /** Optional helper line under the control. */
  help?: string;
  /** Inline mode for tight rows (effect editor): no label/helper, compact
   * select, custom inputs inline. */
  compact?: boolean;
  /** Wrapper class (compact callers size it within a flex row). */
  className?: string;
  /**
   * True when this picker chooses a counter to *assign to*. Derived counters
   * are then shown disabled: they mirror affect state, so a written value
   * would be undone by the next appraisal tick. Reads (condition operands,
   * interpolation) leave this off — reading a derived counter is fine.
   */
  forWriting?: boolean;
}

const CUSTOM = '__custom__';

/**
 * Single combined counter picker. A counter is identified by (name, owner);
 * this control selects the pair atomically so the name and its owner can
 * never disagree (the old separate Owner field let you pick "Player: Health"
 * while Owner still said "Story-global"). Picking a listed counter sets the
 * name and the owner; "type a new name" creates a counter, global by default,
 * with an optional scope choice for a not-yet-declared per-character counter.
 */
export const CounterOwnerPicker: React.FC<CounterOwnerPickerProps> = ({
  counters,
  characters,
  name,
  character,
  onChange,
  lockedCharacter,
  label,
  help,
  compact = false,
  className,
  forWriting = false,
}) => {
  const locked = lockedCharacter !== undefined;

  // Counters offered in the list. When locked (counterCompare 2nd operand),
  // only the fixed owner's counters are valid.
  const pairs = useMemo(
    () =>
      counters.filter((c) =>
        locked ? c.characterId === lockedCharacter : true,
      ),
    [counters, locked, lockedCharacter],
  );

  const charLabel = (id: string): string => {
    if (!id) return 'Story-global';
    const c = characters.find((x) => x.id === id);
    return c ? c.displayName || c.name || id : id;
  };

  const matchesPair = pairs.some(
    (c) => c.name === name && c.characterId === (character || ''),
  );

  // Custom mode: an explicit name+scope path. Auto-engaged when the current
  // value isn't one of the listed pairs (hand-typed global, legacy data, or
  // a counter scoped to a character with no declared entry).
  const [customOpen, setCustomOpen] = useState(false);
  const inCustom = customOpen || (!!name && !matchesPair);

  const selectValue = inCustom
    ? CUSTOM
    : matchesPair
      ? `pair:${character || ''}:${name}`
      : '';

  const handleSelect = (v: string) => {
    if (v === CUSTOM) {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    if (!v) {
      onChange('', '');
      return;
    }
    // v = `pair:${characterId}:${counterName}` — counterName may contain ':'
    const rest = v.slice('pair:'.length);
    const sep = rest.indexOf(':');
    const owner = rest.slice(0, sep);
    const counterName = rest.slice(sep + 1);
    onChange(counterName, owner);
  };

  const selectCls = compact
    ? 'px-1.5 py-1 text-xs border rounded'
    : 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm';
  const inputCls = selectCls;

  const selectEl = (
    <select
      value={selectValue}
      onChange={(e) => handleSelect(e.target.value)}
      className={`${selectCls}${compact ? ' flex-1 min-w-[110px]' : ''}`}
      title={compact && name ? `${name} — ${charLabel(character || '')}` : undefined}
    >
      <option value="">Select counter…</option>
      {pairs.map((c) => {
        // Derived counters are readable but not assignable. Shown disabled
        // with the reason, so an author who just defined one doesn't conclude
        // the picker has lost it.
        const blocked = forWriting && c.derived;
        return (
          <option
            key={`${c.characterId}:${c.name}`}
            value={`pair:${c.characterId}:${c.name}`}
            disabled={blocked}
            title={blocked ? c.derivedWriteReason : undefined}
          >
            {(c.displayName || c.name)} — {c.characterName || 'Story-global'}
            {blocked ? ' (mirrors affect state)' : ''}
          </option>
        );
      })}
      <option value={CUSTOM}>+ Type a counter name…</option>
    </select>
  );

  const customEl = inCustom && (
    <div
      className={
        compact
          ? 'flex flex-wrap gap-1 items-center w-full'
          : 'mt-2 space-y-2 pl-2 border-l-2 border-gray-200'
      }
    >
      <input
        type="text"
        value={name}
        onChange={(e) => onChange(e.target.value, character)}
        placeholder="counter name"
        className={`${inputCls}${compact ? ' flex-1 min-w-[90px]' : ''}`}
      />
      {!locked && (
        compact ? (
          <select
            value={character || ''}
            onChange={(e) => onChange(name, e.target.value)}
            className={`${selectCls} flex-shrink-0`}
            title="Counter owner"
          >
            <option value="">Global</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName || c.name || c.id}</option>
            ))}
          </select>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Scope</label>
            <select
              value={character || ''}
              onChange={(e) => onChange(name, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Story-global (no character)</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName || c.name || c.id}
                </option>
              ))}
            </select>
          </div>
        )
      )}
    </div>
  );

  if (compact) {
    return (
      <div className={className || 'flex flex-wrap gap-1 items-center flex-1 min-w-[110px]'}>
        {selectEl}
        {customEl}
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {selectEl}
      {customEl}
      <p className="text-xs text-gray-500 mt-1">
        {locked ? (
          <>Compared against the same owner as the first counter ({charLabel(lockedCharacter || '')}).</>
        ) : name ? (
          <>
            Selected: <strong>{name}</strong> — {charLabel(character || '')}
          </>
        ) : (
          help || 'Pick a character counter, or type a new name (story-global unless you choose a scope).'
        )}
      </p>
    </div>
  );
};
