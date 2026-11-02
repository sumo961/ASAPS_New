/**
 * Prompt for AI Story Logic: judge a beat's words against the states that
 * actually arrive there. The path simulator worked those states out; the
 * model does not reconstruct the story's logic, it reads text against facts.
 * Written against today's vocabulary (items, variables, counters, feelings,
 * roles): a change to how a story plays updates this in the same change.
 */
import type { StoryLogicKind } from '../../types/storyLogic';

export const STORY_LOGIC_KINDS: StoryLogicKind[] = [
  'assumes-missing-state',
  'contradicts-earlier-text',
  'character-knows-too-much',
  'feeling-mismatch',
  'choice-promise-broken',
  'dangling-reference',
];

export const STORY_LOGIC_SYSTEM_PROMPT = `You check the logic of an interactive story authored in ASAPS. Players reach a beat by different routes, carrying different state. You are given beats, each with its script and the DISTINCT STATES players arrive in, worked out by simulating every path. Those states are facts: never guess at others. "one way here" is one example route into that state, not the only one: a state holds what it lists, so don't conclude the player missed something just because this route doesn't pass it.

Reading a script:
- "Name: text" is a line with its speaker label, which the player sees: a name in a label has been introduced to the player, in this beat and in "before it".
- "Reply: text" is a choice the player can click.
- "[shown only if X]" and "[next line only if X]" are gates. A gated line or reply reaches only players who meet the gate: judge it only against them. Arriving states don't list visited beats, so assume a "visited" gate holds for whoever reads that line.
- Sibling "[next line only if …]" branches are tried in order and the first that matches plays; "[otherwise, next line]" plays only when none did. A player covered by an earlier branch never reads the later ones, so a line under "otherwise" is no problem for them.
- "[this next line never plays…]" marks a line no player reaches: do not judge its words, but the dead line can be reported.
- "[this reply never shows…]" and "[this reply shows only if none of the next lines plays]" mean what they say: a player who gets a next line never sees that reply or anything under it. Judge them only against states where it can show.
- A gate that is itself broken, such as a condition with no beat chosen, can be reported.

Report a finding only where a beat's words do not hold for at least one listed arriving state:
- assumes-missing-state: the text takes for granted an item, knowledge or event that this state lacks ("with the notebook you read" when the state has no notebook).
- contradicts-earlier-text: the text contradicts what the player has just read on the way in (shown as "before it").
- character-knows-too-much: a character refers to something they were not present for or told, in this state.
- feeling-mismatch: the tone of a character's line clashes with their feeling in this state (a warm line at very low trust).
- choice-promise-broken: a choice's words promise something its target beat, shown in "before it" of the next beat or in the digest, does not deliver.
- dangling-reference: a name, object or event mentioned as known, which nothing in this state or the words before it introduces.

Rules:
- Stories can be in any language. Quote in the story's language; write "why" and "suggestion" in the language of the beat.
- "quote" must be copied character for character from the text of a line or reply, as short as still identifies the problem. Do not quote state descriptions, speaker labels or gates.
- "state" is the number of ONE arriving state that breaks the text.
- \${...} placeholders are filled in when the story plays (a character's name, a variable): they are never a problem themselves.
- A generic line that holds for every state is fine. Do not report style, spelling, pacing or plot opinions. Text that hedges ("if you found it…") holds.
- A beat with a single state can still be wrong only if that state contradicts it.
- Severity "problem" when a player in that state would clearly notice; otherwise "worth a look".
- Most beats are fine. An empty list is the expected answer for a well-written batch.

Reply with JSON only: {"findings":[{"beatId":"…","kind":"…","quote":"…","state":0,"why":"one sentence","severity":"problem"|"worth a look","suggestion":"one sentence"}]}`;

export const STORY_LOGIC_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          beatId: { type: 'string' },
          kind: { type: 'string', enum: STORY_LOGIC_KINDS },
          quote: { type: 'string' },
          state: { type: 'integer' },
          why: { type: 'string' },
          severity: { type: 'string', enum: ['problem', 'worth a look'] },
          suggestion: { type: 'string' },
        },
        required: ['beatId', 'kind', 'quote', 'state', 'why', 'severity', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};

/** One beat as the model reads it. */
export interface StoryLogicPromptBeat {
  beatId: string;
  name?: string;
  type: string;
  speaker?: string;
  script: string[];
  arrivingStates: string[];
  before: string[];
}

export function buildStoryLogicUserPrompt(beats: StoryLogicPromptBeat[]): string {
  return JSON.stringify({ beats }, null, 1);
}
