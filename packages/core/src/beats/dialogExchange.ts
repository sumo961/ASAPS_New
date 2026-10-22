/**
 * Inner voices in a conversation (2026-10-22, The Reliable One): characters
 * marked as an inner voice speak in the player's head, not out loud. While
 * the player is deciding, the renderer shows the exchange since the last line
 * spoken out loud — that line dimmed, then each inner voice's thought below
 * it — and says whom the replies go to ("Reply to Danny").
 *
 * The Dialog Tree publishes it per line as renderer state 'dialogExchange'.
 */
import { resolveCharacter } from '../utils/characterRef';

export interface DialogExchangeLine {
  speaker: string;
  text: string;
  /** Spoken in the player's head (the speaker is an inner voice). */
  inner?: boolean;
  /** The speaker's Theme Color. */
  color?: string;
}

export interface DialogExchange {
  /** Lines of this exchange before the current one, oldest first. */
  earlier: DialogExchangeLine[];
  /** The current line is an inner voice. */
  inner?: boolean;
  color?: string;
  /** Whom the player's replies answer: the last character who spoke out loud. */
  replyTo?: string;
}

/** Beats the player doesn't see; they don't break "the conversation just before". */
const UNSEEN_BEAT_TYPES = new Set([
  'setVariable', 'conditionBeat', 'randomTarget', 'setTimer', 'addRemoveInventory', 'updateAffect',
  'aiCondition', 'setGpsLocation',
]);

function storyOf(context: any): any {
  try { return context?.getStory?.(); } catch { return undefined; }
}

/** Is this speaker an inner voice, and what is their Theme Color? */
export function speakerVoice(context: any, ref: string | null | undefined): { inner: boolean; color?: string } {
  if (!ref) return { inner: false };
  const characters = storyOf(context)?.getCharacters?.() as Array<any> | undefined;
  const id = context?.resolveCharacterId?.(ref) ?? null;
  const character = id
    ? characters?.find((c) => c?.id === id)
    : resolveCharacter(ref, characters);
  return {
    inner: character?.innerVoice === true,
    ...(typeof character?.color === 'string' && character.color ? { color: character.color } : {}),
  };
}

/**
 * The last line spoken out loud in the conversation the player came from,
 * when it came directly before this beat (logic beats in between don't
 * count): an inner voice opening a new beat still answers to it.
 * `answered`: the player has replied since — the speaker is still the one
 * the replies go to, but their line is no longer shown.
 */
export function lineCarriedOver(context: any, beatId: string): { line: DialogExchangeLine; answered: boolean } | null {
  const history: string[] = context?.getHistory?.() ?? [];
  const story = storyOf(context);
  let i = history.length - 1;
  if (history[i] === beatId) i--;
  for (; i >= 0; i--) {
    const beat = story?.getBeat?.(history[i]);
    if (beat && UNSEEN_BEAT_TYPES.has(beat.type)) continue;
    break;
  }
  if (i < 0) return null;
  const record = (context?.getConversations?.() ?? []).find((c: any) => c.beatId === history[i]);
  const lines: any[] = record?.lines ?? [];
  let answered = false;
  for (let k = lines.length - 1; k >= 0; k--) {
    const line = lines[k];
    if (line.fromPlayer) { answered = true; continue; }
    const voice = speakerVoice(context, line.characterId || line.speaker);
    if (!voice.inner) return { line: { speaker: line.speaker, text: line.text, ...(voice.color ? { color: voice.color } : {}) }, answered };
  }
  return null;
}

/**
 * The exchange to show with the current line, given the lines before it.
 * `addressee`: who the replies go to when no earlier line says (the player
 * already answered them in the conversation before).
 */
export function exchangeFor(earlier: DialogExchangeLine[], current: { inner: boolean; color?: string }, addressee?: string): DialogExchange | undefined {
  if (!current.inner && earlier.length === 0) return undefined;
  const replyTo = [...earlier].reverse().find((l) => !l.inner)?.speaker ?? addressee;
  return {
    earlier,
    ...(current.inner ? { inner: true } : {}),
    ...(current.color ? { color: current.color } : {}),
    ...(current.inner && replyTo ? { replyTo } : {}),
  };
}
