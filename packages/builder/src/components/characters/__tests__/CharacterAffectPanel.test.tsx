import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CharacterAffectPanel } from '../CharacterAffectPanel';
import type { Character } from '../../../types/character';

const granny: Character = {
  id: 'char_1', name: 'Granny', displayName: 'Grandma', role: 'npc',
  visual: { type: 'static' }, states: [], defaultState: '',
  counters: [], inventory: [], color: '#22c55e',
  createdAt: '', updatedAt: '',
};
const wolf: Character = { ...granny, id: 'char_2', name: 'Wolf', displayName: 'Wolf', color: '#ef4444' };

function makeContext(opts: {
  moods?: Record<string, { valence: number; arousal: number }>;
  sentiments?: Record<string, Array<{ toEntityRef: string; emotion: string; strength: number }>>;
}) {
  return {
    getCharacterMood: (id: string) => opts.moods?.[id] || { valence: 0, arousal: 0 },
    getCharacterSentiments: (id: string) => opts.sentiments?.[id] || [],
  };
}

describe('CharacterAffectPanel', () => {
  afterEach(() => cleanup());

  it('renders empty state when no characters', () => {
    render(<CharacterAffectPanel characters={[]} context={makeContext({})} />);
    expect(screen.getByText(/No characters defined/i)).toBeTruthy();
  });

  it('renders one row per character with name', () => {
    render(<CharacterAffectPanel characters={[granny, wolf]} context={makeContext({})} />);
    expect(screen.getByText('Grandma')).toBeTruthy();
    expect(screen.getByText('Wolf')).toBeTruthy();
  });

  it('shows "neutral" badge when mood is near zero and no sentiments', () => {
    render(<CharacterAffectPanel characters={[granny]} context={makeContext({})} />);
    expect(screen.getByText('neutral')).toBeTruthy();
  });

  it('shows mood summary words when mood is non-trivial', () => {
    render(
      <CharacterAffectPanel
        characters={[granny]}
        context={makeContext({ moods: { char_1: { valence: 0.6, arousal: 0.3 } } })}
      />
    );
    expect(screen.getByText(/happy, alert/i)).toBeTruthy();
  });

  it('lists top sentiments sorted by absolute strength descending', () => {
    render(
      <CharacterAffectPanel
        characters={[granny]}
        context={makeContext({
          sentiments: {
            char_1: [
              { toEntityRef: 'char_2', emotion: 'fear', strength: 0.3 },
              { toEntityRef: 'player', emotion: 'trust', strength: 0.9 },
              { toEntityRef: 'char_2', emotion: 'anger', strength: -0.6 },
            ],
          },
        })}
        topNSentiments={2}
      />
    );
    // Top two by abs strength: trust 0.9, anger -0.6
    expect(screen.getByText(/intense/i)).toBeTruthy();
    expect(screen.getByText(/trust/i)).toBeTruthy();
    expect(screen.getByText(/strong anti-/i)).toBeTruthy();
    expect(screen.getByText(/anger/i)).toBeTruthy();
    // The 0.3 fear sentiment should not appear (cap = 2)
    expect(screen.queryByText(/fear/i)).toBeNull();
  });

  it('skips sentiments below the noise threshold', () => {
    render(
      <CharacterAffectPanel
        characters={[granny]}
        context={makeContext({
          sentiments: { char_1: [{ toEntityRef: 'char_2', emotion: 'mild_unease', strength: 0.02 }] },
        })}
      />
    );
    expect(screen.queryByText(/mild_unease/i)).toBeNull();
  });

  it('resolves Character.id targets to display names', () => {
    render(
      <CharacterAffectPanel
        characters={[granny, wolf]}
        context={makeContext({
          sentiments: { char_1: [{ toEntityRef: 'char_2', emotion: 'fear', strength: 0.7 }] },
        })}
      />
    );
    // The sentiment line should contain the resolved display name "Wolf",
    // not the bare "char_2" id.
    const sentimentLine = screen.getByText(/fear/i).closest('li');
    expect(sentimentLine?.textContent).toContain('Wolf');
    expect(sentimentLine?.textContent).not.toContain('char_2');
  });

  it('falls back to raw ref when target is not a defined character', () => {
    render(
      <CharacterAffectPanel
        characters={[granny]}
        context={makeContext({
          sentiments: { char_1: [{ toEntityRef: 'cookie', emotion: 'love', strength: 0.6 }] },
        })}
      />
    );
    expect(screen.getByText(/cookie/i)).toBeTruthy();
  });

  it('uses custom resolveTargetName when provided', () => {
    render(
      <CharacterAffectPanel
        characters={[granny]}
        context={makeContext({
          sentiments: { char_1: [{ toEntityRef: 'item:cookie', emotion: 'love', strength: 0.6 }] },
        })}
        resolveTargetName={(ref) => ref.startsWith('item:') ? `Item: ${ref.slice(5)}` : ref}
      />
    );
    expect(screen.getByText(/Item: cookie/)).toBeTruthy();
  });

  it('shows close button only when onClose prop is provided', () => {
    const { rerender } = render(<CharacterAffectPanel characters={[]} context={makeContext({})} />);
    expect(screen.queryByLabelText(/close/i)).toBeNull();
    rerender(<CharacterAffectPanel characters={[]} context={makeContext({})} onClose={() => {}} />);
    expect(screen.getByLabelText(/close/i)).toBeTruthy();
  });

  it('fires onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CharacterAffectPanel characters={[]} context={makeContext({})} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });
});
