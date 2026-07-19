/**
 * CharacterDevelopmentDialog tests — stage flow and, most importantly, the
 * accept-write into the Character/CharacterVariant model (base-vs-variant
 * personality convention, random selection policy, enrich-in-place).
 * AI calls are mocked at the getAIService boundary.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import {
  CharacterDevelopmentDialog,
  type CharacterDevelopmentSession,
} from '../CharacterDevelopmentDialog';
import type { Character } from '../../../types/character';
import type { GeneratedCharacterProfile } from '../../../services/prompts/characterGeneration';

const generateCharacterQuestions = vi.fn();
const generateCharacterProfile = vi.fn();
const reviseCharacterCard = vi.fn();

vi.mock('../../../services', () => ({
  getAIService: () => ({
    generateCharacterQuestions,
    generateCharacterProfile,
    reviseCharacterCard,
  }),
}));

vi.mock('../../../hooks/useAI', () => ({
  useAI: () => ({ isConfigured: true }),
}));

const NEUTRAL_TRAITS = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

const profileWithVariants: GeneratedCharacterProfile = {
  name: 'iris',
  displayName: 'Iris',
  description: 'Core identity description.',
  traits: NEUTRAL_TRAITS,
  initialMood: { valence: 0, arousal: 0 },
  variants: [
    {
      id: 'hostile',
      name: 'Hostile',
      characterDescription: 'Hostile Iris, self-contained.',
      traits: { ...NEUTRAL_TRAITS, agreeableness: 0.2 },
      initialMood: { valence: -0.4, arousal: 0.5 },
    },
    {
      id: 'cooperative',
      name: 'Cooperative',
      characterDescription: 'Cooperative Iris, self-contained.',
      traits: { ...NEUTRAL_TRAITS, agreeableness: 0.8 },
      initialMood: { valence: 0.3, arousal: 0.1 },
    },
  ],
};

const profileNoVariants: GeneratedCharacterProfile = {
  name: 'iris',
  displayName: 'Iris',
  description: 'Solo description.',
  traits: { ...NEUTRAL_TRAITS, neuroticism: 0.8 },
  initialMood: { valence: -0.2, arousal: 0.1 },
};

const existingIris: Character = {
  id: 'char_iris',
  name: 'iris',
  displayName: 'Iris',
  role: 'npc',
  description: 'Old description.',
  visual: { type: 'static' },
  states: [],
  defaultState: '',
  counters: [],
  inventory: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderDialog = (
  session: CharacterDevelopmentSession,
  characters: Character[] = [],
  onCharactersChange = vi.fn(),
  onClose = vi.fn(),
) => {
  render(
    <CharacterDevelopmentDialog
      session={session}
      onClose={onClose}
      characters={characters}
      onCharactersChange={onCharactersChange}
    />,
  );
  return { onCharactersChange, onClose };
};

beforeEach(() => {
  generateCharacterQuestions.mockReset();
  generateCharacterProfile.mockReset();
  reviseCharacterCard.mockReset();
});

afterEach(() => cleanup());

describe('CharacterDevelopmentDialog', () => {
  it('renders nothing when session is null', () => {
    const { container } = render(
      <CharacterDevelopmentDialog
        session={null}
        onClose={() => {}}
        characters={[]}
        onCharactersChange={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('disables Generate until there is something to work from', () => {
    renderDialog({ seed: {} });
    const generate = screen.getByRole('button', { name: /generate$/i });
    expect(generate).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/45-year-old client/i), {
      target: { value: 'A grumpy lighthouse keeper.' },
    });
    expect(generate).not.toBeDisabled();
  });

  it('generates and accepts a new character without variants', async () => {
    generateCharacterProfile.mockResolvedValue(profileNoVariants);
    const { onCharactersChange, onClose } = renderDialog({ seed: { brief: 'a mother' } });

    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));
    await waitFor(() => expect(screen.getByText('Solo description.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add character/i }));
    expect(onCharactersChange).toHaveBeenCalledTimes(1);
    const created = onCharactersChange.mock.calls[0][0][0] as Character;
    expect(created.displayName).toBe('Iris');
    expect(created.description).toBe('Solo description.');
    expect(created.traits?.neuroticism).toBe(0.8);
    expect(created.variants).toBeUndefined();
    expect(created.variantSelectionPolicy).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });

  it('accepts variants with random policy; base personality stays per-variant', async () => {
    generateCharacterProfile.mockResolvedValue(profileWithVariants);
    const { onCharactersChange } = renderDialog({ seed: { brief: 'a mother' } });

    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));
    await waitFor(() => expect(screen.getByText(/pick a disposition at random/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add character/i }));
    const created = onCharactersChange.mock.calls[0][0][0] as Character;
    expect(created.variants).toHaveLength(2);
    expect(created.variantSelectionPolicy).toBe('random');
    expect(created.defaultVariantId).toBeUndefined();
    // Variant convention: base owns identity only when variants exist.
    expect(created.traits).toBeUndefined();
    expect(created.initialMood).toBeUndefined();
  });

  it('excluding all but one variant sets it as default instead of random', async () => {
    generateCharacterProfile.mockResolvedValue(profileWithVariants);
    const { onCharactersChange } = renderDialog({ seed: { brief: 'a mother' } });

    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));
    await waitFor(() => expect(screen.getByText('Hostile Iris, self-contained.')).toBeInTheDocument());

    const includeToggles = screen.getAllByTitle('Include this variant');
    fireEvent.click(includeToggles[0]); // drop 'hostile'
    fireEvent.click(screen.getByRole('button', { name: /add character/i }));

    const created = onCharactersChange.mock.calls[0][0][0] as Character;
    expect(created.variants).toHaveLength(1);
    expect(created.variants![0].id).toBe('cooperative');
    expect(created.variantSelectionPolicy).toBeUndefined();
    expect(created.defaultVariantId).toBe('cooperative');
  });

  it('enriches an existing character in place and reports it via onAccepted', async () => {
    generateCharacterProfile.mockResolvedValue(profileWithVariants);
    const onAccepted = vi.fn();
    const { onCharactersChange } = renderDialog(
      { seed: { name: 'Iris', brief: 'the mother' }, existingCharacterId: 'char_iris', onAccepted },
      [existingIris],
    );

    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /apply to iris/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /apply to iris/i }));

    const updatedList = onCharactersChange.mock.calls[0][0] as Character[];
    expect(updatedList).toHaveLength(1);
    const updated = updatedList[0];
    expect(updated.id).toBe('char_iris'); // same character, not a new one
    expect(updated.description).toBe('Core identity description.');
    expect(updated.variants).toHaveLength(2);
    expect(onAccepted).toHaveBeenCalledWith(updated);
  });

  it('askFirst runs the questions stage and passes tapped answers to generation', async () => {
    generateCharacterQuestions.mockResolvedValue([
      { question: 'How does she react to refusal?', suggestions: ['Goes cold', 'Escalates'] },
    ]);
    generateCharacterProfile.mockResolvedValue(profileNoVariants);
    renderDialog({ seed: {}, askFirst: true });

    fireEvent.change(screen.getByPlaceholderText(/45-year-old client/i), {
      target: { value: 'A mother.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByText('How does she react to refusal?')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Goes cold' }));
    fireEvent.click(screen.getByRole('button', { name: /generate character/i }));
    await waitFor(() => expect(generateCharacterProfile).toHaveBeenCalled());

    const seedArg = generateCharacterProfile.mock.calls[0][0];
    expect(seedArg.answers).toEqual([
      { question: 'How does she react to refusal?', answer: 'Goes cold' },
    ]);
  });

  it('preview cards render interactive stance pads (base lens + per-variant)', async () => {
    generateCharacterProfile.mockResolvedValue({
      ...profileWithVariants,
      variants: profileWithVariants.variants!.map((v, i) =>
        i === 0 ? { ...v, stance: { warmth: -0.7, dominance: 0.5 } } : v,
      ),
    });
    renderDialog({ seed: { brief: 'a mother' } });
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));
    await waitFor(() => expect(screen.getByText('Hostile Iris, self-contained.')).toBeInTheDocument());

    // One pad per card (base + 2 variants) — each shows the w/d readout.
    const body = document.body.textContent!;
    expect((body.match(/w [+-]\d\.\d\d/g) || []).length).toBe(3);
    // The authored hostile stance gets its octant subtitle.
    expect(body).toContain('cold-dominant (hostile)');
  });

  it('surfaces generation errors without leaving the brief stage', async () => {
    generateCharacterProfile.mockRejectedValue(new Error('provider exploded'));
    renderDialog({ seed: { brief: 'a mother' } });
    fireEvent.click(screen.getByRole('button', { name: /generate$/i }));
    await waitFor(() => expect(screen.getByText('provider exploded')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/45-year-old client/i)).toBeInTheDocument();
  });
});
