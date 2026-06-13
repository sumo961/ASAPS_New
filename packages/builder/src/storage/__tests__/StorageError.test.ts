/**
 * Tests for StorageError — the typed error every storage adapter
 * throws. Code consumers rely on `error.code` for routing
 * (quota-exceeded shows a different UI than not-found), and on
 * `instanceof StorageError` for catch-typing.
 *
 * Coverage focus:
 *   - Extends Error properly (instanceof Error AND StorageError)
 *   - name is 'StorageError' (used in error.toString() display +
 *     dev-tool console grouping)
 *   - Required code field; original Error preserved
 *   - Every documented code value is accepted
 */
import { describe, it, expect } from 'vitest';
import { StorageError } from '../IStorageAdapter';

describe('StorageError', () => {
  it('is an instance of Error', () => {
    // catch (err) { if (err instanceof Error) ... } must work.
    const e = new StorageError('boom', 'UNKNOWN');
    expect(e).toBeInstanceOf(Error);
  });

  it('is an instance of StorageError specifically', () => {
    // catch (err) { if (err instanceof StorageError) ... }
    // routes by error.code — typing-narrowing must work.
    const e = new StorageError('boom', 'UNKNOWN');
    expect(e).toBeInstanceOf(StorageError);
  });

  it('sets name to "StorageError"', () => {
    // Default Error name is "Error". The custom name shows up in
    // toString() and dev-tool stack groupings, making the source
    // clear without reading the message.
    const e = new StorageError('boom', 'UNKNOWN');
    expect(e.name).toBe('StorageError');
  });

  it('exposes the message', () => {
    const e = new StorageError('Quota exceeded on save', 'QUOTA_EXCEEDED');
    expect(e.message).toBe('Quota exceeded on save');
  });

  it('exposes the code', () => {
    const e = new StorageError('not found', 'NOT_FOUND');
    expect(e.code).toBe('NOT_FOUND');
  });

  it('preserves the original Error via originalError field', () => {
    // Storage adapters wrap IndexedDB / fs errors. The original
    // is essential for debugging — pin so a future refactor
    // doesn't drop it.
    const original = new Error('IDB QuotaExceededError');
    const e = new StorageError('out of space', 'QUOTA_EXCEEDED', original);
    expect(e.originalError).toBe(original);
  });

  it('originalError is undefined when not provided', () => {
    const e = new StorageError('boom', 'UNKNOWN');
    expect(e.originalError).toBeUndefined();
  });

  describe('accepts every documented code value', () => {
    // The union type is enforced at compile time, but pinning
    // each value at runtime catches accidental "code drift"
    // (e.g. someone changing the union to add a new value
    // without updating switch-case consumers).
    const codes = [
      'QUOTA_EXCEEDED',
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'STORAGE_UNAVAILABLE',
      'NOT_INITIALIZED',
      'UNKNOWN',
    ] as const;

    it.each(codes)('code "%s"', (code) => {
      const e = new StorageError('x', code);
      expect(e.code).toBe(code);
    });
  });

  it('toString includes name + message (default Error format)', () => {
    // Useful for "console.log(error)" debugging — verify the
    // default Error toString picks up the custom name.
    const e = new StorageError('whoops', 'NOT_FOUND');
    expect(String(e)).toBe('StorageError: whoops');
  });

  it('has a stack trace (debugging requirement)', () => {
    // Inheriting from Error gives us .stack — pinning so a
    // future "lightweight base class" refactor doesn't drop it.
    const e = new StorageError('x', 'UNKNOWN');
    expect(typeof e.stack).toBe('string');
  });
});
