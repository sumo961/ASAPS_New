/**
 * Prompt Preview — user-facing review of the synthesized
 * StoryGenerationRequest. The prompt text is editable; genre/length/
 * complexity/includeAIBeats are editable via form controls. On "Send to
 * Story Generator", we hand the final request back to the opener window.
 *
 * Per the design agreement, this panel is modal within the pop-out — the
 * conversation is hidden while previewing, and the user can go back to
 * iterate without losing the transcript.
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Send, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { StoryGenerationRequest } from '../../../types/ai';
import type { IdeatorStatus } from './types';

/**
 * Phases shown in rotation while the main builder is generating the story.
 * They're loose narrative labels, not real progress milestones — story
 * generation is one long Anthropic/OpenAI call with no streamed progress.
 * The point is to reassure the author that something is happening; we
 * don't fake a percentage, just rotate phrasing every few seconds.
 */
const GENERATION_PHASES = [
  'Outlining the story arc…',
  'Mapping branching paths…',
  'Drafting beat content…',
  'Writing dialogue and choices…',
  'Wiring up connections…',
  'Validating story structure…',
  'Almost there — polishing the draft…',
];

const GenerationProgress: React.FC = () => {
  const [elapsed, setElapsed] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const tickId = window.setInterval(() => setElapsed(s => s + 1), 1000);
    const phaseId = window.setInterval(
      () => setPhaseIdx(i => Math.min(i + 1, GENERATION_PHASES.length - 1)),
      6000
    );
    return () => {
      window.clearInterval(tickId);
      window.clearInterval(phaseId);
    };
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex flex-col gap-3 p-4 rounded-md bg-purple-50 border border-purple-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-purple-900">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-medium">Generating your story…</span>
        </div>
        <span className="text-xs font-mono tabular-nums text-purple-700">
          {mm}:{ss}
        </span>
      </div>

      <div className="relative w-full h-1.5 overflow-hidden rounded-full bg-purple-100">
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 animate-indeterminate" />
      </div>

      <div className="text-xs text-purple-800">
        {GENERATION_PHASES[phaseIdx]}
      </div>
      <div className="text-[11px] text-purple-600 leading-snug">
        This usually takes 30–90 seconds. You can leave this window open —
        the finished story will appear in the main builder.
      </div>
    </div>
  );
};

interface PromptPreviewPanelProps {
  draft: StoryGenerationRequest;
  status: IdeatorStatus;
  error: string | null;
  onBackToChat: () => void;
  onConfirm: (request: StoryGenerationRequest) => void;
}

export const PromptPreviewPanel: React.FC<PromptPreviewPanelProps> = ({
  draft,
  status,
  error,
  onBackToChat,
  onConfirm,
}) => {
  // Local editable copy so edits don't bounce through the store on every
  // keystroke. Synced when `draft` changes (e.g. after regenerate).
  const [promptText, setPromptText] = useState(draft.prompt);
  const [genre, setGenre] = useState(draft.genre ?? '');
  const [length, setLength] = useState<StoryGenerationRequest['length']>(
    draft.length ?? 'medium'
  );
  const [complexity, setComplexity] = useState<StoryGenerationRequest['complexity']>(
    draft.complexity ?? 'moderate'
  );
  const [includeAIBeats, setIncludeAIBeats] = useState<boolean>(
    draft.includeAIBeats ?? false
  );

  useEffect(() => {
    setPromptText(draft.prompt);
    setGenre(draft.genre ?? '');
    setLength(draft.length ?? 'medium');
    setComplexity(draft.complexity ?? 'moderate');
    setIncludeAIBeats(draft.includeAIBeats ?? false);
  }, [draft]);

  const handleConfirm = () => {
    const trimmed = promptText.trim();
    if (trimmed.length === 0) return;
    const req: StoryGenerationRequest = {
      prompt: trimmed,
      length,
      complexity,
      includeAIBeats,
    };
    if (genre.trim().length > 0) req.genre = genre.trim();
    onConfirm(req);
  };

  const submitting = status === 'submitting';
  const generating = status === 'generating';
  const handedOff = status === 'handed_off';
  const busy = submitting || generating || handedOff;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-pink-50">
        <button
          onClick={onBackToChat}
          disabled={busy}
          className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-40"
          title="Go back to the conversation to refine"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to conversation
        </button>
        <h2 className="text-sm font-semibold text-gray-900">Review your prompt</h2>
        <div className="w-[150px]" /> {/* spacer to center the title */}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <p className="text-xs text-gray-600">
          Ideator turned your conversation into the prompt below. Edit anything
          you'd like before sending it to the ASAPS story generator.
        </p>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Prompt
          </label>
          <textarea
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            disabled={busy}
            rows={14}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed font-normal focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Genre (optional)
            </label>
            <input
              type="text"
              value={genre}
              onChange={e => setGenre(e.target.value)}
              disabled={busy}
              placeholder="e.g. drama, speculative fiction"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Length
            </label>
            <select
              value={length}
              onChange={e => setLength(e.target.value as any)}
              disabled={busy}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Branching complexity
            </label>
            <select
              value={complexity}
              onChange={e => setComplexity(e.target.value as any)}
              disabled={busy}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
            >
              <option value="linear">Linear</option>
              <option value="moderate">Moderate</option>
              <option value="complex">Complex</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 py-1.5">
              <input
                type="checkbox"
                checked={includeAIBeats}
                onChange={e => setIncludeAIBeats(e.target.checked)}
                disabled={busy}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              Include AI-powered beats
            </label>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {generating && <GenerationProgress />}

        {handedOff && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Your story is ready. Switch back to the main builder window to
              inspect it — you can close this window or keep it open to
              review the conversation.
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 px-4 py-3 flex justify-end gap-2">
        <button
          onClick={handleConfirm}
          disabled={busy || promptText.trim().length === 0}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:from-purple-600 hover:to-pink-600 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating || submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {handedOff
              ? 'Sent'
              : generating
                ? 'Generating…'
                : submitting
                  ? 'Sending…'
                  : 'Send to Story Generator'}
          </span>
        </button>
      </div>
    </div>
  );
};
