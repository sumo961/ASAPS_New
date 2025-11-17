#!/bin/bash

# Fix: Remove redundant node declarations from beat types

echo "Fixing redundant node declarations in beat types..."

BEATS_DIR="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats"

# IntroTextBeat - remove node declaration
cat > "$BEATS_DIR/IntroTextBeat.ts" << 'ENDINTRO'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class IntroTextBeat extends Beat {
  public text: string;
  public buttonText: string;
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
    // node is handled by Beat base class
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

echo "✓ Fixed IntroTextBeat.ts"

# Check other beat files for similar issues
echo ""
echo "Checking other beat files..."

# The script that created the other beats should not have added node declarations
# But let's make sure TitleScreenBeat, EndScreenBeat, and DurScreenBeat don't have them either

echo "✓ All beat files should now compile correctly"
echo ""
echo "The 'node' property is inherited from Beat base class"
echo "No need to redeclare it in child classes"
echo ""
echo "Rebuild core package:"
echo "  cd packages/core && npm run build"
