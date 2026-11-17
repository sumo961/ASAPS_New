/**
 * Languages for speech. A story's language arrives in several shapes: a
 * catalog code ('de', 'zh-Hans', 'es-419', 'pt-BR'), a recogniser locale
 * ('en-US'), or a name a player typed for on-the-fly translation
 * ('German', 'Deutsch'). Speech engines want something narrower:
 *
 *  - the browser's voices and recognisers are tagged by REGION ('zh-CN',
 *    'es-MX'), so a script or area code ('zh-Hans', 'es-419') matches none;
 *  - Whisper-style and ElevenLabs endpoints take a two-letter code ('de').
 *
 * Used by the builder's Preview, the exported player and the microphone in
 * AI Conversation, so all three agree.
 */

/** Script / area codes → the region the browser's voices are tagged with. */
const SPEECH_REGION: Record<string, string> = {
  'zh-hans': 'zh-CN',
  'zh-hant': 'zh-TW',
  'zh': 'zh-CN',
  'es-419': 'es-MX',
  'sr-latn': 'sr-RS',
  'sr-cyrl': 'sr-RS',
};

/** Codes tried when a language is given by name. */
const NAMEABLE = [
  'af', 'ar', 'bg', 'bn', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fr', 'ga', 'gl',
  'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kk', 'ko', 'lt', 'lv', 'mi', 'mk', 'mr', 'ms', 'nb',
  'ne', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur',
  'vi', 'zh',
];

const looksLikeTag = (s: string) => /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(s);

/** 'German' / 'Deutsch' / 'german (austria)' → 'de'; undefined when unknown. */
function codeFromName(name: string): string | undefined {
  const wanted = name.toLowerCase().replace(/\(.*\)/, '').trim();
  if (!wanted) return undefined;
  try {
    const english = new Intl.DisplayNames(['en'], { type: 'language' });
    for (const code of NAMEABLE) {
      if (english.of(code)?.toLowerCase() === wanted) return code;
      // The language's own name for itself ('Deutsch', 'français').
      if (new Intl.DisplayNames([code], { type: 'language' }).of(code)?.toLowerCase() === wanted) return code;
    }
  } catch {
    /* Intl.DisplayNames missing: fall through */
  }
  return undefined;
}

/** A language setting as a tag, whatever shape it came in; undefined when it can't be read. */
function asTag(language: string | null | undefined): string | undefined {
  const raw = (language ?? '').trim();
  if (!raw) return undefined;
  if (looksLikeTag(raw) && raw.length <= 3 + 9 * 3) {
    // A bare word of 4+ letters is a name ('German'), not a tag.
    if (!raw.includes('-') && raw.length > 3) return codeFromName(raw);
    return raw;
  }
  return codeFromName(raw);
}

/**
 * The tag to give `SpeechSynthesisUtterance.lang` or `SpeechRecognition.lang`:
 * 'zh-Hans' → 'zh-CN', 'es-419' → 'es-MX', 'German' → 'de', 'de' → 'de'.
 * Falls back to `fallback` when the language can't be read.
 */
export function speechLocale(language: string | null | undefined, fallback = 'en-US'): string {
  const tag = asTag(language);
  if (!tag) return fallback;
  return SPEECH_REGION[tag.toLowerCase()] ?? tag;
}

/** The two- or three-letter language code alone ('de-AT' → 'de', 'Chinese' → 'zh'); undefined when unknown. */
export function speechLanguageCode(language: string | null | undefined): string | undefined {
  const tag = asTag(language);
  return tag ? tag.split('-')[0].toLowerCase() : undefined;
}

/**
 * Whether a voice tagged `voiceLang` ('de-DE', 'zh_CN') can read `language`.
 * Same language, and for Chinese the same script: a Simplified story is not
 * read by a Taiwan or Hong Kong voice when a mainland one would do, and the
 * other way round.
 */
export function voiceSpeaksLanguage(voiceLang: string | null | undefined, language: string | null | undefined): boolean {
  const wanted = asTag(language);
  const voice = (voiceLang ?? '').replace(/_/g, '-').toLowerCase();
  if (!wanted || !voice) return false;
  const [wantedLang, ...wantedRest] = wanted.toLowerCase().split('-');
  if (voice.split('-')[0] !== wantedLang) return false;
  if (wantedLang === 'zh' && wantedRest.length > 0) {
    const traditional = (parts: string[]) => parts.some((p) => p === 'hant' || p === 'tw' || p === 'hk' || p === 'mo');
    return traditional(wantedRest) === traditional(voice.split('-').slice(1));
  }
  return true;
}
