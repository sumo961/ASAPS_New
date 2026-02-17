/**
 * Tests for DirectoryAdapter translation wiring
 *
 * Verifies that translations are passed through correctly in both directions:
 * - openProject: translations from disk → Project object
 * - projectToSerializeInput: Project translations → SerializeInput for saving
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @asaps/core module before importing DirectoryAdapter
vi.mock('@asaps/core', () => ({
  deserializeFromDirectory: vi.fn(),
  serializeToDirectory: vi.fn(),
  isDirectoryProject: vi.fn().mockResolvedValue(true),
  deterministicStringify: vi.fn((obj: any) => JSON.stringify(obj)),
  serializeBeat: vi.fn(),
  serializeBeatFromJSON: vi.fn(),
  beatFilename: vi.fn((id: string) => `${id}.beat.json`),
  setManifestEntry: vi.fn(),
  parseManifest: vi.fn(),
  serializeManifest: vi.fn(),
  getAssetFolder: vi.fn(() => 'other'),
  generateUniqueFilename: vi.fn((name: string) => name),
}));

import { DirectoryAdapter } from '../DirectoryAdapter';
import { deserializeFromDirectory, serializeToDirectory } from '@asaps/core';

// Mock electronAPI on globalThis (works in both node and jsdom)
const mockFS = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readDir: vi.fn().mockResolvedValue([]),
  mkdir: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  unlink: vi.fn(),
  copyFile: vi.fn(),
  stat: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure window exists (for Node test environment)
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = globalThis;
  }
  (globalThis as any).electronAPI = { fs: mockFS };
  (globalThis as any).window.electronAPI = { fs: mockFS };
});

describe('DirectoryAdapter - Translation Wiring', () => {
  describe('openProject', () => {
    it('should include translations from deserialized result', async () => {
      const mockTranslations = [
        {
          languageCode: 'de',
          languageName: 'German',
          strings: { 'beat:b1.parameters.text': { value: 'Hallo', status: 'translated' } },
        },
      ];
      const mockManifest = {
        sourceLanguage: 'en',
        languages: [{ code: 'de', name: 'German' }],
      };

      (deserializeFromDirectory as any).mockResolvedValue({
        project: {
          id: 'proj1',
          name: 'Test',
          description: '',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          version: 1,
        },
        storyMetadata: { title: 'Test' },
        beats: [],
        environment: { props: [], nodes: [] },
        characters: [],
        clusters: [],
        containerBeatPositions: [],
        settings: {},
        globalSettings: undefined,
        themeId: undefined,
        themeOverrides: undefined,
        manifest: { assets: {} },
        translations: mockTranslations,
        translationManifest: mockManifest,
      });

      const adapter = new DirectoryAdapter();
      const project = await adapter.openProject('/test/project');

      expect(project.translations).toEqual(mockTranslations);
      expect(project.translationManifest).toEqual(mockManifest);
    });

    it('should set translations to undefined when none exist', async () => {
      (deserializeFromDirectory as any).mockResolvedValue({
        project: {
          id: 'proj2',
          name: 'Empty',
          description: '',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          version: 1,
        },
        storyMetadata: { title: 'Empty' },
        beats: [],
        environment: { props: [], nodes: [] },
        characters: [],
        clusters: [],
        containerBeatPositions: [],
        settings: {},
        manifest: { assets: {} },
        translations: [],
        translationManifest: undefined,
      });

      const adapter = new DirectoryAdapter();
      const project = await adapter.openProject('/test/empty');

      expect(project.translations).toBeUndefined();
    });
  });

  describe('projectToSerializeInput', () => {
    it('should include translations in serialize input when present', async () => {
      const translations = [
        {
          languageCode: 'fr',
          languageName: 'French',
          strings: { 'beat:b1.parameters.text': { value: 'Bonjour', status: 'translated' } },
        },
      ];
      const translationManifest = {
        sourceLanguage: 'en',
        languages: [{ code: 'fr', name: 'French' }],
      };

      // Set up a mock for serializeToDirectory to capture the input
      let capturedInput: any = null;
      (serializeToDirectory as any).mockImplementation((input: any) => {
        capturedInput = input;
        return { files: new Map() };
      });

      const adapter = new DirectoryAdapter();
      adapter.setProjectPath('/test/project');

      const project = {
        id: 'proj3',
        name: 'With Translations',
        description: '',
        story: {
          metadata: { title: 'Test' },
          beats: [],
          settings: {},
          environment: { props: [], nodes: [] },
          characters: [],
          clusters: [],
          containerBeatPositions: [],
        },
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: 1,
        translations,
        translationManifest,
      } as any;

      // Call saveProject which internally calls projectToSerializeInput
      try {
        await adapter.saveProject(project);
      } catch {
        // May fail due to mock limitations, but capturedInput should be set
      }

      expect(capturedInput).toBeDefined();
      expect(capturedInput.translations).toEqual(translations);
      expect(capturedInput.translationManifest).toEqual(translationManifest);
    });

    it('should omit translations from serialize input when empty', async () => {
      let capturedInput: any = null;
      (serializeToDirectory as any).mockImplementation((input: any) => {
        capturedInput = input;
        return { files: new Map() };
      });

      const adapter = new DirectoryAdapter();
      adapter.setProjectPath('/test/project');

      const project = {
        id: 'proj4',
        name: 'No Translations',
        description: '',
        story: {
          metadata: { title: 'Test' },
          beats: [],
          settings: {},
          environment: { props: [], nodes: [] },
          characters: [],
          clusters: [],
          containerBeatPositions: [],
        },
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: 1,
      } as any;

      try {
        await adapter.saveProject(project);
      } catch {
        // Expected
      }

      expect(capturedInput).toBeDefined();
      expect(capturedInput.translations).toBeUndefined();
      expect(capturedInput.translationManifest).toBeUndefined();
    });
  });
});
