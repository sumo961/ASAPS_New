import { describe, it, expect } from 'vitest';
import { getRuntimeAIConfig, getRuntimeAIModel, type SavedAIConfig } from '../useAI';

const authoring: SavedAIConfig = { provider: 'claude', providerType: 'claude', apiKey: 'k-claude', model: 'claude-opus-5-5' };

describe('the provider in-story AI uses', () => {
  it('is the authoring provider with the runtime model when no separate one is chosen', () => {
    const rt = getRuntimeAIConfig({ ...authoring, runtimeModel: 'claude-haiku-5-5' });
    expect(rt).toMatchObject({ provider: 'claude', apiKey: 'k-claude', model: 'claude-haiku-5-5' });
    expect(getRuntimeAIConfig(authoring)?.model).toBe('claude-opus-5-5');
  });

  it("can be Apple's model on fm serve while authoring stays in the cloud", () => {
    const rt = getRuntimeAIConfig({ ...authoring, runtime: { providerType: 'local', baseUrl: 'http://127.0.0.1:1976/v1', model: 'system' } });
    expect(rt).toEqual({ provider: 'openai', providerType: 'local', apiKey: 'ollama', baseUrl: 'http://127.0.0.1:1976/v1', model: 'system' });
    expect(rt?.apiKey).not.toBe('k-claude'); // the cloud key never goes to another provider
  });

  it('reuses the key above only for the same provider', () => {
    expect(getRuntimeAIConfig({ ...authoring, runtime: { providerType: 'claude', model: 'claude-haiku-5-5' } })?.apiKey).toBe('k-claude');
    expect(getRuntimeAIConfig({ ...authoring, runtime: { providerType: 'openai', model: 'gpt-5.6-luna' } })?.apiKey).toBe('');
    expect(getRuntimeAIConfig({ ...authoring, runtime: { providerType: 'openai', apiKey: 'k-oai' } })?.apiKey).toBe('k-oai');
  });

  it('ignores the old runtime model once a separate provider is chosen', () => {
    expect(getRuntimeAIModel({ ...authoring, runtimeModel: 'claude-haiku-5-5', runtime: { providerType: 'local', model: 'llama3.1:8b' } })).toBe('llama3.1:8b');
    expect(getRuntimeAIConfig(null)).toBeNull();
  });
});
