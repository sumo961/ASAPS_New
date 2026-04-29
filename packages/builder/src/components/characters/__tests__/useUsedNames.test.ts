/**
 * useUsedNames — gathers free-text speakers / character refs from across the
 * project, excluding names already covered by defined Characters.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUsedNames } from '../useUsedNames';

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };

describe('useUsedNames', () => {
  it('returns [] for empty / null inputs', () => {
    const { result: a } = renderHook(() => useUsedNames([], []));
    expect(a.current).toEqual([]);
    const { result: b } = renderHook(() => useUsedNames(null, null));
    expect(b.current).toEqual([]);
  });

  it('counts top-level Beat.speaker occurrences', () => {
    const beats = [
      { type: 'infoText', speaker: 'Town Crier' },
      { type: 'infoText', speaker: 'Town Crier' },
      { type: 'infoText', speaker: 'Mysterious Stranger' },
    ];
    const { result } = renderHook(() => useUsedNames(beats, []));
    expect(result.current).toEqual([
      { name: 'Town Crier', count: 2 },
      { name: 'Mysterious Stranger', count: 1 },
    ]);
  });

  it('walks DialogTree root + nested DialogNode speakers', () => {
    const beats = [{
      type: 'dialogTree',
      parameters: {
        dialogTree: {
          id: 'root', speaker: 'Granny', text: '...',
          choices: [{
            id: 'c1', text: '...',
            dialogNode: {
              id: 'n1', speaker: 'Wolf', text: '...',
              choices: [{
                id: 'c2', text: '...',
                dialogNode: { id: 'n2', speaker: 'Wolf', text: '...', choices: [] },
              }],
            },
          }],
        },
      },
    }];
    const { result } = renderHook(() => useUsedNames(beats, []));
    expect(result.current).toEqual([
      { name: 'Wolf', count: 2 },
      { name: 'Granny', count: 1 },
    ]);
  });

  it('collects AddRemoveInventory character / fromChar / toChar', () => {
    const beats = [
      {
        type: 'addRemoveInventory',
        parameters: { character: 'Granny', fromChar: 'Player', toChar: 'Wolf' },
      },
    ];
    const { result } = renderHook(() => useUsedNames(beats, []));
    // 'Player' is filtered (special routing keyword); Granny + Wolf remain.
    expect(result.current.map(u => u.name).sort()).toEqual(['Granny', 'Wolf']);
  });

  it('collects npcName from AI beats', () => {
    const beats = [
      { type: 'aiDialogTree', parameters: { npcName: 'Sage' } },
      { type: 'aiConversation', parameters: { npcName: 'Sage' } },
      { type: 'aiConversation', parameters: { npcName: 'Crone' } },
    ];
    const { result } = renderHook(() => useUsedNames(beats, []));
    expect(result.current).toEqual([
      { name: 'Sage', count: 2 },
      { name: 'Crone', count: 1 },
    ]);
  });

  it('excludes names that match a defined Character by id, name, or displayName', () => {
    const beats = [
      { type: 'infoText', speaker: 'Granny' },        // matches granny.name
      { type: 'infoText', speaker: 'grandma' },       // matches granny.displayName, ci
      { type: 'infoText', speaker: 'char_1' },        // matches granny.id
      { type: 'infoText', speaker: 'Mysterious One' }, // free
    ];
    const { result } = renderHook(() => useUsedNames(beats, [granny]));
    expect(result.current).toEqual([{ name: 'Mysterious One', count: 1 }]);
  });

  it('always filters the "player" routing keyword', () => {
    const beats = [
      { type: 'addRemoveInventory', parameters: { character: 'player' } },
      { type: 'addRemoveInventory', parameters: { character: 'Player' } },
      { type: 'addRemoveInventory', parameters: { character: 'Granny' } },
    ];
    const { result } = renderHook(() => useUsedNames(beats, []));
    expect(result.current.map(u => u.name)).toEqual(['Granny']);
  });

  it('trims whitespace and merges identically-trimmed names', () => {
    const beats = [
      { type: 'infoText', speaker: 'Town Crier' },
      { type: 'infoText', speaker: '  Town Crier  ' },
    ];
    const { result } = renderHook(() => useUsedNames(beats, []));
    expect(result.current).toEqual([{ name: 'Town Crier', count: 2 }]);
  });

  it('sorts by count desc, then alphabetical', () => {
    const beats = [
      { type: 'infoText', speaker: 'Bravo' },
      { type: 'infoText', speaker: 'Charlie' },
      { type: 'infoText', speaker: 'Charlie' },
      { type: 'infoText', speaker: 'Alpha' },
    ];
    const { result } = renderHook(() => useUsedNames(beats, []));
    expect(result.current.map(u => u.name)).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });
});
