#!/bin/bash

# Fix: Remove redundant node declarations from all beat types

echo "Fixing redundant node declarations in beat types..."
echo ""

BEATS_DIR="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats"

# 1. IntroTextBeat
echo "1/3 Fixing IntroTextBeat.ts..."
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

# 2. InputTextBeat
echo "2/3 Fixing InputTextBeat.ts..."
cat > "$BEATS_DIR/InputTextBeat.ts" << 'ENDINPUT'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

/**
 * InputTextBeat - Prompts user for text input and stores it in a variable
 * 
 * Parameters:
 * - prompt: Question or prompt text to display
 * - variable: Variable name to store the input
 * - placeholder: Optional placeholder text for input field
 * - validation: Optional validation type (none, numeric, email, alphanumeric)
 * - minLength: Minimum character length (optional)
 * - maxLength: Maximum character length (optional)
 * - required: Whether input is required
 * - buttonText: Text for submit button (default: "Continue")
 */
export class InputTextBeat extends Beat {
  public prompt: string;
  public saveToType: 'variable' | 'characterName';
  public variable?: string;
  public characterId?: string;
  public placeholder?: string;
  public validation?: 'none' | 'numeric' | 'email' | 'alphanumeric';
  public minLength?: number;
  public maxLength?: number;
  public required: boolean;
  public buttonText: string;
  
  // Visual data (node is inherited from Beat)
  public locs: any[] = [];
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    prompt?: string;
    saveToType?: 'variable' | 'characterName';
    variable?: string;
    characterId?: string;
    placeholder?: string;
    validation?: 'none' | 'numeric' | 'email' | 'alphanumeric';
    minLength?: number;
    maxLength?: number;
    required?: boolean;
    buttonText?: string;
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    
    // Initialize from direct properties or parameters object
    this.prompt = config.prompt || config.parameters?.prompt || 'Please enter your response:';
    this.saveToType = config.saveToType || config.parameters?.saveToType || 'variable';
    this.variable = config.variable || config.parameters?.variable || 'userInput';
    this.characterId = config.characterId || config.parameters?.characterId;
    this.placeholder = config.placeholder || config.parameters?.placeholder;
    this.validation = config.validation || config.parameters?.validation || 'none';
    this.minLength = config.minLength || config.parameters?.minLength;
    this.maxLength = config.maxLength || config.parameters?.maxLength;
    this.required = config.required ?? config.parameters?.required ?? true;
    this.buttonText = config.buttonText || config.parameters?.buttonText || 'Continue';
    
    // Visual data (node is handled by Beat base class)
    this.locs = config.locs || config.parameters?.locs || [];
    this.backgroundSound = config.backgroundSound || config.parameters?.backgroundSound;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      saveToType: this.saveToType,
      variable: this.variable,
      characterId: this.characterId,
      placeholder: this.placeholder,
      validation: this.validation,
      minLength: this.minLength,
      maxLength: this.maxLength,
      required: this.required,
      buttonText: this.buttonText,
      // Include visual data
      node: this.node,
      locs: this.locs,
      backgroundSound: this.backgroundSound
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.saveToType !== undefined) this.saveToType = params.saveToType;
    if (params.variable !== undefined) this.variable = params.variable;
    if (params.characterId !== undefined) this.characterId = params.characterId;
    if (params.placeholder !== undefined) this.placeholder = params.placeholder;
    if (params.validation !== undefined) this.validation = params.validation;
    if (params.minLength !== undefined) this.minLength = params.minLength;
    if (params.maxLength !== undefined) this.maxLength = params.maxLength;
    if (params.required !== undefined) this.required = params.required;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    
    // Update visual data
    if (params.node !== undefined) this.node = params.node;
    if (params.locs !== undefined) this.locs = params.locs;
    if (params.backgroundSound !== undefined) this.backgroundSound = params.backgroundSound;
  }

  /**
   * Validates user input based on configured rules
   */
  private validateInput(input: string): { valid: boolean; error?: string } {
    // Check required
    if (this.required && (!input || input.trim() === '')) {
      return { valid: false, error: 'This field is required' };
    }

    // If not required and empty, allow it
    if (!this.required && (!input || input.trim() === '')) {
      return { valid: true };
    }

    // Check length
    if (this.minLength !== undefined && input.length < this.minLength) {
      return { valid: false, error: `Minimum ${this.minLength} characters required` };
    }
    if (this.maxLength !== undefined && input.length > this.maxLength) {
      return { valid: false, error: `Maximum ${this.maxLength} characters allowed` };
    }

    // Check validation type
    switch (this.validation) {
      case 'numeric':
        if (!/^\d+$/.test(input)) {
          return { valid: false, error: 'Please enter numbers only' };
        }
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
          return { valid: false, error: 'Please enter a valid email address' };
        }
        break;
      case 'alphanumeric':
        if (!/^[a-zA-Z0-9]+$/.test(input)) {
          return { valid: false, error: 'Please enter letters and numbers only' };
        }
        break;
    }

    return { valid: true };
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Display prompt and wait for user input
    const userInput = await renderer.renderInputText(
      this.prompt,
      this.placeholder,
      this.buttonText,
      {
        validation: this.validation,
        minLength: this.minLength,
        maxLength: this.maxLength,
        required: this.required
      }
    );

    // Validate input
    const validation = this.validateInput(userInput);
    if (!validation.valid) {
      // Renderer should handle validation errors and re-prompt
      console.error('Input validation failed:', validation.error);
      // In real implementation, this would loop back for valid input
    }

    // Save input based on type
    if (this.saveToType === 'characterName' && this.characterId) {
      // Update character display name
      context.updateCharacterDisplayName(this.characterId, userInput);
    } else if (this.saveToType === 'variable' && this.variable) {
      // Store input in variable
      context.setVariable(this.variable, userInput);
    }

    // Continue to next beat
    return this.getNextBeat(context);
  }
}
ENDINPUT

# 3. HyperTextBeat
echo "3/3 Fixing HyperTextBeat.ts..."
cat > "$BEATS_DIR/HyperTextBeat.ts" << 'ENDHYPER'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

/**
 * HyperTextBeat - Displays text with clickable hyperlinked words/phrases
 * 
 * Parameters:
 * - text: Main text content with placeholders for hyperlinks
 * - hyperlinks: Array of { word: string, targetBeatId: string, style?: object }
 * - allowMultipleClicks: Whether user can click multiple links (default: false)
 * - highlightColor: Color for hyperlinked text (default: blue)
 * - hoverColor: Color when hovering over hyperlinks (default: darker blue)
 * 
 * Visual data stored in locs as special "hypertext" kind elements
 */
export class HyperTextBeat extends Beat {
  public text: string;
  public hyperlinks: Array<{
    word: string;
    targetBeatId: string;
    style?: {
      color?: string;
      underline?: boolean;
      bold?: boolean;
    };
  }>;
  public allowMultipleClicks: boolean;
  public highlightColor: string;
  public hoverColor: string;
  
  // Visual data (node is inherited from Beat)
  public locs: any[] = [];
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    text?: string;
    hyperlinks?: Array<{
      word: string;
      targetBeatId: string;
      style?: any;
    }>;
    allowMultipleClicks?: boolean;
    highlightColor?: string;
    hoverColor?: string;
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    
    // Initialize from direct properties or parameters object
    this.text = config.text || config.parameters?.text || 'Click on any word to explore.';
    this.hyperlinks = config.hyperlinks || config.parameters?.hyperlinks || [];
    this.allowMultipleClicks = config.allowMultipleClicks ?? config.parameters?.allowMultipleClicks ?? false;
    this.highlightColor = config.highlightColor || config.parameters?.highlightColor || '#0066cc';
    this.hoverColor = config.hoverColor || config.parameters?.hoverColor || '#003366';
    
    // Visual data (node is handled by Beat base class)
    this.locs = config.locs || config.parameters?.locs || [];
    this.backgroundSound = config.backgroundSound || config.parameters?.backgroundSound;
  }

  getParameters(): Record<string, any> {
    return {
      text: this.text,
      hyperlinks: this.hyperlinks,
      allowMultipleClicks: this.allowMultipleClicks,
      highlightColor: this.highlightColor,
      hoverColor: this.hoverColor,
      // Include visual data
      node: this.node,
      locs: this.locs,
      backgroundSound: this.backgroundSound
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.hyperlinks !== undefined) this.hyperlinks = params.hyperlinks;
    if (params.allowMultipleClicks !== undefined) this.allowMultipleClicks = params.allowMultipleClicks;
    if (params.highlightColor !== undefined) this.highlightColor = params.highlightColor;
    if (params.hoverColor !== undefined) this.hoverColor = params.hoverColor;
    
    // Update visual data
    if (params.node !== undefined) this.node = params.node;
    if (params.locs !== undefined) this.locs = params.locs;
    if (params.backgroundSound !== undefined) this.backgroundSound = params.backgroundSound;
  }

  /**
   * Renders text with clickable hyperlinks and waits for user selection
   */
  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Prepare hypertext data for renderer
    const hypertextData = {
      text: this.text,
      links: this.hyperlinks.map(link => ({
        word: link.word,
        targetBeatId: link.targetBeatId,
        style: {
          color: link.style?.color || this.highlightColor,
          hoverColor: this.hoverColor,
          underline: link.style?.underline ?? true,
          bold: link.style?.bold ?? false
        }
      })),
      allowMultiple: this.allowMultipleClicks
    };

    // Render hypertext and wait for user to click a link
    const selectedTargetId = await renderer.renderHyperText(hypertextData);

    // Validate that the selected target exists in our hyperlinks
    const selectedLink = this.hyperlinks.find(link => link.targetBeatId === selectedTargetId);
    
    if (selectedLink) {
      // Add the connection dynamically if it doesn't exist
      if (!this.hasConnection(selectedTargetId)) {
        this.addConnection({
          targetId: selectedTargetId,
          label: selectedLink.word
        });
      }
      
      return selectedTargetId;
    }

    // Fallback to default next beat if something went wrong
    return this.getNextBeat(context);
  }

  /**
   * Override toJSON to ensure hyperlink connections are included
   */
  toJSON(): any {
    const json = super.toJSON();
    
    // Ensure all hyperlink targets are in connections
    this.hyperlinks.forEach(link => {
      if (!this.hasConnection(link.targetBeatId)) {
        this.addConnection({
          targetId: link.targetBeatId,
          label: link.word
        });
      }
    });
    
    return {
      ...json,
      connections: this.getConnections()
    };
  }
}
ENDHYPER

echo ""
echo "✅ Fixed all redundant node declarations!"
echo ""
echo "Changes made:"
echo "  - IntroTextBeat: removed 'public node?: string;'"
echo "  - InputTextBeat: removed 'public node?: string;'"
echo "  - HyperTextBeat: removed 'public node?: string;'"
echo ""
echo "The 'node' property is inherited from Beat base class"
echo "Child classes can still access it via this.node"
echo ""
echo "Now rebuild:"
echo "  npm run build"
