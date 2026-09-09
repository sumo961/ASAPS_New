import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIEditsLogDialog } from '../AIEditsLogDialog';

describe('AIEditsLogDialog', () => {
  it('lists entries newest first with source, decision and beat jumps', () => {
    const onSelect = vi.fn(); const onClose = vi.fn();
    const ledger: any = { version: 1, entries: [
      { id: 'a', at: '2026-09-09T13:30:19Z', source: 'co-designer', decision: 'accepted', batch: 'Intros', summary: 'Update question on Fork', beatIds: ['beat_p1_con1'] },
      { id: 'b', at: '2026-09-09T13:31:00Z', source: 'ask-ai', decision: 'rejected', batch: 'f1', summary: 'Point Fork at End', beatIds: ['beat_2'], detail: 'Rejected by the author' },
    ] };
    render(<AIEditsLogDialog ledger={ledger} onClose={onClose} onSelectBeat={onSelect} />);
    const rows = screen.getAllByTestId('ai-edit-entry');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Ask AI.*declined.*Point Fork at End/s);
    expect(screen.getByText(/1 accepted · 1 declined/)).toBeTruthy();
    fireEvent.click(screen.getByText('beat_p1_con1'));
    expect(onSelect).toHaveBeenCalledWith('beat_p1_con1');
    expect(onClose).toHaveBeenCalled();
  });
  it('has an empty state', () => {
    render(<AIEditsLogDialog ledger={null} onClose={() => {}} />);
    expect(screen.getByText(/No AI edits recorded yet/)).toBeTruthy();
  });
});
