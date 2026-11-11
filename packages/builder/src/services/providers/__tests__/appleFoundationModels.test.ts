import { describe, it, expect } from 'vitest';
import { isAppleFmServe } from '../appleFoundationModels';

describe("Apple's fm serve goes through the relay", () => {
  it('recognises a local URL serving system or pcc', () => {
    expect(isAppleFmServe('http://127.0.0.1:1976/v1', 'system')).toBe(true);
    expect(isAppleFmServe('http://localhost:1976/v1', undefined, 'pcc')).toBe(true);
    expect(isAppleFmServe('http://localhost:1976/v1', ' System ')).toBe(true);
  });
  it('leaves Ollama and remote servers alone', () => {
    expect(isAppleFmServe('http://localhost:11434/v1', 'llama3.2')).toBe(false);
    expect(isAppleFmServe('https://api.example.com/v1', 'system')).toBe(false);
    expect(isAppleFmServe(undefined, 'system')).toBe(false);
    expect(isAppleFmServe('not a url', 'system')).toBe(false);
  });
});
