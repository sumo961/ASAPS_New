/**
 * Pinning tests for the shared LLM JSON extraction/repair module — the
 * single implementation that replaced the drifted copies in PreviewWindow,
 * StoryPreview, WebAIProvider, OpenAIProvider, and ClaudeProvider.
 */
import { describe, it, expect } from 'vitest';
import {
  extractJSON,
  repairJson,
  repairJsonAggressive,
  parseJSONWithRepair,
} from '../../src/ai/jsonExtraction';

describe('extractJSON', () => {
  it('extracts from a fenced code block', () => {
    expect(extractJSON('Here you go:\n```json\n{"a":1}\n```\nEnjoy')).toBe('{"a":1}');
  });

  it('extracts a balanced object from surrounding prose', () => {
    expect(extractJSON('Sure! {"a":{"b":2}} — done.')).toBe('{"a":{"b":2}}');
  });

  it('ignores braces inside string values while balancing', () => {
    expect(extractJSON('x {"a":"{not a} brace"} y')).toBe('{"a":"{not a} brace"}');
  });

  it('returns the open tail for truncated output (repair closes it later)', () => {
    expect(extractJSON('answer: {"a": [1, 2')).toBe('{"a": [1, 2');
  });
});

describe('repairJson', () => {
  it('leaves already-valid JSON semantically untouched', () => {
    const out = repairJson('{"a":"b","n":1}');
    expect(JSON.parse(out)).toEqual({ a: 'b', n: 1 });
  });

  it('does not corrupt keys (regression: key-closing quotes were escaped as interior)', () => {
    const out = repairJson('{"description":"He said "hello" loudly","n":1,}');
    expect(JSON.parse(out)).toEqual({ description: 'He said "hello" loudly', n: 1 });
  });

  it('escapes literal control characters inside strings', () => {
    const out = repairJson('{"a":"line1\nline2"}');
    expect(JSON.parse(out)).toEqual({ a: 'line1\nline2' });
  });

  it('closes truncated structures', () => {
    expect(JSON.parse(repairJson('{"a": {"b": [1, 2'))).toEqual({ a: { b: [1, 2] } });
  });

  it('drops trailing commas and removes comments', () => {
    expect(JSON.parse(repairJson('{"a": 1, // note\n}'))).toEqual({ a: 1 });
  });
});

describe('repairJsonAggressive', () => {
  it('repairs a key missing its closing quote (the Kimi case)', () => {
    expect(JSON.parse(repairJsonAggressive('{"description: "hello"}'))).toEqual({
      description: 'hello',
    });
  });
});

describe('parseJSONWithRepair', () => {
  it('parses clean JSON without touching it', () => {
    expect(parseJSONWithRepair('{"a": 1}')).toEqual({ a: 1 });
  });

  it('escalates through repair for prose-wrapped truncated output', () => {
    expect(parseJSONWithRepair('Result:\n```json\n{"beats": [{"id": "b1"')).toEqual({
      beats: [{ id: 'b1' }],
    });
  });

  it('throws the original parse error when nothing salvages', () => {
    expect(() => parseJSONWithRepair('no json here at all')).toThrow();
  });
});
