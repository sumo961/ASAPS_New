import { describe, it, expect } from 'vitest';
import { shortVcsMessage } from '../VCSToast';

describe('shortVcsMessage', () => {
  it('keeps short messages as they are', () => {
    expect(shortVcsMessage('Already up to date')).toBe('Already up to date');
    expect(shortVcsMessage('Updating a1..b2\nFast-forward')).toBe('Updating a1..b2\nFast-forward');
  });

  // A pull of a whole project listed every file and the notice grew past the window (2026-10-27).
  it('drops the per-file lines of a pull or commit and keeps the summary', () => {
    const files = Array.from({ length: 70 }, (_, i) => `clusters/start/infoText_beat_${i}.json`);
    const pull = [
      'Updating a1..b2',
      'Fast-forward',
      ...files.map((f) => ` ${f} | 12 ++++`),
      ' 70 files changed, 840 insertions(+)',
      ...files.map((f) => ` create mode 100644 ${f}`),
      "1 of your beats shared an ID with a teammate's and moved to a new one, so both survive: \"Intro\".",
    ].join('\n');
    const short = shortVcsMessage(pull).split('\n');
    expect(short).toEqual([
      'Updating a1..b2',
      'Fast-forward',
      ' 70 files changed, 840 insertions(+)',
      "1 of your beats shared an ID with a teammate's and moved to a new one, so both survive: \"Intro\".",
      'All changed files: Version Control panel ▸ message log.',
    ]);
  });

  it('cuts any other long output to six lines', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const short = shortVcsMessage(long).split('\n');
    expect(short).toHaveLength(8);
    expect(short[6]).toBe('…');
  });
});
