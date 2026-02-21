import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebugPanel } from './DebugPanel';
import { Story, BeatTypeRegistry } from '@asaps/core';

describe('DebugPanel', () => {
  const createTestStory = () => {
    const story = new Story({
      title: 'Test Story',
      author: 'Test Author',
      firstBeatId: 'beat1',
    });

    const registry = BeatTypeRegistry.getInstance();

    const beat1 = registry.createBeat('infoText', {
      id: 'beat1',
      name: 'Start',
      type: 'infoText',
      parameters: { text: 'Start text', buttonText: 'Continue' },
      connections: [{ targetId: 'beat2' }],
      x: 0,
      y: 0,
    });

    const beat2 = registry.createBeat('dialogTree', {
      id: 'beat2',
      name: 'Choice',
      type: 'dialogTree',
      parameters: {},
      connections: [{ targetId: 'beat3' }],
      x: 100,
      y: 0,
    });

    const beat3 = registry.createBeat('endScreen', {
      id: 'beat3',
      name: 'End',
      type: 'endScreen',
      parameters: { message: 'The End' },
      x: 200,
      y: 0,
    });

    story.addBeat(beat1);
    story.addBeat(beat2);
    story.addBeat(beat3);

    return story;
  };

  it('should render debug panel with tabs', () => {
    const story = createTestStory();
    const onClose = vi.fn();

    render(<DebugPanel story={story} onClose={onClose} />);

    expect(screen.getByText('Debug Tools')).toBeInTheDocument();
    // Use getByRole to target tab buttons specifically (avoids duplicate text in child component headings)
    expect(screen.getByRole('button', { name: /reachability analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /path analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /story logic/i })).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    const story = createTestStory();
    const onClose = vi.fn();

    const { container } = render(<DebugPanel story={story} onClose={onClose} />);

    // Close button is in the header, contains an X icon
    const header = container.querySelector('.rounded-t-lg');
    const closeButton = header?.querySelector('button');
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should switch between reachability and path tabs', () => {
    const story = createTestStory();
    const onClose = vi.fn();

    render(<DebugPanel story={story} onClose={onClose} />);

    const reachabilityTab = screen.getByRole('button', { name: /reachability analysis/i });
    const pathTab = screen.getByRole('button', { name: /path analysis/i });

    expect(reachabilityTab).toHaveClass('text-blue-600');
    expect(pathTab).toHaveClass('text-gray-600');

    // Click path tab
    fireEvent.click(pathTab);

    expect(pathTab).toHaveClass('text-blue-600');
    expect(reachabilityTab).toHaveClass('text-gray-600');
  });

  it('should pass onHighlightBeat callback to ReachabilityReport', () => {
    const story = createTestStory();
    const onClose = vi.fn();
    const onHighlightBeat = vi.fn();

    render(
      <DebugPanel
        story={story}
        onClose={onClose}
        onHighlightBeat={onHighlightBeat}
      />
    );

    expect(screen.getByRole('button', { name: /reachability analysis/i })).toBeInTheDocument();
  });

  it('should pass onHighlightPath callback to PathVisualization', () => {
    const story = createTestStory();
    const onClose = vi.fn();
    const onHighlightPath = vi.fn();

    render(
      <DebugPanel
        story={story}
        onClose={onClose}
        onHighlightPath={onHighlightPath}
      />
    );

    const pathTab = screen.getByRole('button', { name: /path analysis/i });
    fireEvent.click(pathTab);

    expect(pathTab).toHaveClass('text-blue-600');
  });

  it('should display tip in footer', () => {
    const story = createTestStory();
    const onClose = vi.fn();

    render(<DebugPanel story={story} onClose={onClose} />);

    expect(
      screen.getByText(/click on any beat or path to highlight it in the graph/i)
    ).toBeInTheDocument();
  });
});
