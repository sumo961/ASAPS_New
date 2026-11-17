/**
 * First-run welcome: shown once, over the untouched starter story, to say
 * what the three areas of the window are for and how to see a story play.
 * Dismissed for good with "Got it" (remembered on this computer).
 */
import React from 'react';
import { MousePointerClick, PlusSquare, Play, X } from 'lucide-react';
import { GuideLink } from './GuideLink';

interface Props {
  onDismiss: () => void;
  /** Opens the New project picker (templates, AI, empty). */
  onBrowseStarts: () => void;
}

export const WelcomeCard: React.FC<Props> = ({ onDismiss, onBrowseStarts }) => (
  <div
    className="absolute left-1/2 bottom-6 -translate-x-1/2 z-30 w-[min(34rem,calc(100%-2rem))] bg-white border border-gray-200 rounded-xl shadow-xl p-4"
    role="dialog"
    aria-label="Welcome to ASAPS"
    data-testid="welcome-card"
  >
    <button onClick={onDismiss} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 rounded" aria-label="Close">
      <X className="w-4 h-4" />
    </button>
    <h3 className="font-semibold text-gray-800">Welcome to ASAPS</h3>
    <p className="text-sm text-gray-600 mt-1">
      A story is made of <strong>beats</strong>: a screen of text, a choice, a conversation. This starter has three, linked in a row.
    </p>
    <ul className="mt-3 space-y-2 text-sm text-gray-700">
      <li className="flex gap-2">
        <MousePointerClick className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
        <span><strong>Click a beat</strong> to change what it says, in Properties on the right.</span>
      </li>
      <li className="flex gap-2">
        <PlusSquare className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
        <span><strong>Drag a beat type</strong> from the right onto the canvas, then drag from a beat's dot to another beat to link them.</span>
      </li>
      <li className="flex gap-2">
        <Play className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
        <span><strong>Preview</strong> (top right) plays the story as a player sees it.</span>
      </li>
    </ul>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button onClick={onDismiss} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
        Got it
      </button>
      <button onClick={onBrowseStarts} className="px-3 py-1.5 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
        Start from a template…
      </button>
      <GuideLink>User Guide</GuideLink>
    </div>
  </div>
);
