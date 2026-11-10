/**
 * A row of tabs that may be wider than its window. When tabs are cut off, the
 * cut edge fades and shows an arrow button that scrolls the row, so the row
 * never looks as if it ends at the last tab you can see.
 */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsDark } from '../../utils/appearance';

export const ScrollableTabStrip: React.FC<{
  className?: string;
  /** Changes when another tab is chosen; that tab is scrolled into view. */
  activeKey?: string;
  children: React.ReactNode;
}> = ({ className = '', activeKey, children }) => {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const isDark = useIsDark();
  const [more, setMore] = React.useState({ left: false, right: false });

  const measure = React.useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const left = row.scrollLeft > 1;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  React.useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    measure();
    let ro: ResizeObserver | undefined;
    try {
      ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    } catch {
      ro = undefined; // a stand-in that can't be constructed (tests); scrolling still updates
    }
    ro?.observe(row);
    Array.from(row.children).forEach((c) => ro?.observe(c));
    row.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro?.disconnect();
      row.removeEventListener('scroll', measure);
    };
  }, [measure]);

  React.useEffect(() => {
    const active = rowRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeKey]);

  const scrollBy = (dir: -1 | 1) => {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: dir * Math.max(120, row.clientWidth * 0.6), behavior: 'smooth' });
  };

  const edge = (side: 'left' | 'right') => {
    // The surface the tabs sit on (bg-white, mapped for dark mode).
    const bg = isDark ? '32,35,41' : '255,255,255';
    return (
    <div
      className={`absolute inset-y-0 flex items-center pointer-events-none ${side === 'left' ? 'left-0 pr-8' : 'right-0 pl-8 justify-end'}`}
      style={{ background: `linear-gradient(to ${side}, rgba(${bg},0), rgba(${bg},0.95) 55%)` }}
    >
      <button
        type="button"
        onClick={() => scrollBy(side === 'left' ? -1 : 1)}
        aria-label={side === 'left' ? 'Show earlier tabs' : 'Show more tabs'}
        title={side === 'left' ? 'Earlier tabs' : 'More tabs'}
        data-testid={`tab-strip-more-${side}`}
        className="pointer-events-auto mx-1 p-1 rounded-full bg-white border border-gray-300 shadow text-gray-600 hover:text-blue-600 hover:border-blue-400"
      >
        {side === 'left' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </div>
    );
  };

  return (
    <div className={`relative ${className}`}>
      <div ref={rowRef} role="tablist" className="flex overflow-x-auto">
        {children}
      </div>
      {more.left && edge('left')}
      {more.right && edge('right')}
    </div>
  );
};
