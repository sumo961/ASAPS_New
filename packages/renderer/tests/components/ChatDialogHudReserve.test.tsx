import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChatDialogView } from '../../src/components/ChatDialogView';

const subscribeWith = (rects: any[]) => (l: (r: any[] | undefined) => void) => { l(rects); return () => {}; };
const messages = [{ id: 'm1', speaker: 'Nathan', text: 'A second message, a minute later.', isPlayer: false }] as any;

describe('ChatDialogView keeps its message area clear of top HUDs', () => {
  it('steps around a narrow corner HUD sideways (the 740×360 clock case)', () => {
    const { container } = render(
      <ChatDialogView messages={messages} mode="chat-scroll" responsive stageWidth={740} stageHeight={360}
        onSubscribeReservedHudRects={subscribeWith([{ id: '__timer', x: 511, y: 57, width: 217, height: 40 }])} />,
    );
    const area = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(area.style.paddingRight).toBe('237px'); // 740 − 511 + 8
    expect(area.style.paddingTop).toBe('12px');     // no band: nothing is above the column
  });

  it('pushes the messages below a wide or centred top HUD', () => {
    const { container } = render(
      <ChatDialogView messages={messages} mode="chat-scroll" responsive stageWidth={740} stageHeight={360}
        onSubscribeReservedHudRects={subscribeWith([{ x: 200, y: 20, width: 340, height: 40 }])} />,
    );
    const area = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(area.style.paddingTop).toBe('68px'); // 20 + 40 + 8
  });

  it('leaves the padding alone without HUDs, and ignores bottom HUDs', () => {
    const { container } = render(
      <ChatDialogView messages={messages} mode="chat-scroll" responsive stageWidth={740} stageHeight={360}
        onSubscribeReservedHudRects={subscribeWith([{ x: 12, y: 300, width: 120, height: 40 }])} />,
    );
    const area = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(area.style.paddingTop).toBe('12px'); // the base padding, unchanged
  });

  it('caps the reserve at 40% of the height', () => {
    const { container } = render(
      <ChatDialogView messages={messages} mode="chat-scroll" responsive stageWidth={740} stageHeight={360}
        onSubscribeReservedHudRects={subscribeWith([{ x: 200, y: 10, width: 340, height: 170 }])} />,
    );
    const area = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(area.style.paddingTop).toBe('144px');
  });

  it('restores the base top padding when the top HUD goes away', () => {
    const { container, rerender } = render(
      <ChatDialogView messages={messages} mode="chat-scroll" responsive stageWidth={740} stageHeight={360}
        onSubscribeReservedHudRects={subscribeWith([{ x: 200, y: 20, width: 340, height: 40 }])} />,
    );
    const area = container.querySelector('.overflow-y-auto') as HTMLElement;
    expect(area.style.paddingTop).toBe('68px');
    rerender(
      <ChatDialogView messages={messages} mode="chat-scroll" responsive stageWidth={740} stageHeight={360}
        onSubscribeReservedHudRects={subscribeWith([])} />,
    );
    expect(area.style.paddingTop).toBe('12px');
  });
});
