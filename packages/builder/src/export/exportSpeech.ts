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
 *  - the same, through a relay     → OpenAI or ElevenLabs without the key:
 *                                   the story's relay holds it (relayKit.ts)
 *
 * Voice input is not among them: an exported story listens with the
 * browser's speech recognition, and nothing is exported for it.
 */

import type { SavedTTSConfig } from '../hooks/useTTS';
import type { HtmlExportOptions } from './HtmlExporter';
import { autoVoicesApply } from '../services/tts/autoVoices';

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

/** OpenAI (at its own address) and ElevenLabs can be read through the story's relay. */
export function speechCanUseRelay(saved: SavedTTSConfig | null | undefined): boolean {
  const type = saved?.providerType;
  if (type === 'elevenlabs') return true;
  return type === 'openai' && (!saved?.baseUrl || /^https:\/\/api\.openai\.com(\/|$)/i.test(saved.baseUrl));
}

/** Only the speakers a voice was chosen for ("Auto" is stored as an empty choice). */
const pickSet = (voices: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(voices ?? {}).filter(([, id]) => !!id));

type SpeechOptions = Pick<HtmlExportOptions,
  'ttsProvider' | 'ttsApiKey' | 'ttsRelayUrl' | 'ttsModel' | 'ttsBaseUrl' | 'ttsDefaultVoiceId' | 'ttsReadPrompts' | 'ttsSpeakerVoices' | 'ttsEnabled'>;

export function exportSpeechOptions(input: {
  /** "Read text aloud in the exported player" (a project setting). */
  readAloud: boolean;
  source: ExportSpeechSource;
  saved: SavedTTSConfig | null | undefined;
  /** The project's speaker → voice lists, by provider (globalSettings.tts.speakerVoices). */
  speakerVoices?: Record<string, Record<string, string>>;
  readPrompts: boolean;
  /** Read through this relay instead of writing the key into the page (cloud providers only). */
  relayUrl?: string;
  /**
   * Voices for the speakers nobody chose one for, as the Preview and the TTS
   * menu have them (services/tts/autoVoices). The author's own choices win.
   */
  autoVoices?: Record<string, string>;
}): SpeechOptions {
  const { readAloud, source, saved, speakerVoices, readPrompts } = input;
  const useSetup = readAloud && source === 'setup' && summarizeSpeechSetup(saved).kind !== 'none';
  if (!useSetup || !saved) {
    return { ttsProvider: 'web-speech', ttsReadPrompts: readPrompts, ttsEnabled: readAloud };
  }
  // The relay knows OpenAI's and ElevenLabs' own addresses only, so a
  // setup pointing elsewhere keeps its key and address.
  const relayed = !!input.relayUrl && speechCanUseRelay(saved);
  return {
    ttsProvider: saved.providerType,
    ttsApiKey: relayed ? undefined : saved.apiKey,
    ttsRelayUrl: relayed ? input.relayUrl : undefined,
    ttsModel: saved.model,
    ttsBaseUrl: relayed ? undefined : saved.baseUrl,
    ttsDefaultVoiceId: saved.defaultVoiceId,
    ttsReadPrompts: readPrompts,
    ttsSpeakerVoices: autoVoicesApply(saved.providerType) && input.autoVoices && Object.keys(input.autoVoices).length > 0
      ? { ...input.autoVoices, ...pickSet(speakerVoices?.[saved.providerType]) }
      : speakerVoices?.[saved.providerType],
    ttsEnabled: true,
  };
}
