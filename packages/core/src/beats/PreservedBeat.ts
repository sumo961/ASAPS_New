/**
 * A beat of a type this version doesn't know — a newer ASAPS made it. It
 * keeps its type and data exactly as they were, so saving with an older
 * version no longer turns it into something else (it used to become a
 * setVariable beat or an Info Text, and that was what got saved). Playing,
 * a logic-only one continues to the next beat; a visible one says it needs
 * a newer ASAPS.
 */
import { InfoTextBeat } from './InfoTextBeat';
import type { BeatConfig } from '../types';
import type { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class PreservedBeat extends InfoTextBeat {
  private preservedType: string;
  private preservedParameters: Record<string, any>;
  private invisible: boolean;
  private preservedTop: Record<string, any>;

  constructor(config: BeatConfig, invisible: boolean) {
    super({
      ...config,
      parameters: {
        text: 'This part of the story needs a newer version of ASAPS.',
        buttonText: 'Continue',
      },
    } as any);
    this.preservedType = config.type;
    this.type = config.type;
    this.preservedParameters = { ...((config.parameters as Record<string, any>) || {}) };
    this.invisible = invisible;
    const { parameters: _p, ...top } = config as any;
    this.preservedTop = top;
  }

  /** True for a beat kept as-is because its type is unknown here. */
  get isPreserved(): boolean {
    return true;
  }

  getParameters(): Record<string, any> {
    return { ...this.preservedParameters };
  }

  updateParameters(params: Record<string, any>): void {
    this.preservedParameters = { ...this.preservedParameters, ...params };
  }

  toJSON(): any {
    // Every top-level field as it came; position, name, links as edited here.
    return { ...this.preservedTop, ...super.toJSON(), type: this.preservedType, parameters: this.getParameters() };
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    if (this.invisible) return this.getNextBeat(context);
    return super.performAction(context, renderer);
  }
}
