import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { exportProjectAsZip, importProjectFromZip } from '../projectZipManager';
import { getStorageManager } from '../../storage/StorageManager';
import type { Project, StoredAsset } from '../../storage/types';

// Mock the storage manager
vi.mock('../../storage/StorageManager', () => ({
  getStorageManager: vi.fn(() => ({
    getProject: vi.fn(),
    getProjectAssets: vi.fn(),
    createAsset: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    projectExists: vi.fn()
  }))
}));

describe('projectZipManager', () => {
  let mockStorage: any;
  let testProject: Project;
  let testAssets: StoredAsset[];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Get mock storage
    mockStorage = getStorageManager();

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
      expect(result.error).toContain('already exists');
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
