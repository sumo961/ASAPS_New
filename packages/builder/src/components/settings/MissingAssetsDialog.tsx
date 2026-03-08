/**
 * Missing Assets Dialog
 *
 * Shows when external assets are missing from the assets folder.
 * Lets users locate, relocate, or remove missing asset entries.
 */

import React, { useState, useCallback } from 'react';
import { X, AlertTriangle, FolderSearch, Trash2, RefreshCw } from 'lucide-react';
import type { AssetManifestEntry } from '@asaps/core';

interface MissingAssetsDialogProps {
  isOpen: boolean;
  missing: AssetManifestEntry[];
  assetsPath: string;
  onClose: () => void;
  /** Called after assets are repaired — caller should re-validate */
  onRepaired: () => void;
}

export const MissingAssetsDialog: React.FC<MissingAssetsDialogProps> = ({
  isOpen,
  missing: initialMissing,
  assetsPath,
  onClose,
  onRepaired,
}) => {
  const [missing, setMissing] = useState(initialMissing);
  const [resolving, setResolving] = useState<string | null>(null);

  const handleLocateFile = useCallback(async (entry: AssetManifestEntry) => {
    const api = (window as any).electronAPI;
    if (!api?.dialog?.open) return;

    setResolving(entry.id);
    try {
      const result = await api.dialog.open({
        properties: ['openFile'],
        title: `Locate "${entry.filename}"`,
        filters: [
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!result?.canceled && result?.filePaths?.[0]) {
        const sourcePath = result.filePaths[0];
        const sep = api.path?.sep || '/';
        const targetDir = [assetsPath, entry.folder].join(sep);
        const targetPath = [targetDir, entry.filename].join(sep);

        // Ensure target directory exists
        await api.fs.mkdir(targetDir, { recursive: true });

        // Copy the file to the expected location
        const data = await api.fs.readFile(sourcePath);
        await api.fs.writeFile(targetPath, data);

        // Remove from missing list
        setMissing(prev => prev.filter(e => e.id !== entry.id));
      }
    } catch (err) {
      console.error('[MissingAssetsDialog] Failed to locate file:', err);
    } finally {
      setResolving(null);
    }
  }, [assetsPath]);

  const handleRelocateAll = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.dialog?.open) return;

    const result = await api.dialog.open({
      properties: ['openDirectory'],
      title: 'Select folder containing the missing assets',
    });

    if (result?.canceled || !result?.filePaths?.[0]) return;

    const sourceDir = result.filePaths[0];
    const sep = api.path?.sep || '/';
    const found: string[] = [];

    for (const entry of missing) {
      // Try to find the file in the selected folder (flat or in subfolder matching entry.folder)
      const candidates = [
        [sourceDir, entry.filename].join(sep),
        [sourceDir, entry.folder, entry.filename].join(sep),
      ];

      for (const candidatePath of candidates) {
        try {
          const exists = await api.fs.exists(candidatePath);
          if (exists) {
            const targetDir = [assetsPath, entry.folder].join(sep);
            const targetPath = [targetDir, entry.filename].join(sep);
            await api.fs.mkdir(targetDir, { recursive: true });
            const data = await api.fs.readFile(candidatePath);
            await api.fs.writeFile(targetPath, data);
            found.push(entry.id);
            break;
          }
        } catch {
          // continue
        }
      }
    }

    if (found.length > 0) {
      setMissing(prev => prev.filter(e => !found.includes(e.id)));
    }
  }, [missing, assetsPath]);

  const handleRemoveMissing = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.fs) return;

    const sep = api.path?.sep || '/';
    const manifestPath = [assetsPath, '_manifest.json'].join(sep);

    try {
      const raw = await api.fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      const missingIds = new Set(missing.map(e => e.id));
      // manifest.assets is a Record<id, entry>, not an array
      for (const id of missingIds) {
        delete manifest.assets[id];
      }
      await api.fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      setMissing([]);
    } catch (err) {
      console.error('[MissingAssetsDialog] Failed to update manifest:', err);
    }
  }, [missing, assetsPath]);

  const handleClose = useCallback(() => {
    if (missing.length < initialMissing.length) {
      onRepaired();
    }
    onClose();
  }, [missing.length, initialMissing.length, onClose, onRepaired]);

  if (!isOpen || missing.length === 0) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6"
        style={{ maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Missing Assets</h2>
              <p className="text-sm text-gray-500">
                {missing.length} asset{missing.length !== 1 ? 's' : ''} not found in the assets folder
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Asset List */}
        <div className="border rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Filename</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Type</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Folder</th>
                <th className="text-right px-3 py-2 text-gray-600 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {missing.map(entry => (
                <tr key={entry.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900 truncate max-w-[200px]" title={entry.filename}>
                    {entry.filename}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{entry.type}</td>
                  <td className="px-3 py-2 text-gray-500">{entry.folder}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleLocateFile(entry)}
                      disabled={resolving === entry.id}
                      className="px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    >
                      <FolderSearch className="w-3 h-3 inline mr-1" />
                      {resolving === entry.id ? 'Locating...' : 'Locate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bulk Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleRelocateAll}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Relocate All
          </button>
          <button
            onClick={handleRemoveMissing}
            className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Remove Missing
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
