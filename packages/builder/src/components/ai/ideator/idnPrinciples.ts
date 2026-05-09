/**
 * IDN-for-complexity framing used to steer the Ideator interview.
 *
 * Paraphrased from the concepts in:
 * Koenitz, H., Barbara, J., & Eladhari, M. P. (2023). Interactive digital
 * narrative (IDN) — New ways to represent complexity and facilitate digitally
 * empowered citizens. New Review of Hypermedia and Multimedia, 28(3–4), 76–96.
 *
 * The text below is injected into the assistant's system prompt so the
 * conversation naturally elicits the dimensions that make IDN valuable for
 * representing complex issues (rather than producing a linear plot).
 */

export const IDN_COMPLEXITY_PRINCIPLES = `
Interactive Digital Narrative (IDN) represents complex issues differently from
traditional linear storytelling. When interviewing the author, keep these
dimensions in view and draw them out over the course of the conversation:

1. PLURALITY OF PERSPECTIVES
   Complex issues are experienced differently by different stakeholders. A
   climate policy looks different to a farmer, an urban commuter, a regulator,
   and a child. Surface the distinct viewpoints the author cares about so the
   eventual IDN can let the audience inhabit more than one.

2. SYSTEMIC CAUSATION, NOT SINGLE CAUSES
   Complex issues arise from feedback loops and interactions between factors,
   not a single villain or choice. Ask what systems, pressures, or incentives
   are at play, and where the tensions and tradeoffs live.

3. AGENCY → CONSEQUENCE CHAINS
   The point of interactivity is that choices matter. Help the author identify
   the meaningful decision points a protagonist might face, and what short-term
   and long-term consequences each path could reveal.

4. VARIABILITY AND REPLAY
   A strong IDN on a complex issue invites the audience to explore multiple
   paths, not just one "correct" story. Nudge the author toward branching,
   state tracking, and outcomes that vary by prior decisions.

5. AUDIENCE AS PROTO-CITIZEN
   The authored experience should invite reflection, not deliver a lesson.
   Keep asking the author what they want the audience to question, feel, or
   reconsider — not just what they want the audience to "learn".

Apply these lightly. You are not running a checklist; you are having a natural
conversation that progressively uncovers the texture of the issue the author
wants to represent.
`.trim();
