import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitInitDialog } from '../GitInitDialog';

describe('GitInitDialog (the "Track versions" dialog)', () => {
  it('defaults to local-only and never shows a URL field the author must clear', () => {
    render(<GitInitDialog onInit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText(/On this computer only/)).toBeChecked();
    expect(screen.queryByLabelText(/Server address/)).toBeNull();
    // Plain language first: no Git jargon in the title
    expect(screen.getByRole('heading').textContent).not.toMatch(/git|repositor/i);
  });

  it('local choice initializes with no remote', async () => {
    const onInit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<GitInitDialog onInit={onInit} onClose={onClose} />);
    fireEvent.click(screen.getByText('Start tracking'));
    await waitFor(() => expect(onInit).toHaveBeenCalledWith(undefined));
    expect(onClose).toHaveBeenCalled();
  });

  it('server choice reveals the address field and requires it before submitting', async () => {
    const onInit = vi.fn().mockResolvedValue(undefined);
    render(<GitInitDialog onInit={onInit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Also back up to a server/));
    const field = screen.getByLabelText(/Server address/);
    expect((screen.getByText('Start tracking') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: '  https://example.com/me/story.git ' } });
    fireEvent.click(screen.getByText('Start tracking'));
    await waitFor(() => expect(onInit).toHaveBeenCalledWith('https://example.com/me/story.git'));
  });

  it('"Not now" closes without initializing', () => {
    const onInit = vi.fn();
    const onClose = vi.fn();
    render(<GitInitDialog onInit={onInit} onClose={onClose} />);
    fireEvent.click(screen.getByText('Not now'));
    expect(onClose).toHaveBeenCalled();
    expect(onInit).not.toHaveBeenCalled();
  });
});
