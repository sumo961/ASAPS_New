/**
 * What an HTML export carries for reading aloud.
 *
 * In-story AI is set in the export dialog; reading aloud used to be taken
 * from this computer's speech setup without a word, key included, whether
 * or not "Read text aloud" was ticked. The dialog now shows the choice, and
 * these helpers turn it into the exporter's options:
 *
 *  - reading aloud off            → nothing of the speech setup is exported
 *  - "the browser's own voice"    → no provider, no key
 *  - "the speech setup's voices"  → provider, model, voices and, for a cloud
 *                                   provider, its key
 *
 * Voice input is not among them: an exported story listens with the
 * browser's speech recognition, and nothing is exported for it.
 */

import type { SavedTTSConfig } from '../hooks/useTTS';
import type { HtmlExportOptions } from './HtmlExporter';

export type ExportSpeechSource = 'browser' | 'setup';

export interface SpeechSetupSummary {
  /** 'none': no setup, or the browser's voice already. */
  kind: 'none' | 'cloud' | 'own-server';
  /** For the dialog: "ElevenLabs", "OpenAI", "your speech server". */
  name: string;
  /** Choosing it writes an API key into the export. */
  embedsKey: boolean;
  /** False for a server only this computer can reach: players get the browser's voice anyway. */
  reachable: boolean;
}

const isLocalAddress = (url?: string) => !url || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(url);

export function summarizeSpeechSetup(saved: SavedTTSConfig | null | undefined): SpeechSetupSummary {
  const type = saved?.providerType;
  if (!saved || !type || type === 'web-speech') return { kind: 'none', name: "the browser's own voice", embedsKey: false, reachable: true };
  if (type === 'elevenlabs' || type === 'openai') {
    // Without its key a cloud provider can't read; the player falls back to the browser's voice.
    return { kind: 'cloud', name: type === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI', embedsKey: !!saved.apiKey, reachable: !!saved.apiKey };
  }
  return { kind: 'own-server', name: 'your speech server', embedsKey: !!saved.apiKey, reachable: !isLocalAddress(saved.baseUrl) };
}

type SpeechOptions = Pick<HtmlExportOptions,
  'ttsProvider' | 'ttsApiKey' | 'ttsModel' | 'ttsBaseUrl' | 'ttsDefaultVoiceId' | 'ttsReadPrompts' | 'ttsSpeakerVoices' | 'ttsEnabled'>;

export function exportSpeechOptions(input: {
  /** "Read text aloud in the exported player" (a project setting). */
  readAloud: boolean;
  source: ExportSpeechSource;
  saved: SavedTTSConfig | null | undefined;
  /** The project's speaker → voice lists, by provider (globalSettings.tts.speakerVoices). */
  speakerVoices?: Record<string, Record<string, string>>;
  readPrompts: boolean;
}): SpeechOptions {
  const { readAloud, source, saved, speakerVoices, readPrompts } = input;
  const useSetup = readAloud && source === 'setup' && summarizeSpeechSetup(saved).kind !== 'none';
  if (!useSetup || !saved) {
    return { ttsProvider: 'web-speech', ttsReadPrompts: readPrompts, ttsEnabled: readAloud };
  }
  return {
    ttsProvider: saved.providerType,
    ttsApiKey: saved.apiKey,
    ttsModel: saved.model,
    ttsBaseUrl: saved.baseUrl,
    ttsDefaultVoiceId: saved.defaultVoiceId,
    ttsReadPrompts: readPrompts,
    ttsSpeakerVoices: speakerVoices?.[saved.providerType],
    ttsEnabled: true,
  };
}
