import { describe, it, expect, vi } from 'vitest';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { StoryContext } from '../../src/engine/StoryContext';

const make = (config: Record<string, unknown>) =>
  BeatTypeRegistry.getInstance().createBeat('infoText', { id: 'b', name: 'B', type: 'infoText', parameters: { text: 'Hi' }, ...config } as any) as any;

describe('Beat.textBoxBorder', () => {
  it('reads show/hide from the beat or its parameters, ignores anything else', () => {
    expect(make({ textBoxBorder: 'hide' }).textBoxBorder).toBe('hide');
    expect(make({ parameters: { text: 'Hi', textBoxBorder: 'show' } }).textBoxBorder).toBe('show');
    expect(make({ textBoxBorder: 'thick' }).textBoxBorder).toBeUndefined();
  });

  it('round-trips through toJSON', () => {
    const json = make({ textBoxBorder: 'hide' }).toJSON();
    expect(make({ parameters: json.parameters }).textBoxBorder).toBe('hide');
  });

  it('tells the renderer on every beat, unset included', async () => {
    const state: Record<string, unknown> = { textBoxBorder: 'hide' };
    const renderer: any = {
      setState: vi.fn((k: string, v: unknown) => { state[k] = v; }),
      getState: vi.fn((k: string) => state[k]),
      renderText: vi.fn(async () => 'continue'),
      renderChoices: vi.fn(async () => 'continue'),
      clear: vi.fn(),
    };
    await make({}).execute(new StoryContext(), renderer).catch(() => undefined);
    expect(renderer.setState).toHaveBeenCalledWith('textBoxBorder', undefined);
  });
});
