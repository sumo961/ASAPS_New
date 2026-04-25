/**
 * DebugWindow — standalone pop-out page for the Story Debug Tools.
 *
 * Receives serialized story data via postMessage from the main builder window,
 * reconstructs a Story, and renders the same three analysis tabs (Reachability,
 * Path Analysis, Story Logic) that used to live inside the in-page DebugPanel.
 *
 * Highlight requests (click a beat or path) are posted BACK to the opener so
 * the flowchart in the main builder paints the trace — same behaviour as the
 * embedded panel, just in a window you can drag anywhere.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Bug, GitBranch, AlertCircle, FileText } from 'lucide-react';
import { Story, BeatTypeRegistry } from '@asaps/core';
import { ReachabilityReport } from '../components/debug/ReachabilityReport';
import { PathVisualization } from '../components/debug/PathVisualization';
import { LogicValidationReport } from '../components/debug/LogicValidationReport';
import type { DebugMessage } from '../services/DebugWindowManager';
import type { SerializedStoryData } from '../services/PreviewWindowManager';

type Tab = 'reachability' | 'paths' | 'logic';

export const DebugWindow: React.FC = () => {
  const [storyData, setStoryData] = useState<SerializedStoryData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('reachability');

  // Listen for STORY_UPDATE messages; ping the opener so it knows we're ready.
  // In Electron the preload exposes the same transport via IPC.
  useEffect(() => {
    const isElectron = typeof window !== 'undefined'
      && !!(window as any).electronAPI?.debug?.ping;

    const handleDebugMessage = (message: DebugMessage) => {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'STORY_UPDATE' && message.payload?.storyData) {
        setStoryData(message.payload.storyData);
      }
    };

    // Web path: postMessage
    const handleWebMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handleDebugMessage(event.data as DebugMessage);
    };
    window.addEventListener('message', handleWebMessage);

    // Electron IPC path
    let unsubscribeIPC: (() => void) | undefined;
    if (isElectron) {
      unsubscribeIPC = (window as any).electronAPI.onDebugMessage(handleDebugMessage);
    }

    // Announce readiness so the manager can push the latest story.
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'PING' }, window.location.origin);
      } catch (err) {
        console.warn('[DebugWindow] Failed to PING opener:', err);
      }
    }
    if (isElectron) {
      try {
        (window as any).electronAPI.debug.ping();
      } catch (err) {
        console.warn('[DebugWindow] Failed to PING main via IPC:', err);
      }
    }

    return () => {
      window.removeEventListener('message', handleWebMessage);
      unsubscribeIPC?.();
    };
  }, []);

  // Reconstruct a live Story object from the serialized payload. Mirrors the
  // reconstruction in PreviewWindow.tsx — same registry, same field order.
  const story = useMemo<Story | null>(() => {
    if (!storyData) return null;
    try {
      const registry = BeatTypeRegistry.getInstance();
      const newStory = new Story({
        title: storyData.title,
        author: storyData.author || 'Unknown',
        firstBeatId: storyData.firstBeatId,
      });
      for (const beatData of storyData.beats) {
        const beat = registry.createBeat(beatData.type, {
          ...beatData,
          parameters: beatData.parameters,
          connections: beatData.connections,
        } as any);
        if (beatData.x !== undefined) beat.x = beatData.x;
        if (beatData.y !== undefined) beat.y = beatData.y;
        if (beatData.locations && beatData.locations.length > 0) {
          beat.locations = new Map(
            beatData.locations.map((loc: any) => [loc.id || loc.name, loc]),
          );
        }
        if (beatData.animations) beat.animations = beatData.animations;
        newStory.addBeat(beat);
      }
      return newStory;
    } catch (err) {
      console.error('[DebugWindow] Failed to reconstruct story:', err);
      return null;
    }
  }, [storyData]);

  // Forward highlight events to the opener so the flowchart paints them.
  // Uses postMessage on the web and the Electron `debug.sendToMain` IPC
  // channel in the desktop build (there's no real `window.opener` on
  // BrowserWindows opened via IPC).
  const postToOpener = (message: DebugMessage) => {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, window.location.origin);
      } else if ((window as any).electronAPI?.debug?.sendToMain) {
        (window as any).electronAPI.debug.sendToMain(message);
      }
    } catch (err) {
      console.warn('[DebugWindow] Failed to post highlight to opener:', err);
    }
  };

  const handleHighlightBeat = (beatId: string) => {
    postToOpener({ type: 'HIGHLIGHT_BEAT', payload: { beatId } });
  };

  const handleHighlightPath = (beatIds: string[]) => {
    postToOpener({ type: 'HIGHLIGHT_PATH', payload: { beatIds } });
  };

  if (!story) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        <div className="text-center">
          <Bug className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <div>Waiting for story data from the builder…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
        <Bug className="w-5 h-5" />
        <h2 className="text-lg font-semibold">Debug Tools</h2>
        <span className="text-xs text-gray-500 ml-2">{story.getMetadata().title}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('reachability')}
          className={`px-4 py-2.5 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'reachability'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800'
          }`}
          title="Find beats that cannot be reached from the start."
        >
          <AlertCircle className="w-4 h-4" />
          Reachability
        </button>
        <button
          onClick={() => setActiveTab('paths')}
          className={`px-4 py-2.5 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'paths'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800'
          }`}
          title="Explore possible paths through your story."
        >
          <GitBranch className="w-4 h-4" />
          Path Analysis
        </button>
        <button
          onClick={() => setActiveTab('logic')}
          className={`px-4 py-2.5 font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'logic'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800'
          }`}
          title="Check for logic errors: undefined variables, missing connections, unused counters."
        >
          <FileText className="w-4 h-4" />
          Story Logic
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'reachability' && (
          <ReachabilityReport story={story} onHighlightBeat={handleHighlightBeat} />
        )}
        {activeTab === 'paths' && (
          <PathVisualization story={story} onHighlightPath={handleHighlightPath} />
        )}
        {activeTab === 'logic' && (
          <LogicValidationReport story={story} onHighlightBeat={handleHighlightBeat} />
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 bg-gray-50 text-xs text-gray-600">
        Clicking a beat or path highlights it in the main builder flowchart.
      </div>
    </div>
  );
};

export default DebugWindow;
