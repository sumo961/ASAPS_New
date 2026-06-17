/**
 * Tests for WebViewElement (browser/iframe mode — jsdom is not Electron).
 * Covers iframe rendering, contextHash fragment composition, the Done button
 * (default + custom label) → onExit('done'), the postMessage result channel
 * (string + object value), and the exit-once guard.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { WebViewElement } from '../../src/components/WebViewElement';

const post = (data: any) => act(() => void window.dispatchEvent(new MessageEvent('message', { data })));

describe('WebViewElement (iframe mode)', () => {
  it('renders an iframe pointing at the url (no electron webview)', () => {
    const { container } = render(<WebViewElement url="https://example.com/x" onExit={vi.fn()} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe('https://example.com/x');
    expect(container.querySelector('webview')).toBeNull();
  });

  it('composes contextHash as the URL fragment, replacing any existing one', () => {
    const { container } = render(<WebViewElement url="https://e.com/p#old" contextHash="k=v&a=b" onExit={vi.fn()} />);
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe('https://e.com/p#k=v&a=b');
  });

  it('renders the Done button (default + custom) and exits with "done" on click', () => {
    const onExit = vi.fn();
    const { getByText } = render(<WebViewElement url="https://e.com" doneButtonText="Finish" onExit={onExit} />);
    fireEvent.click(getByText('Finish'));
    expect(onExit).toHaveBeenCalledWith('done');
  });

  it('only exits once even if the button is clicked repeatedly', () => {
    const onExit = vi.fn();
    const { getByText } = render(<WebViewElement url="https://e.com" onExit={onExit} />);
    const btn = getByText('Done');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('exits via a postMessage result (string value)', () => {
    const onExit = vi.fn();
    render(<WebViewElement url="https://e.com" onExit={onExit} />);
    post({ asaps: 'result', value: 'chosen-A' });
    expect(onExit).toHaveBeenCalledWith('chosen-A');
  });

  it('stringifies a non-string postMessage value', () => {
    const onExit = vi.fn();
    render(<WebViewElement url="https://e.com" onExit={onExit} />);
    post({ asaps: 'result', value: { pick: 2 } });
    expect(onExit).toHaveBeenCalledWith(JSON.stringify({ pick: 2 }));
  });

  it('ignores unrelated postMessages', () => {
    const onExit = vi.fn();
    render(<WebViewElement url="https://e.com" onExit={onExit} />);
    post({ foo: 'bar' });
    post('a plain string');
    expect(onExit).not.toHaveBeenCalled();
  });

  it('does not crash on an invalid exitUrlPattern', () => {
    expect(() => render(<WebViewElement url="https://e.com" exitUrlPattern="(unclosed" onExit={vi.fn()} />)).not.toThrow();
  });
});
