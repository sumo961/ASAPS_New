/**
 * Tests for PlayerContextBuilder — assembles structured player-state
 * context for AI beat prompts (AIConditionBeat / AISummaryBeat /
 * OnlineContentBeat / AIDialogTreeBeat) and the "tell the AI what
 * happened in this story" journey-summary mode.
 *
 * Coverage focus:
 *   - buildContext defaults (variables/inventory/counters on; history
 *     and choiceHistory off — they're heavy and not every AI call
 *     wants them)
 *   - filter-by-name lists for variables and counters (empty array
 *     means "include all"; non-empty means "include only these")
 *   - maxHistoryItems / maxChoiceItems truncation (taking the tail
 *     so we keep the most recent context)
 *   - buildPromptContext section headers + formatting (variables
 *     line by line, inventory comma-joined with quantities only
 *     when > 1, character inventories nested)
 *   - buildPromptContext skips sections when their data is empty
 *     (no zombie "Player Inventory: " header with nothing after)
 *   - buildJourneySummary structure (journey stats, profile vars,
 *     counters, inventory, choice list, journey path, the explicit
 *     "no AI discussions" footer note for the AI)
 */
import { describe, it, expect } from 'vitest';
import { PlayerContextBuilder } from '../../src/utils/PlayerContextBuilder';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

/**
 * Build a fully populated context for the integration-style tests.
 * Variables / counters / inventory / visited beats / choices.
 */
function makeRichContext(): StoryContext {
  const ctx = new StoryContext();
  const story = new Story({ title: 'T', author: 'T', firstBeatId: 'intro' });
  story.addBeat(createTestBeat({
    id: 'intro', name: 'Intro', type: 'titleScreen', parameters: { title: 'x' },
  }));
  story.addBeat(createTestBeat({
    id: 'forest', name: 'Forest', type: 'infoText', parameters: { text: 'trees' },
  }));
  story.addBeat(createTestBeat({
    id: 'village', name: 'Village', type: 'infoText', parameters: { text: 'people' },
  }));
  ctx.setStory(story);
  ctx.setVariable('playerName', 'Alice');
  ctx.setVariable('mood', 'curious');
  ctx.setCounter('cluesFound', 3);
  ctx.setCounter('reputation', -1);
  ctx.addToInventory('lantern');
  ctx.addToInventory('coin');
  ctx.addToInventory('coin'); // second copy → quantity 2
  ctx.markBeatVisited('intro');
  ctx.markBeatVisited('forest');
  ctx.recordChoice({
    beatId: 'forest',
    beatName: 'Forest',
    beatType: 'dialogTree',
    choiceText: 'Climb the tree',
    choiceContext: 'How do you cross the clearing?',
  });
  return ctx;
}

describe('PlayerContextBuilder', () => {
  describe('buildContext', () => {
    describe('defaults', () => {
      it('includes variables / counters / inventory by default', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext();
        expect(result.variables.playerName).toBe('Alice');
        expect(result.counters.cluesFound).toBe(3);
        expect(result.inventory).toContain('lantern');
      });

      it('excludes history and choiceHistory by default', () => {
        // Heavy fields — the AI call has to opt in. Default to off
        // so a cheap "what's the mood" check doesn't burn tokens.
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext();
        expect(result.history).toEqual([]);
        expect(result.choiceHistory).toBeUndefined();
      });

      it('excludes character inventories by default', () => {
        // Same reason — character-specific inventory is sometimes
        // relevant (gift-giving NPC arc) but usually noise.
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext();
        expect(result.characterInventories).toBeUndefined();
        expect(result.characterInventoriesWithQuantities).toBeUndefined();
      });
    });

    describe('opt-out toggles', () => {
      it('includeVariables:false produces an empty variables map', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ includeVariables: false });
        expect(result.variables).toEqual({});
      });

      it('includeInventory:false yields empty arrays', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ includeInventory: false });
        expect(result.inventory).toEqual([]);
        expect(result.inventoryWithQuantities).toBeUndefined();
      });

      it('includeCounters:false produces an empty counters map', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ includeCounters: false });
        expect(result.counters).toEqual({});
      });
    });

    describe('opt-in toggles', () => {
      it('includeHistory:true returns the tail of beat ids', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ includeHistory: true });
        expect(result.history).toEqual(['intro', 'forest']);
      });

      it('includeChoiceHistory:true returns the choice records', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ includeChoiceHistory: true });
        expect(result.choiceHistory).toHaveLength(1);
        expect(result.choiceHistory![0].choiceText).toBe('Climb the tree');
      });
    });

    describe('filter-by-name lists', () => {
      it('empty variables array includes ALL variables (default)', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ variables: [] });
        expect(Object.keys(result.variables)).toContain('playerName');
        expect(Object.keys(result.variables)).toContain('mood');
      });

      it('non-empty variables array filters to just those names', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ variables: ['playerName'] });
        expect(result.variables).toHaveProperty('playerName', 'Alice');
        expect(result.variables).not.toHaveProperty('mood');
      });

      it('filter list silently skips names that do not exist', () => {
        // Defensive — author might typo a variable name in the
        // filter list. Don't blow up; just return what's there.
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({
          variables: ['playerName', 'doesNotExist'],
        });
        expect(result.variables).toHaveProperty('playerName');
        expect(result.variables).not.toHaveProperty('doesNotExist');
      });

      it('non-empty counters array filters counter list', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext({ counters: ['cluesFound'] });
        expect(result.counters).toHaveProperty('cluesFound', 3);
        expect(result.counters).not.toHaveProperty('reputation');
      });
    });

    describe('truncation', () => {
      it('truncates history to maxHistoryItems (keeping the most recent)', () => {
        const ctx = new StoryContext();
        ctx.setStory(new Story({ title: 'T', author: 'T', firstBeatId: 'b1' }));
        for (let i = 0; i < 10; i++) {
          ctx.markBeatVisited(`beat_${i}`);
        }

        const result = new PlayerContextBuilder(ctx).buildContext({
          includeHistory: true,
          maxHistoryItems: 3,
        });
        // .slice(-3) → the LAST three. Most-recent-first reflects
        // the AI context's "what just happened" semantics.
        expect(result.history).toEqual(['beat_7', 'beat_8', 'beat_9']);
      });

      it('truncates choiceHistory to maxChoiceItems', () => {
        const ctx = new StoryContext();
        ctx.setStory(new Story({ title: 'T', author: 'T', firstBeatId: 'b' }));
        for (let i = 0; i < 5; i++) {
          ctx.recordChoice({
            beatId: `b${i}`, beatName: `B${i}`, beatType: 'multiChoice',
            choiceText: `choice ${i}`,
          });
        }
        const result = new PlayerContextBuilder(ctx).buildContext({
          includeChoiceHistory: true,
          maxChoiceItems: 2,
        });
        expect(result.choiceHistory).toHaveLength(2);
        expect(result.choiceHistory![0].choiceText).toBe('choice 3');
        expect(result.choiceHistory![1].choiceText).toBe('choice 4');
      });
    });

    describe('inventoryWithQuantities', () => {
      it('reports quantities for multi-pickup items', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext();
        const coin = result.inventoryWithQuantities?.find(e => e.name === 'coin');
        expect(coin?.quantity).toBe(2);
      });

      it('single-pickup items have quantity 1', () => {
        const ctx = makeRichContext();
        const result = new PlayerContextBuilder(ctx).buildContext();
        const lantern = result.inventoryWithQuantities?.find(e => e.name === 'lantern');
        expect(lantern?.quantity).toBe(1);
      });
    });
  });

  describe('buildPromptContext', () => {
    it('returns empty string when no context is included', () => {
      // A context where every flag is off, but the underlying ctx
      // is empty too. No sections emitted → empty string.
      const ctx = new StoryContext();
      ctx.setStory(new Story({ title: 'T', author: 'T', firstBeatId: 'b' }));
      const result = new PlayerContextBuilder(ctx).buildPromptContext();
      expect(result).toBe('');
    });

    it('formats the variables section as "  - key: value" lines', () => {
      const ctx = makeRichContext();
      const result = new PlayerContextBuilder(ctx).buildPromptContext();
      expect(result).toContain('Player Variables:');
      expect(result).toMatch(/- playerName: "Alice"/);
      expect(result).toMatch(/- mood: "curious"/);
    });

    it('formats the counters section without JSON-quoting numbers', () => {
      const ctx = makeRichContext();
      const result = new PlayerContextBuilder(ctx).buildPromptContext();
      expect(result).toContain('Counters:');
      // Counter values are raw numbers, not JSON.stringified.
      expect(result).toMatch(/- cluesFound: 3/);
      expect(result).toMatch(/- reputation: -1/);
    });

    it('formats inventory with "(xN)" for quantities > 1', () => {
      const ctx = makeRichContext();
      const result = new PlayerContextBuilder(ctx).buildPromptContext();
      expect(result).toContain('Player Inventory:');
      // coin had 2 picks → "coin (x2)". lantern stays plain.
      expect(result).toContain('coin (x2)');
      expect(result).toContain('lantern');
      // Plain 'lantern' must NOT have "(x" attached.
      expect(result).not.toMatch(/lantern\s*\(x/);
    });

    it('omits the inventory section entirely when inventory is empty', () => {
      // Critical UX detail: a literal "Player Inventory: " line with
      // nothing after is worse than no line — it confuses the AI
      // into thinking the field is meaningful.
      const ctx = new StoryContext();
      ctx.setStory(new Story({ title: 'T', author: 'T', firstBeatId: 'b' }));
      ctx.setVariable('x', '1');
      const result = new PlayerContextBuilder(ctx).buildPromptContext();
      expect(result).not.toContain('Player Inventory');
    });

    it('omits the counters section when counters are empty', () => {
      const ctx = new StoryContext();
      ctx.setStory(new Story({ title: 'T', author: 'T', firstBeatId: 'b' }));
      ctx.setVariable('x', '1');
      const result = new PlayerContextBuilder(ctx).buildPromptContext();
      expect(result).not.toContain('Counters:');
    });

    it('formats choice history as "context → chose text"', () => {
      const ctx = makeRichContext();
      const result = new PlayerContextBuilder(ctx).buildPromptContext({
        includeChoiceHistory: true,
      });
      expect(result).toContain('Player Choices:');
      expect(result).toContain('How do you cross the clearing?');
      expect(result).toContain('Climb the tree');
    });
  });

  describe('buildJourneySummary', () => {
    it('emits the Journey Statistics block', () => {
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx, (ctx as any).getStory()).buildJourneySummary();
      expect(summary).toContain('## Journey Statistics');
      // markBeatVisited('intro') + markBeatVisited('forest') = 2.
      expect(summary).toMatch(/Total beats visited: 2/);
      expect(summary).toMatch(/Choices made: 1/);
    });

    it('extracts profile variables (playerName) into a dedicated Player Profile section', () => {
      // The summary mode treats canonical names (name, playerName,
      // gender, profession, role) as the player profile section, with
      // other variables landing in Story Variables instead.
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx).buildJourneySummary();
      expect(summary).toContain('## Player Profile');
      expect(summary).toContain('playerName: Alice');
    });

    it('puts non-profile variables in Story Variables section', () => {
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx).buildJourneySummary();
      expect(summary).toContain('## Story Variables');
      expect(summary).toContain('- mood: "curious"');
    });

    it('emits Final Counters', () => {
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx).buildJourneySummary();
      expect(summary).toContain('## Final Counters');
      expect(summary).toContain('- cluesFound: 3');
    });

    it('emits Final Inventory with quantities', () => {
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx).buildJourneySummary();
      expect(summary).toContain('## Final Inventory');
      expect(summary).toContain('coin (x2)');
    });

    it('emits the choice list', () => {
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx).buildJourneySummary();
      expect(summary).toContain('## Player Choices (in order)');
      expect(summary).toContain('chose "Climb the tree"');
    });

    it('includes the explicit "no AI discussions" footer note for visited beats', () => {
      // Critical AI-prompting detail: without this footnote, the
      // AI confidently invents conversations that never happened
      // (the "AI car" hallucination the source notes).
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx).buildJourneySummary();
      expect(summary).toContain('## IMPORTANT NOTE');
      expect(summary).toMatch(/Do NOT invent or mention/i);
    });

    it('omits sections when their toggle is false', () => {
      const ctx = makeRichContext();
      const summary = new PlayerContextBuilder(ctx).buildJourneySummary({
        includeVariables: false,
        includeCounters: false,
        includeInventory: false,
        includeChoiceHistory: false,
        includeVisitedBeats: false,
      });
      expect(summary).not.toContain('## Player Profile');
      expect(summary).not.toContain('## Story Variables');
      expect(summary).not.toContain('## Final Counters');
      expect(summary).not.toContain('## Final Inventory');
      expect(summary).not.toContain('## Player Choices');
      expect(summary).not.toContain('## Journey Path');
      // The stats block stays — it's a small header that's always
      // useful regardless of toggles.
      expect(summary).toContain('## Journey Statistics');
    });
  });
});
