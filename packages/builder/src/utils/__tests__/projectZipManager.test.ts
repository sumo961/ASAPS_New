import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { exportProjectAsZip, importProjectFromZip } from '../projectZipManager';
import type { Project, StoredAsset } from '../../storage/types';

// Use vi.hoisted to ensure the mock instance is created before vi.mock runs
const { mockStorageInstance } = vi.hoisted(() => ({
  mockStorageInstance: {
    getProject: vi.fn(),
    getProjectAssets: vi.fn(),
    getAsset: vi.fn(),
    createAsset: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    projectExists: vi.fn(),
    listProjects: vi.fn()
  }
}));

// Mock the storage manager to return the same instance
vi.mock('../../storage/StorageManager', () => ({
  getStorageManager: vi.fn(() => mockStorageInstance)
}));

// Polyfill Blob.prototype.arrayBuffer for jsdom (not implemented in jsdom)
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(this);
    });
  };
}

describe('projectZipManager', () => {
  const mockStorage = mockStorageInstance;
  let testProject: Project;
  let testAssets: StoredAsset[];

  beforeEach(() => {
    mockStorageInstance.listProjects.mockResolvedValue({ success: true, data: [] });
    // Reset mocks
    vi.clearAllMocks();

    // Create test project
    testProject = {
      id: 'test-project-id',
      name: 'Test Project',
      description: 'A test project for ZIP export',
      story: {
        beats: [
          {
            id: 'beat_1',
            name: 'Intro',
            type: 'infoText',
            parameters: { text: 'Welcome', buttonText: 'Continue' },
            connections: [{ targetId: 'beat_2' }],
            locations: [],
            x: 100,
            y: 200,
            node: 'background_1'
          }
        ],
        metadata: { title: 'Test Story', author: 'Test Author' },
        settings: { width: 1024, height: 768 },
        environment: {
          props: [{ id: 'prop_1', name: 'Sword' }],
          nodes: [{ id: 'background_1', url: 'bg.jpg' }]
        },
        characters: [{ id: 'char_1', name: 'Hero' }],
        clusters: []
      } as any,
      settings: { width: 1024, height: 768, fonts: ['Arial'] },
      assetIds: ['asset_1', 'asset_2'],
      createdAt: new Date('2024-01-01'),
      modifiedAt: new Date('2024-01-02'),
      version: '1.0.0'
    };

    // Create test assets
    testAssets = [
      {
        id: 'asset_1',
        projectId: 'test-project-id',
        type: 'image',
        filename: 'background.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        blob: new Blob(['test image data'], { type: 'image/jpeg' }),
        uploadedAt: new Date('2024-01-01'),
        metadata: {}
      },
      {
        id: 'asset_2',
        projectId: 'test-project-id',
        type: 'audio',
        filename: 'music.mp3',
        mimeType: 'audio/mpeg',
        size: 2048,
        blob: new Blob(['test audio data'], { type: 'audio/mpeg' }),
        uploadedAt: new Date('2024-01-01'),
        metadata: {}
      }
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportProjectAsZip', () => {
    it('should export project as ZIP blob', async () => {
      mockStorage.getProject.mockResolvedValue({
        success: true,
        data: testProject
      });

      mockStorage.getProjectAssets.mockResolvedValue({
        success: true,
        data: testAssets
      });

      const zipBlob = await exportProjectAsZip('test-project-id');

      expect(zipBlob).toBeInstanceOf(Blob);
      expect(zipBlob.size).toBeGreaterThan(0);
      expect(zipBlob.type).toContain('zip');
    });

    it('should include project.json in ZIP', async () => {
      mockStorage.getProject.mockResolvedValue({
        success: true,
        data: testProject
      });

      mockStorage.getProjectAssets.mockResolvedValue({
        success: true,
        data: []
      });

      const zipBlob = await exportProjectAsZip('test-project-id');
      const zip = await JSZip.loadAsync(zipBlob);

      const projectJsonFile = zip.file('project.json');
      expect(projectJsonFile).toBeDefined();

      if (projectJsonFile) {
        const content = await projectJsonFile.async('text');
        const projectData = JSON.parse(content);

        expect(projectData.metadata).toBeDefined();
        expect(projectData.metadata.projectName).toBe('Test Project');
        expect(projectData.project).toBeDefined();
        expect(projectData.project.id).toBe('test-project-id');
      }
    });

    it('should organize assets in appropriate folders', async () => {
      mockStorage.getProject.mockResolvedValue({
        success: true,
        data: testProject
      });

      mockStorage.getProjectAssets.mockResolvedValue({
        success: true,
        data: testAssets
      });

      const zipBlob = await exportProjectAsZip('test-project-id');
      const zip = await JSZip.loadAsync(zipBlob);

      // Check that image is in backgrounds folder
      const backgroundFile = zip.file('backgrounds/background.jpg');
      expect(backgroundFile).toBeDefined();

      // Check that audio is in sounds folder
      const audioFile = zip.file('sounds/music.mp3');
      expect(audioFile).toBeDefined();
    });

    it('should include asset metadata', async () => {
      mockStorage.getProject.mockResolvedValue({
        success: true,
        data: testProject
      });

      mockStorage.getProjectAssets.mockResolvedValue({
        success: true,
        data: testAssets
      });

      const zipBlob = await exportProjectAsZip('test-project-id');
      const zip = await JSZip.loadAsync(zipBlob);

      // Check for metadata file
      const metadataFile = zip.file('backgrounds/asset_1.json');
      expect(metadataFile).toBeDefined();

      if (metadataFile) {
        const content = await metadataFile.async('text');
        const metadata = JSON.parse(content);

        expect(metadata.id).toBe('asset_1');
        expect(metadata.filename).toBe('background.jpg');
        expect(metadata.type).toBe('image');
      }
    });

    it('writes the template flag only when asTemplate is requested', async () => {
      mockStorage.getProject.mockResolvedValue({ success: true, data: testProject });
      mockStorage.getProjectAssets.mockResolvedValue({ success: true, data: [] });

      const templateBlob = await exportProjectAsZip('test-project-id', { asTemplate: true });
      const templateZip = await JSZip.loadAsync(templateBlob);
      const templateJson = JSON.parse(await templateZip.file('project.json')!.async('text'));
      expect(templateJson.project.projectType).toBe('template');

      const normalBlob = await exportProjectAsZip('test-project-id');
      const normalZip = await JSZip.loadAsync(normalBlob);
      const normalJson = JSON.parse(await normalZip.file('project.json')!.async('text'));
      expect(normalJson.project.projectType).toBeUndefined();
    });

    it('should throw error if project not found', async () => {
      mockStorage.getProject.mockResolvedValue({
        success: false,
        data: null
      });

      await expect(exportProjectAsZip('nonexistent-id')).rejects.toThrow('Project not found');
    });

    it('should handle projects with no assets', async () => {
      mockStorage.getProject.mockResolvedValue({
        success: true,
        data: testProject
      });

      mockStorage.getProjectAssets.mockResolvedValue({
        success: true,
        data: []
      });

      const zipBlob = await exportProjectAsZip('test-project-id');
      const zip = await JSZip.loadAsync(zipBlob);

      // Should still have project.json
      const projectJsonFile = zip.file('project.json');
      expect(projectJsonFile).toBeDefined();

      // But no asset files
      const files = Object.keys(zip.files).filter(name => name.startsWith('backgrounds/'));
      expect(files.length).toBe(0);
    });
  });

  describe('importProjectFromZip', () => {
    it('should import project from ZIP file', async () => {
      // Create a ZIP file
      const zip = new JSZip();

      const projectData = {
        metadata: {
          exportVersion: '1.0.0',
          exportedAt: new Date().toISOString(),
          projectId: 'original-id',
          projectName: 'Imported Project'
        },
        project: {
          id: 'original-id',
          name: 'Imported Project',
          description: 'Test import',
          createdAt: new Date(),
          modifiedAt: new Date(),
          version: '1.0.0',
          settings: { width: 1024, height: 768 },
          story: {
            beats: [],
            metadata: { title: 'Test Story' }
          }
        }
      };

      zip.file('project.json', JSON.stringify(projectData));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'test.zip', { type: 'application/zip' });

      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, { generateNewId: false });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('original-id');
      expect(mockStorage.createProject).toHaveBeenCalled();
    });

    it('uniquifies the NAME when a different project already uses it', async () => {
      // The id-conflict flow only catches ID collisions — a recovered story
      // dump (fresh id every import) sailed past it and landed a duplicate
      // name in the library.
      const zip = new JSZip();
      zip.file('project.json', JSON.stringify({
        metadata: { exportVersion: '1.1.0', projectId: 'fresh-id', projectName: 'The Interview' },
        project: {
          id: 'fresh-id', name: 'The Interview', createdAt: new Date(), modifiedAt: new Date(),
          version: '1.0.0', settings: {}, story: { beats: [], metadata: { title: 'The Interview' } },
        },
      }));
      const file = new File([await zip.generateAsync({ type: 'blob' })], 'recovered.asaps.zip');

      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });
      mockStorage.listProjects.mockResolvedValue({
        success: true,
        data: [{ id: 'other-id', name: 'The Interview' }],
      });

      const result = await importProjectFromZip(file, { generateNewId: false });
      expect(result.success).toBe(true);
      const created = mockStorage.createProject.mock.calls.at(-1)![0];
      expect(created.name).toBe('The Interview 1');
    });

    it('should generate new ID when requested', async () => {
      const zip = new JSZip();

      const projectData = {
        metadata: {
          exportVersion: '1.0.0',
          exportedAt: new Date().toISOString(),
          projectId: 'original-id',
          projectName: 'Test'
        },
        project: {
          id: 'original-id',
          name: 'Test',
          settings: {},
          story: { beats: [] }
        }
      };

      zip.file('project.json', JSON.stringify(projectData));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'test.zip');

      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, { generateNewId: true });

      expect(result.success).toBe(true);
      expect(result.projectId).not.toBe('original-id');
    });

    // --- Template semantics (.asapst / projectType flag) ------------------

    const makeZipFile = async (projectPatch: Record<string, any>, fileName: string) => {
      const zip = new JSZip();
      zip.file('project.json', JSON.stringify({
        metadata: {
          exportVersion: '1.1.0',
          exportedAt: new Date().toISOString(),
          projectId: 'template-master-id',
          projectName: 'Template Master',
        },
        project: {
          id: 'template-master-id',
          name: 'Template Master',
          settings: {},
          story: { beats: [], metadata: { title: 'Template Master' } },
          ...projectPatch,
        },
      }));
      const blob = await zip.generateAsync({ type: 'blob' });
      return new File([blob], fileName, { type: 'application/zip' });
    };

    it('projectType flag forces a fresh copy even when the caller asked to keep the id', async () => {
      const zipFile = await makeZipFile({ projectType: 'template' }, 'master.asaps.zip');
      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, { generateNewId: false });

      expect(result.success).toBe(true);
      expect(result.projectId).not.toBe('template-master-id');
      // The instantiated copy is a NORMAL project — the flag must not persist.
      const created = mockStorage.createProject.mock.calls[0][0];
      expect(created.projectType).toBeUndefined();
    });

    it('.asapst extension alone triggers template semantics (renamed-flag fallback)', async () => {
      const zipFile = await makeZipFile({}, 'shared-by-teacher.asapst');
      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, { generateNewId: false });

      expect(result.success).toBe(true);
      expect(result.projectId).not.toBe('template-master-id');
    });

    it('template import can never hit the overwrite path even if requested', async () => {
      const zipFile = await makeZipFile({ projectType: 'template' }, 'master.asapst');
      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, { overwrite: true, generateNewId: false });

      expect(result.success).toBe(true);
      expect(result.projectId).not.toBe('template-master-id');
      expect(mockStorage.updateProject).not.toHaveBeenCalled();
      expect(mockStorage.createProject).toHaveBeenCalled();
    });

    it('plain .asaps files without the flag keep the ordinary import behavior', async () => {
      const zipFile = await makeZipFile({}, 'normal.asaps.zip');
      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, { generateNewId: false });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('template-master-id');
    });

    it('should import assets from ZIP', async () => {
      const zip = new JSZip();

      const projectData = {
        metadata: {
          exportVersion: '1.0.0',
          exportedAt: new Date().toISOString(),
          projectId: 'test-id',
          projectName: 'Test'
        },
        project: {
          id: 'test-id',
          name: 'Test',
          settings: {},
          story: { beats: [] }
        }
      };

      zip.file('project.json', JSON.stringify(projectData));

      // Add an asset
      const assetData = new Blob(['test data']);
      zip.file('backgrounds/test.jpg', assetData);
      zip.file('backgrounds/asset_1.json', JSON.stringify({
        id: 'asset_1',
        filename: 'test.jpg',
        type: 'image',
        mimeType: 'image/jpeg',
        size: 9
      }));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'test.zip');

      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });
      mockStorage.createAsset.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile);

      expect(result.success).toBe(true);
      expect(mockStorage.createAsset).toHaveBeenCalled();
    });

    it('should fail if project.json is missing', async () => {
      const zip = new JSZip();
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'test.zip');

      const result = await importProjectFromZip(zipFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain('project.json not found');
    });

    it('should fail if project already exists without overwrite', async () => {
      const zip = new JSZip();

      const projectData = {
        metadata: {
          exportVersion: '1.0.0',
          projectId: 'existing-id',
          projectName: 'Test'
        },
        project: {
          id: 'existing-id',
          name: 'Test',
          settings: {},
          story: { beats: [] }
        }
      };

      zip.file('project.json', JSON.stringify(projectData));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'test.zip');

      mockStorage.projectExists.mockResolvedValue(true);

      const result = await importProjectFromZip(zipFile, { overwrite: false });

      expect(result.success).toBe(false);
      expect(result.conflict).toBeDefined();
      expect(result.conflict!.existingProjectId).toBe('existing-id');
    });

    it('should update existing project with overwrite option', async () => {
      const zip = new JSZip();

      const projectData = {
        metadata: {
          exportVersion: '1.0.0',
          projectId: 'existing-id',
          projectName: 'Test'
        },
        project: {
          id: 'existing-id',
          name: 'Test',
          settings: {},
          story: { beats: [] }
        }
      };

      zip.file('project.json', JSON.stringify(projectData));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'test.zip');

      mockStorage.projectExists.mockResolvedValue(true);
      mockStorage.updateProject.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, {
        generateNewId: false,
        overwrite: true
      });

      expect(result.success).toBe(true);
      expect(mockStorage.updateProject).toHaveBeenCalled();
    });
  });

  describe('character image round-trip (Windows→Mac report)', () => {
    it('exports character image assets and re-imports them with intact references', async () => {
      // Character with an uploaded image asset (the CharacterEditor path)
      testProject.story.characters = [{
        id: 'char_1',
        name: 'Hero',
        visual: { defaultAssetId: 'asset_char_img', defaultImage: 'blob:http://origin-machine/dead' },
      }];
      const charAsset: StoredAsset = {
        id: 'asset_char_img',
        projectId: 'test-project-id',
        type: 'image',
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 512,
        blob: new Blob(['hero image bytes'], { type: 'image/png' }),
        uploadedAt: new Date('2024-01-01'),
        metadata: {},
      };
      mockStorage.getProject.mockResolvedValue({ success: true, data: testProject });
      mockStorage.getProjectAssets.mockResolvedValue({ success: true, data: [charAsset] });
      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });
      mockStorage.createAsset.mockResolvedValue({ success: true });

      // Export on "Windows"
      const zipBlob = await exportProjectAsZip('test-project-id');

      // The zip must actually CONTAIN the character image
      const zip = await JSZip.loadAsync(zipBlob);
      const entries = Object.keys(zip.files);
      const imgEntry = entries.find(e => e.includes('asset_char_img'));
      expect(imgEntry, `character image missing from zip; entries: ${entries.join(', ')}`).toBeTruthy();

      // Import on "Mac"
      const file = new File([zipBlob], 'story.asaps', { type: 'application/zip' });
      const result = await importProjectFromZip(file, { generateNewId: false });
      expect(result.success, `import failed: ${(result as any).error}`).toBe(true);

      // The asset must be recreated with the same id + type image
      const created = mockStorage.createAsset.mock.calls.map(c => c[0]);
      const imported = created.find((a: any) => a.id === 'asset_char_img');
      expect(imported, `character asset not recreated; created: ${created.map((a: any) => a.id).join(', ')}`).toBeTruthy();
      expect(imported.type).toBe('image');
      expect(imported.blob.size).toBeGreaterThan(0);

      // And the character must still reference it
      const savedProject = mockStorage.createProject.mock.calls[0][0];
      const chars = savedProject.story.characters;
      expect(chars[0].visual.defaultAssetId).toBe('asset_char_img');
    });
  });

  describe('orphaned timestamp-ID assets (Windows→Mac character-image loss)', () => {
    it('exports character images referenced by timestamp-format IDs even when not project-linked', async () => {
      // The real-world shape: the CharacterEditor uploads via
      // DirectAssetUpload (id: asset_<ts>_<rand>), the character references
      // it, but the asset is no longer in the project's linked asset list.
      // The referenced-asset safety net must pull it into the zip.
      const orphanId = 'asset_1783617637019_x7k2m9p4q';
      testProject.story.characters = [{
        id: 'char_1',
        name: 'Hero',
        visual: { defaultAssetId: orphanId },
      }];
      const orphanAsset: StoredAsset = {
        id: orphanId,
        projectId: 'test-project-id',
        type: 'image',
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 512,
        blob: new Blob(['hero image bytes'], { type: 'image/png' }),
        uploadedAt: new Date('2024-01-01'),
        metadata: {},
      };
      mockStorage.getProject.mockResolvedValue({ success: true, data: testProject });
      // NOT in the linked list — only reachable via getAsset by id
      mockStorage.getProjectAssets.mockResolvedValue({ success: true, data: [] });
      mockStorage.getAsset.mockImplementation(async (id: string) =>
        id === orphanId ? { success: true, data: orphanAsset } : { success: false }
      );
      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });
      mockStorage.createAsset.mockResolvedValue({ success: true });

      const zipBlob = await exportProjectAsZip('test-project-id');

      const zip = await JSZip.loadAsync(zipBlob);
      const entries = Object.keys(zip.files);
      expect(entries.find(e => e.includes(orphanId)), `orphan asset missing from zip; entries: ${entries.join(', ')}`).toBeTruthy();

      // Round-trip: import must recreate the asset with the intact id
      const file = new File([zipBlob], 'story.asaps', { type: 'application/zip' });
      const result = await importProjectFromZip(file, { generateNewId: false });
      expect(result.success, `import failed: ${(result as any).error}`).toBe(true);

      const created = mockStorage.createAsset.mock.calls.map(c => c[0]);
      const imported = created.find((a: any) => a.id === orphanId);
      expect(imported).toBeTruthy();
      expect(imported.filename).toBe('hero.png');
      const savedProject = mockStorage.createProject.mock.calls[0][0];
      expect(savedProject.story.characters[0].visual.defaultAssetId).toBe(orphanId);
    });

    it('imports video assets (videos/ folder was exported but never scanned)', async () => {
      testAssets.push({
        id: 'asset_9999_vid',
        projectId: 'test-project-id',
        type: 'video',
        filename: 'intro.mp4',
        mimeType: 'video/mp4',
        size: 4096,
        blob: new Blob(['video bytes'], { type: 'video/mp4' }),
        uploadedAt: new Date('2024-01-01'),
        metadata: {},
      });
      mockStorage.getProject.mockResolvedValue({ success: true, data: testProject });
      mockStorage.getProjectAssets.mockResolvedValue({ success: true, data: testAssets });
      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });
      mockStorage.createAsset.mockResolvedValue({ success: true });

      const zipBlob = await exportProjectAsZip('test-project-id');
      const file = new File([zipBlob], 'story.asaps', { type: 'application/zip' });
      const result = await importProjectFromZip(file, { generateNewId: false });
      expect(result.success, `import failed: ${(result as any).error}`).toBe(true);

      const created = mockStorage.createAsset.mock.calls.map(c => c[0]);
      const video = created.find((a: any) => a.id === 'asset_9999_vid');
      expect(video, `video asset not imported; created: ${created.map((a: any) => a.id).join(', ')}`).toBeTruthy();
      expect(video.type).toBe('video');
    });
  });

  describe('Asset ID Remapping', () => {
    it('should remap asset IDs in beat nodes when generating new ID', async () => {
      const zip = new JSZip();

      const projectData = {
        metadata: {
          exportVersion: '1.0.0',
          projectId: 'test-id',
          projectName: 'Test'
        },
        project: {
          id: 'test-id',
          name: 'Test',
          settings: {},
          story: {
            beats: [
              {
                id: 'beat_1',
                type: 'infoText',
                node: 'old_asset_id',
                parameters: { text: 'Test' }
              }
            ]
          }
        }
      };

      zip.file('project.json', JSON.stringify(projectData));

      // Add asset with old ID
      zip.file('backgrounds/bg.jpg', new Blob(['data']));
      zip.file('backgrounds/old_asset_id.json', JSON.stringify({
        id: 'old_asset_id',
        filename: 'bg.jpg',
        type: 'image'
      }));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'test.zip');

      mockStorage.projectExists.mockResolvedValue(false);
      mockStorage.createProject.mockResolvedValue({ success: true });
      mockStorage.createAsset.mockResolvedValue({ success: true });

      const result = await importProjectFromZip(zipFile, { generateNewId: true });

      expect(result.success).toBe(true);

      // Check that createProject was called with remapped IDs
      const projectCall = mockStorage.createProject.mock.calls[0][0];
      expect(projectCall.story.beats[0].node).not.toBe('old_asset_id');
    });
  });
});
