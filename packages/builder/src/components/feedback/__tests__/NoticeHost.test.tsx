import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { NoticeHost } from '../NoticeHost';
import { notify, confirmAction } from '../../../utils/notify';

describe('NoticeHost', () => {
  it('renders notices with detail and runs the action, then closes', async () => {
    render(<NoticeHost />);
    let ran = false;
    act(() => { notify.success('Deleted "Intro".', { detail: 'one beat', action: { label: 'Undo', run: () => { ran = true; } } }); });
    expect(screen.getByText('Deleted "Intro".')).toBeTruthy();
    expect(screen.getByText('one beat')).toBeTruthy();
    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() => expect(screen.queryByText('Deleted "Intro".')).toBeNull());
    expect(ran).toBe(true);
  });

  it('a long notice scrolls inside and keeps its close button (2026-10-27)', () => {
    render(<NoticeHost />);
    const long = Array.from({ length: 150 }, (_, i) => `create mode 100644 clusters/start/beat_${i}.json`).join('\n');
    act(() => { notify.success(long); });
    const notice = screen.getByRole('status');
    expect(notice.style.maxHeight).toBe('calc(100vh - 40px)');
    const text = notice.querySelector('[data-notice-text]') as HTMLElement;
    expect(text.style.overflowY).toBe('auto');
    expect(text.style.maxHeight).toBe('45vh');
    // The close button is outside the scrolling text.
    const close = screen.getByLabelText('Dismiss');
    expect(text.contains(close)).toBe(false);
  });

  it('confirm: named buttons, Cancel focused for destructive, Escape cancels', async () => {
    render(<NoticeHost />);
    let answer: Promise<boolean> | undefined;
    act(() => { answer = confirmAction({ title: 'Remove translation?', confirmLabel: 'Remove translation', destructive: true }); });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Remove translation?');
    expect(document.activeElement?.textContent).toBe('Cancel');
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    await expect(answer!).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('confirm button resolves true; queued confirms show one at a time', async () => {
    render(<NoticeHost />);
    let a: Promise<boolean> | undefined; let b: Promise<boolean> | undefined;
    act(() => {
      a = confirmAction({ title: 'First?', confirmLabel: 'Yes first' });
      b = confirmAction({ title: 'Second?', confirmLabel: 'Yes second' });
    });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    fireEvent.click(screen.getByText('Yes first'));
    await expect(a!).resolves.toBe(true);
    await waitFor(() => expect(screen.getByText('Second?')).toBeTruthy());
    fireEvent.click(screen.getByText('Cancel'));
    await expect(b!).resolves.toBe(false);
  });
});
