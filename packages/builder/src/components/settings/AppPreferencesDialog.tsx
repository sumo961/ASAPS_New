/**
 * App Preferences — the MACHINE scope (UX-Eval B3): everything that is about
 * this computer rather than a story. Project Settings (⌘,) is the project
 * scope; the rule that separates them is "if two authors opening the same
 * project could see different players or exports, it belongs to the
 * project".
 *
 * One place for: AI provider, voices (TTS), speech input (STT), web search,
 * where keys are stored, and — desktop only — automatic updates and the
 * Claude Desktop (MCP) integration. The provider rows open the existing
 * configuration dialogs rather than duplicating them.
 */

import React, { useEffect, useState } from 'react';
import { X, Sparkles, Volume2, Mic, Search, RefreshCw, Plug, Lock } from 'lucide-react';
import { getSavedAIConfig } from '../../hooks/useAI';
import { getSavedTTSConfig } from '../../hooks/useTTS';
import { getSavedSTTConfig } from '../../hooks/useSTT';
import { getSavedBraveApiKey } from '../ai/ideator/braveConfig';
import { keyStorageNote } from '../../utils/keyStorageNote';

export interface AppPreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAIConfig: () => void;
  onOpenTTSConfig: () => void;
  onOpenSTTConfig: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  local: 'Local model',
  'web-speech': 'Built-in browser voices',
  elevenlabs: 'ElevenLabs',
  custom: 'Custom server',
  whisper: 'Whisper',
};

function label(provider?: string): string {
  return provider ? PROVIDER_LABELS[provider] ?? provider : 'Not set up';
}

/** MCP toggle in the browser build (no desktop menu there). */
const WEB_MCP_KEY = 'asaps_mcp_enabled';

const Row: React.FC<{
  icon: React.ReactNode;
  title: string;
  summary: string;
  action?: React.ReactNode;
}> = ({ icon, title, summary, action }) => (
  <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-b-0">
    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 flex-shrink-0">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-gray-900">{title}</div>
      <div className="text-xs text-gray-500 truncate">{summary}</div>
    </div>
    {action}
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label: aria }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={aria}
    onClick={() => onChange(!checked)}
    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
  </button>
);

export const AppPreferencesDialog: React.FC<AppPreferencesDialogProps> = ({
  isOpen,
  onClose,
  onOpenAIConfig,
  onOpenTTSConfig,
  onOpenSTTConfig,
}) => {
  const electronSettings = (window as any).electronAPI?.settings;
  const isDesktop = !!electronSettings;
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState<boolean | null>(null);
  // Re-read summaries whenever the dialog opens (keys may have changed in a
  // provider dialog opened from here).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setTick((t) => t + 1);
    if (isDesktop) {
      electronSettings.getMcpEnabled?.().then((v: boolean) => setMcpEnabled(!!v)).catch(() => {});
      electronSettings.getAutoUpdateEnabled?.().then((v: boolean) => setAutoUpdate(!!v)).catch(() => {});
    } else {
      try { setMcpEnabled(localStorage.getItem(WEB_MCP_KEY) === 'true'); } catch { /* ignore */ }
    }
  }, [isOpen, isDesktop, electronSettings]);

  if (!isOpen) return null;
  void tick;

  const ai = getSavedAIConfig();
  const tts = getSavedTTSConfig();
  const stt = getSavedSTTConfig();
  const brave = getSavedBraveApiKey();

  const openThen = (open: () => void) => () => {
    onClose();
    open();
  };

  const setMcp = async (enabled: boolean) => {
    setMcpEnabled(enabled);
    if (isDesktop) {
      await electronSettings.setMcpEnabled?.(enabled);
    } else {
      try { localStorage.setItem(WEB_MCP_KEY, String(enabled)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('asaps:mcp-setting-changed', { detail: { enabled } }));
    }
  };

  const setUpdates = async (enabled: boolean) => {
    setAutoUpdate(enabled);
    await electronSettings?.setAutoUpdateEnabled?.(enabled);
  };

  const configureBtn = (onClick: () => void, text = 'Configure…') => (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 flex-shrink-0"
    >
      {text}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="app-prefs-title" className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 id="app-prefs-title" className="text-lg font-semibold text-gray-900">App Preferences</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Settings for this computer. Settings that travel with a project are in Project Settings (⌘,).
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-2">
          <Row
            icon={<Sparkles className="w-4 h-4" />}
            title="AI provider"
            summary={ai ? `${label(ai.providerType || ai.provider)}${ai.model ? ` · ${ai.model}` : ''}${ai.apiKey || ai.providerType === 'local' ? '' : ' · no key'}` : 'Not set up'}
            action={configureBtn(openThen(onOpenAIConfig))}
          />
          <Row
            icon={<Search className="w-4 h-4" />}
            title="Web search for the Ideator"
            summary={brave ? 'Brave Search key saved' : 'Off — add a Brave Search key in the AI configuration'}
            action={configureBtn(openThen(onOpenAIConfig), brave ? 'Change…' : 'Add key…')}
          />
          <Row
            icon={<Volume2 className="w-4 h-4" />}
            title="Voices (text to speech)"
            summary={label(tts?.providerType)}
            action={configureBtn(openThen(onOpenTTSConfig))}
          />
          <Row
            icon={<Mic className="w-4 h-4" />}
            title="Speech input"
            summary={label(stt?.providerType)}
            action={configureBtn(openThen(onOpenSTTConfig))}
          />
          {isDesktop && autoUpdate !== null && (
            <Row
              icon={<RefreshCw className="w-4 h-4" />}
              title="Check for updates automatically"
              summary="New versions download in the background and install when you quit."
              action={<Toggle checked={autoUpdate} onChange={setUpdates} label="Check for updates automatically" />}
            />
          )}
          <Row
            icon={<Plug className="w-4 h-4" />}
            title="Claude Desktop integration (MCP)"
            summary="Lets Claude Desktop send generated stories into this app."
            action={<Toggle checked={mcpEnabled} onChange={setMcp} label="Claude Desktop integration" />}
          />
        </div>

        <div className="px-5 py-3 bg-gray-50 rounded-b-xl flex items-start gap-2 text-xs text-gray-600">
          <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{keyStorageNote()}</span>
        </div>
      </div>
    </div>
  );
};
