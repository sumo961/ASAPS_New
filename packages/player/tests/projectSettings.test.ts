// @vitest-environment jsdom
/**
 * Exported stories carry Project Settings in project.globalSettings — the
 * declared variables and the cast roles the runtime reads from
 * story.getSettings(). The player used to load only the story's own (empty)
 * settings, so exports lost variable defaults, types and roles.
 */
import { describe, it, expect } from 'vitest';
import { PlayerEngine } from '../src/PlayerEngine';
import { StoryContext } from '@asaps/core';

describe('player: Project Settings reach the runtime', () => {
  it('roles and declared variables from project.globalSettings', () => {
    const engine = new PlayerEngine({ renderer: {} } as any);
    const story = (engine as any).createStoryFromJson({
      project: {
        globalSettings: {
          variables: [{ name: 'met', type: 'boolean', defaultValue: true }],
          roles: [{ id: 'player', candidates: ['char_a', 'char_b'] }],
        },
        story: {
          metadata: { title: 't', firstBeatId: 'b1' },
          settings: {},
          characters: [{ id: 'char_a', name: 'a', displayName: 'Ana' }, { id: 'char_b', name: 'b', displayName: 'Ben' }],
          beats: [{ id: 'b1', name: 'b1', type: 'infoText', parameters: { text: '${@player.name}' }, connections: [] }],
        },
      },
    });
    const ctx = new StoryContext(undefined, story);
    expect(ctx.getRoleHolder('player')).toBe('char_a');
    expect(ctx.getVariable('met')).toBe(true);
  });
});
