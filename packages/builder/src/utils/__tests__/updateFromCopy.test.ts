/**
 * Update from a copy (Birka group, 2026-10-27): a copy's pictures carry new
 * ids after every import; those the folder already has must keep the
 * folder's ids, new ones must not overwrite a folder file of the same name.
 */
import { describe, it, expect } from 'vitest';
import { planCopyUpdate, type FolderAsset } from '../updateFromCopy';
import type { ProjectCopy } from '../projectZipManager';

const bytes = (s: string) => new TextEncoder().encode(s);
const parsed = (id: string, filename: string, content: string, type = 'image') => ({
  id,
  asset: { filename, type, mimeType: 'image/png', size: content.length, blob: new Blob([bytes(content)]), uploadedAt: new Date(), metadata: {} } as any,
});
const beat = (id: string, name: string, parameters: any = {}, connections: any[] = []) => ({ id, type: 'dialogTree', name, parameters, connections });

const folderFiles: Record<string, string> = { 'backgrounds/Tunnel.png': 'TUNNEL', 'backgrounds/Quay.png': 'QUAY-OLD' };
const folderAssets: FolderAsset[] = [
  { id: 'asset_tunnel', filename: 'Tunnel.png', folder: 'backgrounds', size: 6 },
  { id: 'asset_quay', filename: 'Quay.png', folder: 'backgrounds', size: 8 },
];
const read = async (a: FolderAsset) => bytes(folderFiles[`${a.folder}/${a.filename}`]);

function copyOf(story: any, assets: any[]): ProjectCopy {
  return { name: 'BirkaV13,1', story, settings: {}, assets } as ProjectCopy;
}

describe('planCopyUpdate', () => {
  it('reuses pictures the folder already has and remaps the story to their ids', async () => {
    const copy = copyOf(
      { beats: [beat('b1', 'Morning - quay', { backgroundAssetId: 'asset_renumbered' })] },
      [parsed('asset_renumbered', 'Tunnel.png', 'TUNNEL')],
    );
    const plan = await planCopyUpdate(copy, { beats: [beat('b1', 'Morning - quay', { backgroundAssetId: 'asset_tunnel' })] }, folderAssets, read);
    expect(plan.reusedAssets).toBe(1);
    expect(plan.newAssets).toEqual([]);
    expect(plan.copy.story.beats[0].parameters.backgroundAssetId).toBe('asset_tunnel');
    // Same content once the ids agree: not a change.
    expect(plan.beats).toEqual({ added: [], removed: [], changed: [] });
  });

  it('a new picture gets a free id and does not overwrite a folder file of the same name', async () => {
    const copy = copyOf(
      { beats: [beat('b1', 'Quay', { backgroundAssetId: 'asset_quay' })] },
      [parsed('asset_quay', 'Quay.png', 'QUAY-NEW!')],
    );
    const plan = await planCopyUpdate(copy, { beats: [] }, folderAssets, read);
    expect(plan.reusedAssets).toBe(0);
    expect(plan.newAssets).toHaveLength(1);
    const [added] = plan.newAssets;
    expect(added.id).not.toBe('asset_quay');
    expect(added.asset.filename).not.toBe('Quay.png');
    expect(plan.copy.story.beats[0].parameters.backgroundAssetId).toBe(added.id);
  });

  it('the same new file twice in the copy is written once', async () => {
    const copy = copyOf(
      { beats: [beat('b1', 'Opening', { music: 'asset_a' }), beat('b2', 'Later', { music: 'asset_b' })] },
      [parsed('asset_a', 'Opening.mp3', 'MUSIC', 'audio'), parsed('asset_b', 'Opening.mp3', 'MUSIC', 'audio')],
    );
    const plan = await planCopyUpdate(copy, { beats: [] }, folderAssets, read);
    expect(plan.newAssets.map((a) => a.id)).toEqual(['asset_a']);
    expect(plan.copy.story.beats.map((b: any) => b.parameters.music)).toEqual(['asset_a', 'asset_a']);
  });

  it('lists new, changed and removed beats by name; moving a beat is not a change', async () => {
    const current = { beats: [
      { ...beat('b1', 'Q1', { dialogTree: { text: 'Hello' } }), x: 0, y: 0 },
      beat('b2', 'Free her now.'),
      beat('b3', 'Stay in Birka.'),
    ] };
    const copy = copyOf({ beats: [
      { ...beat('b1', 'Q1', { dialogTree: { text: 'Hello' } }), x: 400, y: 90 },
      beat('b2', 'Free her now.', { dialogTree: { text: 'Idun looks at you.' } }),
      beat('b4', 'Shore meeting with Eyvind'),
    ] }, []);
    const plan = await planCopyUpdate(copy, current, [], read);
    expect(plan.beats).toEqual({ added: ['Shore meeting with Eyvind'], changed: ['Free her now.'], removed: ['Stay in Birka.'] });
  });
});
