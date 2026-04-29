/**
 * CharacterRefField — combobox for inputs that may reference a defined Character
 * or a free-text name. Single component used everywhere a character reference is
 * authored (beat speaker, dialog node speaker, inventory character, AI NPC, …).
 *
 * Stored value is a tuple of two optional strings:
 *   - `characterRef`: canonical Character.id when linked, otherwise undefined
 *   - `freeText`:     the display string. When linked, this is a cache of the
 *                     character's name (re-derived on render); when not linked,
 *                     this is the author-typed string.
 *
 * Dropdown layout:
 *   ┌─ Pinned (e.g. "Player") ──────────┐  optional, set by call site
 *   ├─ Characters ──────────────────────┤  defined Character records
 *   │   🟢 Granny       (Grandma)       │
 *   │   🔴 Red          (Little Red)    │
 *   ├─ Used names ──────────────────────┤  free-text strings used elsewhere
 *   │   Mysterious Stranger    3×       │
 *   ├───────────────────────────────────┤
 *   │   + Define "Town Crier" …         │  shown when typed text isn't yet
 *   └───────────────────────────────────┘  a defined Character
 *
 * The "Define …" link calls back to the parent (typically opens the Character
 * Manager prefilled). No silent character creation; the author opts in.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Character } from '../../types/character';

export interface CharacterRefFieldValue {
  /** Canonical Character.id when linked. */
  characterRef?: string;
  /** Display string. Cache of the linked character's name when characterRef is set. */
  freeText?: string;
}

export interface UsedName {
  /** The free-text name as it appears in the project. */
  name: string;
  /** How many beats currently reference this name. */
  count: number;
}

export interface CharacterRefFieldProps {
  value: CharacterRefFieldValue;
  onChange: (next: CharacterRefFieldValue) => void;
  /** Defined Character records to show in the top section. */
  characters: ReadonlyArray<Character>;
  /** Free-text speaker / character names used elsewhere in the project. */
  usedNames?: ReadonlyArray<UsedName>;
  /**
   * Called when the user clicks "Define '<name>' as a Character" with the
   * name they currently have typed. Parent typically opens the Character
   * Manager prefilled with this name.
   */
  onDefineAsCharacter?: (name: string) => void;
  /** Optional always-visible top entry (e.g. "Player" for inventory). */
  pinnedOption?: { value: string; label: string };
  placeholder?: string;
  disabled?: boolean;
  /** Test id for unit tests. */
  testId?: string;
}

export const CharacterRefField: React.FC<CharacterRefFieldProps> = ({
  value,
  onChange,
  characters,
  usedNames = [],
  onDefineAsCharacter,
  pinnedOption,
  placeholder = 'Type or pick a character…',
  disabled = false,
  testId,
}) => {
  // Resolve the linked Character (if any) so the chip renders with its data
  // and any rename of the underlying record propagates to every linked input.
  const linkedCharacter = useMemo<Character | null>(() => {
    if (!value.characterRef) return null;
    return characters.find((c) => c.id === value.characterRef) ?? null;
  }, [value.characterRef, characters]);

  // Display string: prefer the linked character's name (auto-refreshed on rename),
  // fall back to the cached freeText, fall back to the raw ref (e.g. for deleted
  // characters where we want to show *something* without losing the ref).
  const displayText = linkedCharacter
    ? (linkedCharacter.displayName || linkedCharacter.name || '')
    : (value.freeText ?? '');

  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState(displayText);
  // Track whether the user is actively editing — while editing, the field
  // shows the typed string rather than the linked character's name so the
  // dropdown filter feels responsive.
  const [isEditing, setIsEditing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the input in sync with the linked character when not actively editing.
  useEffect(() => {
    if (!isEditing) setInputText(displayText);
  }, [displayText, isEditing]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setIsEditing(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const filterText = isEditing ? inputText.trim().toLowerCase() : '';
  const matchesText = useCallback((s: string | undefined) => {
    if (!filterText) return true;
    return (s || '').toLowerCase().includes(filterText);
  }, [filterText]);

  const filteredCharacters = useMemo(
    () => characters.filter((c) => matchesText(c.name) || matchesText(c.displayName)),
    [characters, matchesText],
  );
  const filteredUsedNames = useMemo(
    () =>
      usedNames
        // Don't show names that exactly match a defined character — those go in the Characters section.
        .filter((u) => !characters.some((c) =>
          c.name?.toLowerCase() === u.name.toLowerCase()
          || c.displayName?.toLowerCase() === u.name.toLowerCase()))
        .filter((u) => matchesText(u.name)),
    [usedNames, characters, matchesText],
  );

  // Show the "Define as Character" link only when the user has typed something
  // that isn't already a defined character (case-insensitive), and a callback
  // is wired up.
  const trimmedTyped = inputText.trim();
  const typedIsAlreadyDefined = !!characters.find(
    (c) => c.name?.toLowerCase() === trimmedTyped.toLowerCase()
      || c.displayName?.toLowerCase() === trimmedTyped.toLowerCase(),
  );
  const showDefineLink = !!onDefineAsCharacter && trimmedTyped.length > 0 && !typedIsAlreadyDefined;

  const pickCharacter = useCallback((c: Character) => {
    onChange({ characterRef: c.id, freeText: c.displayName || c.name });
    setIsEditing(false);
    setOpen(false);
  }, [onChange]);

  const pickUsedName = useCallback((name: string) => {
    onChange({ characterRef: undefined, freeText: name });
    setIsEditing(false);
    setOpen(false);
  }, [onChange]);

  const pickPinned = useCallback(() => {
    if (!pinnedOption) return;
    onChange({ characterRef: undefined, freeText: pinnedOption.value });
    setIsEditing(false);
    setOpen(false);
  }, [pinnedOption, onChange]);

  const handleDefineClick = useCallback(() => {
    if (!onDefineAsCharacter) return;
    onDefineAsCharacter(trimmedTyped);
    setOpen(false);
  }, [onDefineAsCharacter, trimmedTyped]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setInputText(next);
    setIsEditing(true);
    setOpen(true);
    // Typing in the input means the user is no longer linked to the previous
    // character — store as free text immediately. If they pick a character
    // from the dropdown, that handler will overwrite both fields.
    onChange({ characterRef: undefined, freeText: next });
  }, [onChange]);

  const unlink = useCallback(() => {
    // Keep the cached display name as free text so the field doesn't go blank.
    onChange({ characterRef: undefined, freeText: linkedCharacter?.name || value.freeText || '' });
    setIsEditing(true);
    setOpen(true);
    inputRef.current?.focus();
  }, [linkedCharacter, value.freeText, onChange]);

  const isLinked = !!linkedCharacter;
  const isDanglingRef = !!value.characterRef && !linkedCharacter;

  return (
    <div ref={wrapperRef} style={wrapperStyle} data-testid={testId}>
      <div style={{ ...inputRowStyle, opacity: disabled ? 0.5 : 1 }}>
        {isLinked && !isEditing && (
          <span style={{ ...chipStyle, backgroundColor: linkedCharacter.color || '#334155' }}>
            <span style={chipDotStyle} />
            {linkedCharacter.displayName || linkedCharacter.name}
            <button
              type="button"
              onClick={unlink}
              style={chipUnlinkStyle}
              title="Unlink — return to free-text name"
              disabled={disabled}
            >
              ✕
            </button>
          </span>
        )}
        {(!isLinked || isEditing) && (
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onFocus={() => { setOpen(true); setIsEditing(true); }}
            placeholder={placeholder}
            disabled={disabled}
            style={inputStyle}
          />
        )}
        {isDanglingRef && !isEditing && (
          <span style={dangleStyle} title="The linked character has been deleted.">
            (deleted)
          </span>
        )}
      </div>

      {open && (
        <div style={dropdownStyle} role="listbox">
          {pinnedOption && (
            <>
              <button type="button" style={optionStyle} onMouseDown={(e) => { e.preventDefault(); pickPinned(); }}>
                <span style={pinnedIconStyle}>★</span>
                <span style={{ flex: 1 }}>{pinnedOption.label}</span>
              </button>
              <div style={dividerStyle} />
            </>
          )}

          <div style={sectionHeaderStyle}>Characters</div>
          {filteredCharacters.length === 0 ? (
            <div style={emptyHintStyle}>{characters.length === 0 ? 'No characters defined yet.' : 'No matches.'}</div>
          ) : (
            filteredCharacters.map((c) => (
              <button
                key={c.id}
                type="button"
                style={optionStyle}
                onMouseDown={(e) => { e.preventDefault(); pickCharacter(c); }}
              >
                <span style={{ ...chipDotStyle, backgroundColor: c.color || '#94a3b8' }} />
                <span style={{ flex: 1 }}>
                  {c.displayName || c.name}
                  {c.displayName && c.name && c.displayName !== c.name && (
                    <span style={subtleStyle}> ({c.name})</span>
                  )}
                </span>
              </button>
            ))
          )}

          {filteredUsedNames.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Used names</div>
              {filteredUsedNames.map((u) => (
                <button
                  key={u.name}
                  type="button"
                  style={optionStyle}
                  onMouseDown={(e) => { e.preventDefault(); pickUsedName(u.name); }}
                >
                  <span style={{ flex: 1 }}>{u.name}</span>
                  <span style={countBadgeStyle}>{u.count}×</span>
                </button>
              ))}
            </>
          )}

          {showDefineLink && (
            <>
              <div style={dividerStyle} />
              <button
                type="button"
                style={defineLinkStyle}
                onMouseDown={(e) => { e.preventDefault(); handleDefineClick(); }}
              >
                + Define <strong>"{trimmedTyped}"</strong> as a Character
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Styles (match the inline-style convention used elsewhere in components/vcs)
// ============================================================================

const wrapperStyle: React.CSSProperties = { position: 'relative', width: '100%' };
const inputRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '4px 6px',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 4,
  minHeight: 30,
  boxSizing: 'border-box',
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#e2e8f0',
  fontSize: 13,
  padding: '2px 0',
};
const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 8px',
  borderRadius: 12,
  fontSize: 12,
  color: '#fff',
  fontWeight: 500,
};
const chipDotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8, height: 8, borderRadius: '50%',
  backgroundColor: 'rgba(255,255,255,0.7)',
};
const chipUnlinkStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
  marginLeft: 2,
};
const dangleStyle: React.CSSProperties = {
  fontSize: 11, color: '#f97316', fontStyle: 'italic',
};
const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0, right: 0,
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  zIndex: 1000,
  maxHeight: 320,
  overflowY: 'auto',
  padding: '4px 0',
};
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: '#64748b',
  padding: '6px 12px 2px',
  fontWeight: 600,
};
const optionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 13,
  textAlign: 'left',
};
const subtleStyle: React.CSSProperties = { color: '#64748b', fontSize: 11 };
const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
  background: '#0f172a',
  padding: '1px 6px',
  borderRadius: 8,
};
const emptyHintStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  color: '#64748b',
  fontStyle: 'italic',
};
const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#334155',
  margin: '4px 0',
};
const defineLinkStyle: React.CSSProperties = {
  ...optionStyle,
  color: '#60a5fa',
  fontSize: 12,
};
const pinnedIconStyle: React.CSSProperties = { color: '#fbbf24', width: 14, textAlign: 'center' };
