/**
 * Tests for the Ideator system-prompt builders. These prompts control
 * Claude's behavior during ideation interviews + synthesis. Editing
 * either silently changes the conversational behavior of the live
 * Ideator feature — pin the load-bearing instructions so a reword
 * doesn't accidentally drop them.
 *
 * Coverage focus:
 *   - READINESS_MARKER exact value (parsed by useIdeator to surface
 *     the "Generate Prompt" button — changing breaks the UI link)
 *   - buildInterviewSystemPrompt structure: role intro, IDN
 *     principles section, optional tool-use instructions when
 *     webSearchAvailable
 *   - tool-use block includes the "error honesty" + "do research
 *     when asked" load-bearing rules (the Ideator anti-paraphrase
 *     policy)
 *   - readiness signaling instructions present (the marker
 *     emission protocol)
 *   - "do not lecture about role" / "do not produce plot" guards
 *   - buildSynthesisSystemPrompt enforces single-JSON-object output
 *   - synthesis schema mentions every field downstream consumes
 *   - length/complexity/affectDepth defaults guarded against
 *     reflexive "auto"/"medium"
 */
import { describe, it, expect } from 'vitest';
import {
  READINESS_MARKER,
  buildInterviewSystemPrompt,
  buildSynthesisSystemPrompt,
} from '../systemPrompt';

describe('READINESS_MARKER', () => {
  it('is "<<IDEATOR_READY>>" (parsed by useIdeator)', () => {
    // EXACT match — useIdeator uses .includes(READINESS_MARKER)
    // to surface the "Generate Prompt" button. Any rename
    // silently breaks the UI link.
    expect(READINESS_MARKER).toBe('<<IDEATOR_READY>>');
  });
});

describe('buildInterviewSystemPrompt', () => {
  describe('always-included instructions', () => {
    const prompt = buildInterviewSystemPrompt({});

    it('introduces the Ideator role to Claude', () => {
      expect(prompt).toContain('You are Ideator');
      expect(prompt).toContain('ASAPS');
    });

    it('describes the author audience (may have no IDN experience)', () => {
      // Critical UX context: tells Claude not to lecture about IDN.
      expect(prompt).toMatch(/may have (little|no) (or no )?experience/i);
    });

    it('includes the IDN complexity principles section', () => {
      // The principles are pulled from a separate module — pinning
      // a stable marker substring catches accidental removal of
      // the interpolation.
      expect(prompt).toContain('IDN');
    });

    it('embeds the HOW TO CONVERSE section', () => {
      expect(prompt).toContain('HOW TO CONVERSE');
    });

    it('demands ONE question per turn (anti-stacking guard)', () => {
      // The most-violated rule by base Claude — make sure it's
      // not lost in any reword.
      expect(prompt).toMatch(/ONE focused question per turn/i);
      expect(prompt).toMatch(/Do not stack multiple questions/i);
    });

    it('keeps responses short (anti-essay guard)', () => {
      // "Good thesis advisor in conversation, not essay" — a
      // memorable framing that should survive future edits.
      expect(prompt).toMatch(/short/i);
      expect(prompt).toMatch(/Two or three sentences/i);
    });

    it('describes WHEN TO SIGNAL READINESS', () => {
      expect(prompt).toContain('WHEN TO SIGNAL READINESS');
    });

    it('includes the readiness marker on its own line', () => {
      // Claude must emit the marker exactly so useIdeator can
      // parse it out. Embedding the literal in the prompt is
      // self-referential — Claude sees the string and echoes it.
      expect(prompt).toContain(READINESS_MARKER);
    });

    it('mentions the author override (author can signal readiness early)', () => {
      // The "author's signal overrides yours" clause prevents
      // Claude from refusing to wrap up when the author is done.
      // [\s\S] handles the possible newline between "author's" and
      // "overrides" in source-wrapped prompt strings.
      expect(prompt).toMatch(/author[\s\S]{0,40}overrides/i);
    });

    it('forbids re-asking the same question with different wording', () => {
      // The "worst failure mode" rule.
      expect(prompt).toMatch(/Do not loop back/i);
    });

    it('has a WHAT NOT TO DO section', () => {
      expect(prompt).toContain('WHAT NOT TO DO');
    });

    it('forbids producing plot / beat list during interview', () => {
      // Critical scope guard — Claude likes to start writing
      // stories.
      expect(prompt).toMatch(/Do not produce a story/i);
    });

    it('forbids talking about ASAPS internals (beat types, XML)', () => {
      // The author may never have seen those terms.
      expect(prompt).toMatch(/Do not talk about ASAPS internals/i);
    });

    it('forbids deflecting research requests with role-lecturing', () => {
      // Specifically pin the "help comes first; framing comes
      // after" policy — a frequent failure mode where the model
      // refuses a tool-use request by appealing to its scope.
      expect(prompt).toMatch(/Do not lecture/i);
      expect(prompt).toMatch(/Help comes first/i);
    });
  });

  describe('webSearch toggle', () => {
    it('omits the WEB SEARCH section when webSearchAvailable is false / unset', () => {
      const off = buildInterviewSystemPrompt({});
      expect(off).not.toContain('TOOL: WEB SEARCH');
      const explicitlyOff = buildInterviewSystemPrompt({ webSearchAvailable: false });
      expect(explicitlyOff).not.toContain('TOOL: WEB SEARCH');
    });

    it('includes the WEB SEARCH section when webSearchAvailable is true', () => {
      const on = buildInterviewSystemPrompt({ webSearchAvailable: true });
      expect(on).toContain('TOOL: WEB SEARCH');
    });

    it('the web-search section instructs running multiple queries when asked to research broad topics', () => {
      // The "do the research first" policy — pinned because
      // base Claude tends to ask clarifying questions instead.
      const on = buildInterviewSystemPrompt({ webSearchAvailable: true });
      expect(on).toMatch(/Run multiple queries/i);
    });

    it('the web-search section has the ERROR HONESTY policy', () => {
      // Critical anti-paraphrase rule: the executor preserves
      // verbatim error messages, but Claude must also surface them
      // verbatim — not say "the tool is having a hiccup".
      const on = buildInterviewSystemPrompt({ webSearchAvailable: true });
      expect(on).toContain('ERROR HONESTY');
      expect(on).toMatch(/verbatim/i);
      expect(on).toMatch(/hiccup/i); // the specific anti-pattern mentioned
    });

    it('forbids using the tool for story plots / generic creativity prompts', () => {
      const on = buildInterviewSystemPrompt({ webSearchAvailable: true });
      expect(on).toMatch(/Do NOT use the tool to fetch story plots/i);
    });

    it('forbids dumping raw results without weaving into the next question', () => {
      const on = buildInterviewSystemPrompt({ webSearchAvailable: true });
      expect(on).toMatch(/weave findings into/i);
    });
  });
});

describe('buildSynthesisSystemPrompt', () => {
  const prompt = buildSynthesisSystemPrompt();

  it('describes the synthesis stage', () => {
    expect(prompt).toContain('synthesis stage');
  });

  it('demands a single JSON object output (no prose, no markdown fences)', () => {
    // The downstream parses this as JSON. Markdown fences or
    // prose would break the parse silently.
    expect(prompt).toMatch(/JSON object/);
    expect(prompt).toMatch(/no prose, no\s*markdown fences/);
  });

  describe('schema field coverage', () => {
    // Every field downstream consumes must be in the schema spec
    // — pinning catches silent drops in future edits.
    const fields = ['prompt', 'genre', 'length', 'complexity', 'affectDepth', 'includeAIBeats'];
    it.each(fields)('mentions the "%s" field', (field) => {
      expect(prompt).toContain(`"${field}"`);
    });
  });

  describe('default-guarding instructions', () => {
    it('warns against reflexively defaulting length to "medium"', () => {
      // The reflexive "medium" was a real regression in early
      // versions. Pinned so a future schema clean-up doesn't drop
      // the guard.
      expect(prompt).toMatch(/don't reflexively default/i);
    });

    it('warns against reflexively picking "auto" for affectDepth', () => {
      // Use [\s\S] to span the newline that template literals
      // insert between "don't" and "reflexively" at line wrap.
      expect(prompt).toMatch(/don't[\s\S]{0,15}reflexively pick "auto"/i);
    });

    it('explains the conditions for "long" length (multi-month, 3+ characters)', () => {
      // Specific guidance for the model — pinned so the
      // "rich, multi-character stories" path stays honest.
      expect(prompt).toMatch(/multiple months|seasons/i);
      expect(prompt).toMatch(/3\+ character/);
    });

    it('explains conditions for "rich" affectDepth (mental health, relationships)', () => {
      expect(prompt).toMatch(/mental health|relationships/i);
    });
  });

  it('the prompt-field gets the most attention (most important output)', () => {
    expect(prompt).toMatch(/prompt.{0,40}most important/i);
  });

  it('reminds the model the downstream will NOT see the transcript', () => {
    // Critical: every meaningful decision must survive into the
    // prompt because the generator only sees the prompt.
    expect(prompt).toMatch(/will NOT see/i);
    expect(prompt).toMatch(/transcript/);
  });
});
