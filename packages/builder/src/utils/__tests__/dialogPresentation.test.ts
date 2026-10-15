import { describe, it, expect } from 'vitest';
import { dialogChatMode, presentationModePatch, DIALOG_CHAT_RESPONSE_DELAY } from '../dialogPresentation';

describe('dialogPresentation', () => {
  it('reads the chat layout from layoutTemplate, the legacy field only as a fallback', () => {
    expect(dialogChatMode({ layoutTemplate: 'chat-scroll' })).toBe('chat-scroll');
    expect(dialogChatMode({ layoutTemplate: 'chat-bubble', presentationMode: 'positioned' })).toBe('chat-bubble');
    // A stale legacy value does not override the authoritative template.
    expect(dialogChatMode({ layoutTemplate: 'stacked', presentationMode: 'chat-scroll' })).toBeNull();
    expect(dialogChatMode({ presentationMode: 'chat-bubble' })).toBe('chat-bubble');
    expect(dialogChatMode({})).toBeNull();
    expect(dialogChatMode(undefined)).toBeNull();
  });

  it('writes both fields together', () => {
    expect(presentationModePatch({ layoutTemplate: 'stacked' }, 'chat-scroll'))
      .toEqual({ presentationMode: 'chat-scroll', layoutTemplate: 'chat-scroll' });
    expect(presentationModePatch({ layoutTemplate: 'chat-bubble' }, 'positioned'))
      .toEqual({ presentationMode: 'positioned', layoutTemplate: 'stacked' });
    // Conversation / custom stay what they are.
    expect(presentationModePatch({ layoutTemplate: 'conversation' }, 'positioned'))
      .toEqual({ presentationMode: 'positioned', layoutTemplate: 'conversation' });
  });

  it('shows the runtime default delay', () => {
    expect(DIALOG_CHAT_RESPONSE_DELAY).toBe(1.5);
  });
});
