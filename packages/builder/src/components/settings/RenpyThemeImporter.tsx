/**
 * Ren'Py Theme Importer
 *
 * UI component for importing Ren'Py visual novel themes into ASAPS.
 * Handles file upload, validation, preview, and conversion.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  X,
  Check,
  AlertCircle,
  FileArchive,
  Palette,
  Type,
  Image,
  ChevronDown,
  ChevronUp,
  Loader,
} from 'lucide-react';
import {
  validateRenpyZip,
  extractRenpyAssets,
  convertRenpyToTheme,
  estimateRenpyThemeSize,
  type RenpyAssetBundle,
  type RenpyConversionResult,
} from '@asaps/core';

interface RenpyThemeImporterProps {
  /** Called when import is complete */
  onImport: (result: RenpyConversionResult) => Promise<void>;
  /** Called when dialog should close */
  onClose: () => void;
  /** Current project resolution for scaling */
  projectResolution?: { width: number; height: number };
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete' | 'error';

export const RenpyThemeImporter: React.FC<RenpyThemeImporterProps> = ({
  onImport,
  onClose,
  projectResolution = { width: 1024, height: 768 },
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // File and bundle state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<RenpyAssetBundle | null>(null);

  // Import options
  const [themeName, setThemeName] = useState('');
  const [author, setAuthor] = useState('');
  const [useBorderImage, setUseBorderImage] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Preview state
  const [previewExpanded, setPreviewExpanded] = useState<
    'colors' | 'fonts' | 'assets' | null
  >('colors');

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setWarnings([]);
    setSelectedFile(file);

    try {
      // Validate ZIP
      const validation = await validateRenpyZip(file);

      if (!validation.valid) {
        setError(validation.errors.join('\n'));
        setStep('error');
        return;
      }

      if (validation.warnings.length > 0) {
        setWarnings(validation.warnings);
      }

      // Extract assets
      const extractedBundle = await extractRenpyAssets(file);
      setBundle(extractedBundle);

      // Set default theme name from metadata or filename
      const defaultName =
        extractedBundle.metadata.name ||
        file.name.replace(/\.(zip|7z|rar)$/i, '').replace(/[-_]/g, ' ');
      setThemeName(defaultName);

      if (extractedBundle.metadata.author) {
        setAuthor(extractedBundle.metadata.author);
      }

      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process ZIP file');
      setStep('error');
    }
  }, []);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.zip') || file.type === 'application/zip')) {
        handleFileSelect(file);
      } else {
        setError('Please drop a ZIP file containing Ren\'Py theme files');
      }
    },
    [handleFileSelect]
  );

  // Handle import
  const handleImport = useCallback(async () => {
    if (!bundle) return;

    setStep('importing');
    setError(null);

    try {
      const result = convertRenpyToTheme(bundle, {
        themeName: themeName || 'Imported Theme',
        author: author || undefined,
        targetResolution: projectResolution,
        useBorderImage,
        tags: ['renpy', 'imported'],
      });

      await onImport(result);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import theme');
      setStep('error');
    }
  }, [bundle, themeName, author, projectResolution, useBorderImage, onImport]);

  // Estimate size
  const sizeEstimate = bundle ? estimateRenpyThemeSize(bundle) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold">Import Ren'Py Theme</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Import a Ren'Py theme from a ZIP file. The importer will extract
                colors, fonts, and UI graphics from your gui.rpy file and gui/
                folder.
              </p>

              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                  className="hidden"
                />
                <Upload
                  className={`w-12 h-12 mx-auto mb-3 ${
                    isDragging ? 'text-purple-500' : 'text-gray-400'
                  }`}
                />
                <p className="text-sm font-medium text-gray-700">
                  Drop a Ren'Py theme ZIP here or click to browse
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports full Ren'Py projects or gui/ folder exports
                </p>
              </div>

              {/* Format Info */}
              <div className="bg-gray-50 rounded-lg p-4 text-sm">
                <h4 className="font-medium text-gray-700 mb-2">
                  Supported formats:
                </h4>
                <ul className="space-y-1 text-gray-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    Full Ren'Py project (game/gui/ folder)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    GUI folder export (gui/ folder with textbox.png, etc.)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    Theme packs from itch.io or lemmasoft
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {step === 'preview' && bundle && (
            <div className="space-y-4">
              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-1">
                    <AlertCircle className="w-4 h-4" />
                    Warnings
                  </div>
                  <ul className="text-sm text-amber-600 list-disc list-inside">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Theme Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Theme Name
                </label>
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="My VN Theme"
                />
              </div>

              {/* Author */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Author (optional)
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Theme author"
                />
              </div>

              {/* Preview Sections */}
              <div className="border rounded-lg divide-y">
                {/* Colors */}
                <div>
                  <button
                    onClick={() =>
                      setPreviewExpanded(previewExpanded === 'colors' ? null : 'colors')
                    }
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-purple-500" />
                      <span className="font-medium text-sm">Colors</span>
                    </div>
                    {previewExpanded === 'colors' ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {previewExpanded === 'colors' && (
                    <div className="px-4 pb-4 grid grid-cols-4 gap-2">
                      {bundle.guiData.colors.accent && (
                        <div className="text-center">
                          <div
                            className="w-10 h-10 rounded-lg border mx-auto mb-1"
                            style={{ backgroundColor: bundle.guiData.colors.accent }}
                          />
                          <span className="text-xs text-gray-500">Accent</span>
                        </div>
                      )}
                      {bundle.guiData.colors.text && (
                        <div className="text-center">
                          <div
                            className="w-10 h-10 rounded-lg border mx-auto mb-1"
                            style={{ backgroundColor: bundle.guiData.colors.text }}
                          />
                          <span className="text-xs text-gray-500">Text</span>
                        </div>
                      )}
                      {bundle.guiData.colors.idle && (
                        <div className="text-center">
                          <div
                            className="w-10 h-10 rounded-lg border mx-auto mb-1"
                            style={{ backgroundColor: bundle.guiData.colors.idle }}
                          />
                          <span className="text-xs text-gray-500">Idle</span>
                        </div>
                      )}
                      {bundle.guiData.colors.hover && (
                        <div className="text-center">
                          <div
                            className="w-10 h-10 rounded-lg border mx-auto mb-1"
                            style={{ backgroundColor: bundle.guiData.colors.hover }}
                          />
                          <span className="text-xs text-gray-500">Hover</span>
                        </div>
                      )}
                      {Object.keys(bundle.guiData.colors).length === 0 && (
                        <div className="col-span-4 text-sm text-gray-500 py-2">
                          No colors defined in gui.rpy (will use defaults)
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Fonts */}
                <div>
                  <button
                    onClick={() =>
                      setPreviewExpanded(previewExpanded === 'fonts' ? null : 'fonts')
                    }
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-sm">
                        Fonts ({bundle.fonts.length} found)
                      </span>
                    </div>
                    {previewExpanded === 'fonts' ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {previewExpanded === 'fonts' && (
                    <div className="px-4 pb-4">
                      {bundle.fonts.length > 0 ? (
                        <ul className="space-y-1">
                          {bundle.fonts.map((font, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between text-sm py-1"
                            >
                              <span className="font-mono text-gray-700">
                                {font.filename}
                              </span>
                              <span className="text-xs text-gray-500 capitalize">
                                {font.role}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-500 py-2">
                          No custom fonts found (will use system fonts)
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Assets */}
                <div>
                  <button
                    onClick={() =>
                      setPreviewExpanded(previewExpanded === 'assets' ? null : 'assets')
                    }
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm">
                        UI Graphics ({bundle.uiGraphics.length} found)
                      </span>
                    </div>
                    {previewExpanded === 'assets' ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {previewExpanded === 'assets' && (
                    <div className="px-4 pb-4">
                      {bundle.uiGraphics.length > 0 ? (
                        <ul className="space-y-1">
                          {bundle.uiGraphics.map((graphic, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between text-sm py-1"
                            >
                              <span className="font-mono text-gray-700">
                                {graphic.filename}
                              </span>
                              <span className="text-xs text-gray-500 capitalize">
                                {graphic.role.replace('-', ' ')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-500 py-2">
                          No UI graphics found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Options */}
              <div className="border rounded-lg">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-700">
                    Advanced Options
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={useBorderImage}
                        onChange={(e) => setUseBorderImage(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">
                        Use CSS border-image for textbox frame
                      </span>
                    </label>
                    <p className="text-xs text-gray-500">
                      Preserves original Ren'Py nine-patch visual fidelity
                    </p>

                    {sizeEstimate && (
                      <div className="pt-2 border-t text-sm text-gray-600">
                        <div>Fonts: {sizeEstimate.fontCount}</div>
                        <div>Graphics: {sizeEstimate.graphicCount}</div>
                        <div>
                          Estimated size: ~{Math.round(sizeEstimate.estimatedStorageKB)} KB
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader className="w-12 h-12 text-purple-500 animate-spin mb-4" />
              <p className="text-gray-700 font-medium">Importing theme...</p>
              <p className="text-sm text-gray-500 mt-1">
                Processing fonts and graphics
              </p>
            </div>
          )}

          {/* Complete Step */}
          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-gray-700 font-medium text-lg">
                Theme imported successfully!
              </p>
              <p className="text-sm text-gray-500 mt-1">
                "{themeName}" is now available in your themes
              </p>
            </div>
          )}

          {/* Error Step */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-gray-700 font-medium text-lg">Import failed</p>
              <p className="text-sm text-red-600 mt-2 text-center max-w-md">
                {error}
              </p>
              <button
                onClick={() => {
                  setStep('upload');
                  setError(null);
                  setSelectedFile(null);
                  setBundle(null);
                }}
                className="mt-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            {selectedFile && step !== 'complete' && step !== 'error' && (
              <span>Selected: {selectedFile.name}</span>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'upload' && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
            )}
            {step === 'preview' && (
              <>
                <button
                  onClick={() => {
                    setStep('upload');
                    setSelectedFile(null);
                    setBundle(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!themeName.trim()}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import Theme
                </button>
              </>
            )}
            {(step === 'complete' || step === 'error') && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RenpyThemeImporter;
