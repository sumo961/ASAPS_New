/**
 * MergeStoryDialog — merge another story (.asaps file) into the open
 * project. Flow: pick file → analysis summary + per-character collision
 * decisions → merge. The heavy lifting lives in utils/projectMerge.ts;
 * this dialog only collects the author's choices.
 */
import React, { useCallback, useRef, useState } from 'react';
import { GitMerge, Upload, X, Users, AlertTriangle } from 'lucide-react';
import {
  analyzeMergeSource,
  type MergeSourceAnalysis,
  type CharacterDecision,
} from '../utils/projectMerge';

export interface MergeStoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  existingCharacters: any[];
  /** Performs the merge; resolves with a human-readable summary line. */
  onMerge: (analysis: MergeSourceAnalysis, decisions: CharacterDecision[]) => Promise<string>;
}

export const MergeStoryDialog: React.FC<MergeStoryDialogProps> = ({
  isOpen,
  onClose,
  existingCharacters,
  onMerge,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analysis, setAnalysis] = useState<MergeSourceAnalysis | null>(null);
  const [decisions, setDecisions] = useState<Map<string, CharacterDecision['action']>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reset = useCallback(() => {
    setAnalysis(null);
    setDecisions(new Map());
    setBusy(false);
    setError(null);
    setDone(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const result = await analyzeMergeSource(file, existingCharacters);
      setAnalysis(result);
      // Default every collision to keep-both (never silently fuse)
      setDecisions(new Map(result.characterCollisions.map(c => [c.incomingId, 'keep-both' as const])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }, [existingCharacters]);

  const handleMerge = useCallback(async () => {
    if (!analysis) return;
    setBusy(true);
    setError(null);
    try {
      const summary = await onMerge(
        analysis,
        [...decisions.entries()].map(([incomingId, action]) => ({ incomingId, action })),
      );
      setDone(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed.');
    } finally {
      setBusy(false);
    }
  }, [analysis, decisions, onMerge]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-purple-600" />
            Merge Story
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {done ? (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
              {done}
            </div>
          ) : !analysis ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Pick an exported story file (<code>.asaps</code>). Its beats arrive as a
                separate cluster beside your current story — nothing existing is changed.
                You connect the two stories afterwards.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-gray-500 hover:border-purple-400 hover:text-purple-600 transition-colors flex flex-col items-center gap-2"
              >
                <Upload className="w-8 h-8" />
                {busy ? 'Reading…' : 'Choose .asaps file'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".asaps,.zip,.asapst"
                className="hidden"
                onChange={e => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </>
          ) : (
            <>
              <div className="text-sm text-gray-700 mb-4">
                <div className="font-medium mb-1">{analysis.storyTitle}</div>
                <div className="text-gray-500">
                  {analysis.incomingBeats.length} beats · {analysis.incomingCharacters.length} characters ·{' '}
                  {analysis.parsedAssets.length} assets
                </div>
              </div>

              {analysis.characterCollisions.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4" />
                    Both stories have these characters — same person?
                  </div>
                  <div className="space-y-2">
                    {analysis.characterCollisions.map(c => (
                      <div key={c.incomingId} className="border rounded p-3 text-sm">
                        <div className="font-medium mb-2">{c.incomingName}</div>
                        <label className="flex items-center gap-2 text-gray-600">
                          <input
                            type="radio"
                            name={`col-${c.incomingId}`}
                            checked={decisions.get(c.incomingId) === 'reuse'}
                            onChange={() => setDecisions(prev => new Map(prev).set(c.incomingId, 'reuse'))}
                          />
                          Same character — reuse “{c.existingName}” from this project
                        </label>
                        <label className="flex items-center gap-2 text-gray-600 mt-1">
                          <input
                            type="radio"
                            name={`col-${c.incomingId}`}
                            checked={decisions.get(c.incomingId) === 'keep-both'}
                            onChange={() => setDecisions(prev => new Map(prev).set(c.incomingId, 'keep-both'))}
                          />
                          Different character — keep both (incoming becomes “{c.incomingName} 2”)
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          {analysis && !done && (
            <button
              onClick={handleMerge}
              disabled={busy}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              <GitMerge className="w-4 h-4" />
              {busy ? 'Merging…' : 'Merge into this project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
