import { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { FREE_LAYOUT_NEXT, FREE_LAYOUT_TIMEOUT } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { FreeLayoutButton, FreeLayoutParameters, FreeLayoutText } from '../generated/beat-types';
import { migrateChoiceEffects } from '../migration/effectsMigration';

/**
 * Free Layout — a screen the author lays out by hand (2026-10-29, class
 * feedback: "an 'empty' beat which would allow to add textboxes, buttons,
 * and graphical elements at will").
 *
 * The stage elements are the beat's locations (text boxes, buttons,
 * pictures, characters) placed in the Visual Editor. The words of a text
 * box are in `texts`, and each button — a text button or a clickable
 * picture — is a choice in `choices`; both name their element by
 * `locationName`. A button leads on like a Multi Choice choice (target,
 * effects, conditions, sound). An optional timer (`duration`) goes on to
 * `timerTarget` by itself; with no buttons and no timer, a click anywhere
 * goes on to `nextTarget`. All links come from the parameters.
 */
export class FreeLayoutBeat extends Beat {
  public texts: FreeLayoutText[];
  public choices: FreeLayoutButton[];
  public duration: number;
  public timerTarget?: string;
  public nextTarget?: string;
  public markVisited: boolean;
  public effectsOncePerChoice: boolean;

  constructor(config: BeatConfig & { parameters?: Partial<FreeLayoutParameters> } & Partial<FreeLayoutParameters>) {
    super(config);
    const p: Partial<FreeLayoutParameters> = { ...(config.parameters || {}), ...config };
    this.texts = Array.isArray(p.texts) ? p.texts : [];
    this.choices = Array.isArray(p.choices) ? p.choices : [];
    this.duration = Number(p.duration) > 0 ? Number(p.duration) : 0;
    this.timerTarget = p.timerTarget || undefined;
    this.nextTarget = p.nextTarget || undefined;
    this.markVisited = !!p.markVisited;
    this.effectsOncePerChoice = !!p.effectsOncePerChoice;
    this.choices.forEach((c) => migrateChoiceEffects(c as any));
  }

  getParameters(): Record<string, any> {
    return {
      texts: this.texts,
      choices: this.choices,
      duration: this.duration,
      timerTarget: this.timerTarget,
      nextTarget: this.nextTarget,
      markVisited: this.markVisited,
      effectsOncePerChoice: this.effectsOncePerChoice,
      node: this.node,
      speaker: this.speaker,
      showSpeaker: this.showSpeaker,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.texts !== undefined) this.texts = Array.isArray(params.texts) ? params.texts : [];
    if (params.choices !== undefined) this.choices = Array.isArray(params.choices) ? params.choices : [];
    if (params.duration !== undefined) this.duration = Number(params.duration) > 0 ? Number(params.duration) : 0;
    if (params.timerTarget !== undefined) this.timerTarget = params.timerTarget || undefined;
    if (params.nextTarget !== undefined) this.nextTarget = params.nextTarget || undefined;
    if (params.markVisited !== undefined) this.markVisited = !!params.markVisited;
    if (params.effectsOncePerChoice !== undefined) this.effectsOncePerChoice = !!params.effectsOncePerChoice;
    if (params.node !== undefined) this.node = params.node;
    if (params.speaker !== undefined) this.speaker = params.speaker;
    if (params.showSpeaker !== undefined) this.showSpeaker = params.showSpeaker;
  }

  /** "Next" (click anywhere) applies only while the beat has no buttons and no timer. */
  get clickAnywhere(): boolean {
    return this.choices.length === 0 && this.duration <= 0;
  }

  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const out: Array<{ targetId: string; label?: string; condition?: any }> = [];
    for (const c of this.choices) {
      if (c.target && c.target !== '__self__') out.push({ targetId: c.target, label: c.text || c.locationName || c.id, condition: c.conditions });
    }
    if (this.duration > 0 && this.timerTarget) out.push({ targetId: this.timerTarget, label: 'When time runs out' });
    if (this.clickAnywhere && this.nextTarget) out.push({ targetId: this.nextTarget, label: 'Next' });
    return out;
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    renderer.setState('currentBeatType', this.type || 'freeLayout');
    renderer.setState('markVisited', this.markVisited);
    if (renderer.setVisitedChoiceIds) renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));

    const locations = Array.from(this.locations.values());
    let unlinkedPicks = 0;
    while (true) {
      const buttons = this.choices.filter((c) => !c.conditions?.length || c.conditions.every((cond) => context.checkCondition(cond)));
      const texts: Record<string, string> = {};
      for (const t of this.texts) if (t?.locationName) texts[t.locationName] = this.processText(t.displayText || t.text || '', context);
      for (const b of buttons) if (b.locationName) texts[b.locationName] = this.processText(b.displayText || b.text || '', context);

      const answer = renderer.renderFreeLayout
        ? await renderer.renderFreeLayout({
          locations,
          texts,
          buttons: buttons.map((b) => ({ id: b.id, locationName: b.locationName })),
          hidden: this.choices.filter((c) => !buttons.includes(c)).map((c) => c.locationName),
          duration: this.duration,
          clickAnywhere: this.clickAnywhere,
          layoutMode: renderer.getState('projectLayoutMode') === 'responsive' ? 'responsive' : 'fixed',
        })
        : await this.renderWithoutFreeLayout(renderer, texts, buttons);

      if (answer === FREE_LAYOUT_TIMEOUT) return this.timerTarget || null;
      if (answer === FREE_LAYOUT_NEXT) return this.nextTarget || null;

      const selected = buttons.find((b) => b.id === answer);
      if (!selected) {
        console.warn(`[FreeLayoutBeat] No button "${answer}" — available: ${buttons.map((b) => b.id).join(', ')}`);
        return null;
      }
      if (selected.target !== '__self__' && !selected.target) {
        if (++unlinkedPicks > Beat.UNLINKED_REPEAT_LIMIT) return null;
        this.unlinkedChoice(renderer, selected.displayText || selected.text || selected.locationName);
        continue;
      }
      unlinkedPicks = 0;

      const alreadyChosen = this.effectsOncePerChoice && context.getVisitedChoicesForBeat(this.id).includes(selected.id);
      context.markChoiceVisited(this.id, selected.id);
      if (renderer.setVisitedChoiceIds) renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));
      context.recordChoice({
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: this.type || 'freeLayout',
        choiceText: selected.text || selected.locationName,
        choiceContext: this.texts.map((t) => t.text).join(' ').slice(0, 200),
      });
      if (selected.effects?.length && !alreadyChosen) selected.effects.forEach((e) => context.applyEffect(e));
      if (selected.soundEffect && renderer.playSound) await renderer.playSound({ file: selected.soundEffect });
      if (selected.target === '__self__') continue;
      return selected.target;
    }
  }

  /** For a renderer without renderFreeLayout: the buttons as choices, or the text with Continue. */
  private async renderWithoutFreeLayout(renderer: IRenderer, texts: Record<string, string>, buttons: FreeLayoutButton[]): Promise<string> {
    const words = this.texts.map((t) => texts[t.locationName]).filter(Boolean).join('\n\n');
    if (buttons.length > 0) {
      if (words) await renderer.renderDialog('', words);
      return renderer.renderChoices(buttons.map((b) => ({ id: b.id, text: texts[b.locationName] || b.locationName })));
    }
    await renderer.renderText(words, 'Continue');
    return this.duration > 0 ? FREE_LAYOUT_TIMEOUT : FREE_LAYOUT_NEXT;
  }
}
