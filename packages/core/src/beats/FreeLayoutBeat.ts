import { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { FREE_LAYOUT_NEXT } from '../types';
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
 * effects, conditions, sound). The timer is every beat's auto-advance
 * (defaultTarget after defaultTargetDelay, with its countdown); with no
 * buttons and no timer, a click anywhere goes on to `nextTarget`.
 */
export class FreeLayoutBeat extends Beat {
  public texts: FreeLayoutText[];
  public choices: FreeLayoutButton[];
  /** Buttons of pictures no longer clickable: kept, with their link, for when they are again. */
  public parkedButtons: FreeLayoutButton[];
  public nextTarget?: string;
  public markVisited: boolean;
  public effectsOncePerChoice: boolean;

  constructor(config: BeatConfig & { parameters?: Partial<FreeLayoutParameters> } & Partial<FreeLayoutParameters>) {
    super(config);
    const p: Partial<FreeLayoutParameters> = { ...(config.parameters || {}), ...config };
    this.texts = Array.isArray(p.texts) ? p.texts : [];
    this.choices = Array.isArray(p.choices) ? p.choices : [];
    this.parkedButtons = Array.isArray((p as any).parkedButtons) ? (p as any).parkedButtons : [];
    this.nextTarget = p.nextTarget || undefined;
    this.markVisited = !!p.markVisited;
    this.effectsOncePerChoice = !!p.effectsOncePerChoice;
    this.choices.forEach((c) => migrateChoiceEffects(c as any));
    this.moveSoundsToElements();
  }

  /**
   * A button's click sound is its element's (the Visual Editor's Click
   * Sound). v0.9.147 also had a Sound Effect on the button: move it onto an
   * element that has no sound of its own. One whose element is gone stays.
   */
  private moveSoundsToElements(): void {
    for (const c of this.choices) {
      if (!c?.soundEffect) continue;
      const loc = this.elementOf(c);
      if (!loc) continue;
      if (!loc.sound && !(loc as any).soundAssetId) loc.sound = c.soundEffect;
      delete c.soundEffect;
    }
  }

  private elementOf(c: FreeLayoutButton) {
    return Array.from(this.locations.values()).find((l) => l?.name === c.locationName);
  }

  getParameters(): Record<string, any> {
    return {
      texts: this.texts,
      choices: this.choices,
      parkedButtons: this.parkedButtons,
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
    if (params.parkedButtons !== undefined) this.parkedButtons = Array.isArray(params.parkedButtons) ? params.parkedButtons : [];
    // A link set to nowhere comes as undefined: the key says it was given.
    if ('nextTarget' in params) this.nextTarget = params.nextTarget || undefined;
    if (params.markVisited !== undefined) this.markVisited = !!params.markVisited;
    if (params.effectsOncePerChoice !== undefined) this.effectsOncePerChoice = !!params.effectsOncePerChoice;
    if (params.node !== undefined) this.node = params.node;
    if (params.speaker !== undefined) this.speaker = params.speaker;
    if (params.showSpeaker !== undefined) this.showSpeaker = params.showSpeaker;
  }

  /**
   * The buttons whose element is on the stage. A button whose element was
   * deleted stays in `choices` — unused — so the Visual Editor's Undo brings
   * back its link with the element.
   */
  get liveChoices(): FreeLayoutButton[] {
    // By the element's name, not the Map key: some loaders key locations by
    // the element's id (the Preview did — every button looked deleted).
    const names = new Set(Array.from(this.locations.values()).map((l) => l?.name));
    return this.choices.filter((c) => !!c?.locationName && names.has(c.locationName));
  }

  /** Does the auto-advance timer run on this beat? */
  get timed(): boolean {
    return !!this.defaultTarget && (this.defaultTargetDelay ?? 0) > 0;
  }

  /** "Next" (click anywhere) applies only while the beat has no buttons and no timer. */
  get clickAnywhere(): boolean {
    return this.liveChoices.length === 0 && !this.timed;
  }

  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const out: Array<{ targetId: string; label?: string; condition?: any }> = [];
    for (const c of this.liveChoices) {
      if (c.target && c.target !== '__self__') out.push({ targetId: c.target, label: c.text || c.locationName || c.id, condition: c.conditions });
    }
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
      const live = this.liveChoices;
      const buttons = live.filter((c) => !c.conditions?.length || c.conditions.every((cond) => context.checkCondition(cond)));
      const texts: Record<string, string> = {};
      for (const t of this.texts) if (t?.locationName) texts[t.locationName] = this.processText(t.displayText || t.text || '', context);
      for (const b of buttons) if (b.locationName) texts[b.locationName] = this.processText(b.displayText || b.text || '', context);

      const answer = renderer.renderFreeLayout
        ? await renderer.renderFreeLayout({
          locations,
          texts,
          buttons: buttons.map((b) => ({ id: b.id, locationName: b.locationName })),
          hidden: live.filter((c) => !buttons.includes(c)).map((c) => c.locationName),
          clickAnywhere: this.clickAnywhere,
          layoutMode: renderer.getState('projectLayoutMode') === 'responsive' ? 'responsive' : 'fixed',
        })
        : await this.renderWithoutFreeLayout(renderer, texts, buttons);

      // The auto-advance timer ran out (the engine goes to its target).
      if (answer === '__timer_interrupt__') return this.defaultTarget || null;
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
      // The element plays its own click sound; an old Sound Effect only where it has none.
      const element = this.elementOf(selected);
      if (selected.soundEffect && !element?.sound && renderer.playSound) await renderer.playSound({ file: selected.soundEffect });
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
    return FREE_LAYOUT_NEXT;
  }
}
