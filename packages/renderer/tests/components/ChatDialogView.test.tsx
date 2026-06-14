/**
 * Tests for ChatDialogView — renders dialog as a chat/messaging UI in two
 * modes (chat-scroll = full history, chat-bubble = latest only), with
 * player/NPC bubbles, avatars or name labels, choice buttons, and a typing
 * indicator. Driven with React Testing Library.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatDialogView, type ChatMessage } from '../../src/components/ChatDialogView';

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  speaker: 'Marcus',
  text: 'Hello there',
  ...over,
});

describe('mode', () => {
  it('chat-scroll renders the full message history', () => {
    render(
      <ChatDialogView
        mode="chat-scroll"
        messages={[msg({ id: 'a', text: 'First line' }), msg({ id: 'b', text: 'Second line' })]}
      />,
    );
    expect(screen.getByText('First line')).toBeDefined();
    expect(screen.getByText('Second line')).toBeDefined();
  });

  it('chat-bubble shows only the latest message', () => {
    render(
      <ChatDialogView
        mode="chat-bubble"
        messages={[msg({ id: 'a', text: 'First line' }), msg({ id: 'b', text: 'Second line' })]}
      />,
    );
    expect(screen.queryByText('First line')).toBeNull();
    expect(screen.getByText('Second line')).toBeDefined();
  });
});

describe('speaker label vs avatar', () => {
  it('shows the NPC speaker name as a label when avatars are off', () => {
    render(<ChatDialogView mode="chat-scroll" showAvatars={false} messages={[msg({ speaker: 'Marcus' })]} />);
    expect(screen.getByText('Marcus')).toBeDefined();
  });

  it('suppresses the name label and shows an avatar initial when avatars are on', () => {
    render(<ChatDialogView mode="chat-scroll" showAvatars messages={[msg({ speaker: 'marcus' })]} />);
    expect(screen.queryByText('marcus')).toBeNull(); // full name not shown
    expect(screen.getByText('M')).toBeDefined(); // uppercased initial avatar
  });

  it('renders an avatar image when avatarUrl is provided', () => {
    const { container } = render(
      <ChatDialogView mode="chat-scroll" showAvatars messages={[msg({ avatarUrl: 'http://x/a.png' })]} />,
    );
    expect(container.querySelector('img[src="http://x/a.png"]')).not.toBeNull();
  });

  it('never labels a player message (even with avatars off)', () => {
    render(
      <ChatDialogView
        mode="chat-scroll"
        showAvatars={false}
        messages={[msg({ speaker: 'You', text: 'My reply', isPlayer: true })]}
      />,
    );
    expect(screen.getByText('My reply')).toBeDefined();
    expect(screen.queryByText('You')).toBeNull(); // player bubbles carry no name label
  });
});

describe('choices', () => {
  it('renders choice buttons and fires onChoiceSelect with the choice id', () => {
    const onChoiceSelect = vi.fn();
    render(
      <ChatDialogView
        mode="chat-scroll"
        messages={[msg()]}
        choices={[{ id: 'c1', text: 'Say hi' }, { id: 'c2', text: 'Stay silent' }]}
        onChoiceSelect={onChoiceSelect}
      />,
    );
    expect(screen.getByRole('button', { name: 'Say hi' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Stay silent' }));
    expect(onChoiceSelect).toHaveBeenCalledWith('c2');
  });

  it('renders no buttons when there are no choices', () => {
    render(<ChatDialogView mode="chat-scroll" messages={[msg()]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('background', () => {
  it('uses a background image when backgroundUrl is set', () => {
    const { container } = render(
      <ChatDialogView mode="chat-scroll" messages={[msg()]} backgroundUrl="http://x/bg.jpg" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.backgroundImage).toContain('http://x/bg.jpg');
  });

  it('falls back to a background color when no url is given', () => {
    const { container } = render(
      <ChatDialogView mode="chat-scroll" messages={[msg()]} backgroundColor="rgb(10, 20, 30)" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.backgroundColor).toBe('rgb(10, 20, 30)');
    expect(root.style.backgroundImage).toBe('');
  });
});
