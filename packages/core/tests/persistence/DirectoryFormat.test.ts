import { describe, it, expect, vi } from 'vitest';
import {
  serializeToDirectory,
  deserializeFromDirectory,
  isDirectoryProject,
  type SerializeInput,
  type DirectoryReader,
} from '../../src/persistence/DirectoryFormat';

// Helper to create a minimal serialize input
function createMinimalInput(overrides?: Partial<SerializeInput>): SerializeInput {
  return {
    project: {
      id: 'proj_1',
      name: 'Test Project',
      createdAt: '2025-01-01T00:00:00.000Z',
      modifiedAt: '2025-01-02T00:00:00.000Z',
      version: '1.0',
      ...overrides?.project,
    },
    story: {
      metadata: { firstBeatId: 'beat_1', title: 'Test' },
      beats: [
        {
          id: 'beat_1',
          type: 'titleScreen',
          name: 'Title',
          parameters: { title: 'My Story' },
          connections: [{ targetId: 'beat_2' }],
          locations: [],
        },
        {
          id: 'beat_2',
          type: 'endScreen',
          name: 'End',
          parameters: {},
          connections: [],
          locations: [],
        },
      ],
      clusters: [],
      characters: [],
      environment: { props: [], nodes: [] },
      containerBeatPositions: [],
      ...overrides?.story as any,
    },
    assets: overrides?.assets,
  };
}

describe('DirectoryFormat', () => {
  describe('serializeToDirectory', () => {
    it('generates the required project files', () => {
      const input = createMinimalInput();
      const result = serializeToDirectory(input);

      const filePaths = result.files.map(f => f.path);

      expect(filePaths).toContain('.asaps/format.json');
      expect(filePaths).toContain('project.json');
      expect(filePaths).toContain('settings.json');
      expect(filePaths).toContain('environment.json');
      expect(filePaths).toContain('clusters/_index.json');
      expect(filePaths).toContain('.gitattributes');
      expect(filePaths).toContain('.gitignore');
      expect(filePaths).toContain('.p4ignore');
    });

    it('writes correct format.json', () => {
      const input = createMinimalInput();
      const result = serializeToDirectory(input);
      const formatFile = result.files.find(f => f.path === '.asaps/format.json')!;
      const data = JSON.parse(formatFile.content);

      expect(data.type).toBe('directory');
      expect(data.version).toBe('1.0');
    });

    it('writes project.json with metadata', () => {
      const input = createMinimalInput({
        project: {
          id: 'proj_1',
          name: 'My Story',
          description: 'A great tale',
          createdAt: '2025-01-01T00:00:00.000Z',
          modifiedAt: '2025-01-02T00:00:00.000Z',
          version: '2.0',
        },
      });
      const result = serializeToDirectory(input);
      const projectFile = result.files.find(f => f.path === 'project.json')!;
      const data = JSON.parse(projectFile.content);

      expect(data.id).toBe('proj_1');
      expect(data.name).toBe('My Story');
      expect(data.description).toBe('A great tale');
      expect(data.version).toBe('2.0');
      expect(data.firstBeatId).toBe('beat_1');
    });

    it('places unclustered beats in clusters/_unclustered/', () => {
      const input = createMinimalInput();
      const result = serializeToDirectory(input);

      const beatFiles = result.files.filter(f => f.path.includes('_unclustered/'));
      expect(beatFiles.length).toBe(2);
      expect(beatFiles[0].path).toMatch(/clusters\/_unclustered\/titleScreen_beat_1\.json/);
    });

    it('places clustered beats in their cluster directory', () => {
      const input = createMinimalInput({
        story: {
          metadata: { firstBeatId: 'beat_1' },
          beats: [
            {
              id: 'beat_1',
              type: 'dialogTree',
              name: 'Talk',
              parameters: {},
              connections: [],
              locations: [],
              cluster: 'c1',
            },
          ],
          clusters: [
            { id: 'c1', name: 'Forest Area', type: 'normal', color: '#00ff00' },
          ],
          characters: [],
          environment: { props: [], nodes: [] },
          containerBeatPositions: [],
        },
      });

      const result = serializeToDirectory(input);

      const beatFiles = result.files.filter(f => f.path.includes('forest-area/'));
      expect(beatFiles.some(f => f.path.endsWith('dialogTree_beat_1.json'))).toBe(true);
    });

    it('generates character files when characters exist', () => {
      const input = createMinimalInput({
        story: {
          metadata: { firstBeatId: 'beat_1' },
          beats: [],
          clusters: [],
          characters: [{ id: 'char_hero', name: 'Hero', color: '#ff0000' }],
          environment: { props: [], nodes: [] },
          containerBeatPositions: [],
        },
      });

      const result = serializeToDirectory(input);
      const charIndex = result.files.find(f => f.path === 'characters/_index.json')!;
      const charFile = result.files.find(f => f.path === 'characters/char_hero.json')!;

      expect(charIndex).toBeDefined();
      expect(charFile).toBeDefined();

      const indexData = JSON.parse(charIndex.content);
      expect(indexData.characterIds).toContain('char_hero');
    });

    it('generates asset manifest and asset file entries', () => {
      const input = createMinimalInput({
        assets: [
          {
            id: 'asset_1',
            filename: 'forest.jpg',
            type: 'image',
            mimeType: 'image/jpeg',
            size: 10000,
            context: 'background',
          },
        ],
      });

      const result = serializeToDirectory(input);
      const manifestFile = result.files.find(f => f.path === 'assets/_manifest.json')!;
      const manifestData = JSON.parse(manifestFile.content);

      expect(manifestData.assets['asset_1']).toBeDefined();
      expect(manifestData.assets['asset_1'].filename).toBe('forest.jpg');
      expect(manifestData.assets['asset_1'].folder).toBe('backgrounds');

      expect(result.assetFiles.length).toBe(1);
      expect(result.assetFiles[0].path).toBe('assets/backgrounds/forest.jpg');
    });

    it('generates deterministic JSON output', () => {
      const input = createMinimalInput();
      const result1 = serializeToDirectory(input);
      const result2 = serializeToDirectory(input);

      // Every file should be exactly identical
      for (let i = 0; i < result1.files.length; i++) {
        expect(result1.files[i].content).toBe(result2.files[i].content);
      }
    });
  });

  describe('deserializeFromDirectory', () => {
    it('reads a minimal project from a mock directory', async () => {
      // Build a virtual filesystem from serialized output
      const input = createMinimalInput();
      const serialized = serializeToDirectory(input);

      const fileMap = new Map<string, string>();
      for (const f of serialized.files) {
        fileMap.set(`/project/${f.path}`, f.content);
      }

      const reader: DirectoryReader = {
        readText: async (path: string) => {
          const content = fileMap.get(path);
          if (content === undefined) throw new Error(`File not found: ${path}`);
          return content;
        },
        exists: async (path: string) => {
          // Check exact file match or directory prefix
          if (fileMap.has(path)) return true;
          // Check if it's a directory (any file starts with this path)
          for (const key of fileMap.keys()) {
            if (key.startsWith(path + '/')) return true;
          }
          return false;
        },
        listDir: async (path: string) => {
          const entries: Array<{ name: string; isDirectory: boolean }> = [];
          const seen = new Set<string>();
          for (const key of fileMap.keys()) {
            if (key.startsWith(path + '/')) {
              const rest = key.substring(path.length + 1);
              const parts = rest.split('/');
              const name = parts[0];
              if (!seen.has(name)) {
                seen.add(name);
                entries.push({ name, isDirectory: parts.length > 1 });
              }
            }
          }
          return entries;
        },
      };

      const result = await deserializeFromDirectory('/project', reader);

      expect(result.project.id).toBe('proj_1');
      expect(result.project.name).toBe('Test Project');
      expect(result.beats.length).toBe(2);
      expect(result.beats.find(b => b.id === 'beat_1')).toBeDefined();
      expect(result.beats.find(b => b.id === 'beat_2')).toBeDefined();
    });

    it('reads settings and theme data', async () => {
      const input = createMinimalInput({
        project: {
          id: 'proj_1',
          name: 'Test',
          createdAt: '2025-01-01T00:00:00.000Z',
          modifiedAt: '2025-01-02T00:00:00.000Z',
          version: '1.0',
          globalSettings: { fontSize: 16, fontFamily: 'Arial' },
          themeId: 'dark-mode',
          themeOverrides: { backgroundColor: '#000' },
        },
      });
      const serialized = serializeToDirectory(input);

      const fileMap = new Map<string, string>();
      for (const f of serialized.files) {
        fileMap.set(`/p/${f.path}`, f.content);
      }

      const reader: DirectoryReader = {
        readText: async (path) => {
          const content = fileMap.get(path);
          if (content === undefined) throw new Error(`Not found: ${path}`);
          return content;
        },
        exists: async (path) => {
          if (fileMap.has(path)) return true;
          for (const key of fileMap.keys()) {
            if (key.startsWith(path + '/')) return true;
          }
          return false;
        },
        listDir: async (path) => {
          const entries: Array<{ name: string; isDirectory: boolean }> = [];
          const seen = new Set<string>();
          for (const key of fileMap.keys()) {
            if (key.startsWith(path + '/')) {
              const rest = key.substring(path.length + 1);
              const parts = rest.split('/');
              const name = parts[0];
              if (!seen.has(name)) {
                seen.add(name);
                entries.push({ name, isDirectory: parts.length > 1 });
              }
            }
          }
          return entries;
        },
      };

      const result = await deserializeFromDirectory('/p', reader);

      expect(result.globalSettings).toEqual({ fontSize: 16, fontFamily: 'Arial' });
      expect(result.themeId).toBe('dark-mode');
      expect(result.themeOverrides).toEqual({ backgroundColor: '#000' });
    });
  });

  describe('isDirectoryProject', () => {
    it('returns true when .asaps/format.json with type=directory exists', async () => {
      const reader: DirectoryReader = {
        readText: async () => JSON.stringify({ type: 'directory', version: '1.0' }),
        exists: async (path) => path.endsWith('.asaps/format.json'),
        listDir: async () => [],
      };

      expect(await isDirectoryProject('/test', reader)).toBe(true);
    });

    it('returns true when project.json and clusters/ exist (fallback check)', async () => {
      const reader: DirectoryReader = {
        readText: async () => '{}',
        exists: async (path) => {
          return path.endsWith('project.json') || path.endsWith('clusters');
        },
        listDir: async () => [],
      };

      expect(await isDirectoryProject('/test', reader)).toBe(true);
    });

    it('returns false when neither indicator exists', async () => {
      const reader: DirectoryReader = {
        readText: async () => '{}',
        exists: async () => false,
        listDir: async () => [],
      };

      expect(await isDirectoryProject('/test', reader)).toBe(false);
    });

    it('returns false when format.json has wrong type', async () => {
      const reader: DirectoryReader = {
        readText: async () => JSON.stringify({ type: 'zip', version: '1.0' }),
        exists: async (path) => path.endsWith('.asaps/format.json'),
        listDir: async () => [],
      };

      expect(await isDirectoryProject('/test', reader)).toBe(false);
    });
  });
});
