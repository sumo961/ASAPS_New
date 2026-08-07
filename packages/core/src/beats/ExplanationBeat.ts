import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

/**
 * ExplanationBeat — teaches the interactor what the screen HUDs mean.
 *
 * The beat itself is a plain text-and-button screen (so it inherits theme,
 * slot/fixed layout, speaker and translation handling for free). What makes it
 * an explanation is that the host draws callout labels over the REAL, packed
 * HUD positions while it is on screen — the same layoutScreenHuds geometry the
 * runtime uses, so the pointers stay correct when the author moves a HUD, adds
 * a character, or the stack re-packs.
 *
 * There is deliberately ONE explanation mechanism rather than one beat type per
 * interaction pattern: what differs between "here's the timer" and "here's the
 * inventory" is the caption, which is data. Captions default per HUD kind and
 * are overridable here; the same layer is reused by the overlay form
 * (Beat.explainHuds) that annotates HUDs on top of an ordinary beat.
 */
export class ExplanationBeat extends Beat {
  /** Intro copy shown in the beat's own text box. */
  public text: string;
  /** Continue button label. */
  public buttonText?: string;
  /**
   * Per-HUD-kind caption overrides. Authored as individual `caption*` string
   * params (so they render with the generic schema control AND get picked up
   * by the translation extractors like any other player-facing copy); an
   * explicit `captions` object is still accepted and wins, for AI-generated
   * and programmatically-built stories.
   */
  public captions?: Record<string, string>;
  public captionTimer?: string;
  public captionCountdown?: string;
  public captionMeter?: string;
  public captionInventory?: string;
  public captionMood?: string;
  /** HUD kinds to leave unannotated (author opted out of explaining them). */
  public skipKinds?: string[];
  public locs: any[];

  constructor(config: BeatConfig & {
    node?: string;
    locs?: any[];
    text?: string;
    buttonText?: string;
    captions?: Record<string, string>;
    skipKinds?: string[];
    parameters?: Record<string, any>;
  }) {
    super(config);
    const p: any = config.parameters || {};
    this.text = (config as any).text ?? p.text ?? '';
    this.buttonText = (config as any).buttonText ?? p.buttonText;
    this.captions = (config as any).captions ?? p.captions;
    this.captionTimer = (config as any).captionTimer ?? p.captionTimer;
    this.captionCountdown = (config as any).captionCountdown ?? p.captionCountdown;
    this.captionMeter = (config as any).captionMeter ?? p.captionMeter;
    this.captionInventory = (config as any).captionInventory ?? p.captionInventory;
    this.captionMood = (config as any).captionMood ?? p.captionMood;
    this.skipKinds = (config as any).skipKinds ?? p.skipKinds;
    this.locs = (config as any).locs || p.locs || [];
  }

  /**
   * The caption map the host actually renders: authored per-kind strings,
   * with an explicit `captions` object taking precedence. Blank entries are
   * dropped so the layer falls back to its built-in wording.
   */
  get resolvedCaptions(): Record<string, string> {
    const out: Record<string, string> = {};
    const pairs: Array<[string, string | undefined]> = [
      ['timer', this.captionTimer], ['countdown', this.captionCountdown],
      ['meter', this.captionMeter], ['inventory', this.captionInventory],
      ['mood', this.captionMood],
    ];
    for (const [kind, text] of pairs) {
      if (text && text.trim()) out[kind] = text;
    }
    return { ...out, ...(this.captions || {}) };
  }

  getParameters(): Record<string, any> {
    const params: Record<string, any> = {
      text: this.text,
      buttonText: this.buttonText,
      node: this.node,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
    };
    if (this.captions && Object.keys(this.captions).length > 0) {
      params.captions = this.captions;
    }
    if (this.captionTimer) params.captionTimer = this.captionTimer;
    if (this.captionCountdown) params.captionCountdown = this.captionCountdown;
    if (this.captionMeter) params.captionMeter = this.captionMeter;
    if (this.captionInventory) params.captionInventory = this.captionInventory;
    if (this.captionMood) params.captionMood = this.captionMood;
    if (this.skipKinds && this.skipKinds.length > 0) {
      params.skipKinds = this.skipKinds;
    }
    if (this.locs && this.locs.length > 0) {
      params.locs = this.locs;
    }
    return params;
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.captions !== undefined) this.captions = params.captions;
    if (params.captionTimer !== undefined) this.captionTimer = params.captionTimer;
    if (params.captionCountdown !== undefined) this.captionCountdown = params.captionCountdown;
    if (params.captionMeter !== undefined) this.captionMeter = params.captionMeter;
    if (params.captionInventory !== undefined) this.captionInventory = params.captionInventory;
    if (params.captionMood !== undefined) this.captionMood = params.captionMood;
    if (params.skipKinds !== undefined) this.skipKinds = params.skipKinds;
    if (params.node !== undefined) this.node = params.node;
    if (params.locs !== undefined) this.locs = params.locs;
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    const processedText = this.processText(this.text, context);
    const processedButtonText = this.processText(this.buttonText || 'Got it', context);

    // Declare our own beat type so the host knows to draw HUD callouts over
    // this screen (and so renderText resolves schema-driven behaviour for THIS
    // beat rather than a stale value left by a prior one).
    renderer.setState('currentBeatType', 'explanation');
    renderer.setState('slotAnimations', this.slotAnimations);

    const locations = Array.from(this.locations.values());
    await renderer.renderText(processedText, processedButtonText, locations);
    return this.getNextBeat(context);
  }
}
