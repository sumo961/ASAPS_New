/**
 * The banner exists because the validator's findings used to go to
 * console.warn and nowhere else — a generated story with three dead links
 * imported looking complete and stopped dead at its first decision.
 *
 * So what matters is that it names the beats, is dismissible, and can hand the
 * author to the beat concerned. A banner that merely says "there were errors"
 * would be the same failure with extra steps.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportIssuesBanner } from '../ImportIssuesBanner';

const broken = [
  { sourceBeatId: 'beat_3', sourceBeatName: 'Decision 1 — How you open', target: 'beat_intake' },
  { sourceBeatId: 'beat_3', sourceBeatName: 'Decision 1 — How you open', target: 'beat_intake' },
  { sourceBeatId: 'beat_9', sourceBeatName: 'Decision 5', target: 'beat_nowhere' },
];

describe('ImportIssuesBanner', () => {
  it('agrees its verb with the count', () => {
    // "1 choice lead nowhere" shipped to a screenshot before anyone read it.
    const { rerender } = render(<ImportIssuesBanner brokenTargets={[broken[0]]} onDismiss={() => {}} />);
    expect(screen.getByText(/1 choice leads nowhere/i)).toBeTruthy();
    rerender(<ImportIssuesBanner brokenTargets={broken} onDismiss={() => {}} />);
    expect(screen.getByText(/3 choices lead nowhere/i)).toBeTruthy();
  });

  it('says how many choices are broken, in play terms', () => {
    render(<ImportIssuesBanner brokenTargets={broken} onDismiss={() => {}} />);
    expect(screen.getByText(/3 choices lead nowhere/i)).toBeTruthy();
    // The consequence, not the data shape — "points at a missing beat" means
    // nothing until you have watched a story stop.
    expect(screen.getByText(/stops there when someone plays it/i)).toBeTruthy();
  });

  it('names each source beat and the id it points at', () => {
    render(<ImportIssuesBanner brokenTargets={broken} onDismiss={() => {}} />);
    expect(screen.getAllByText('Decision 1 — How you open').length).toBe(2);
    expect(screen.getAllByText('beat_intake').length).toBe(2);
    expect(screen.getByText('beat_nowhere')).toBeTruthy();
  });

  it('counts distinct beats, not links, when pointing at the graph', () => {
    // Three broken links across two beats — the graph will show two marks.
    render(<ImportIssuesBanner brokenTargets={broken} onDismiss={() => {}} />);
    expect(screen.getByText(/2 beats are marked/i)).toBeTruthy();
  });

  it('hands the author to the beat concerned', () => {
    const onSelectBeat = vi.fn();
    render(<ImportIssuesBanner brokenTargets={broken} onDismiss={() => {}} onSelectBeat={onSelectBeat} />);
    fireEvent.click(screen.getAllByText('Decision 5')[0]);
    expect(onSelectBeat).toHaveBeenCalledWith('beat_9');
  });

  it('can be dismissed — it reports, it does not block', () => {
    const onDismiss = vi.fn();
    render(<ImportIssuesBanner brokenTargets={broken} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders nothing when the story is clean', () => {
    const { container } = render(<ImportIssuesBanner brokenTargets={[]} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('still surfaces non-link errors on their own', () => {
    render(<ImportIssuesBanner brokenTargets={[]} otherErrors={['Beat beat_2 has no content']} onDismiss={() => {}} />);
    expect(screen.getByText(/imported with warnings/i)).toBeTruthy();
    expect(screen.getByText(/no content/i)).toBeTruthy();
  });
});

describe('fix proposals (generation review, 2026-09-08)', () => {
  const proposals = [
    { id: 'fix:1', findingId: 'f1', kind: 'retarget', beatId: 'beat_2', path: 'choices[1].target', value: 'beat_end', description: 'Point "Fork" at "End" instead of the missing "beat_ned".', confidence: 'safe' },
    { id: 'fix:2', findingId: 'f2', kind: 'clamp-threshold', beatId: 'beat_gate', path: 'value', value: 1, description: 'Change the check on "Gate" to trust >= 1.', confidence: 'review' },
  ] as const;
  it('renders each proposal with Apply / Skip and a jump to the beat, and offers the safe ones in one go', () => {
    const onApply = vi.fn(); const onSkip = vi.fn(); const onAll = vi.fn(); const onSelect = vi.fn();
    render(<ImportIssuesBanner brokenTargets={[]} proposals={proposals as any} onDismiss={() => {}} onApplyProposal={onApply} onSkipProposal={onSkip} onApplyAllSafe={onAll} onSelectBeat={onSelect} />);
    expect(screen.getByText(/2 proposed fixes/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^Apply: Point/));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'fix:1' }));
    fireEvent.click(screen.getByLabelText(/^Skip: Change/));
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ id: 'fix:2' }));
    fireEvent.click(screen.getByText(/Apply 1 safe fix$/));
    expect(onAll).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Change the check on/));
    expect(onSelect).toHaveBeenCalledWith('beat_gate');
  });
  it('shows with proposals alone', () => {
    render(<ImportIssuesBanner brokenTargets={[]} proposals={[proposals[1]] as any} onDismiss={() => {}} />);
    expect(screen.getByText(/1 proposed fix/i)).toBeTruthy();
  });
});
