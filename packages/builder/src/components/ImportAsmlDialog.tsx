/**
 * ImportAsmlDialog - Dialog for importing ASML files with assets
 *
 * Shows the asset manifest summary and allows user to select
 * a folder containing the assets for import.
 */

import React, { useState, useCallback, useRef } from 'react';
import type { AssetManifest } from '@asaps/core';

export interface ImportAsmlDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** The XML content being imported */
  xmlContent: string;
  /** The asset manifest extracted from the XML */
  manifest: AssetManifest;
  /** Called when import is complete */
  onImport: (result: AsmlImportDialogResult) => void;
  /** Called when dialog is cancelled */
  onCancel: () => void;
}

export interface AsmlImportDialogResult {
  /** Map of filename to File for resolved assets */
  fileMap: Map<string, File>;
  /** Number of files found */
  filesFound: number;
  /** Number of files missing */
  filesMissing: number;
}

type ImportStep = 'summary' | 'folder-select' | 'importing' | 'complete';

export function ImportAsmlDialog({
  isOpen,
  xmlContent,
  manifest,
  onImport,
  onCancel
}: ImportAsmlDialogProps) {
  const [step, setStep] = useState<ImportStep>('summary');
  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedFiles, setMatchedFiles] = useState<string[]>([]);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);

  const folderInputRef = useRef<HTMLInputElement>(null);

  // Get all required file paths from manifest
  const requiredFiles = manifest.getAllFilePaths();
  const totalFiles = manifest.getTotalFileCount();

  /**
   * Handle folder selection from file input
   */
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);

    // Build file map from selected folder
    const newFileMap = new Map<string, File>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Store by filename (case-insensitive lookup support)
      newFileMap.set(file.name, file);
      newFileMap.set(file.name.toLowerCase(), file);

      // Also store by relative path if available
      if (file.webkitRelativePath) {
        const relativePath = file.webkitRelativePath;
        // Extract just the filename from the path
        const pathParts = relativePath.split('/');
        if (pathParts.length > 1) {
          const filenameFromPath = pathParts[pathParts.length - 1];
          newFileMap.set(filenameFromPath, file);
          newFileMap.set(filenameFromPath.toLowerCase(), file);
        }
      }
    }

    // Check which files are matched vs missing
    const matched: string[] = [];
    const missing: string[] = [];

    for (const fPath of requiredFiles) {
      const filename = fPath.split('/').pop() || fPath;
      const file = newFileMap.get(filename) || newFileMap.get(filename.toLowerCase());
      if (file) {
        matched.push(fPath);
      } else {
        missing.push(fPath);
      }
    }

    setFileMap(newFileMap);
    setMatchedFiles(matched);
    setMissingFiles(missing);
    setStep('folder-select');

    console.log('[ImportAsmlDialog] Files from folder:', files.length);
    console.log('[ImportAsmlDialog] Matched:', matched.length, 'Missing:', missing.length);
  }, [requiredFiles]);

  /**
   * Proceed with import
   */
  const handleImport = useCallback(() => {
    setImporting(true);

    // Return the file map to the parent for processing
    onImport({
      fileMap,
      filesFound: matchedFiles.length,
      filesMissing: missingFiles.length
    });
  }, [fileMap, matchedFiles.length, missingFiles.length, onImport]);

  /**
   * Skip asset import (import without assets)
   */
  const handleSkipAssets = useCallback(() => {
    onImport({
      fileMap: new Map(),
      filesFound: 0,
      filesMissing: totalFiles
    });
  }, [totalFiles, onImport]);

  /**
   * Trigger folder picker
   */
  const triggerFolderPicker = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Import ASML Story
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {step === 'summary' && (
            <div className="space-y-4">
              <p className="text-gray-600">
                This ASML file references the following assets:
              </p>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                {manifest.backgrounds.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Backgrounds:</span>
                    <span className="font-medium">{manifest.backgrounds.length}</span>
                  </div>
                )}
                {manifest.props.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Props:</span>
                    <span className="font-medium">{manifest.props.length}</span>
                  </div>
                )}
                {manifest.sounds.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Sounds:</span>
                    <span className="font-medium">{manifest.sounds.length}</span>
                  </div>
                )}
                {manifest.characters.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Characters:</span>
                    <span className="font-medium">
                      {manifest.characters.length} ({manifest.characters.reduce((sum, c) => sum + c.states.length, 0)} images)
                    </span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                  <span className="text-gray-700">Total files:</span>
                  <span>{totalFiles}</span>
                </div>
              </div>

              <p className="text-gray-600 text-sm">
                To import these assets, select the folder containing the asset files.
                The folder should contain files like: {requiredFiles.slice(0, 3).map(f => f.split('/').pop()).join(', ')}{requiredFiles.length > 3 ? '...' : ''}
              </p>
            </div>
          )}

          {step === 'folder-select' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-700 font-medium">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {matchedFiles.length} of {totalFiles} files found
                </div>
              </div>

              {missingFiles.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="text-yellow-700 font-medium mb-2">
                    Missing files ({missingFiles.length}):
                  </div>
                  <ul className="text-sm text-yellow-600 list-disc list-inside max-h-32 overflow-y-auto">
                    {missingFiles.slice(0, 10).map((f, i) => (
                      <li key={i}>{f.split('/').pop()}</li>
                    ))}
                    {missingFiles.length > 10 && (
                      <li>... and {missingFiles.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}

              {matchedFiles.length > 0 && (
                <details className="text-sm">
                  <summary className="text-gray-600 cursor-pointer hover:text-gray-800">
                    Show matched files ({matchedFiles.length})
                  </summary>
                  <ul className="mt-2 text-gray-500 list-disc list-inside max-h-32 overflow-y-auto">
                    {matchedFiles.slice(0, 20).map((f, i) => (
                      <li key={i}>{f.split('/').pop()}</li>
                    ))}
                    {matchedFiles.length > 20 && (
                      <li>... and {matchedFiles.length - 20} more</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}

          {importing && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4" />
              <p className="text-gray-600">Importing assets...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Hidden folder input */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore - webkitdirectory is not in the types but works in modern browsers
          webkitdirectory="true"
          directory=""
          multiple
          onChange={handleFolderSelect}
          className="hidden"
        />

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button
            onClick={onCancel}
            disabled={importing}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>

          <div className="flex gap-2">
            {step === 'summary' && (
              <>
                <button
                  onClick={handleSkipAssets}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Skip Assets
                </button>
                <button
                  onClick={triggerFolderPicker}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Select Folder
                </button>
              </>
            )}

            {step === 'folder-select' && !importing && (
              <>
                <button
                  onClick={triggerFolderPicker}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Change Folder
                </button>
                <button
                  onClick={handleImport}
                  disabled={matchedFiles.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Import {matchedFiles.length > 0 ? `(${matchedFiles.length} files)` : ''}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImportAsmlDialog;
