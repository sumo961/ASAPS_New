import { describe, it, expect } from 'vitest';
import { isNewerVersion, newerVersionWarning } from '../appVersion';

describe('app version check', () => {
  it('compares dotted versions as numbers', () => {
    expect(isNewerVersion('0.9.124', '0.9.123')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.123')).toBe(true);
    expect(isNewerVersion('0.9.123', '0.9.123')).toBe(false);
    expect(isNewerVersion('0.9.99', '0.9.123')).toBe(false);
  });
  it('warns only when the project was saved by a newer ASAPS', () => {
    expect(newerVersionWarning('0.9.125', '0.9.123')).toMatch(/v0\.9\.125.*v0\.9\.123/);
    expect(newerVersionWarning('0.9.120', '0.9.123')).toBeNull();
    expect(newerVersionWarning(undefined, '0.9.123')).toBeNull();
  });
});
