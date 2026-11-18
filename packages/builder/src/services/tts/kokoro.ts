/**
 * Kokoro's voices and languages.
 *
 * A Kokoro voice belongs to one language, and its id says which: the first
 * letter is the language ('a' American English, 'j' Japanese…), the second
 * the gender. A server is told the language as `lang_code`, the same letter;
 * it "must match the voice" (Kokoro README). mlx-audio defaults `lang_code`
 * to 'a', so without it every voice is read as American English.
 *
 * Kokoro has no German, Dutch, Swedish, Korean… For a line in a language it
 * can't read, `kokoroVoiceFor` returns null and the caller hands the line to
 * the browser's voice.
 *
 * Voices as listed in hexgrad/Kokoro-82M VOICES.md (checked 2026-11-18).
 */

import { speechLanguageCode } from '@asaps/core';
import type { TTSVoiceInfo } from '../../types/tts';

interface KokoroLanguage {
  /** Kokoro's lang_code. */
  code: string;
  /** Tag for the voice list. */
  lang: string;
  label: string;
  voices: string[];
}

const KOKORO_LANGUAGES: KokoroLanguage[] = [
  {
    code: 'a', lang: 'en-US', label: 'American',
    voices: [
      'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river',
      'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx',
      'am_puck', 'am_santa',
    ],
  },
  {
    code: 'b', lang: 'en-GB', label: 'British',
    voices: ['bf_emma', 'bf_alice', 'bf_isabella', 'bf_lily', 'bm_george', 'bm_daniel', 'bm_fable', 'bm_lewis'],
  },
  { code: 'e', lang: 'es', label: 'Spanish', voices: ['ef_dora', 'em_alex', 'em_santa'] },
  { code: 'f', lang: 'fr', label: 'French', voices: ['ff_siwis'] },
  { code: 'h', lang: 'hi', label: 'Hindi', voices: ['hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi'] },
  { code: 'i', lang: 'it', label: 'Italian', voices: ['if_sara', 'im_nicola'] },
  { code: 'j', lang: 'ja', label: 'Japanese', voices: ['jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo'] },
  { code: 'p', lang: 'pt-BR', label: 'Brazilian Portuguese', voices: ['pf_dora', 'pm_alex', 'pm_santa'] },
  {
    code: 'z', lang: 'zh-CN', label: 'Mandarin',
    voices: ['zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang'],
  },
];

/** 'af_heart', and blends such as 'af_bella+af_sky', which start the same way. */
const KOKORO_VOICE = /^([abefhijpz])([fm])_/i;

const languageOfCode = (code: string) => KOKORO_LANGUAGES.find((l) => l.code === code.toLowerCase());
const primary = (lang: string) => lang.split('-')[0].toLowerCase();

/** Whether this setup talks to Kokoro: its preset, or a model named after it. */
export function isKokoro(config: { model?: string; localPreset?: string } | null | undefined): boolean {
  return config?.localPreset === 'kokoro' || /kokoro/i.test(config?.model ?? '');
}

/** What a Kokoro voice id says about the voice; undefined for other ids. */
export function describeKokoroVoice(id: string): TTSVoiceInfo | undefined {
  const m = KOKORO_VOICE.exec(id);
  const language = m && languageOfCode(m[1]);
  if (!m || !language) return undefined;
  const female = m[2].toLowerCase() === 'f';
  const word = id.slice(3);
  return {
    id,
    name: `${word.charAt(0).toUpperCase()}${word.slice(1)} (${language.label} ${female ? 'F' : 'M'})`,
    lang: language.lang,
    gender: female ? 'female' : 'male',
  };
}

/** Every voice, for servers that don't list their own. */
export const KOKORO_VOICES: TTSVoiceInfo[] = KOKORO_LANGUAGES.flatMap((l) => l.voices.map((id) => describeKokoroVoice(id)!));

/**
 * The voice and `lang_code` for a line in `language`.
 *
 *  - The voice reads that language (or no language is known): the voice as
 *    chosen, with its own lang_code.
 *  - It doesn't, and Kokoro has the language: that language's first voice of
 *    the same gender. A British story keeps an American voice and the other
 *    way round; both read English.
 *  - Kokoro doesn't have the language: null.
 *
 * `langCode` is undefined for an id that isn't Kokoro's own (a server's
 * custom voice) reading a language we can't tell it doesn't have.
 */
export function kokoroVoiceFor(
  voiceId: string | undefined,
  language: string | null | undefined,
): { voice: string | undefined; langCode: string | undefined } | null {
  const m = voiceId ? KOKORO_VOICE.exec(voiceId) : null;
  const own = m ? languageOfCode(m[1]) : undefined;
  const wanted = speechLanguageCode(language);
  if (!wanted || (own && primary(own.lang) === wanted)) return { voice: voiceId, langCode: own?.code };

  const target = KOKORO_LANGUAGES.find((l) => l.lang.toLowerCase() === (language ?? '').toLowerCase())
    ?? KOKORO_LANGUAGES.find((l) => primary(l.lang) === wanted);
  if (!target) return null;
  // An id we can't read (a custom voice) is left to read English.
  if (!own && wanted === 'en') return { voice: voiceId, langCode: undefined };
  const gender = m ? m[2].toLowerCase() : undefined;
  const voice = target.voices.find((v) => v.charAt(1) === gender) ?? target.voices[0];
  return { voice, langCode: target.code };
}
