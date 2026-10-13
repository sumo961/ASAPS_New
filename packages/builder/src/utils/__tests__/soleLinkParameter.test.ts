import { describe, it, expect } from 'vitest';
import { soleLinkParameter } from '../beatTypeReference';

describe('soleLinkParameter', () => {
  it('names the field that holds an AI conversation\'s exit', () => {
    expect(soleLinkParameter('aiConversation')).toBe('fallbackExitTarget');
  });

  it('is undefined for beats that keep their link in connections', () => {
    expect(soleLinkParameter('infoText')).toBeUndefined();
    expect(soleLinkParameter('multiChoice')).toBeUndefined();
    expect(soleLinkParameter(undefined)).toBeUndefined();
  });
});
