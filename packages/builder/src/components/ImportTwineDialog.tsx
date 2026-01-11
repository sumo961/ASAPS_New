/**
 * ImportTwineDialog - Dialog for importing Twine (SugarCube) HTML files
 *
 * Shows a preview of the import with beat type breakdown and warnings,
 * then imports the story as ASAPS beats.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  TwineImporter,
  TwineParser,
  type TwineStory,
  type AnalysisResult,
  type ImportResult,
  type SuggestedBeatType,
} from '@asaps/core';

export interface ImportTwineDialogProps {
  isOpen: boolean;
  onImport: (result: ImportResult) => void;
  onCancel: () => void;
}

type DialogStep = 'select' | 'preview' | 'importing' | 'complete' | 'error';

const BEAT_TYPE_ICONS: Record<SuggestedBeatType, string> = {
  introText: '📝',
  dialogTree: '🌳',
  hyperText: '🔗',
  endScreen: '🏁',
  setVariable: '🔧',
  conditionBeat: '❓',
};

const BEAT_TYPE_LABELS: Record<SuggestedBeatType, string> = {
  introText: 'Intro Text',
  dialogTree: 'Dialog Tree',
  hyperText: 'Hyper Text',
  endScreen: 'End Screen',
  setVariable: 'Set Variable',
  conditionBeat: 'Condition',
};

export function ImportTwineDialog({
  isOpen,
  onImport,
  onCancel,
}: ImportTwineDialogProps) {
  const [step, setStep] = useState<DialogStep>('select');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [story, setStory] = useState<TwineStory | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [title, setTitle] = useState<string>('');
  const [author, setAuthor] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setHtmlContent('');
      setFileName('');
      setStory(null);
      setAnalysis(null);
      setTitle('');
      setAuthor('');
      setError(null);
      setImporting(false);
    }
  }, [isOpen]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setHtmlContent(content);

      // Validate and preview
      const validation = TwineParser.validate(content);
      if (!validation.valid) {
        setError(`Invalid Twine file: ${validation.errors.join(', ')}`);
        setStep('error');
        return;
      }

      try {
        const preview = TwineImporter.preview(content);
        setStory(preview.story);
        setAnalysis(preview.analysis);
        setTitle(preview.title);
        setAuthor(preview.author || '');
        setStep('preview');
      } catch (err) {
        setError(`Failed to parse Twine file: ${err instanceof Error ? err.message : String(err)}`);
        setStep('error');
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
      setStep('error');
    };

    reader.readAsText(file);
  }, []);

  /**
   * Handle import
   */
  const handleImport = useCallback(() => {
    if (!htmlContent) return;

    setImporting(true);
    setStep('importing');

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const importer = new TwineImporter();
        const result = importer.import(htmlContent);
        setStep('complete');
        onImport(result);
      } catch (err) {
        setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
        setStep('error');
      } finally {
        setImporting(false);
      }
    }, 100);
  }, [htmlContent, onImport]);

  /**
   * Open file picker
   */
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Import Twine Story</h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Select Step */}
          {step === 'select' && (
            <div className="text-center py-8">
              <div className="mb-6">
                <p className="text-gray-600 mb-2">
                  Import a Twine 2 story (SugarCube format)
                </p>
                <p className="text-sm text-gray-500">
                  Passages will be analyzed and converted to appropriate ASAPS beat types
                </p>
              </div>
              <button
                onClick={openFilePicker}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Select Twine HTML File
              </button>
            </div>
          )}

          {/* Preview Step */}
          {step === 'preview' && story && analysis && (
            <div className="space-y-6">
              {/* Story Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Story Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Title:</span>{' '}
                    <span className="font-medium">{title}</span>
                  </div>
                  {author && (
                    <div>
                      <span className="text-gray-500">Author:</span>{' '}
                      <span className="font-medium">{author}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Format:</span>{' '}
                    <span className="font-medium">{story.format} {story.formatVersion}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">File:</span>{' '}
                    <span className="font-medium">{fileName}</span>
                  </div>
                </div>
              </div>

              {/* Beat Type Breakdown */}
              <div>
                <h3 className="font-semibold mb-3">
                  Beat Type Mapping ({analysis.stats.total} passages)
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(analysis.stats.byType).map(([type, count]) => (
                    count > 0 && (
                      <div
                        key={type}
                        className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2"
                      >
                        <span>{BEAT_TYPE_ICONS[type as SuggestedBeatType]}</span>
                        <span className="text-sm">{BEAT_TYPE_LABELS[type as SuggestedBeatType]}</span>
                        <span className="ml-auto font-medium">{count}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>

              {/* Warnings */}
              {analysis.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-800 mb-2">
                    Warnings ({analysis.warnings.length})
                  </h3>
                  <ul className="text-sm text-yellow-700 space-y-1 max-h-40 overflow-y-auto">
                    {analysis.warnings.slice(0, 20).map((warning, i) => (
                      <li key={i}>• {warning}</li>
                    ))}
                    {analysis.warnings.length > 20 && (
                      <li className="text-yellow-600 italic">
                        ...and {analysis.warnings.length - 20} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Conditionals Info */}
              {analysis.stats.withConditionals > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-700">
                    <strong>{analysis.stats.withConditionals}</strong> passages contain
                    conditional branching and will be converted to ConditionBeats.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Importing story...</p>
            </div>
          )}

          {/* Error Step */}
          {step === 'error' && error && (
            <div className="text-center py-8">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-700">{error}</p>
              </div>
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Try Another File
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={importing}
          >
            Cancel
          </button>
          {step === 'preview' && (
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              disabled={importing}
            >
              Import Story
            </button>
          )}
          {step === 'select' && (
            <button
              onClick={openFilePicker}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Select File
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
