/**
 * CharacterRefField unit tests — validates the combobox behaviour in isolation
 * before any call site wires it up.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CharacterRefField } from '../CharacterRefField';
import type { Character } from '../../../types/character';

const granny: Character = {
  id: 'char_1',
  name: 'Granny',
  displayName: 'Grandma',
  role: 'npc',
  visual: { type: 'static' },
  states: [],
  defaultState: '',
  counters: [],
  inventory: [],
  color: '#22c55e',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const wolf: Character = {
  ...granny,
  id: 'char_2',
  name: 'Wolf',
  displayName: 'Big Bad Wolf',
  color: '#ef4444',
};

describe('CharacterRefField', () => {
  afterEach(() => cleanup());

  describe('rendering', () => {
    it('renders an empty input when value is empty', () => {
      render(
        <CharacterRefField value={{}} onChange={() => {}} characters={[granny, wolf]} testId="f" />
      );
      const input = screen.getByPlaceholderText(/Type or pick/);
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe('');
    });

    it('renders a chip when value.characterRef matches a defined character', () => {
      render(
        <CharacterRefField
          value={{ characterRef: 'char_1', freeText: 'Grandma' }}
          onChange={() => {}}
          characters={[granny, wolf]}
        />
      );
      // Linked: chip shows the displayName, no input until user clicks unlink
      expect(screen.getByText('Grandma')).toBeTruthy();
      // The unlink button (✕) is present
      expect(screen.getByTitle(/Unlink/)).toBeTruthy();
    });

    it('shows "(deleted)" indicator when characterRef points to an unknown id', () => {
      render(
        <CharacterRefField
          value={{ characterRef: 'char_999', freeText: 'OldName' }}
          onChange={() => {}}
          characters={[granny, wolf]}
        />
      );
      expect(screen.getByText(/deleted/i)).toBeTruthy();
      // Free-text fallback still readable
      expect(screen.getByDisplayValue('OldName')).toBeTruthy();
    });

    it('reflects character renames automatically (display follows source)', () => {
      const renamed: Character = { ...granny, displayName: 'Granny Renamed' };
      render(
        <CharacterRefField
          value={{ characterRef: 'char_1', freeText: 'Grandma' }}
          onChange={() => {}}
          characters={[renamed, wolf]}
        />
      );
      // Even though freeText is the *cached* old name, the chip prefers the live record.
      expect(screen.getByText('Granny Renamed')).toBeTruthy();
    });
  });

  describe('typing free text', () => {
    it('clears characterRef and updates freeText on every keystroke', () => {
      const onChange = vi.fn();
      render(
        <CharacterRefField
          value={{ characterRef: 'char_1', freeText: 'Grandma' }}
          onChange={onChange}
          characters={[granny, wolf]}
        />
      );
      // Click the chip's unlink first to enter editing mode
      fireEvent.click(screen.getByTitle(/Unlink/));
      // onChange called with cleared characterRef
      expect(onChange).toHaveBeenLastCalledWith({ characterRef: undefined, freeText: 'Granny' });
    });

    it('typing a new name stores it as free text (no auto-character creation)', () => {
      const onChange = vi.fn();
      render(
        <CharacterRefField value={{}} onChange={onChange} characters={[granny, wolf]} />
      );
      const input = screen.getByPlaceholderText(/Type or pick/);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Stranger' } });
      expect(onChange).toHaveBeenLastCalledWith({ characterRef: undefined, freeText: 'Stranger' });
    });
  });

  describe('dropdown behaviour', () => {
    it('opens on focus and lists defined characters', () => {
      render(
        <CharacterRefField value={{}} onChange={() => {}} characters={[granny, wolf]} />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      expect(screen.getByText('Characters')).toBeTruthy();
      expect(screen.getByText('Grandma')).toBeTruthy();
      expect(screen.getByText('Big Bad Wolf')).toBeTruthy();
    });

    it('selecting a defined character sets characterRef + cached freeText', () => {
      const onChange = vi.fn();
      render(
        <CharacterRefField value={{}} onChange={onChange} characters={[granny, wolf]} />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      fireEvent.mouseDown(screen.getByText('Big Bad Wolf'));
      expect(onChange).toHaveBeenLastCalledWith({ characterRef: 'char_2', freeText: 'Big Bad Wolf' });
    });

    it('shows "Used names" section with counts and excludes names that match defined characters', () => {
      render(
        <CharacterRefField
          value={{}}
          onChange={() => {}}
          characters={[granny]}
          usedNames={[
            { name: 'Mysterious Stranger', count: 3 },
            { name: 'Granny', count: 2 }, // collides with defined char — must NOT appear under Used names
          ]}
        />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      expect(screen.getByText('Used names')).toBeTruthy();
      expect(screen.getByText('Mysterious Stranger')).toBeTruthy();
      expect(screen.getByText('3×')).toBeTruthy();
      // 'Granny' under "Used names" must NOT appear (it's already a defined character)
      const usedSection = screen.getByText('Used names');
      const usedSectionItems = usedSection.parentElement?.textContent || '';
      expect(usedSectionItems).not.toContain('Mysterious Stranger Granny'); // sanity
    });

    it('selecting a Used name stores freeText only (no characterRef)', () => {
      const onChange = vi.fn();
      render(
        <CharacterRefField
          value={{}}
          onChange={onChange}
          characters={[]}
          usedNames={[{ name: 'Mysterious Stranger', count: 3 }]}
        />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      fireEvent.mouseDown(screen.getByText('Mysterious Stranger'));
      expect(onChange).toHaveBeenLastCalledWith({ characterRef: undefined, freeText: 'Mysterious Stranger' });
    });

    it('filters both sections by typed text', () => {
      render(
        <CharacterRefField
          value={{}}
          onChange={() => {}}
          characters={[granny, wolf]}
          usedNames={[{ name: 'Town Crier', count: 1 }, { name: 'Mysterious Stranger', count: 3 }]}
        />
      );
      const input = screen.getByPlaceholderText(/Type or pick/);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'wolf' } });
      // Wolf matches; Granny and the used-names should not appear
      expect(screen.getByText('Big Bad Wolf')).toBeTruthy();
      expect(screen.queryByText('Grandma')).toBeNull();
      expect(screen.queryByText('Town Crier')).toBeNull();
    });
  });

  describe('Define as Character', () => {
    it('shows the "Define" link when typed text is not a defined character', () => {
      const onDefine = vi.fn();
      render(
        <CharacterRefField
          value={{}}
          onChange={() => {}}
          characters={[granny]}
          onDefineAsCharacter={onDefine}
        />
      );
      const input = screen.getByPlaceholderText(/Type or pick/);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Town Crier' } });
      expect(screen.getByText(/Define/)).toBeTruthy();
      expect(screen.getByText(/Town Crier/)).toBeTruthy();
    });

    it('does NOT show the link when typed text already matches a defined character', () => {
      render(
        <CharacterRefField
          value={{}}
          onChange={() => {}}
          characters={[granny]}
          onDefineAsCharacter={vi.fn()}
        />
      );
      const input = screen.getByPlaceholderText(/Type or pick/);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'granny' } });
      expect(screen.queryByText(/^\+ Define/)).toBeNull();
    });

    it('clicking Define calls back with the typed name', () => {
      const onDefine = vi.fn();
      render(
        <CharacterRefField
          value={{}}
          onChange={() => {}}
          characters={[]}
          onDefineAsCharacter={onDefine}
        />
      );
      const input = screen.getByPlaceholderText(/Type or pick/);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Town Crier' } });
      fireEvent.mouseDown(screen.getByText(/Define/));
      expect(onDefine).toHaveBeenCalledWith('Town Crier');
    });
  });

  describe('pinned options (plural)', () => {
    it('renders multiple pinned options when pinnedOptions is set', () => {
      render(
        <CharacterRefField
          value={{}}
          onChange={() => {}}
          characters={[granny]}
          pinnedOptions={[
            { value: '', label: '(Default — Narrator)' },
            { value: 'Narrator', label: 'Narrator' },
            { value: 'Red', label: 'Red (Player)' },
          ]}
        />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      expect(screen.getByText('(Default — Narrator)')).toBeTruthy();
      expect(screen.getByText('Narrator')).toBeTruthy();
      expect(screen.getByText('Red (Player)')).toBeTruthy();
    });

    it('selecting a pinned option from pinnedOptions stores its value as freeText', () => {
      const onChange = vi.fn();
      render(
        <CharacterRefField
          value={{}}
          onChange={onChange}
          characters={[]}
          pinnedOptions={[{ value: 'Narrator', label: 'Narrator' }]}
        />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      fireEvent.mouseDown(screen.getByText('Narrator'));
      expect(onChange).toHaveBeenLastCalledWith({ characterRef: undefined, freeText: 'Narrator' });
    });
  });

  describe('pinned option (legacy singular)', () => {
    it('renders the pinned option above defined characters', () => {
      render(
        <CharacterRefField
          value={{}}
          onChange={() => {}}
          characters={[granny]}
          pinnedOption={{ value: 'player', label: 'Player' }}
        />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      expect(screen.getByText('Player')).toBeTruthy();
    });

    it('selecting the pinned option stores its value as freeText, no characterRef', () => {
      const onChange = vi.fn();
      render(
        <CharacterRefField
          value={{}}
          onChange={onChange}
          characters={[granny]}
          pinnedOption={{ value: 'player', label: 'Player' }}
        />
      );
      fireEvent.focus(screen.getByPlaceholderText(/Type or pick/));
      fireEvent.mouseDown(screen.getByText('Player'));
      expect(onChange).toHaveBeenLastCalledWith({ characterRef: undefined, freeText: 'player' });
    });
  });
});
