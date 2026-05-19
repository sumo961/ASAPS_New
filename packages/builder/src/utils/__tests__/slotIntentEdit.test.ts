import { describe, it, expect } from 'vitest';
import { mergeSlotIntent } from '../slotIntentEdit';

describe('mergeSlotIntent', () => {
  it('adds a slot entry onto an absent intent', () => {
    expect(mergeSlotIntent(undefined, 'title', { preferredLines: 2 })).toEqual({
      title: { preferredLines: 2 },
    });
  });

  it('shallow-merges onto an existing entry (keeps other keys)', () => {
    const prev = { title: { preferredLines: 2 }, action: { anchor: { v: 'bottom' } } };
    const out = mergeSlotIntent(prev as any, 'action', { gap: 24 });
    expect(out).toEqual({
      title: { preferredLines: 2 },
      action: { anchor: { v: 'bottom' }, gap: 24 },
    });
  });

  it('does not mutate the input', () => {
    const prev = { title: { preferredLines: 2 } };
    const copy = JSON.parse(JSON.stringify(prev));
    mergeSlotIntent(prev as any, 'title', { preferredLines: 3 });
    expect(prev).toEqual(copy);
  });

  it('partial=null removes just that slot', () => {
    const prev = { title: { preferredLines: 2 }, action: { gap: 8 } };
    expect(mergeSlotIntent(prev as any, 'title', null)).toEqual({ action: { gap: 8 } });
  });

  it('returns undefined when the last slot is removed (clean serialization)', () => {
    const prev = { title: { preferredLines: 2 } };
    expect(mergeSlotIntent(prev as any, 'title', null)).toBeUndefined();
  });

  it('drops a slot whose merged entry becomes empty', () => {
    const prev = { title: { preferredLines: 2 } };
    expect(mergeSlotIntent(prev as any, 'title', { preferredLines: undefined })).toBeUndefined();
  });

  it('clearing one key to undefined removes only that key', () => {
    const prev = { action: { gap: 8, anchor: { v: 'bottom' } } };
    expect(mergeSlotIntent(prev as any, 'action', { gap: undefined })).toEqual({
      action: { anchor: { v: 'bottom' } },
    });
  });

  it('tolerates a non-object prev (defensive)', () => {
    expect(mergeSlotIntent('nope' as any, 'title', { preferredLines: 1 })).toEqual({
      title: { preferredLines: 1 },
    });
  });
});
