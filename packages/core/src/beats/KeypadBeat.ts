import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

/**
 * KeypadBeat - Numerical input pad for phone keypads, safe locks, PIN entry, etc.
 *
 * Renders a grid of digit buttons with an optional code validation.
 * Reuses InputTextBeat's variable/counter storage pattern.
 */
export class KeypadBeat extends Beat {
  public prompt: string;
  public layout: 'numeric' | 'phone' | 'pin';
  public maxDigits: number;
  public minDigits: number;
  public correctCode?: string;
  public failTarget?: string;
  public maxAttempts: number;
  public maskInput: boolean;
  public saveToType: 'variable' | 'counter';
  public variable?: string;
  public counter?: string;
  public counterOperation?: 'set' | 'change';
  public buttonText: string;
  public clearButtonText: string;
  public showDisplay: boolean;
  public skinId?: string;

  // Visual data
  public locs: any[] = [];
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);

    const p = config.parameters || {};
    this.prompt = p.prompt || 'Enter the code:';
    this.layout = p.layout || 'numeric';
    this.maxDigits = p.maxDigits || 4;
    this.minDigits = p.minDigits || 1;
    this.correctCode = p.correctCode || '';
    this.failTarget = p.failTarget || '';
    this.maxAttempts = p.maxAttempts || 0;
    this.maskInput = p.maskInput ?? true;
    this.saveToType = p.saveToType || 'variable';
    this.variable = p.variable || 'keypadInput';
    this.counter = p.counter;
    this.counterOperation = p.counterOperation || 'set';
    this.buttonText = p.buttonText || 'Enter';
    this.clearButtonText = p.clearButtonText || 'Clear';
    this.showDisplay = p.showDisplay ?? true;
    this.skinId = p.skinId;

    // Visual data
    this.node = config.node || p.node;
    this.locs = config.locs || p.locs || [];
    this.backgroundSound = config.backgroundSound || p.backgroundSound;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      layout: this.layout,
      maxDigits: this.maxDigits,
      minDigits: this.minDigits,
      correctCode: this.correctCode,
      failTarget: this.failTarget,
      maxAttempts: this.maxAttempts,
      maskInput: this.maskInput,
      saveToType: this.saveToType,
      variable: this.variable,
      counter: this.counter,
      counterOperation: this.counterOperation,
      buttonText: this.buttonText,
      clearButtonText: this.clearButtonText,
      showDisplay: this.showDisplay,
      skinId: this.skinId,
      node: this.node,
      locs: this.locs,
      backgroundSound: this.backgroundSound,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.layout !== undefined) this.layout = params.layout;
    if (params.maxDigits !== undefined) this.maxDigits = params.maxDigits;
    if (params.minDigits !== undefined) this.minDigits = params.minDigits;
    if (params.correctCode !== undefined) this.correctCode = params.correctCode;
    if (params.failTarget !== undefined) this.failTarget = params.failTarget;
    if (params.maxAttempts !== undefined) this.maxAttempts = params.maxAttempts;
    if (params.maskInput !== undefined) this.maskInput = params.maskInput;
    if (params.saveToType !== undefined) this.saveToType = params.saveToType;
    if (params.variable !== undefined) this.variable = params.variable;
    if (params.counter !== undefined) this.counter = params.counter;
    if (params.counterOperation !== undefined) this.counterOperation = params.counterOperation;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.clearButtonText !== undefined) this.clearButtonText = params.clearButtonText;
    if (params.showDisplay !== undefined) this.showDisplay = params.showDisplay;
    if (params.skinId !== undefined) this.skinId = params.skinId;
    if (params.node !== undefined) this.node = params.node;
    if (params.locs !== undefined) this.locs = params.locs;
    if (params.backgroundSound !== undefined) this.backgroundSound = params.backgroundSound;
  }

  /**
   * Override getConnections to expose failTarget to the graph and reachability analyzer
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    // Start with base connections (defaultTarget, etc.)
    const connections = super.getConnections();

    // Add failTarget if set
    if (this.failTarget) {
      if (!connections.some(c => c.targetId === this.failTarget)) {
        connections.push({
          targetId: this.failTarget,
          label: 'fail'
        });
      }
    }

    return connections;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    const locations = Array.from(this.locations.values());

    // Process text with variable interpolation
    const processedPrompt = this.processText(this.prompt, context);

    // Render keypad and wait for user input
    const result = await (renderer as any).renderKeypad(
      processedPrompt,
      {
        layout: this.layout,
        maxDigits: this.maxDigits,
        minDigits: this.minDigits,
        correctCode: this.correctCode || undefined,
        failTarget: this.failTarget || undefined,
        maxAttempts: this.maxAttempts,
        maskInput: this.maskInput,
        buttonText: this.buttonText,
        clearButtonText: this.clearButtonText,
        showDisplay: this.showDisplay,
        skinId: this.skinId,
      },
      locations
    );

    // Check if the result indicates failure (wrong code, max attempts reached)
    if (result === '__keypad_fail__' && this.failTarget) {
      return this.failTarget;
    }

    // Save entered code to variable/counter
    if (this.saveToType === 'counter' && this.counter) {
      const numValue = parseFloat(result);
      if (!isNaN(numValue)) {
        if (this.counterOperation === 'change') {
          const currentValue = context.getCounter(this.counter) || 0;
          context.setCounter(this.counter, currentValue + numValue);
        } else {
          context.setCounter(this.counter, numValue);
        }
      }
    } else if (this.variable) {
      context.setVariable(this.variable, result);
    }

    return this.getNextBeat(context);
  }
}
