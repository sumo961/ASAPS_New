/**
 * A voice of their own for every speaker nobody chose one for.
 *
 * Without this a story fresh from a template was read in one voice: the
 * narrator and every character got the speech setup's default (author's
 * field test, 2026-11-22: "the same for both the narrator and the Karin
 * character"). The Preview, the TTS menu and exports all ask here, so they
 * agree on who gets which voice.
 *
 * Only where the voices are known without asking the account: OpenAI's.
 * ElevenLabs voices belong to the author's account, a local server's to its
 * install, the browser's to the player's device.
 *
 * What it leaves alone: a voice the author chose; the narrator, who keeps the
 * default voice; and the player's own character, who stays silent until the
 * author gives them a voice.
 */
import { guessSpeakerGenders } from './guessGender';

export interface AutoVoice {
  id: string;
  gender?: 'male' | 'female' | 'neutral';
}

/** The speech setups whose unassigned speakers get voices of their own. */
export function autoVoicesApply(providerType: string | null | undefined): boolean {
  return providerType === 'openai';
}

export const NARRATOR = 'Narrator';
const DEFAULT_WHEN_NONE_SET = 'alloy';

export function autoSpeakerVoices(input: {
  /** The story's speakers, in the order the TTS menu lists them. */
  speakers: ReadonlyArray<string>;
  /** Voices the author chose (speaker → voice id). */
  assigned?: Record<string, string> | null;
  /** The voices the setup's model can use, in the order they are offered. */
  voices: ReadonlyArray<AutoVoice>;
  /** The setup's default voice: the narrator's. */
  defaultVoiceId?: string;
  /** The player's own character under each name it goes by ('Interactor', their display name). */
  playerKeys?: ReadonlyArray<string>;
  /** What is known of a speaker ('she' / 'he' from their character's pronouns). */
  genders?: Record<string, 'male' | 'female' | undefined>;
  /**
   * Names that are one speaker (a character's display name, name and id: a
   * story may use any of them): they share a voice.
   */
  sameSpeaker?: ReadonlyArray<ReadonlyArray<string>>;
}): Record<string, string> {
  const { speakers, voices } = input;
  const assigned = input.assigned ?? {};
  const out: Record<string, string> = {};
  if (voices.length === 0) return out;
  const narrators = input.defaultVoiceId || DEFAULT_WHEN_NONE_SET;
  const silent = new Set<string>([NARRATOR, 'Interactor', ...(input.playerKeys ?? [])]);
  const taken = new Set<string>([narrators, ...Object.values(assigned).filter(Boolean)]);
  // When every voice is in use they come round again, the narrator's last.
  const round = voices.filter((v) => v.id !== narrators);
  let turn = 0;
  let shared = 0;
  const othersOf = (speaker: string) => (input.sameSpeaker ?? []).filter((g) => g.includes(speaker)).flat().filter((n) => n !== speaker);
  for (const speaker of speakers) {
    if (!speaker || silent.has(speaker) || assigned[speaker] || out[speaker]) continue;
    // Their other name is the player's: silent like them. It has a voice: that one.
    const others = othersOf(speaker);
    if (others.some((n) => silent.has(n))) continue;
    const theirs = others.map((n) => assigned[n] || out[n]).find(Boolean);
    if (theirs) { out[speaker] = theirs; continue; }
    const free = voices.filter((v) => !taken.has(v.id));
    const wanted = input.genders?.[speaker] ?? others.map((n) => input.genders?.[n]).find(Boolean);
    // A woman gets a woman's voice and a man a man's, also when all of
    // those are taken (then one is shared) and even if it is the narrator's:
    // a voice that suits comes before a voice of one's own. (A man's voice
    // read a woman's lines in the field test.)
    const suiting = wanted ? voices.filter((v) => v.gender === wanted) : [];
    const pick = (wanted && free.find((v) => v.gender === wanted))
      || (suiting.length > 0 ? (suiting.filter((v) => v.id !== narrators)[shared++ % Math.max(1, suiting.filter((v) => v.id !== narrators).length)] ?? suiting[0]) : undefined)
      || free[0]
      || round[turn++ % Math.max(1, round.length)]
      || voices[0];
    out[speaker] = pick.id;
    taken.add(pick.id);
  }
  return out;
}

/**
 * The author's choices, also under the other names of the same character:
 * a voice chosen for "Karin Lindqvist" reads a line attributed to "karin".
 * A name with a choice of its own keeps it.
 */
export function voicesUnderAllNames(assigned: Record<string, string> | null | undefined, sameSpeaker: ReadonlyArray<ReadonlyArray<string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [speaker, voice] of Object.entries(assigned ?? {})) if (voice) out[speaker] = voice;
  for (const group of sameSpeaker) {
    const voice = group.map((n) => out[n]).find(Boolean);
    if (!voice) continue;
    for (const name of group) out[name] ??= voice;
  }
  return out;
}

/** The names each character goes by, for `sameSpeaker`. */
export function speakerNameGroups(characters: ReadonlyArray<{ id?: string; name?: string; displayName?: string }> | null | undefined): string[][] {
  return (characters ?? []).map((c) => [...new Set([c.displayName, c.name, c.id].filter(Boolean) as string[])]).filter((g) => g.length > 1);
}

/**
 * Woman or man for each speaker, as far as the story says (guessGender):
 * the character's pronouns, what their own texts call them, a role word or
 * a common first name. Speakers who are no character go by their name.
 */
export function speakerGenders(
  characters: Parameters<typeof guessSpeakerGenders>[0],
  speakers?: ReadonlyArray<string> | null,
): Record<string, 'male' | 'female' | undefined> {
  return guessSpeakerGenders(characters, speakers);
}
