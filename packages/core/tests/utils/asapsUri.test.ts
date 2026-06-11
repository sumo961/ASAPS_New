/**
 * Tests for the asaps:// URI scheme parser/formatter.
 *
 * This URI scheme rides through several runtime channels: QR codes
 * (qrScan), AR anchor onTap (arBeat), hyperText href, webView
 * postMessage payloads, native deep links. Bugs here break every
 * consumer at once, so coverage focuses on:
 *   - all four verbs round-trip cleanly
 *   - encode/decode handles names + values with reserved chars
 *   - non-asaps inputs return null (callers rely on that signal to
 *     fall back to default behavior)
 *   - malformed asaps URIs return null (missing segments, bad verbs)
 */
import { describe, it, expect } from 'vitest';
import { parseAsapsUri, formatAsapsUri, type AsapsAction } from '../../src/utils/asapsUri';

describe('parseAsapsUri', () => {
  describe('beat verb', () => {
    it('parses a simple beat jump', () => {
      expect(parseAsapsUri('asaps://beat/intro')).toEqual({
        kind: 'beat',
        target: 'intro',
      });
    });

    it('parses a beat id with hyphens and underscores', () => {
      expect(parseAsapsUri('asaps://beat/start_screen-01')).toEqual({
        kind: 'beat',
        target: 'start_screen-01',
      });
    });

    it('decodes percent-encoded beat ids', () => {
      // Some authors will paste raw spaces; encoders will percent-encode them.
      expect(parseAsapsUri('asaps://beat/dark%20alley')).toEqual({
        kind: 'beat',
        target: 'dark alley',
      });
    });

    it('returns null for an empty beat id', () => {
      expect(parseAsapsUri('asaps://beat/')).toBeNull();
      expect(parseAsapsUri('asaps://beat')).toBeNull();
    });
  });

  describe('variable verb', () => {
    it('parses a simple variable set', () => {
      expect(parseAsapsUri('asaps://variable/health/100')).toEqual({
        kind: 'variable',
        name: 'health',
        value: '100',
      });
    });

    it('preserves slashes in the value (path-like values)', () => {
      // Values may contain slashes — authors might encode a URL or
      // a path. Only the first segment is the name; the rest is the
      // value joined back with slashes.
      expect(parseAsapsUri('asaps://variable/url/https://example.com')).toEqual({
        kind: 'variable',
        name: 'url',
        value: 'https://example.com',
      });
    });

    it('accepts an empty value', () => {
      // asaps://variable/cleared/ — clearing a variable to '' is a
      // valid operation.
      expect(parseAsapsUri('asaps://variable/cleared/')).toEqual({
        kind: 'variable',
        name: 'cleared',
        value: '',
      });
    });

    it('decodes percent-encoded name and value', () => {
      expect(parseAsapsUri('asaps://variable/last%20word/the%20end')).toEqual({
        kind: 'variable',
        name: 'last word',
        value: 'the end',
      });
    });

    it('returns null for a missing name', () => {
      expect(parseAsapsUri('asaps://variable/')).toBeNull();
      expect(parseAsapsUri('asaps://variable')).toBeNull();
    });
  });

  describe('inventory verb', () => {
    it('parses an add op', () => {
      expect(parseAsapsUri('asaps://inventory/add/key')).toEqual({
        kind: 'inventory',
        op: 'add',
        item: 'key',
      });
    });

    it('parses a remove op', () => {
      expect(parseAsapsUri('asaps://inventory/remove/key')).toEqual({
        kind: 'inventory',
        op: 'remove',
        item: 'key',
      });
    });

    it('decodes percent-encoded item names', () => {
      expect(parseAsapsUri('asaps://inventory/add/silver%20key')).toEqual({
        kind: 'inventory',
        op: 'add',
        item: 'silver key',
      });
    });

    it('returns null for unknown ops', () => {
      // Only 'add' and 'remove' are valid. 'set', 'use', etc. fall
      // through so future expansions don't accidentally route as
      // existing ops.
      expect(parseAsapsUri('asaps://inventory/use/key')).toBeNull();
      expect(parseAsapsUri('asaps://inventory/set/key')).toBeNull();
    });

    it('returns null for missing item', () => {
      expect(parseAsapsUri('asaps://inventory/add')).toBeNull();
      expect(parseAsapsUri('asaps://inventory/add/')).toBeNull();
    });

    it('returns null when op is missing', () => {
      expect(parseAsapsUri('asaps://inventory')).toBeNull();
      expect(parseAsapsUri('asaps://inventory/')).toBeNull();
    });
  });

  describe('event verb', () => {
    it('parses a named event', () => {
      expect(parseAsapsUri('asaps://event/door_opened')).toEqual({
        kind: 'event',
        name: 'door_opened',
      });
    });

    it('decodes percent-encoded event names', () => {
      expect(parseAsapsUri('asaps://event/found%20treasure')).toEqual({
        kind: 'event',
        name: 'found treasure',
      });
    });

    it('returns null for missing name', () => {
      expect(parseAsapsUri('asaps://event/')).toBeNull();
      expect(parseAsapsUri('asaps://event')).toBeNull();
    });
  });

  describe('rejection cases', () => {
    it('returns null for non-asaps schemes', () => {
      expect(parseAsapsUri('https://example.com')).toBeNull();
      expect(parseAsapsUri('http://example.com')).toBeNull();
      expect(parseAsapsUri('mailto:a@b.com')).toBeNull();
    });

    it('returns null for arbitrary strings', () => {
      // Callers (qrScan with interpretAsapsUri:false, or any QR with
      // a plain-text payload) pipe arbitrary strings through and
      // expect null so they can fall back to the saveTo variable
      // path.
      expect(parseAsapsUri('hello world')).toBeNull();
      expect(parseAsapsUri('')).toBeNull();
      expect(parseAsapsUri('123-456')).toBeNull();
    });

    it('returns null for unknown asaps verbs', () => {
      // Future-proofing: a payload from a newer client with a verb
      // this older runtime doesn't know about safely falls through
      // instead of accidentally executing as a known verb.
      expect(parseAsapsUri('asaps://teleport/somewhere')).toBeNull();
      expect(parseAsapsUri('asaps://unknown')).toBeNull();
      expect(parseAsapsUri('asaps://')).toBeNull();
    });

    it('returns null for non-string inputs', () => {
      // Defensive — qrScan decoders can hand us anything if a barcode
      // library is misbehaving.
      // @ts-expect-error testing runtime safety
      expect(parseAsapsUri(null)).toBeNull();
      // @ts-expect-error testing runtime safety
      expect(parseAsapsUri(undefined)).toBeNull();
      // @ts-expect-error testing runtime safety
      expect(parseAsapsUri(42)).toBeNull();
      // @ts-expect-error testing runtime safety
      expect(parseAsapsUri({ foo: 'bar' })).toBeNull();
    });

    it('survives malformed percent encoding gracefully', () => {
      // A bad percent sequence shouldn't throw — fallback decoder
      // returns the raw segment. Critical because we can't trust QR
      // payloads to be well-formed.
      const result = parseAsapsUri('asaps://beat/dark%2Galley');
      expect(result).toEqual({ kind: 'beat', target: 'dark%2Galley' });
    });
  });
});

describe('formatAsapsUri', () => {
  it('formats beat actions', () => {
    expect(formatAsapsUri({ kind: 'beat', target: 'intro' }))
      .toBe('asaps://beat/intro');
  });

  it('percent-encodes beat ids with reserved chars', () => {
    expect(formatAsapsUri({ kind: 'beat', target: 'dark alley' }))
      .toBe('asaps://beat/dark%20alley');
  });

  it('formats variable actions', () => {
    expect(formatAsapsUri({ kind: 'variable', name: 'health', value: '100' }))
      .toBe('asaps://variable/health/100');
  });

  it('percent-encodes variable name and value', () => {
    expect(formatAsapsUri({ kind: 'variable', name: 'last word', value: 'the end' }))
      .toBe('asaps://variable/last%20word/the%20end');
  });

  it('formats inventory add', () => {
    expect(formatAsapsUri({ kind: 'inventory', op: 'add', item: 'key' }))
      .toBe('asaps://inventory/add/key');
  });

  it('formats inventory remove', () => {
    expect(formatAsapsUri({ kind: 'inventory', op: 'remove', item: 'key' }))
      .toBe('asaps://inventory/remove/key');
  });

  it('formats event actions', () => {
    expect(formatAsapsUri({ kind: 'event', name: 'door_opened' }))
      .toBe('asaps://event/door_opened');
  });
});

describe('round-trip', () => {
  // The QR generator UI relies on this round-trip: author picks an
  // action in the inspector → format to a URI for the QR canvas →
  // runtime scans → parse back to the same action. A round-trip
  // failure means the QR-generator UI silently produces non-routable
  // codes.
  const cases: AsapsAction[] = [
    { kind: 'beat', target: 'intro' },
    { kind: 'beat', target: 'dark alley' },
    { kind: 'beat', target: 'beat_42' },
    { kind: 'variable', name: 'health', value: '100' },
    { kind: 'variable', name: 'has_key', value: 'true' },
    { kind: 'variable', name: 'last word', value: 'the end' },
    { kind: 'inventory', op: 'add', item: 'key' },
    { kind: 'inventory', op: 'remove', item: 'silver coin' },
    { kind: 'event', name: 'door_opened' },
    { kind: 'event', name: 'found treasure' },
  ];

  it.each(cases)('round-trips: $kind / $target$name$item$op', (action) => {
    const uri = formatAsapsUri(action);
    const parsed = parseAsapsUri(uri);
    expect(parsed).toEqual(action);
  });
});
