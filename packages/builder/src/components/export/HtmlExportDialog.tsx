/**
 * HTML Export Dialog - Configure and trigger HTML export
 */

import React, { useState, useCallback } from 'react';
import { X, Download, FileText, FolderOpen, Info } from 'lucide-react';
import { downloadHtmlExport, type HtmlExportOptions } from '../../export/HtmlExporter';

interface HtmlExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export const HtmlExportDialog: React.FC<HtmlExportDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
}) => {
  const [mode, setMode] = useState<'folder' | 'single-file'>('folder');
  const [enableAI, setEnableAI] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);

    try {
      const options: HtmlExportOptions = {
        mode,
        responsive: true,
        enableAI,
        showApiKeyPrompt: enableAI,
      };

      await downloadHtmlExport(projectId, projectName, options);
      onClose();
    } catch (err) {
      console.error('[HtmlExportDialog] Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [mode, enableAI, projectId, projectName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Export as HTML</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Export Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('folder')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === 'folder'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FolderOpen className={`w-6 h-6 mb-2 ${mode === 'folder' ? 'text-blue-500' : 'text-gray-400'}`} />
                <div className="font-medium text-gray-900">Folder (ZIP)</div>
                <div className="text-xs text-gray-500 mt-1">
                  Separate files, better for large stories
                </div>
              </button>

              <button
                onClick={() => setMode('single-file')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === 'single-file'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText className={`w-6 h-6 mb-2 ${mode === 'single-file' ? 'text-blue-500' : 'text-gray-400'}`} />
                <div className="font-medium text-gray-900">Single File</div>
                <div className="text-xs text-gray-500 mt-1">
                  One HTML file with everything inline
                </div>
              </button>
            </div>
          </div>

          {/* AI Settings */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableAI}
                onChange={(e) => setEnableAI(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900">Enable AI Features</div>
                <div className="text-sm text-gray-500">
                  Players will be prompted for API key if story uses AI beats
                </div>
              </div>
            </label>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 rounded-lg p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">About HTML Export</p>
              <p>
                The exported story can be opened directly in a browser or embedded in a webpage
                using an iframe. All assets are included in the export.
              </p>
              {mode === 'folder' && (
                <p className="mt-2">
                  <strong>Folder mode:</strong> Upload the extracted folder to a web server.
                  Open <code className="bg-blue-100 px-1 rounded">index.html</code> to play.
                </p>
              )}
              {mode === 'single-file' && (
                <p className="mt-2">
                  <strong>Single-file mode:</strong> The HTML file contains everything.
                  Note: Very large stories may have slower load times.
                </p>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
