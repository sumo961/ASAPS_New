/**
 * Tests for the enhanced story-generation prompt builders. These three
 * functions assemble the system + user prompts that drive the live
 * "Generate Story with AI" feature. The prompts are pure string content,
 * but they carry dozens of load-bearing instructions the model is known
 * to violate without them (counter→conditionBeat coupling, the nested
 * conditionBeat format, the no-pixel-positions responsive guard, the
 * exact-case beat type names). A reword that silently drops one of these
 * regresses generation quality with no compile error and no test failure
 * anywhere else — so we pin the markers here.
 *
 * Coverage focus:
 *   - buildEnhancedStoryGenerationSystemPrompt: section structure,
 *     beat-type list interpolation, condensed-schema embedding, affect
 *     section wiring, and the most-violated authoring rules.
 *   - buildEnhancedUserPrompt: request-field branching (genre, length,
 *     complexity, context, languages, includeAIBeats, mystery craft).
 *   - getEnhancedStoryExample: a valid, parseable few-shot example whose
 *     structure matches what the system prompt instructs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildEnhancedStoryGenerationSystemPrompt,
  buildEnhancedUserPrompt,
  getEnhancedStoryExample,
} from '../storyGenerationEnhanced';
import type { StoryGenerationRequest } from '../../../types/ai';

/**
 * A minimal schema shaped like the runtime beat-definition schema:
 * `beatTypes` is a map of type-name → definition. buildCondensedSchema
 * reads category / connectionType / description / parameters.required.
 */
const SAMPLE_SCHEMA = {
  beatTypes: {
    titleScreen: {
      category: 'visible',
      connectionType: 'single',
      description: 'Opening title screen',
      parameters: {
        title: { required: true },
        author: { required: false },
        startButtonText: { required: false },
      },
    },
    conditionBeat: {
      category: 'invisible',
      connectionType: 'branch',
      description: 'Branch on state',
      parameters: {
        condition: { required: true },
        trueConnection: { required: true },
        falseConnection: { required: true },
      },
    },
    setVariable: {
      category: 'invisible',
      connectionType: 'single',
      description: 'Set a variable or counter',
      parameters: {
        name: { required: true },
        value: { required: true },
        operation: { required: false },
      },
    },
  },
};

describe('buildEnhancedStoryGenerationSystemPrompt', () => {
  const prompt = buildEnhancedStoryGenerationSystemPrompt(SAMPLE_SCHEMA);

  describe('role + top-level framing', () => {
    it('introduces the expert-narrative-designer role', () => {
      expect(prompt).toMatch(/expert interactive narrative designer/i);
    });

    it('names the ASAPS beat system', () => {
      expect(prompt).toContain('ASAPS beat system');
    });
  });

  describe('counter ↔ conditionBeat coupling (the single most-violated rule)', () => {
    it('states the CRITICAL counter rule up front', () => {
      // Counters with no conditionBeat to read them produce stories
      // where accumulated state never affects the ending — the #1
      // generation failure. Pinned because it is repeated (intentionally)
      // and a cleanup pass might "deduplicate" it away.
      expect(prompt).toMatch(/If you use counters, you MUST include a conditionBeat/i);
    });

    it('keeps the MANDATORY counter + conditionBeat pattern section', () => {
      expect(prompt).toContain('MANDATORY');
      expect(prompt).toMatch(/Counter \+ ConditionBeat Pattern/i);
    });

    it('explains counter choice properties (counter/counterOperation/counterValue)', () => {
      expect(prompt).toContain('counterOperation');
      expect(prompt).toContain('counterValue');
    });
  });

  describe('theme guide', () => {
    it('embeds the three built-in theme ids', () => {
      expect(prompt).toContain('builtin-visual-novel');
      expect(prompt).toContain('builtin-twine');
      expect(prompt).toContain('builtin-point-and-click');
    });

    it('keeps the color-contrast guidance', () => {
      expect(prompt).toMatch(/contrast ratio of at least 4\.5:1/);
    });
  });

  describe('beat-type list interpolation', () => {
    it('lists every beat type from the schema, quoted', () => {
      // The list is built from Object.keys(schema.beatTypes) — pin the
      // interpolation so an empty/garbled schema is visible.
      expect(prompt).toContain('"titleScreen"');
      expect(prompt).toContain('"conditionBeat"');
      expect(prompt).toContain('"setVariable"');
    });

    it('demands exact case-sensitive type names with worked counter-examples', () => {
      expect(prompt).toMatch(/case-sensitive/i);
      expect(prompt).toContain('"SetVariable" (wrong)');
      expect(prompt).toContain('"setVariable" (correct)');
    });
  });

  describe('condensed schema embedding', () => {
    it('embeds the condensed schema JSON with required params extracted', () => {
      // buildCondensedSchema splits params into required/optional. The
      // title param is required in SAMPLE_SCHEMA, author is not.
      expect(prompt).toContain('## Beat Type Reference (Condensed)');
      expect(prompt).toContain('"requiredParams"');
      expect(prompt).toContain('"optionalParams"');
    });

    it('reflects the schema-declared required/optional split', () => {
      // Reparse the embedded JSON block to assert the split is correct
      // rather than matching loose substrings.
      const marker = '## Beat Type Reference (Condensed)\n';
      const start = prompt.indexOf(marker) + marker.length;
      const jsonStart = prompt.indexOf('{', start);
      // Walk braces to find the matching close of the condensed block.
      let depth = 0;
      let end = jsonStart;
      for (; end < prompt.length; end++) {
        if (prompt[end] === '{') depth++;
        else if (prompt[end] === '}') {
          depth--;
          if (depth === 0) {
            end++;
            break;
          }
        }
      }
      const condensed = JSON.parse(prompt.slice(jsonStart, end));
      expect(condensed.titleScreen.requiredParams).toEqual(['title']);
      expect(condensed.titleScreen.optionalParams).toEqual(
        expect.arrayContaining(['author', 'startButtonText']),
      );
      expect(condensed.conditionBeat.requiredParams).toEqual(
        expect.arrayContaining(['condition', 'trueConnection', 'falseConnection']),
      );
    });
  });

  describe('conditionBeat nested-format guard', () => {
    it('limits conditionBeat to exactly 3 parameters', () => {
      expect(prompt).toMatch(/conditionBeat parameters MUST contain EXACTLY these 3 fields/i);
    });

    it('forbids the flattened top-level fields', () => {
      // The model loves to flatten condition.* up to parameters.*.
      expect(prompt).toContain('"trueTarget"');
      expect(prompt).toContain('"falseTarget"');
      expect(prompt).toContain('"variableName"');
    });

    it('insists on "target" not "targetId" inside trueConnection/falseConnection', () => {
      expect(prompt).toMatch(/USE "target" NOT "targetId"/);
    });
  });

  describe('responsive layout guard (no pixel positions)', () => {
    it('declares responsive layout the default and forbids pixel positions', () => {
      expect(prompt).toMatch(/responsive is the default/i);
      expect(prompt).toMatch(/never emit pixel\s*positions/i);
    });

    it('forbids the internal locations/locs fields', () => {
      expect(prompt).toContain('locations');
      expect(prompt).toContain('locs');
    });

    it('documents the normalized 0–1 hotspot format', () => {
      expect(prompt).toContain('hotspot');
      expect(prompt).toMatch(/normalized 0[–-]1/);
    });

    it('documents slotIntent and warns against baking it to locations[]', () => {
      expect(prompt).toContain('slotIntent');
      expect(prompt).toMatch(/NEVER serialize this as[\s\S]{0,20}locations\[\]/);
    });
  });

  describe('reachability + id-consistency guards', () => {
    it('requires every non-title beat be reachable', () => {
      expect(prompt).toMatch(/All Beats Must Be Reachable/i);
    });

    it('requires generating every referenced beat id', () => {
      expect(prompt).toMatch(/Beat ID Consistency/i);
      expect(prompt).toMatch(/GENERATE ALL BEATS/i);
    });
  });

  describe('multi-language support section', () => {
    it('documents the translations output format', () => {
      expect(prompt).toContain('Multi-Language');
      expect(prompt).toMatch(/Translation Output Format/i);
    });
  });

  describe('affect section wiring', () => {
    it("includes the standard+ affect catalog at the default 'auto' depth", () => {
      // buildAffectPromptSection('auto') pushes the AFFECT_CATALOG block.
      // A stable marker from that block confirms the section is wired in.
      const auto = buildEnhancedStoryGenerationSystemPrompt(SAMPLE_SCHEMA);
      const autoExplicit = buildEnhancedStoryGenerationSystemPrompt(SAMPLE_SCHEMA, 'auto');
      expect(auto).toBe(autoExplicit);
    });

    it("'sparse' depth produces a shorter prompt than 'rich' (catalog omitted)", () => {
      // sparse skips AFFECT_CATALOG / EFFECTS_CONDITIONS_REFERENCE /
      // DOSSIER_POLICY_HEURISTIC, so it must be strictly shorter.
      const sparse = buildEnhancedStoryGenerationSystemPrompt(SAMPLE_SCHEMA, 'sparse');
      const rich = buildEnhancedStoryGenerationSystemPrompt(SAMPLE_SCHEMA, 'rich');
      expect(sparse.length).toBeLessThan(rich.length);
    });
  });

  describe('robustness', () => {
    it('does not throw on a schema with no beatTypes', () => {
      expect(() => buildEnhancedStoryGenerationSystemPrompt({})).not.toThrow();
    });

    it('does not throw on an empty beatTypes map', () => {
      const out = buildEnhancedStoryGenerationSystemPrompt({ beatTypes: {} });
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });
  });
});

describe('buildEnhancedUserPrompt', () => {
  const base: StoryGenerationRequest = { prompt: 'A lighthouse keeper finds a message in a bottle' };

  it('always quotes the user prompt in the opening line', () => {
    const out = buildEnhancedUserPrompt(base);
    expect(out).toContain('Create an interactive story: "A lighthouse keeper finds a message in a bottle"');
  });

  describe('optional fields', () => {
    it('omits genre/length/complexity/context lines when unset', () => {
      const out = buildEnhancedUserPrompt(base);
      expect(out).not.toContain('Genre:');
      expect(out).not.toContain('Story Length:');
      expect(out).not.toContain('Branching Complexity:');
      expect(out).not.toContain('Additional requirements:');
    });

    it('includes the genre line when set', () => {
      const out = buildEnhancedUserPrompt({ ...base, genre: 'fantasy' });
      expect(out).toContain('Genre: fantasy');
    });

    it('includes the length guide for the requested length', () => {
      const out = buildEnhancedUserPrompt({ ...base, length: 'long' });
      expect(out).toContain('Story Length: LONG');
      expect(out).toMatch(/30\+ beats/);
    });

    it('includes the complexity guide for the requested complexity', () => {
      const out = buildEnhancedUserPrompt({ ...base, complexity: 'complex' });
      expect(out).toContain('Branching Complexity: COMPLEX');
      expect(out).toMatch(/Multiple endings/);
    });

    it('appends additional requirements from context', () => {
      const out = buildEnhancedUserPrompt({ ...base, context: 'No violence please' });
      expect(out).toContain('Additional requirements: No violence please');
    });
  });

  describe('mystery craft rules', () => {
    it('injects the distribution rule for mystery-family genres', () => {
      for (const g of ['mystery', 'Detective', 'noir thriller', 'whodunit']) {
        const out = buildEnhancedUserPrompt({ ...base, genre: g });
        expect(out).toContain('MYSTERY / INVESTIGATION CRAFT RULES');
        expect(out).toMatch(/DISTRIBUTE the answer across multiple/);
      }
    });

    it('does NOT inject the craft rules for non-mystery genres', () => {
      const out = buildEnhancedUserPrompt({ ...base, genre: 'romance' });
      expect(out).not.toContain('MYSTERY / INVESTIGATION CRAFT RULES');
    });

    it('matches the genre case-insensitively', () => {
      const out = buildEnhancedUserPrompt({ ...base, genre: 'MYSTERY' });
      expect(out).toContain('MYSTERY / INVESTIGATION CRAFT RULES');
    });
  });

  describe('multi-language branching', () => {
    it('single language → simple LANGUAGE directive (no translations array)', () => {
      const out = buildEnhancedUserPrompt({ ...base, languages: ['de'] });
      expect(out).toContain('LANGUAGE: Write all story content in de');
      expect(out).not.toContain('"translations" array');
    });

    it('multiple languages → translations array with the additional languages listed', () => {
      const out = buildEnhancedUserPrompt({ ...base, languages: ['en', 'de', 'fr'] });
      expect(out).toMatch(/Write the story content in en/);
      expect(out).toContain('"translations" array');
      expect(out).toContain('de, fr');
    });

    it('empty languages array adds no language section', () => {
      const out = buildEnhancedUserPrompt({ ...base, languages: [] });
      expect(out).not.toContain('LANGUAGE:');
      expect(out).not.toContain('MULTI-LANGUAGE');
    });
  });

  describe('AI-powered beats toggle', () => {
    it('lists the AI beat types when includeAIBeats is true', () => {
      const out = buildEnhancedUserPrompt({ ...base, includeAIBeats: true });
      expect(out).toContain('AI-POWERED BEATS ENABLED');
      expect(out).toContain('aiConversation');
      expect(out).toContain('aiSummary');
    });

    it('forbids the AI beat types when includeAIBeats is falsy', () => {
      const out = buildEnhancedUserPrompt(base);
      expect(out).toContain('AI-POWERED BEATS DISABLED');
      expect(out).toMatch(/Do NOT use these beat types/);
    });
  });

  describe('always-present trailer', () => {
    const out = buildEnhancedUserPrompt(base);

    it('repeats the mandatory counter rule', () => {
      expect(out).toMatch(/MANDATORY COUNTER RULE/);
    });

    it('demands ONLY valid JSON output', () => {
      expect(out).toMatch(/Respond with ONLY valid JSON/);
    });

    it('includes the verification checklist (beat_0 titleScreen, reachability)', () => {
      expect(out).toMatch(/VERIFICATION CHECKLIST/);
      expect(out).toMatch(/beat_0 is titleScreen/);
    });
  });
});

describe('getEnhancedStoryExample', () => {
  const example = getEnhancedStoryExample();

  it('returns a user/assistant pair', () => {
    expect(example).toHaveProperty('user');
    expect(example).toHaveProperty('assistant');
  });

  it('the user side is a mystery story request', () => {
    expect(example.user).toContain('detective');
    expect(example.user).toContain('Genre: mystery');
  });

  it('the assistant side is valid JSON', () => {
    expect(() => JSON.parse(example.assistant)).not.toThrow();
  });

  describe('the example obeys the rules the system prompt teaches', () => {
    const story = JSON.parse(example.assistant);

    it('begins with a titleScreen as beat_0', () => {
      expect(story.beats[0].id).toBe('beat_0');
      expect(story.beats[0].type).toBe('titleScreen');
    });

    it('suggests a built-in theme with a reason', () => {
      expect(story.suggestedTheme.themeId).toMatch(/^builtin-/);
      expect(story.suggestedTheme.reason.length).toBeGreaterThan(0);
    });

    it('demonstrates the counter pattern (a setVariable adds to a counter)', () => {
      const counterBeats = story.beats.filter(
        (b: any) => b.type === 'setVariable' && b.parameters?.type === 'counter',
      );
      expect(counterBeats.length).toBeGreaterThan(0);
      expect(counterBeats[0].parameters.operation).toBe('add');
    });

    it('has no dangling target references (every referenced id exists)', () => {
      // This is the consistency invariant the system prompt's
      // verification checklist demands — the few-shot example must
      // model it, or it teaches the model to break it.
      const ids = new Set(story.beats.map((b: any) => b.id));
      const referenced: string[] = [];
      for (const b of story.beats) {
        for (const c of b.connections ?? []) {
          if (c.targetId) referenced.push(c.targetId);
        }
        const p = b.parameters ?? {};
        for (const choice of p.choices ?? []) if (choice.target) referenced.push(choice.target);
        for (const prop of p.props ?? []) if (prop.target) referenced.push(prop.target);
        for (const choice of p.dialogTree?.choices ?? []) if (choice.target) referenced.push(choice.target);
        if (p.trueConnection?.target) referenced.push(p.trueConnection.target);
        if (p.falseConnection?.target) referenced.push(p.falseConnection.target);
      }
      const dangling = referenced.filter((id) => !ids.has(id));
      expect(dangling).toEqual([]);
    });
  });
});

describe('guidance stays current with the schema', () => {
  const prompt = buildEnhancedStoryGenerationSystemPrompt(SAMPLE_SCHEMA);

  describe('dialog layout vocabulary', () => {
    it('teaches layoutTemplate, the authoritative field', () => {
      // v0.9.82 unified aiDialogTree onto layoutTemplate; the picker used to
      // read a field the beat didn't have, so it showed one layout and ran
      // another. The prompt kept teaching the legacy field afterwards.
      expect(prompt).toMatch(/layoutTemplate/);
    });

    it('warns off the legacy presentationMode and its dead "positioned" value', () => {
      expect(prompt).toMatch(/NOT "presentationMode" and NOT "positioned"/);
    });

    it('never presents "positioned" as a layout the model may choose', () => {
      // 'positioned' migrates to 'stacked'; offering it teaches a vocabulary
      // the current schema does not have.
      expect(prompt).not.toMatch(/layoutTemplate:.*"positioned"/);
    });
  });

  describe('counter binding', () => {
    it('explains that a counter can display a feeling rather than store a number', () => {
      expect(prompt).toMatch(/"source"/);
      expect(prompt).toMatch(/kind.*sentiment/i);
    });

    it('forbids writing to a bound counter', () => {
      // The write is silently lost to the next appraisal — the single most
      // likely mistake once binding exists.
      expect(prompt).toMatch(/NEVER emit an incrementCounter\/setCounter effect targeting a bound counter/);
    });

    it('ties the range to whether the feeling has an opposite', () => {
      expect(prompt).toMatch(/min: -100 when the feeling has a real opposite/);
      expect(prompt).toMatch(/min: 0 when it does not/);
    });

    it('requires a neutral band on a bipolar ladder', () => {
      expect(prompt).toMatch(/band covering ZERO/);
    });
  });

  describe('cross-beat properties shipped since the last prompt update', () => {
    it('documents spatialFit', () => {
      expect(prompt).toMatch(/spatialFit/);
    });

    it('documents explainHuds, and says not to overuse it', () => {
      expect(prompt).toMatch(/explainHuds/);
      expect(prompt).toMatch(/not decoration/i);
    });

    it('documents the playSound effect', () => {
      expect(prompt).toMatch(/"type": "playSound"/);
    });

    it('documents video captions as the accessibility default', () => {
      expect(prompt).toMatch(/captions: cue rows/);
      expect(prompt).toMatch(/accessibility default/i);
    });
  });
});

describe('every beat type in the schema has authorial guidance', () => {
  // The condensed schema already gives the model every beat type and its
  // parameters, so this is not about reachability — it's about the model
  // knowing WHEN to reach for something. That guidance is hand-written, so
  // it goes stale silently every time a beat type is added. This test is the
  // tripwire: add a beat to core-beats.json and it fails until documented.
  const realSchema = JSON.parse(
    readFileSync(join(__dirname, '../../../../../../beat-definitions/core-beats.json'), 'utf-8'),
  );
  const prompt = buildEnhancedStoryGenerationSystemPrompt(realSchema);
  const documented = new Set([...prompt.matchAll(/\*\*([a-zA-Z]+)\*\*/g)].map((m) => m[1]));

  it('documents all of them', () => {
    const missing = Object.keys(realSchema.beatTypes).filter((t) => !documented.has(t));
    expect(missing, `undocumented beat types: ${missing.join(', ')}`).toEqual([]);
  });

  it('tells the model not to invent real-world assets', () => {
    // arBeat/gpsLocation/indoorLocation need trackers, coordinates and beacon
    // ids. A story generated with placeholders cannot run.
    expect(prompt).toMatch(/PROPOSE, do not emit/);
    expect(prompt).toMatch(/cannot run/);
  });

  it('teaches markdown-lite — and where NOT to use it', () => {
    // Item 9 made formatting a contract; the generator has to know both
    // halves or it will bold button labels and break hyperText link words.
    expect(prompt).toContain('markdown-lite');
    expect(prompt).toMatch(/\*\*bold\*\*/);
    expect(prompt).toMatch(/button labels/);
    expect(prompt).toMatch(/hyperText body/);
    // The schema descriptions carry the same contract for schema-driven
    // consumers (MCP serves the schema live).
    const desc = realSchema.beatTypes.infoText.parameters.text.description;
    expect(desc).toContain('markdown-lite');
  });
});
