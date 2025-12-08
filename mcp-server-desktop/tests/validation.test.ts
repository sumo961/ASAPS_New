/**
 * Tests for MCP Desktop server validation utilities
 *
 * Tests story structure validation before injection
 */

import { describe, it, expect } from 'vitest';
import {
  validateMetadata,
  validateBeatsArray,
  validateBeat,
  validateAllBeats,
  validateStory,
  findDuplicateBeatIds,
  findBrokenConnections,
  type StoryData,
  type StoryBeat,
} from '../src/validation.js';

describe('validateMetadata', () => {
  it('should reject undefined metadata', () => {
    const result = validateMetadata(undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('title');
    }
  });

  it('should reject metadata without title', () => {
    const result = validateMetadata({ author: 'Test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('metadata.title is required');
    }
  });

  it('should accept metadata with title', () => {
    const result = validateMetadata({ title: 'My Story' });
    expect(result.success).toBe(true);
  });

  it('should accept metadata with title and other fields', () => {
    const result = validateMetadata({
      title: 'My Story',
      author: 'Test Author',
      description: 'A test story',
    });
    expect(result.success).toBe(true);
  });
});

describe('validateBeatsArray', () => {
  it('should reject undefined beats', () => {
    const result = validateBeatsArray(undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('beats array');
    }
  });

  it('should reject non-array beats', () => {
    const result = validateBeatsArray({} as any);
    expect(result.success).toBe(false);
  });

  it('should reject empty beats array', () => {
    const result = validateBeatsArray([]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('at least one beat');
    }
  });

  it('should accept non-empty beats array', () => {
    const result = validateBeatsArray([{ id: 'beat_0', type: 'titleScreen' }]);
    expect(result.success).toBe(true);
  });
});

describe('validateBeat', () => {
  it('should reject beat without id', () => {
    const beat: StoryBeat = { type: 'titleScreen', parameters: {} };
    const result = validateBeat(beat, 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('index 0');
      expect(result.error).toContain('id');
    }
  });

  it('should reject beat without type', () => {
    const beat: StoryBeat = { id: 'beat_0', parameters: {} };
    const result = validateBeat(beat, 2);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('beat_0');
      expect(result.error).toContain('type');
    }
  });

  it('should accept valid beat', () => {
    const beat: StoryBeat = { id: 'beat_0', type: 'titleScreen', parameters: {} };
    const result = validateBeat(beat, 0);
    expect(result.success).toBe(true);
  });

  it('should accept beat with all optional fields', () => {
    const beat: StoryBeat = {
      id: 'beat_0',
      type: 'titleScreen',
      name: 'Start Screen',
      parameters: { title: 'My Story' },
      x: 100,
      y: 200,
    };
    const result = validateBeat(beat, 0);
    expect(result.success).toBe(true);
  });
});

describe('validateAllBeats', () => {
  it('should reject if any beat is invalid', () => {
    const beats: StoryBeat[] = [
      { id: 'beat_0', type: 'titleScreen' },
      { id: 'beat_1' }, // missing type
      { id: 'beat_2', type: 'endScreen' },
    ];
    const result = validateAllBeats(beats);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('beat_1');
    }
  });

  it('should accept if all beats are valid', () => {
    const beats: StoryBeat[] = [
      { id: 'beat_0', type: 'titleScreen' },
      { id: 'beat_1', type: 'introText' },
      { id: 'beat_2', type: 'endScreen' },
    ];
    const result = validateAllBeats(beats);
    expect(result.success).toBe(true);
  });

  it('should return first error found', () => {
    const beats: StoryBeat[] = [
      { type: 'titleScreen' }, // missing id at index 0
      { id: 'beat_1' }, // missing type
    ];
    const result = validateAllBeats(beats);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('index 0');
    }
  });
});

describe('validateStory', () => {
  it('should reject story without metadata', () => {
    const story: StoryData = {
      beats: [{ id: 'beat_0', type: 'titleScreen' }],
    };
    const result = validateStory(story);
    expect(result.success).toBe(false);
  });

  it('should reject story without beats', () => {
    const story: StoryData = {
      metadata: { title: 'Test Story' },
    };
    const result = validateStory(story);
    expect(result.success).toBe(false);
  });

  it('should reject story with invalid beats', () => {
    const story: StoryData = {
      metadata: { title: 'Test Story' },
      beats: [{ id: 'beat_0' }], // missing type
    };
    const result = validateStory(story);
    expect(result.success).toBe(false);
  });

  it('should accept valid story', () => {
    const story: StoryData = {
      metadata: { title: 'Test Story', author: 'Test' },
      beats: [
        { id: 'beat_0', type: 'titleScreen', parameters: { title: 'Welcome' } },
        { id: 'beat_1', type: 'introText', parameters: { text: 'Hello' } },
        { id: 'beat_2', type: 'endScreen', parameters: {} },
      ],
      connections: [
        { source: 'beat_0', target: 'beat_1' },
        { source: 'beat_1', target: 'beat_2' },
      ],
    };
    const result = validateStory(story);
    expect(result.success).toBe(true);
  });

  it('should accept minimal valid story', () => {
    const story: StoryData = {
      metadata: { title: 'Minimal Story' },
      beats: [{ id: 'beat_0', type: 'titleScreen' }],
    };
    const result = validateStory(story);
    expect(result.success).toBe(true);
  });
});

describe('findDuplicateBeatIds', () => {
  it('should return empty array for unique IDs', () => {
    const beats: StoryBeat[] = [
      { id: 'beat_0', type: 'titleScreen' },
      { id: 'beat_1', type: 'introText' },
      { id: 'beat_2', type: 'endScreen' },
    ];
    const duplicates = findDuplicateBeatIds(beats);
    expect(duplicates).toHaveLength(0);
  });

  it('should find duplicate IDs', () => {
    const beats: StoryBeat[] = [
      { id: 'beat_0', type: 'titleScreen' },
      { id: 'beat_1', type: 'introText' },
      { id: 'beat_0', type: 'endScreen' }, // duplicate
    ];
    const duplicates = findDuplicateBeatIds(beats);
    expect(duplicates).toContain('beat_0');
    expect(duplicates).toHaveLength(1);
  });

  it('should find multiple duplicate IDs', () => {
    const beats: StoryBeat[] = [
      { id: 'beat_0', type: 'titleScreen' },
      { id: 'beat_1', type: 'introText' },
      { id: 'beat_0', type: 'endScreen' },
      { id: 'beat_1', type: 'movementChoice' },
    ];
    const duplicates = findDuplicateBeatIds(beats);
    expect(duplicates).toContain('beat_0');
    expect(duplicates).toContain('beat_1');
    expect(duplicates).toHaveLength(2);
  });

  it('should handle beats without IDs', () => {
    const beats: StoryBeat[] = [
      { id: 'beat_0', type: 'titleScreen' },
      { type: 'introText' }, // no id
      { id: 'beat_0', type: 'endScreen' },
    ];
    const duplicates = findDuplicateBeatIds(beats);
    expect(duplicates).toContain('beat_0');
    expect(duplicates).toHaveLength(1);
  });
});

describe('findBrokenConnections', () => {
  it('should return empty array for valid connections', () => {
    const beatIds = new Set(['beat_0', 'beat_1', 'beat_2']);
    const connections = [
      { source: 'beat_0', target: 'beat_1' },
      { source: 'beat_1', target: 'beat_2' },
    ];
    const broken = findBrokenConnections(connections, beatIds);
    expect(broken).toHaveLength(0);
  });

  it('should find connections with missing source', () => {
    const beatIds = new Set(['beat_0', 'beat_1']);
    const connections = [
      { source: 'beat_missing', target: 'beat_1' },
    ];
    const broken = findBrokenConnections(connections, beatIds);
    expect(broken).toHaveLength(1);
    expect(broken[0].source).toBe('beat_missing');
    expect(broken[0].target).toBeUndefined();
  });

  it('should find connections with missing target', () => {
    const beatIds = new Set(['beat_0', 'beat_1']);
    const connections = [
      { source: 'beat_0', target: 'beat_missing' },
    ];
    const broken = findBrokenConnections(connections, beatIds);
    expect(broken).toHaveLength(1);
    expect(broken[0].source).toBeUndefined();
    expect(broken[0].target).toBe('beat_missing');
  });

  it('should find connections with both source and target missing', () => {
    const beatIds = new Set(['beat_0']);
    const connections = [
      { source: 'beat_missing_1', target: 'beat_missing_2' },
    ];
    const broken = findBrokenConnections(connections, beatIds);
    expect(broken).toHaveLength(1);
    expect(broken[0].source).toBe('beat_missing_1');
    expect(broken[0].target).toBe('beat_missing_2');
  });

  it('should find multiple broken connections', () => {
    const beatIds = new Set(['beat_0', 'beat_1']);
    const connections = [
      { source: 'beat_0', target: 'beat_1' }, // valid
      { source: 'beat_1', target: 'beat_missing' }, // broken
      { source: 'beat_nonexistent', target: 'beat_0' }, // broken
    ];
    const broken = findBrokenConnections(connections, beatIds);
    expect(broken).toHaveLength(2);
  });
});
