/**
 * A "Learn more" link into the User Guide, at the section that explains
 * what the author is looking at. Opens in the browser (the desktop app
 * hands web links to the system browser).
 */
import React from 'react';
import { BookOpen } from 'lucide-react';

const GUIDE_URL = 'https://github.com/sumo961/ASAPS_New/blob/main/docs/USER_GUIDE.md';

/** The guide's address, at a section anchor when one is given. */
export function guideUrl(anchor?: string): string {
  return anchor ? `${GUIDE_URL}#${anchor}` : GUIDE_URL;
}

export const GuideLink: React.FC<{ anchor?: string; children?: React.ReactNode; className?: string }> = ({ anchor, children, className }) => (
  <a
    href={guideUrl(anchor)}
    target="_blank"
    rel="noreferrer"
    className={className ?? 'inline-flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap'}
    title="Opens the User Guide in your browser"
  >
    <BookOpen className="w-3 h-3" />
    {children ?? 'Learn more'}
  </a>
);
