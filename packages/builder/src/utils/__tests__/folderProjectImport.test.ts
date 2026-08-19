/**
 * The Safari case: macOS auto-extracts downloaded .asaps.zip files, so a
 * shared project arrives as a FOLDER. These tests pin the folder→zip
 * adapter: root detection through the nesting Safari creates, dot-file
 * hygiene, and a re-zipped payload the ordinary zip importer accepts.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { findProjectRoot, rezipUnzippedProject, type FolderEntryFile } from '../folderProjectImport';

const mem = (path: string, content = '{}'): FolderEntryFile => ({
  path,
  read: async () => new Blob([content]),
});

describe('findProjectRoot', () => {
  it('finds project.json at the walked root', () => {
    expect(findProjectRoot(['project.json', 'backgrounds/a.png'])).toBe('');
  });

  it('finds it one level down — the shape Safari unzips into', () => {
    expect(findProjectRoot([
      'Night_Train.asaps/project.json',
      'Night_Train.asaps/backgrounds/a.png',
    ])).toBe('Night_Train.asaps/');
  });

  it('shallowest wins when the user dropped a parent folder', () => {
    expect(findProjectRoot([
      'downloads/deep/other/project.json',
      'downloads/mine/project.json',
    ])).toBe('downloads/mine/');
  });

  it('returns null for a folder that is not a project', () => {
    expect(findProjectRoot(['notes.txt', 'img/cat.png'])).toBe(null);
  });
});

describe('rezipUnzippedProject', () => {
  it('re-zips the Safari shape into an importable .asaps.zip', async () => {
    const files = [
      mem('Night_Train.asaps/project.json', JSON.stringify({ metadata: {}, project: { id: 'p1' } })),
      mem('Night_Train.asaps/backgrounds/bg1_cover.png', 'PNGDATA'),
      mem('Night_Train.asaps/.DS_Store', 'junk'),
      mem('Night_Train.asaps/backgrounds/.DS_Store', 'junk'),
    ];
    const file = await rezipUnzippedProject(files, 'Night_Train.asaps');
    expect(file).not.toBeNull();
    expect(file!.name).toBe('Night_Train.asaps.zip');

    const zip = await JSZip.loadAsync(file!);
    expect(zip.file('project.json')).toBeTruthy();
    expect(zip.file('backgrounds/bg1_cover.png')).toBeTruthy();
    // Finder droppings must not ride along.
    expect(Object.keys(zip.files).some((p) => p.includes('.DS_Store'))).toBe(false);
    const projectJson = JSON.parse(await zip.file('project.json')!.async('text'));
    expect(projectJson.project.id).toBe('p1');
  });

  it('returns null (not a throw) for a non-project folder', async () => {
    expect(await rezipUnzippedProject([mem('cat.png', 'x')], 'pics')).toBe(null);
  });

  it('strips stacked extensions from the folder name', async () => {
    const file = await rezipUnzippedProject([mem('project.json')], 'My Story.asaps.zip');
    expect(file!.name).toBe('My Story.asaps.zip');
  });
});
