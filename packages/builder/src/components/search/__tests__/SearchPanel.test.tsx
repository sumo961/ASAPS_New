/**
 * Tests for SearchPanel — search/replace UI over the (separately-tested)
 * searchService singleton. Props-only with fake beats. Covers the isOpen null
 * guard, running a search on Enter (setTimeout debounce → fake timers),
 * result count + no-results state, navigate-on-result-click, and the
 * close/Escape exits.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { SearchPanel } from '../SearchPanel';

const beat = (over: any = {}) =>
  ({
    id: 'b1',
    name: 'Forest Hub',
    type: 'infoText',
    getParameters: () => ({ text: 'a dark forest path' }),
    connections: [],
    locations: new Map(),
    ...over,
  }) as any;

const props = (over: any = {}) => ({
  isOpen: true,
  onClose: vi.fn(),
  beats: [beat()],
  characters: [],
  assets: [],
  metadata: { title: 'My Story', author: 'Ada' },
  ...over,
});

const runSearch = (input: HTMLElement, query: string) => {
  fireEvent.change(input, { target: { value: query } });
  act(() => {
    fireEvent.keyDown(input, { key: 'Enter' });
    vi.advanceTimersByTime(20); // performSearch's setTimeout(…, 10)
  });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SearchPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SearchPanel {...props({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the search input when open', () => {
    const { getByPlaceholderText } = render(<SearchPanel {...props()} />);
    expect(getByPlaceholderText('Search in project...')).toBeTruthy();
  });

  it('runs a search and shows matching results', () => {
    const { getByPlaceholderText, getByText, getAllByText } = render(<SearchPanel {...props()} />);
    runSearch(getByPlaceholderText('Search in project...'), 'forest');
    expect(getByText(/results/)).toBeTruthy();
    // "Forest Hub" appears as both the row title and the highlighted match
    expect(getAllByText('Forest Hub').length).toBeGreaterThan(0);
  });

  it('navigates to the beat when a result is clicked', () => {
    const onNavigateToBeat = vi.fn();
    const { getByPlaceholderText, getAllByText } = render(<SearchPanel {...props({ onNavigateToBeat })} />);
    runSearch(getByPlaceholderText('Search in project...'), 'forest');
    fireEvent.click(getAllByText('Forest Hub')[0]); // bubbles to the row's onClick
    expect(onNavigateToBeat).toHaveBeenCalledWith('b1');
  });

  it('shows "No results found" for a non-matching query', () => {
    const { getByPlaceholderText, getByText } = render(<SearchPanel {...props()} />);
    runSearch(getByPlaceholderText('Search in project...'), 'zzz-no-such-term');
    expect(getByText('No results found')).toBeTruthy();
  });

  it('Escape in the input closes the panel', () => {
    const onClose = vi.fn();
    const { getByPlaceholderText } = render(<SearchPanel {...props({ onClose })} />);
    fireEvent.keyDown(getByPlaceholderText('Search in project...'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
