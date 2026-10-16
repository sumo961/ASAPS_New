import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationHistoryPanel, conversationTitle } from '../../src/components/ConversationHistoryPanel';

const chats = [
  {
    beatId: 'b2', updatedAt: 2,
    lines: [
      { speaker: 'Zoe', text: 'Hello there.', characterId: 'z' },
      { speaker: 'Zoe', text: 'I said GET OUT!', characterId: 'z', speakerState: 'angry' },
      { speaker: 'Ana', text: 'Okay, okay.', fromPlayer: true },
      { speaker: 'Zoe', text: 'Back again?', newVisit: true },
    ],
  },
  { beatId: 'b1', updatedAt: 1, lines: [{ speaker: 'Tim', text: 'Hi.' }, { speaker: 'Mark', text: 'Yo.' }] },
];

describe('ConversationHistoryPanel', () => {
  it('names a chat after the people in it, not the player', () => {
    expect(conversationTitle(chats[0] as any)).toBe('Zoe');
    expect(conversationTitle(chats[1] as any)).toBe('Tim, Mark');
  });

  it('lists the chats and shows a transcript with pictures for the state each line showed', () => {
    const resolvePicture = vi.fn((line: any) => (line.speakerState === 'angry' ? 'angry.png' : 'calm.png'));
    render(<ConversationHistoryPanel conversations={chats as any} onClose={() => {}} resolvePicture={resolvePicture} />);
    expect(screen.getByTestId('messages-list').textContent).toContain('Tim, Mark');
    const transcript = screen.getByTestId('messages-transcript');
    expect(transcript.textContent).toContain('I said GET OUT!');
    expect(transcript.textContent).toContain('· · ·');
    const srcs = [...transcript.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['calm.png', 'angry.png', 'calm.png']);

    fireEvent.click(screen.getByText('Tim, Mark'));
    expect(screen.getByTestId('messages-transcript').textContent).toContain('Yo.');
  });

  it('closes on the Close button and says when there is nothing yet', () => {
    const onClose = vi.fn();
    render(<ConversationHistoryPanel conversations={[]} onClose={onClose} />);
    expect(screen.getByTestId('messages-panel').textContent).toContain('No conversations yet.');
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
