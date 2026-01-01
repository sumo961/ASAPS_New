import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { InputTextParameters } from '../generated/beat-types';

/**
 * InputTextBeat - Prompts user for text input and stores it in a variable
 * Uses auto-generated types from beat schema for compile-time safety.
 */
export class InputTextBeat extends Beat {
  public prompt: string;
  public saveToType: string;
  public variable?: string;
  public characterId?: string;
  public counter?: string;
  public counterOperation?: 'set' | 'change';
  public placeholder?: string;
  public validation?: string;
  public minLength?: number;
  public maxLength?: number;
  public required?: boolean;
  public buttonText?: string;

  // Visual data (node is inherited from Beat)
  public locs: any[] = []; // Visual elements
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    parameters?: Partial<InputTextParameters>;
  } & Partial<InputTextParameters>) {
    super(config);
    
    // Initialize from direct properties or parameters object
    this.prompt = config.prompt || config.parameters?.prompt || 'Please enter your response:';
    this.saveToType = config.saveToType || config.parameters?.saveToType || 'variable';
    // Support both 'variable' (canonical) and 'variableName' (AI-generated variant)
    this.variable = config.variable || config.parameters?.variable || config.parameters?.variableName || 'userInput';
    this.characterId = config.characterId || config.parameters?.characterId;
    this.counter = config.counter || config.parameters?.counter;
    this.counterOperation = (config.counterOperation || config.parameters?.counterOperation || 'set') as 'set' | 'change';
    this.placeholder = config.placeholder || config.parameters?.placeholder;
    this.validation = config.validation || config.parameters?.validation || 'none';
    this.minLength = config.minLength || config.parameters?.minLength;
    this.maxLength = config.maxLength || config.parameters?.maxLength;
    this.required = config.required ?? config.parameters?.required ?? true;
    this.buttonText = config.buttonText || config.parameters?.buttonText || 'Continue';
    
    // Visual data
    this.node = config.node || config.parameters?.node;
    this.locs = config.locs || config.parameters?.locs || [];
    this.backgroundSound = config.backgroundSound || config.parameters?.backgroundSound;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      saveToType: this.saveToType,
      variable: this.variable,
      characterId: this.characterId,
      counter: this.counter,
      counterOperation: this.counterOperation,
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
    // Update beat parameters
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.saveToType !== undefined) this.saveToType = params.saveToType;
    if (params.variable !== undefined) this.variable = params.variable;
    if (params.variableName !== undefined) {
      console.log(`[InputTextBeat] Setting variable from variableName: "${params.variableName}"`);
      this.variable = params.variableName; // AI-generated variant
    }
    if (params.characterId !== undefined) this.characterId = params.characterId;
    if (params.counter !== undefined) this.counter = params.counter;
    if (params.counterOperation !== undefined) this.counterOperation = params.counterOperation as 'set' | 'change';
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
    // Set background asset ID in renderer state so it can be resolved
    if (this.node) {
      renderer.setState('backgroundAssetId', this.node);
    }

    // Convert locations to array for renderer
    const locations = Array.from(this.locations.values());

    // Process text with variable interpolation
    const processedPrompt = this.processText(this.prompt, context);
    const processedPlaceholder = this.placeholder ? this.processText(this.placeholder, context) : undefined;
    const processedButtonText = this.processText(this.buttonText || 'Continue', context);

    // Display prompt and wait for user input (with positioned rendering support)
    const userInput = await renderer.renderInputText(
      processedPrompt,
      processedPlaceholder,
      processedButtonText,
      {
        validation: this.validation as 'none' | 'numeric' | 'email' | 'alphanumeric' | undefined,
        minLength: this.minLength,
        maxLength: this.maxLength,
        required: this.required
      },
      locations  // Pass locations for positioned rendering
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
    } else if (this.saveToType === 'counter' && this.counter) {
      // Store input as counter (numeric)
      const numValue = parseFloat(userInput);
      if (!isNaN(numValue)) {
        console.log(`[InputTextBeat] Saving ${numValue} to counter "${this.counter}" (${this.counterOperation || 'set'})`);
        if (this.counterOperation === 'change') {
          // Add to existing counter value
          const currentValue = context.getCounter(this.counter) || 0;
          context.setCounter(this.counter, currentValue + numValue);
        } else {
          // Set counter to value
          context.setCounter(this.counter, numValue);
        }
      } else {
        console.warn(`[InputTextBeat] Could not parse "${userInput}" as number for counter "${this.counter}"`);
      }
    } else if (this.saveToType === 'variable' && this.variable) {
      // Store input in variable
      console.log(`[InputTextBeat] Saving "${userInput}" to variable "${this.variable}"`);

      // Auto-convert to number if validation is numeric
      if (this.validation === 'numeric') {
        const numValue = parseFloat(userInput);
        if (!isNaN(numValue)) {
          context.setVariable(this.variable, numValue);
        } else {
          context.setVariable(this.variable, userInput);
        }
      } else {
        context.setVariable(this.variable, userInput);
      }
    }

    // Continue to next beat
    return this.getNextBeat(context);
  }
}
