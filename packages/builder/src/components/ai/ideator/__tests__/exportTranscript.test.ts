/**
 * Tests for exportTranscript — turns an Ideator session into a
 * downloadable Markdown document. Authors use the export for
 * thesis / notebook / issue-tracker pastes, so format stability
 * matters (changing column order or label silently breaks every
 * previously-exported file's parse).
 *
 * Coverage focus:
 *   - buildTranscriptMarkdown structure: title, metadata block,
 *     separator, message body, optional synthesized prompt
 *   - speaker labels: 'You' for user, 'Ideator' for assistant
 *   - web_search tool-use messages become block-quote chips
 *   - createdAt/lastUpdatedAt metadata lines only emitted when
 *     present
 *   - handedOff status string
 *   - draftRequest section only when present; populated meta
 *     filtered (empty/undefined fields skipped)
 *   - transcriptFilename slug generation: lowercase, non-alnum →
 *     dashes, trim leading/trailing, max 40 chars, "ideator-"
 *     prefix, ".md" suffix, fallback "session" stamp when no
 *     createdAt
 *   - downloadMarkdown triggers a Blob URL download + revokes
 *     after timeout
 *   - exportSessionMarkdown end-to-end glue (uses first user
 *     message for the filename slug, skips tool_use messages)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTranscriptMarkdown,
  transcriptFilename,
  downloadMarkdown,
  exportSessionMarkdown,
} from '../exportTranscript';

describe('buildTranscriptMarkdown', () => {
  describe('header + metadata', () => {
    it('starts with "# Ideator session"', () => {
      const md = buildTranscriptMarkdown({ messages: [] });
      expect(md.startsWith('# Ideator session')).toBe(true);
    });

    it('emits "Created:" line when createdAt is present', () => {
      // 2026-01-15 10:30 (local time interpretation; we just
      // check the label and YYYY-MM-DD shape).
      const md = buildTranscriptMarkdown({
        messages: [],
        createdAt: new Date('2026-01-15T10:30:00').getTime(),
      });
      expect(md).toContain('**Created:**');
      expect(md).toMatch(/Created.*\d{4}-\d{2}-\d{2}/);
    });

    it('does NOT emit "Created:" line when createdAt is missing', () => {
      const md = buildTranscriptMarkdown({ messages: [] });
      expect(md).not.toContain('**Created:**');
    });

    it('shows "In progress" status by default', () => {
      const md = buildTranscriptMarkdown({ messages: [] });
      expect(md).toContain('**Status:** In progress');
    });

    it('shows "Handed off" status when handedOff is true', () => {
      const md = buildTranscriptMarkdown({ messages: [], handedOff: true });
      expect(md).toContain('Handed off to story generator');
    });
  });

  describe('message body', () => {
    it('labels user messages as "You"', () => {
      const md = buildTranscriptMarkdown({
        messages: [
          { role: 'user', content: 'hello' } as any,
        ],
      });
      expect(md).toContain('**You:**');
      expect(md).toContain('hello');
    });

    it('labels assistant messages as "Ideator"', () => {
      const md = buildTranscriptMarkdown({
        messages: [
          { role: 'assistant', content: 'hi back' } as any,
        ],
      });
      expect(md).toContain('**Ideator:**');
      expect(md).toContain('hi back');
    });

    it('renders messages in order', () => {
      const md = buildTranscriptMarkdown({
        messages: [
          { role: 'user', content: 'first' } as any,
          { role: 'assistant', content: 'second' } as any,
          { role: 'user', content: 'third' } as any,
        ],
      });
      const idxFirst = md.indexOf('first');
      const idxSecond = md.indexOf('second');
      const idxThird = md.indexOf('third');
      expect(idxFirst).toBeLessThan(idxSecond);
      expect(idxSecond).toBeLessThan(idxThird);
    });
  });

  describe('tool-use messages (web search)', () => {
    it('renders web_search tool-use as a block-quote with magnifier emoji', () => {
      // Round-trip-friendly format: a future Import feature can
      // parse the block-quote shape back into a tool_use entry.
      const md = buildTranscriptMarkdown({
        messages: [
          { kind: 'tool_use', toolMeta: {
              type: 'web_search',
              query: 'IDN ethics',
              resultCount: 3,
          } } as any,
        ],
      });
      expect(md).toContain('> 🔎');
      expect(md).toContain('IDN ethics');
      expect(md).toContain('(3 results)');
    });

    it('uses singular "result" when resultCount is 1', () => {
      const md = buildTranscriptMarkdown({
        messages: [
          { kind: 'tool_use', toolMeta: {
              type: 'web_search', query: 'x', resultCount: 1,
          } } as any,
        ],
      });
      expect(md).toContain('(1 result)');
    });

    it('skips non-web_search tool_use entries silently', () => {
      // Future-compat: a different tool type shouldn't break
      // export, just not show.
      const md = buildTranscriptMarkdown({
        messages: [
          { kind: 'tool_use', toolMeta: { type: 'other' } } as any,
        ],
      });
      // No magnifier chip should appear.
      expect(md).not.toContain('🔎');
    });
  });

  describe('synthesized prompt section', () => {
    it('omits the section when draftRequest is null', () => {
      const md = buildTranscriptMarkdown({ messages: [], draftRequest: null });
      expect(md).not.toContain('## Synthesized prompt');
    });

    it('omits the section when draftRequest is undefined', () => {
      const md = buildTranscriptMarkdown({ messages: [] });
      expect(md).not.toContain('## Synthesized prompt');
    });

    it('shows the prompt body when draftRequest is set', () => {
      const md = buildTranscriptMarkdown({
        messages: [],
        draftRequest: { prompt: 'My final prompt' } as any,
      });
      expect(md).toContain('## Synthesized prompt');
      expect(md).toContain('My final prompt');
    });

    it('falls back to "(empty)" placeholder when prompt is missing', () => {
      const md = buildTranscriptMarkdown({
        messages: [],
        draftRequest: {} as any,
      });
      expect(md).toContain('_(empty)_');
    });

    it('emits populated metadata lines (Genre, Length, etc.) only', () => {
      const md = buildTranscriptMarkdown({
        messages: [],
        draftRequest: {
          prompt: 'P',
          genre: 'drama',
          length: 'medium',
          // complexity left undefined
          affectDepth: 'rich',
          // includeAIBeats left undefined
        } as any,
      });
      expect(md).toContain('**Genre:** drama');
      expect(md).toContain('**Length:** medium');
      expect(md).toContain('**Affect depth:** rich');
      expect(md).not.toContain('**Branching complexity:**');
      expect(md).not.toContain('**Include AI-powered beats:**');
    });

    it('skips empty-string values too', () => {
      // Empty string is "not set" semantics here — the filter
      // catches '', undefined, AND null.
      const md = buildTranscriptMarkdown({
        messages: [],
        draftRequest: {
          prompt: 'P',
          genre: '',
        } as any,
      });
      expect(md).not.toContain('**Genre:**');
    });

    it('renders boolean includeAIBeats truthfully', () => {
      // False is a meaningful value, not "unset". Must appear.
      const md = buildTranscriptMarkdown({
        messages: [],
        draftRequest: {
          prompt: 'P',
          includeAIBeats: false,
        } as any,
      });
      expect(md).toContain('**Include AI-powered beats:** false');
    });
  });
});

describe('transcriptFilename', () => {
  it('starts with "ideator-" prefix and ends with ".md"', () => {
    const name = transcriptFilename({});
    expect(name).toMatch(/^ideator-/);
    expect(name).toMatch(/\.md$/);
  });

  it('uses "session" as the stamp when createdAt is missing', () => {
    expect(transcriptFilename({})).toBe('ideator-session.md');
  });

  it('uses a date-stamp from createdAt', () => {
    const name = transcriptFilename({
      createdAt: new Date('2026-01-15T10:30:00').getTime(),
    });
    // YYYY-MM-DD-HH-MM (spaces and colons → dashes).
    expect(name).toMatch(/^ideator-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/);
  });

  it('slugifies the first user message into the filename', () => {
    const name = transcriptFilename({
      createdAt: 0,
      firstUserMessage: 'Tell me about Climate Change',
    });
    expect(name).toContain('tell-me-about-climate-change');
  });

  it('truncates the slug to 40 characters', () => {
    const longMsg = 'this is a very long opening message that exceeds the slug limit';
    const name = transcriptFilename({
      createdAt: 0,
      firstUserMessage: longMsg,
    });
    // Extract slug between "ideator-<stamp>-" and ".md".
    const match = name.match(/ideator-[\d-]+(?:-([^.]+))?\.md/);
    if (match && match[1]) {
      expect(match[1].length).toBeLessThanOrEqual(40);
    }
  });

  it('lowercases the slug', () => {
    const name = transcriptFilename({
      createdAt: 0,
      firstUserMessage: 'UPPERCASE',
    });
    expect(name).toMatch(/uppercase/);
    expect(name).not.toMatch(/UPPERCASE/);
  });

  it('collapses non-alphanumeric runs into single dashes', () => {
    const name = transcriptFilename({
      createdAt: 0,
      firstUserMessage: 'hello   ###   world',
    });
    expect(name).toContain('hello-world');
  });

  it('trims leading and trailing dashes', () => {
    const name = transcriptFilename({
      createdAt: 0,
      firstUserMessage: '---hello---',
    });
    expect(name).not.toMatch(/-hello-\./); // no leading dash before "hello"
    expect(name).toMatch(/-hello\./);
  });

  it('does not append "-" suffix when firstUserMessage is missing', () => {
    const name = transcriptFilename({ createdAt: 0 });
    // Form: ideator-<stamp>.md, no trailing slug separator before .md
    expect(name).toMatch(/\.md$/);
    expect(name).not.toMatch(/-\.md$/);
  });
});

describe('downloadMarkdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom URL doesn't implement createObjectURL/revokeObjectURL.
    (URL.createObjectURL as any) = vi.fn(() => 'blob:test-url');
    (URL.revokeObjectURL as any) = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a Blob URL and triggers an anchor click', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    downloadMarkdown('test.md', 'content');
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('revokes the object URL after a 1-second delay', () => {
    // Source uses setTimeout 1000ms — give the click time to
    // start before releasing the blob backing memory.
    downloadMarkdown('test.md', 'content');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});

describe('exportSessionMarkdown', () => {
  beforeEach(() => {
    (URL.createObjectURL as any) = vi.fn(() => 'blob:test-url');
    (URL.revokeObjectURL as any) = vi.fn();
  });

  it('builds + downloads using the session shape', () => {
    const session = {
      messages: [
        { role: 'user', content: 'hello' },
      ],
      createdAt: new Date('2026-01-15T10:30:00').getTime(),
      lastUpdatedAt: undefined,
      handedOff: false,
      draftRequest: null,
    } as any;

    exportSessionMarkdown(session);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('uses first NON-tool_use user message for the filename slug', () => {
    // Tool_use messages with role:user must NOT count for the
    // filename slug. The first textual user message is what the
    // author actually said.
    let capturedFilename = '';
    const origCreate = URL.createObjectURL;
    (URL.createObjectURL as any) = vi.fn(() => 'blob:test-url');
    const origAppendChild = document.body.appendChild;
    document.body.appendChild = vi.fn((node: any) => {
      capturedFilename = node.download;
      return node;
    }) as any;
    document.body.removeChild = vi.fn() as any;

    const session = {
      messages: [
        { role: 'user', kind: 'tool_use', toolMeta: {} },
        { role: 'user', content: 'My real first message' },
      ],
      createdAt: 0,
    } as any;

    exportSessionMarkdown(session);
    expect(capturedFilename).toContain('my-real-first-message');
    expect(capturedFilename).not.toContain('tool_use');

    document.body.appendChild = origAppendChild;
    (URL.createObjectURL as any) = origCreate;
  });
});
