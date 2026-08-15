/**
 * The ⚠ mark is the banner's other half: the list says which beats are broken,
 * the graph says where they are. Without it the author reads three beat names
 * and then hunts for them by eye.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { BeatNode } from '../BeatNode';

const renderNode = (extra: Record<string, unknown>) =>
  render(
    <ReactFlowProvider>
      <BeatNode
        id="beat_3"
        selected={false}
        data={{ beat: { id: 'beat_3' } as never, label: 'Decision 1', type: 'dialogTree',
                selected: false, color: '#888', ...extra }}
        type="beatNode" zIndex={1} isConnectable={false} xPos={0} yPos={0} dragging={false}
      />
    </ReactFlowProvider>,
  );

describe('BeatNode broken-link mark', () => {
  it('marks a beat whose choice points nowhere', () => {
    renderNode({ brokenTarget: 'beat_intake' });
    expect(screen.getByText('⚠')).toBeTruthy();
  });

  it('says what is broken on hover, including the missing id', () => {
    const { container } = renderNode({ brokenTarget: 'beat_intake' });
    const titled = container.querySelector('[title]') as HTMLElement;
    expect(titled.getAttribute('title')).toContain('beat_intake');
    expect(titled.getAttribute('title')).toContain('play stops at this beat');
  });

  it('leaves a healthy beat unmarked', () => {
    renderNode({});
    expect(screen.queryByText('⚠')).toBeNull();
  });

  it('keeps the plain title when nothing is broken', () => {
    const { container } = renderNode({});
    expect((container.querySelector('[title]') as HTMLElement).getAttribute('title')).toBe('Decision 1');
  });
});
