/**
 * Choose your character's picture cards (optionStyle 'pictures' |
 * 'picturesOnly'): the responsive row of cards, the fixed-layout button
 * drawn as a card or a chip, and the element data that carries the picture.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { SlotFlowView } from '../../src/components/SlotFlowView';
import { PositionedBeatView, createPositionedElementData, type PositionedElementData } from '../../src/components/PositionedBeatView';
import { getSlotSpec } from '../../src/utils/slotLayout';
import { installRendererDomStubs } from '../helpers/installRendererDomStubs';

beforeEach(() => installRendererDomStubs());

const choices = [
  { id: 'o1', text: 'Mara', description: 'A doctor at the end of a double shift.', imageUrl: 'https://x/mara.png' },
  { id: 'o2', text: 'Jonas', description: 'The ferry mechanic.' },
];

const mountSlot = (props: Record<string, unknown> = {}) =>
  render(
    <SlotFlowView
      beatType="chooseCharacter"
      slots={getSlotSpec('multiChoice')!}
      content={{ question: 'Whose night is it?' }}
      backgroundColor="#101010"
      dynamicChoices={choices}
      requireFullRead={false}
      onAction={vi.fn()}
      {...props}
    />,
  );

const row = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-slotflow-slot="actions"]')!;

describe('picture choices — responsive layout', () => {
  it("'pictures': a wrapping row of cards with the picture, name and description", async () => {
    const onAction = vi.fn();
    const { container } = mountSlot({ choiceStyle: 'pictures', onAction });
    await waitFor(() => expect(row(container)).toBeTruthy());
    expect(row(container).style.flexDirection).toBe('row');
    expect(row(container).style.flexWrap).toBe('wrap');
    const cards = row(container).querySelectorAll('[data-choice-picture="card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('img')!.getAttribute('src')).toBe('https://x/mara.png');
    expect(cards[0].textContent).toContain('A doctor at the end of a double shift.');
    // No picture: the initial stands in, and the name still shows.
    expect(cards[1].querySelector('[data-choice-picture-placeholder]')!.textContent).toBe('J');
    expect(cards[1].textContent).toContain('Jonas');
    fireEvent.click(row(container).querySelectorAll('button')[0]);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('o1'));
  });

  it("'picturesOnly': no caption under a picture; the name is the button's label", async () => {
    const { container } = mountSlot({ choiceStyle: 'picturesOnly' });
    await waitFor(() => expect(row(container)).toBeTruthy());
    const [mara, jonas] = Array.from(row(container).querySelectorAll('button'));
    expect(mara.textContent).toBe('');
    expect(mara.getAttribute('aria-label')).toBe('Mara: A doctor at the end of a double shift.');
    // Without a picture the name is the only way to tell options apart.
    expect(jonas.textContent).toContain('Jonas');
  });

  it('text buttons when no picture style is set', async () => {
    const { container } = mountSlot();
    await waitFor(() => expect(row(container)).toBeTruthy());
    expect(container.querySelector('[data-choice-picture]')).toBeNull();
    expect(row(container).textContent).toContain('A doctor at the end of a double shift.');
  });
});

describe('picture choices — fixed layout', () => {
  const content = {
    choices: [{ id: 'o1', text: 'Mara', description: 'A doctor.', imageUrl: 'https://x/mara.png' }],
    choiceStyle: 'pictures',
  };

  it('element data carries the picture of the matching choice', () => {
    const [el] = createPositionedElementData(
      [{ kind: 'button', name: 'Mara', x: 100, y: 100, width: 180, height: 280 } as any],
      content,
      'chooseCharacter',
    );
    expect(el.actionId).toBe('o1');
    expect(el.picture).toEqual({ url: 'https://x/mara.png', style: 'pictures' });
    // Buttons without a picture style carry none.
    const [plain] = createPositionedElementData(
      [{ kind: 'button', name: 'Mara', x: 100, y: 100, width: 180, height: 280 } as any],
      { ...content, choiceStyle: null },
      'chooseCharacter',
    );
    expect(plain.picture).toBeUndefined();
  });

  const pictureEl = (loc: any): PositionedElementData => ({
    location: { kind: 'button', name: 'Mara', x: 100, y: 100, ...loc },
    content: 'Mara',
    actionId: 'o1',
    description: 'A doctor.',
    picture: { url: 'https://x/mara.png', style: 'pictures' },
  }) as any;

  it('a tall box is a card at the size the author placed', async () => {
    const onAction = vi.fn();
    const { container } = render(
      <PositionedBeatView stageWidth={1024} stageHeight={768} interactive elements={[pictureEl({ width: 180, height: 280 })]} onAction={onAction} />,
    );
    const card = await waitFor(() => container.querySelector('[data-choice-picture="card"]')!);
    expect(card.querySelector('img')!.getAttribute('src')).toBe('https://x/mara.png');
    const box = card.closest('button')!.parentElement!;
    expect(box.style.width).toBe('180px');
    expect(box.style.height).toBe('280px');
    fireEvent.click(card.closest('button')!);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('o1'));
  });

  it('a box placed for a text button shows a thumbnail beside the name', async () => {
    const { container } = render(
      <PositionedBeatView stageWidth={1024} stageHeight={768} interactive elements={[pictureEl({ width: 300, height: 50 })]} />,
    );
    const chip = await waitFor(() => container.querySelector('[data-choice-picture="chip"]')!);
    expect(chip.textContent).toContain('Mara');
  });
});
