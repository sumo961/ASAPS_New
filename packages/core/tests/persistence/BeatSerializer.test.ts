import { describe, it, expect } from 'vitest';
import {
  serializeBeatFromJSON,
  beatFilename,
  deterministicStringify,
} from '../../src/persistence/BeatSerializer';

describe('BeatSerializer', () => {
  describe('serializeBeatFromJSON', () => {
    it('serializes a minimal beat with required fields', () => {
      const raw = {
        id: 'beat_1',
        type: 'dialogTree',
        name: 'Test Beat',
        parameters: { text: 'Hello' },
        connections: [],
      };

      const result = serializeBeatFromJSON(raw);

      expect(result.id).toBe('beat_1');
      expect(result.type).toBe('dialogTree');
      expect(result.name).toBe('Test Beat');
      expect(result.parameters).toEqual({ text: 'Hello' });
      expect(result.connections).toEqual([]);
      expect(result.locations).toEqual([]);
      expect(result._format).toBe('1.0');
    });

    it('includes optional fields when present', () => {
      const raw = {
        id: 'beat_2',
        type: 'durScreen',
        name: 'Timed Beat',
        x: 100,
        y: 200,
        parameters: {},
        locations: [{ id: 'loc1' }],
        connections: [{ targetId: 'beat_3', label: 'Next' }],
        cluster: 'cluster_1',
        node: 'bg_forest',
        transition: { type: 'fade', duration: 500 },
        sound: { src: 'theme.mp3' },
        defaultTarget: 'beat_4',
        defaultTargetDelay: 5000,
        showTimer: true,
        notes: 'A note',
      };

      const result = serializeBeatFromJSON(raw);

      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
      expect(result.locations).toEqual([{ id: 'loc1' }]);
      expect(result.connections).toEqual([{ targetId: 'beat_3', label: 'Next' }]);
      expect(result.cluster).toBe('cluster_1');
      expect(result.node).toBe('bg_forest');
      expect(result.transition).toEqual({ type: 'fade', duration: 500 });
      expect(result.sound).toEqual({ src: 'theme.mp3' });
      expect(result.defaultTarget).toBe('beat_4');
      expect(result.defaultTargetDelay).toBe(5000);
      expect(result.showTimer).toBe(true);
      expect(result.notes).toBe('A note');
    });

    it('omits optional fields when null or undefined', () => {
      const raw = {
        id: 'beat_3',
        type: 'infoText',
        name: 'Info',
        x: null,
        y: undefined,
        parameters: {},
        connections: [],
        cluster: undefined,
        node: null,
        transition: null,
        sound: null,
        notes: '',
      };

      const result = serializeBeatFromJSON(raw);

      expect(result).not.toHaveProperty('x');
      expect(result).not.toHaveProperty('y');
      expect(result).not.toHaveProperty('cluster');
      expect(result).not.toHaveProperty('node');
      expect(result).not.toHaveProperty('transition');
      expect(result).not.toHaveProperty('sound');
      expect(result).not.toHaveProperty('notes');
    });

    it('strips condition from connections when not present', () => {
      const raw = {
        id: 'beat_4',
        type: 'dialogTree',
        name: 'Connections',
        parameters: {},
        connections: [
          { targetId: 'beat_5', label: 'Go', condition: null },
          { targetId: 'beat_6', label: '', condition: { var: 'x', op: '==', value: 1 } },
          { targetId: 'beat_7' },
        ],
      };

      const result = serializeBeatFromJSON(raw);

      expect(result.connections).toEqual([
        { targetId: 'beat_5', label: 'Go' },
        { targetId: 'beat_6', condition: { var: 'x', op: '==', value: 1 } },
        { targetId: 'beat_7' },
      ]);
    });
  });

  describe('beatFilename', () => {
    it('generates a filename from type and id', () => {
      expect(beatFilename({ type: 'dialogTree', id: 'beat_5' })).toBe('dialogTree_beat_5.json');
    });

    it('sanitizes special characters in IDs', () => {
      expect(beatFilename({ type: 'infoText', id: 'beat/with spaces' })).toBe('infoText_beat_with_spaces.json');
    });

    it('handles IDs with only special characters', () => {
      expect(beatFilename({ type: 'titleScreen', id: '!@#$%' })).toBe('titleScreen______.json');
    });
  });

  describe('deterministicStringify', () => {
    it('sorts keys alphabetically', () => {
      const obj = { z: 1, a: 2, m: 3 };
      const result = deterministicStringify(obj);
      const parsed = JSON.parse(result);
      const keys = Object.keys(parsed);
      expect(keys).toEqual(['a', 'm', 'z']);
    });

    it('sorts nested object keys', () => {
      const obj = { outer: { z: 1, a: 2 }, beta: { y: 3, b: 4 } };
      const result = deterministicStringify(obj);

      // Verify nested keys are sorted
      expect(result).toMatch(/"a": 2[\s\S]*"z": 1/);
      expect(result).toMatch(/"b": 4[\s\S]*"y": 3/);
      // Verify outer keys are sorted
      expect(result).toMatch(/"beta"[\s\S]*"outer"/);
    });

    it('preserves arrays in order', () => {
      const obj = { items: [3, 1, 2] };
      const result = deterministicStringify(obj);
      const parsed = JSON.parse(result);
      expect(parsed.items).toEqual([3, 1, 2]);
    });

    it('produces consistent output regardless of key insertion order', () => {
      const obj1: Record<string, number> = {};
      obj1.b = 2;
      obj1.a = 1;
      obj1.c = 3;

      const obj2: Record<string, number> = {};
      obj2.a = 1;
      obj2.c = 3;
      obj2.b = 2;

      expect(deterministicStringify(obj1)).toBe(deterministicStringify(obj2));
    });

    it('uses 2-space indentation', () => {
      const result = deterministicStringify({ key: 'value' });
      expect(result).toContain('  "key"');
    });

    it('handles null and primitive values', () => {
      const obj = { a: null, b: 42, c: true, d: 'hello' };
      const result = deterministicStringify(obj);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(obj);
    });
  });
});
