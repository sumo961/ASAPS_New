#!/bin/bash

# Update all visual beats to support background nodes

echo "Updating all visual beats to support background nodes..."

# IntroTextBeat
cat > "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats/IntroTextBeat.ts" << 'ENDINTRO'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class IntroTextBeat extends Beat {
  public text: string;
  public buttonText: string;
  public node?: string;
  public locs: any[];
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    text?: string;
    buttonText?: string;
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.text = config.text || config.parameters?.text || '';
    this.buttonText = config.buttonText || config.parameters?.buttonText || 'Continue';
    this.locs = config.locs || config.parameters?.locs || [];
    this.backgroundSound = config.backgroundSound || config.parameters?.backgroundSound;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      text: this.text,
      buttonText: this.buttonText,
      node: this.node,
      locs: this.locs,
      backgroundSound: this.backgroundSound
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.node !== undefined) this.node = params.node;
    if (params.locs !== undefined) this.locs = params.locs;
    if (params.backgroundSound !== undefined) this.backgroundSound = params.backgroundSound;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    const locations = Array.from(this.locations.values());
    await renderer.renderText(this.text, this.buttonText, locations);
    return this.getNextBeat(context);
  }
}
ENDINTRO

echo "✓ Updated IntroTextBeat.ts"

# EndScreenBeat
cat > "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats/EndScreenBeat.ts" << 'ENDEND'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class EndScreenBeat extends Beat {
  public message: string;
  public showRestart: boolean;
  public showCredits: boolean;
  public reset: boolean;

  constructor(config: BeatConfig & {
    message?: string;
    showRestart?: boolean;
    showCredits?: boolean;
    reset?: boolean;
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.message = config.message || config.parameters?.message || 'The End';
    this.showRestart = config.showRestart ?? config.parameters?.showRestart ?? true;
    this.showCredits = config.showCredits ?? config.parameters?.showCredits ?? false;
    this.reset = config.reset ?? config.parameters?.reset ?? false;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      message: this.message,
      showRestart: this.showRestart,
      showCredits: this.showCredits,
      reset: this.reset,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.message !== undefined) this.message = params.message;
    if (params.showRestart !== undefined) this.showRestart = params.showRestart;
    if (params.showCredits !== undefined) this.showCredits = params.showCredits;
    if (params.reset !== undefined) this.reset = params.reset;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (this.reset) {
      context.reset();
    }

    const locations = Array.from(this.locations.values());
    await renderer.renderEndScreen(this.message, this.showRestart, this.showCredits, locations);

    if (this.showCredits) {
      await this.showCreditsScreen(context, renderer);
    }

    return null;
  }

  private async showCreditsScreen(context: StoryContext, renderer: IRenderer): Promise<void> {
    const story = context.getStory();
    const metadata = story.getMetadata();
    const creditsText = `
      ${metadata.title || 'Untitled Story'}
      
      Created by: ${metadata.author || 'Anonymous'}
      
      Thank you for playing!
    `;
    await renderer.renderText(creditsText, 'Close', []);
  }
}
ENDEND

echo "✓ Updated EndScreenBeat.ts"

# DurScreenBeat
cat > "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats/DurScreenBeat.ts" << 'ENDDUR'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class DurScreenBeat extends Beat {
  public text: string;
  public duration: number;

  constructor(config: BeatConfig & {
    text?: string;
    duration?: number;
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.text = config.text || config.parameters?.text || '';
    this.duration = config.duration || config.parameters?.duration || 3000;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      text: this.text,
      duration: this.duration,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.duration !== undefined) this.duration = params.duration;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    const locations = Array.from(this.locations.values());
    await renderer.renderDurScreen(this.text, this.duration, locations);
    return this.getNextBeat(context);
  }
}
ENDDUR

echo "✓ Updated DurScreenBeat.ts"

echo ""
echo "All visual beats now support background nodes!"
echo ""
echo "Rebuild packages:"
echo "  cd packages/core && npm run build"
echo "  cd ../renderer && npm run build"
echo "  cd ../builder && npm run build"
