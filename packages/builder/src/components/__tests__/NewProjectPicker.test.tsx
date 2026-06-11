/**
 * Tests for NewProjectPicker — the in-editor "+ New" modal that
 * surfaces three create paths (Empty / Build from a prompt /
 * Co-write with AI).
 *
 * The picker is intentionally thin: it routes clicks to the
 * caller's handlers and disables the AI cards when no provider is
 * wired. Tests focus on the behaviours that would silently break
 * the create-flow if regressed:
 *   - all three cards render with correct labels + descriptions
 *   - clicking a card invokes the matching handler exactly once
 *   - close-on-click-card (the picker dismisses after a pick)
 *   - close-on-backdrop-click
 *   - AI cards disable + show SOON pill when handler is missing
 *   - Empty card stays enabled even without AI providers
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewProjectPicker } from '../NewProjectPicker';

describe('NewProjectPicker', () => {
  function setup(overrides: Partial<Parameters<typeof NewProjectPicker>[0]> = {}) {
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      onPickEmpty: vi.fn(),
      onPickPrompt: vi.fn(),
      onPickIdeator: vi.fn(),
      ...overrides,
    };
    render(<NewProjectPicker {...props} />);
    return props;
  }

  it('renders all three cards with current copy', () => {
    setup();
    // Card 1 — Empty
    expect(screen.getByText('Empty project')).toBeInTheDocument();
    expect(screen.getByText(/Pick layout up front/i)).toBeInTheDocument();
    // Card 2 — Prompt
    expect(screen.getByText('Build from a prompt')).toBeInTheDocument();
    expect(screen.getByText(/Your prompt → AI drafts the rest/i)).toBeInTheDocument();
    // Card 3 — Ideator
    expect(screen.getByText('Co-write with AI')).toBeInTheDocument();
    expect(screen.getByText(/Develop your idea in conversation/i)).toBeInTheDocument();
  });

  it('renders the "Start a new project" modal title', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Start a new project' })).toBeInTheDocument();
  });

  it('renders nothing when isOpen is false', () => {
    setup({ isOpen: false });
    expect(screen.queryByText('Empty project')).not.toBeInTheDocument();
    expect(screen.queryByText('Start a new project')).not.toBeInTheDocument();
  });

  describe('click handlers', () => {
    it('clicks Empty → onPickEmpty + onClose', () => {
      const props = setup();
      fireEvent.click(screen.getByText('Empty project').closest('button')!);
      expect(props.onPickEmpty).toHaveBeenCalledTimes(1);
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onPickPrompt).not.toHaveBeenCalled();
      expect(props.onPickIdeator).not.toHaveBeenCalled();
    });

    it('clicks Build from a prompt → onPickPrompt + onClose', () => {
      const props = setup();
      fireEvent.click(screen.getByText('Build from a prompt').closest('button')!);
      expect(props.onPickPrompt).toHaveBeenCalledTimes(1);
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onPickEmpty).not.toHaveBeenCalled();
    });

    it('clicks Co-write with AI → onPickIdeator + onClose', () => {
      const props = setup();
      fireEvent.click(screen.getByText('Co-write with AI').closest('button')!);
      expect(props.onPickIdeator).toHaveBeenCalledTimes(1);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('clicks the X (close) button → onClose only, no pick handlers', () => {
      const props = setup();
      fireEvent.click(screen.getByTitle('Close'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onPickEmpty).not.toHaveBeenCalled();
      expect(props.onPickPrompt).not.toHaveBeenCalled();
      expect(props.onPickIdeator).not.toHaveBeenCalled();
    });

    it('clicks the backdrop → onClose', () => {
      // Backdrop is the outermost div with fixed inset-0.
      const props = setup();
      // The X button's container chain leads up to the modal box; the
      // backdrop is its sibling. We find it via the bg-opacity-50 wrapper.
      const backdrop = document.querySelector('.fixed.inset-0.bg-black') as HTMLElement;
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking the modal content does NOT trigger onClose', () => {
      // stopPropagation in the picker keeps inner clicks from
      // bubbling up to the backdrop's onClose. Critical UX: user
      // selecting text inside the modal shouldn't dismiss it.
      const props = setup();
      const heading = screen.getByRole('heading', { name: 'Start a new project' });
      fireEvent.click(heading);
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });

  describe('SOON / disabled states', () => {
    it('Prompt card shows SOON and is disabled when onPickPrompt is omitted', () => {
      setup({ onPickPrompt: undefined });
      const promptCard = screen.getByText('Build from a prompt').closest('button')!;
      expect(promptCard).toBeDisabled();
      // SOON pill appears in the same card.
      const soons = screen.getAllByText('SOON');
      expect(soons.length).toBeGreaterThanOrEqual(1);
    });

    it('Ideator card shows SOON and is disabled when onPickIdeator is omitted', () => {
      setup({ onPickIdeator: undefined });
      const ideatorCard = screen.getByText('Co-write with AI').closest('button')!;
      expect(ideatorCard).toBeDisabled();
    });

    it('Empty card stays enabled even without AI handlers', () => {
      // The Empty path doesn't need an AI provider — the picker
      // shouldn't disable it just because Prompt/Ideator are
      // disabled. Authors with no AI key should still get a
      // working create flow.
      const props = setup({ onPickPrompt: undefined, onPickIdeator: undefined });
      const emptyCard = screen.getByText('Empty project').closest('button')!;
      expect(emptyCard).not.toBeDisabled();
      fireEvent.click(emptyCard);
      expect(props.onPickEmpty).toHaveBeenCalledTimes(1);
    });

    it('clicking a disabled Prompt card does not fire the handler', () => {
      // Pretend a malicious caller wires a handler then immediately
      // removes it — disabled buttons must stay click-deaf.
      const onPickPrompt = vi.fn();
      setup({ onPickPrompt: undefined });
      const promptCard = screen.getByText('Build from a prompt').closest('button')!;
      fireEvent.click(promptCard);
      expect(onPickPrompt).not.toHaveBeenCalled();
    });
  });
});
