import { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { MultiChoiceOption, MultiChoiceParameters } from '../generated/beat-types';
import { migrateChoiceEffects } from '../migration/effectsMigration';

/**
 * MultiChoice — NPC prompt + several response buttons in one beat.
 *
 * Simpler than DialogTree (no node nesting, no follow-up turns) and more
 * powerful than the legacy ConversationChoice (full per-choice effect /
 * condition surface — same as MovementChoice / DialogTree choices). Sits
 * in the "Multi Choice → Buttons" sub-group as the no-frills baseline.
 *
 * Renders via the existing two-call IRenderer surface:
 *   1. renderDialog(speaker, question) — show the prompt text
 *   2. renderChoices(choices)          — show the buttons
 *
 * No spatial layer; no hotspot variant — for spatial picks use
 * MovementChoice; for back-and-forth dialog use DialogTree.
 */
/** Layout templates available on MultiChoice. chat-scroll is intentionally
 *  excluded — MultiChoice is single-screen by design; chat-scroll's
 *  scrollable history concept only makes sense on DialogTree. */
export type MultiChoiceLayoutTemplate = 'stacked' | 'conversation' | 'chat-bubble' | 'custom';

function normalizeLayoutTemplate(v: unknown): MultiChoiceLayoutTemplate {
  if (v === 'stacked' || v === 'conversation' || v === 'chat-bubble' || v === 'custom') {
    return v;
  }
  return 'stacked';
}

export class MultiChoiceBeat extends Beat {
  public question: string;
  public choices: MultiChoiceOption[];
  public choiceDelay?: number;
  public markVisited?: boolean;
  public layoutTemplate: MultiChoiceLayoutTemplate;

  constructor(config: BeatConfig & {
    parameters?: Partial<MultiChoiceParameters>;
  } & Partial<MultiChoiceParameters>) {
    super(config);
    this.question = config.question || config.parameters?.question || 'What do you say?';
    this.choices = (config.choices || config.parameters?.choices || []) as MultiChoiceOption[];
    this.choiceDelay = config.choiceDelay ?? config.parameters?.choiceDelay;
    this.markVisited = config.markVisited ?? config.parameters?.markVisited ?? false;
    this.layoutTemplate = normalizeLayoutTemplate(
      (config as any).layoutTemplate ?? config.parameters?.layoutTemplate,
    );

    // Migrate flat counter fields → canonical effects on all choices, same as
    // MovementChoice / DialogTree. No-op when choices already use effects[].
    this.choices.forEach(c => migrateChoiceEffects(c as any));
  }

  getParameters(): Record<string, any> {
    return {
      question: this.question,
      choices: this.choices,
      node: this.node,
      choiceDelay: this.choiceDelay,
      markVisited: this.markVisited,
      layoutTemplate: this.layoutTemplate,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
      speaker: this.speaker,
      showSpeaker: this.showSpeaker,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.question !== undefined) this.question = params.question;
    if (params.choices !== undefined) {
      this.choices = params.choices;
      // Mirror MovementChoiceBeat — rebuild connections from choices so the
      // graph view + analyzer see the targets without a save/reload cycle.
      this.clearConnections();
      for (const choice of this.choices) {
        if (choice.target && choice.target !== '__self__') {
          this.addConnection({
            targetId: choice.target,
            label: choice.text || choice.id,
          });
        }
      }
    }
    if (params.node !== undefined) this.node = params.node;
    if (params.choiceDelay !== undefined) this.choiceDelay = params.choiceDelay;
    if (params.markVisited !== undefined) this.markVisited = params.markVisited;
    if (params.layoutTemplate !== undefined) this.layoutTemplate = normalizeLayoutTemplate(params.layoutTemplate);
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
    if (params.speaker !== undefined) this.speaker = params.speaker;
    if (params.showSpeaker !== undefined) this.showSpeaker = params.showSpeaker;
  }

  /**
   * Dynamic connections from choices (matches MovementChoice / DialogTree).
   * Lets the graph view and analyzers see every reachable target without
   * needing the beat to be re-saved after a choice edit.
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];
    if (this.choices && Array.isArray(this.choices)) {
      for (const choice of this.choices) {
        if (choice.target && choice.target !== '__self__') {
          connections.push({
            targetId: choice.target,
            label: choice.text || choice.id,
            condition: choice.conditions,
          });
        }
      }
    }
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
      if (!connections.some(c => c.targetId === conn.targetId && c.label === conn.label)) {
        connections.push(conn);
      }
    }
    return connections;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer,
  ): Promise<string | null> {
    // Surface the beat type + chosen layout so the renderer can dispatch
    // into slot-mode (SlotFlowView with dynamicChoices) when in
    // responsive layout. ReactRenderer.renderChoices reads currentBeatType
    // to look up the slot spec; layoutTemplate drives the within-SlotFlowView
    // visual (stacked vs. conversation).
    renderer.setState('currentBeatType', 'multiChoice');
    renderer.setState('layoutTemplate', this.layoutTemplate);

    // chat-bubble template routes through ChatDialogView (same path
    // DialogTree uses). presentationMode is the legacy state key the
    // chat path keys off; we reset it to 'positioned' for non-chat
    // templates so a prior chat beat doesn't strand the renderer in
    // chat mode.
    const isChatMode = this.layoutTemplate === 'chat-bubble';
    renderer.setState('presentationMode', isChatMode ? 'chat-bubble' : 'positioned');
    if (isChatMode) {
      const variables = context.getVariables();
      const playerName = (variables as any).playerName || (variables as any).name || (variables as any).player || 'You';
      renderer.setState('playerName', playerName);
      renderer.setState('responseDelay', 0);
      if (renderer.clearChatHistory) renderer.clearChatHistory();
    }

    // Mark-visited dimming state for the choice renderer.
    renderer.setState('markVisited', this.markVisited || false);
    if (renderer.setVisitedChoiceIds) {
      renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));
    }

    while (true) {
      const availableChoices = this.choices.filter(choice => {
        if (!choice.conditions || choice.conditions.length === 0) return true;
        return choice.conditions.every(condition => context.checkCondition(condition));
      });

      if (availableChoices.length === 0) {
        console.warn(`[MultiChoiceBeat] No available choices for beat ${this.id}`);
        return this.getNextBeat(context);
      }

      const processedSpeaker = this.processText(this.speaker || '', context);
      const processedQuestion = this.processText(this.question, context);

      // Author-baked locations from the Visual Editor. When present, the
      // renderer takes the absolute (fixed-pixel) path and lays the prompt
      // + buttons at the positions the author authored. When absent the
      // renderer falls through to slot mode (responsive). MovementChoice /
      // DialogTree follow the same convention.
      const locations = Array.from(this.locations.values());

      // Render the NPC prompt. We always call renderDialog (even with an
      // empty speaker) so the prompt sits in the dialog/body slot — the
      // same slot DialogTree uses, which is what the responsive layout +
      // theme are built around.
      await renderer.renderDialog(processedSpeaker, processedQuestion, undefined, locations);

      // Optional pre-choice delay (lets the player read the prompt before
      // the buttons fade in). Same convention as MovementChoiceBeat.
      if (this.choiceDelay && this.choiceDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.choiceDelay! * 1000));
      }

      const choiceId = await renderer.renderChoices(
        availableChoices.map(c => ({
          id: c.id,
          text: this.processText(c.text, context),
          // displayText is the translated label; renderer picks it up via
          // the same channel renderChoices already uses for other beats.
        })),
        locations,
      );

      const selected = availableChoices.find(c => c.id === choiceId);
      if (!selected) {
        console.warn(`[MultiChoiceBeat] No matching choice for "${choiceId}" — available: ${availableChoices.map(c => c.id).join(', ')}`);
        break;
      }

      // Visited tracking + AI context, same as MovementChoice / DialogTree.
      context.markChoiceVisited(this.id, selected.id);
      if (renderer.setVisitedChoiceIds) {
        renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));
      }
      context.recordChoice({
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'multiChoice',
        choiceText: selected.text,
        choiceContext: this.question,
      });

      // Apply effects from the selected choice (canonical effects array;
      // migrated from any flat counter fields in the constructor).
      if (selected.effects && selected.effects.length > 0) {
        selected.effects.forEach(effect => context.applyEffect(effect));
      }

      // Per-choice sound effect (optional).
      if (selected.soundEffect && renderer.playSound) {
        await renderer.playSound({ file: selected.soundEffect });
      }

      if (selected.target === '__self__') {
        // Loop back to re-render with updated visited / state.
        continue;
      }

      return selected.target;
    }

    return this.getNextBeat(context);
  }
}
