import { describe, it, expect } from 'vitest';
import { tidyLook } from '../BeatLookSection';

describe('tidyLook', () => {
  it('drops unset values and empty groups, so an untouched look is stored as nothing', () => {
    expect(tidyLook({ textBox: { opacity: undefined }, stageColor: undefined })).toBeUndefined();
    expect(tidyLook({ textBox: { opacity: 50, padding: undefined }, fonts: {} })).toEqual({ textBox: { opacity: 50 } });
  });
});
