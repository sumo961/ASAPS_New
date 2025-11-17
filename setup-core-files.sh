#!/bin/bash

echo "Setting up core package files..."

# Create all the TypeScript files with content
cat > packages/core/src/index.ts << 'EOF'
// Main exports for @asaps/core
export * from './beats';
export * from './engine';
export * from './xml';
export * from './types';

// Package info
export const version = '2.0.0';
export const name = 'ASAPS Core';
EOF

cat > packages/core/src/types/index.ts << 'EOF'
// Core type definitions
export interface Location {
  kind: 'text' | 'hotspot' | 'prop' | 'character';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

export interface Transition {
  type: 'none' | 'fade' | 'slide' | 'zoom' | 'dissolve';
  duration: number;
  direction?: 'in' | 'out';
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface Sound {
  file: string;
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Connection {
  targetId: string;
  condition?: Condition;
  label?: string;
}

export interface Condition {
  type: 'variable' | 'inventory' | 'counter' | 'timer';
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
  left: string;
  right: any;
}

export interface Effect {
  type: 'setVariable' | 'addInventory' | 'removeInventory' | 'incrementCounter';
  target: string;
  value?: any;
}

export interface BeatConfig {
  id: string;
  name: string;
  type: string;
  cluster?: string;
  transition?: Transition;
  sound?: Sound;
  locations?: Location[];
  defaultTarget?: string;
  parameters?: Record<string, any>;
}

export interface StoryMetadata {
  title?: string;
  author?: string;
  version?: string;
  created?: string;
  modified?: string;
  firstBeatId: string;
}

export interface IRenderer {
  renderTitleScreen(title: string, author: string, buttonText: string): Promise<void>;
  renderText(text: string, buttonText: string): Promise<void>;
  renderDialog(speaker: string, text: string, emotion?: string): Promise<void>;
  renderChoices(choices: { id: string; text: string }[]): Promise<string>;
  applyTransition(transition: Transition): Promise<void>;
  playSound(sound: Sound): Promise<void>;
  waitForUserInput(): Promise<void>;
  clear(): void;
}

export interface BeatTypeDefinition {
  category: 'visible' | 'invisible' | 'custom';
  displayName: string;
  icon: string;
  parameters: Record<string, any>;
  locations?: string[];
  transitions?: boolean;
  sound?: boolean;
  renderer?: string;
}
EOF

cat > packages/core/src/beats/index.ts << 'EOF'

export { Beat } from './Beat';
export { BeatTypeRegistry } from './BeatRegistry';
export { TitleScreenBeat } from './TitleScreenBeat';
export { IntroTextBeat } from './IntroTextBeat';
export { DialogTreeBeat } from './DialogTreeBeat';
export type { DialogNode, DialogChoice } from './DialogTreeBeat';
EOF

cat > packages/core/src/beats/Beat.ts << 'EOF'
import  type { 
  BeatConfig, 
  Connection, 
  Location, 
  Transition, 
  Sound, 
  IRenderer 
} from '../types';
import { StoryContext } from '../engine/StoryContext';

export abstract class Beat {
  public id: string;
  public name: string;
  public type: string;
  public cluster?: string;
  public transition?: Transition;
  public sound?: Sound;
  public locations: Map<string, Location> = new Map();
  public connections: Connection[] = [];
  public defaultTarget?: string;
  public x?: number;
  public y?: number;

  constructor(config: BeatConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.cluster = config.cluster;
    this.transition = config.transition;
    this.sound = config.sound;
    this.defaultTarget = config.defaultTarget;
    
    if (config.locations) {
      config.locations.forEach(loc => {
        this.locations.set(loc.name, loc);
      });
    }
  }

  async execute(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    try {
      await this.onEnter(context, renderer);
      
      if (this.transition) {
        await renderer.applyTransition(this.transition);
      }
      
      if (this.sound) {
        await renderer.playSound(this.sound);
      }
      
      const nextBeatId = await this.performAction(context, renderer);
      
      await this.onExit(context, renderer);
      
      context.markBeatVisited(this.id);
      
      return nextBeatId;
    } catch (error) {
      console.error(`Error executing beat ${this.id}:`, error);
      throw error;
    }
  }

  protected abstract performAction(
    context: StoryContext, 
    renderer: IRenderer
  ): Promise<string | null>;

  protected async onEnter(context: StoryContext, renderer: IRenderer): Promise<void> {
    console.log(`Entering beat: ${this.name} (${this.id})`);
  }

  protected async onExit(context: StoryContext, renderer: IRenderer): Promise<void> {
    console.log(`Exiting beat: ${this.name} (${this.id})`);
  }

  addConnection(connection: Connection): void {
    this.connections.push(connection);
  }

  getConnections(): Connection[] {
    return [...this.connections];
  }

  getNextBeat(context: StoryContext): string | null {
    for (const connection of this.connections) {
      if (connection.condition && context.checkCondition(connection.condition)) {
        return connection.targetId;
      }
    }
    
    if (this.defaultTarget) {
      return this.defaultTarget;
    }
    
    const unconditional = this.connections.find(c => !c.condition);
    return unconditional?.targetId || null;
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      cluster: this.cluster,
      transition: this.transition,
      sound: this.sound,
      locations: Array.from(this.locations.values()),
      connections: this.connections,
      defaultTarget: this.defaultTarget,
      x: this.x,
      y: this.y
    };
  }
}
EOF

cat > packages/core/src/beats/BeatRegistry.ts << 'EOF'
import  type { BeatConfig, BeatTypeDefinition } from '../types';
import { Beat } from './Beat';
import { TitleScreenBeat } from './TitleScreenBeat';
import { IntroTextBeat } from './IntroTextBeat';
import { DialogTreeBeat } from './DialogTreeBeat';

export class BeatTypeRegistry {
  private static instance: BeatTypeRegistry;
  private beatTypes = new Map<string, BeatTypeDefinition>();
  private beatFactories = new Map<string, (config: BeatConfig) => Beat>();

  private constructor() {
    // Register built-in beat types
    this.registerBuiltInTypes();
  }

  static getInstance(): BeatTypeRegistry {
    if (!this.instance) {
      this.instance = new BeatTypeRegistry();
    }
    return this.instance;
  }

  private registerBuiltInTypes(): void {
    // Title Screen
    this.beatFactories.set('titleScreen', (config) => new TitleScreenBeat(config));
    this.beatTypes.set('titleScreen', {
      category: 'visible',
      displayName: 'Title Screen',
      icon: '🎬',
      parameters: {
        title: { type: 'string', required: true },
        author: { type: 'string', required: false },
        buttonText: { type: 'string', required: false }
      },
      transitions: true,
      sound: true
    });

    // Intro Text
    this.beatFactories.set('introText', (config) => new IntroTextBeat(config));
    this.beatTypes.set('introText', {
      category: 'visible',
      displayName: 'Intro Text',
      icon: '📝',
      parameters: {
        text: { type: 'string', required: true },
        buttonText: { type: 'string', required: false }
      },
      transitions: true,
      sound: true
    });

    // Dialog Tree
    this.beatFactories.set('dialogTree', (config) => new DialogTreeBeat(config));
    this.beatTypes.set('dialogTree', {
      category: 'visible',
      displayName: 'Dialog Tree',
      icon: '🌳',
      parameters: {
        dialogTree: { type: 'object', required: true }
      },
      transitions: true,
      sound: true
    });
  }

  registerBeatType(
    typeId: string, 
    definition: BeatTypeDefinition,
    factory: (config: BeatConfig) => Beat
  ): void {
    this.beatTypes.set(typeId, definition);
    this.beatFactories.set(typeId, factory);
  }

  getDefinition(typeId: string): BeatTypeDefinition | undefined {
    return this.beatTypes.get(typeId);
  }

  createBeat(typeId: string, config: BeatConfig): Beat {
    const factory = this.beatFactories.get(typeId);
    if (!factory) {
      throw new Error(`Unknown beat type: ${typeId}`);
    }
    return factory(config);
  }

  getAllTypes(): Map<string, BeatTypeDefinition> {
    return new Map(this.beatTypes);
  }
}
EOF

cat > packages/core/src/beats/TitleScreenBeat.ts << 'EOF'
import  { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

export class TitleScreenBeat extends Beat {
  public title: string;
  public author: string;
  public buttonText: string;

  constructor(config: BeatConfig & {
    title?: string;
    author?: string;
    buttonText?: string;
  }) {
    super(config);
    this.title = config.title || 'Untitled Story';
    this.author = config.author || 'Anonymous';
    this.buttonText = config.buttonText || 'Start';
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    await renderer.renderTitleScreen(this.title, this.author, this.buttonText);
    await renderer.waitForUserInput();
    return this.getNextBeat(context);
  }
}
EOF

cat > packages/core/src/beats/IntroTextBeat.ts<< 'EOF'
import  { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

export class IntroTextBeat extends Beat {
  public text: string;
  public buttonText: string;

  constructor(config: BeatConfig & {
    text?: string;
    buttonText?: string;
  }) {
    super(config);
    this.text = config.text || '';
    this.buttonText = config.buttonText || 'Continue';
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    await renderer.renderText(this.text, this.buttonText);
    await renderer.waitForUserInput();
    return this.getNextBeat(context);
  }
}
EOF

cat > packages/core/src/beats/DialogTreeBeat.ts<< 'EOF'
import  { Beat } from './Beat';
import type { BeatConfig, IRenderer, Condition, Effect } from '../types';
import { StoryContext } from '../engine/StoryContext';

export interface DialogNode {
  id: string;
  speaker: string;
  text: string;
  emotion?: string;
  conditions?: Condition[];
  choices?: DialogChoice[];
  next?: string | DialogNode;
  effects?: Effect[];
}

export interface DialogChoice {
  id: string;
  text: string;
  target?: string | DialogNode;
  conditions?: Condition[];
  effects?: Effect[];
  visible?: boolean;
}

export class DialogTreeBeat extends Beat {
  private dialogTree: DialogNode;
  private currentNode: DialogNode | null = null;

  constructor(config: BeatConfig & {
    dialogTree?: DialogNode;
  }) {
    super(config);
    this.dialogTree = config.dialogTree || {
      id: 'root',
      speaker: 'Character',
      text: 'Hello!'
    };
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    this.currentNode = this.dialogTree;
    
    while (this.currentNode) {
      if (this.currentNode.conditions) {
        const allConditionsMet = this.currentNode.conditions.every(
          cond => context.checkCondition(cond)
        );
        if (!allConditionsMet) {
          this.currentNode = this.findNextNode(this.currentNode);
          continue;
        }
      }
      
      if (this.currentNode.effects) {
        this.currentNode.effects.forEach(effect => context.applyEffect(effect));
      }
      
      await renderer.renderDialog(
        this.currentNode.speaker,
        this.currentNode.text,
        this.currentNode.emotion
      );
      
      if (this.currentNode.choices && this.currentNode.choices.length > 0) {
        const visibleChoices = this.filterVisibleChoices(
          this.currentNode.choices,
          context
        );
        
        if (visibleChoices.length === 0) {
          this.currentNode = this.findNextNode(this.currentNode);
        } else {
          const choiceId = await renderer.renderChoices(
            visibleChoices.map(c => ({ id: c.id, text: c.text }))
          );
          
          const selectedChoice = visibleChoices.find(c => c.id === choiceId);
          if (selectedChoice) {
            if (selectedChoice.effects) {
              selectedChoice.effects.forEach(effect => context.applyEffect(effect));
            }
            this.currentNode = this.resolveTarget(selectedChoice.target);
          } else {
            break;
          }
        }
      } else if (this.currentNode.next) {
        await renderer.waitForUserInput();
        this.currentNode = this.resolveTarget(this.currentNode.next);
      } else {
        await renderer.waitForUserInput();
        break;
      }
    }
    
    return this.getNextBeat(context);
  }

  private filterVisibleChoices(
    choices: DialogChoice[],
    context: StoryContext
  ): DialogChoice[] {
    return choices.filter(choice => {
      if (choice.visible === false) return false;
      if (choice.conditions) {
        return choice.conditions.every(cond => context.checkCondition(cond));
      }
      return true;
    });
  }

  private resolveTarget(target?: string | DialogNode): DialogNode | null {
    if (!target) return null;
    if (typeof target === 'string') {
      return this.findNodeById(target);
    }
    return target;
  }

  private findNodeById(id: string): DialogNode | null {
    // Simplified - in real implementation would traverse tree
    return null;
  }

  private findNextNode(current: DialogNode): DialogNode | null {
    if (current.next) {
      return this.resolveTarget(current.next);
    }
    return null;
  }
}
EOF

cat >packages/core/src/engine/index.ts << 'EOF'
export { StoryEngine } from './StoryEngine';
export { StoryContext } from './StoryContext';
export { Story } from './Story';
EOF

cat > packages/core/src/engine/StoryContext.ts << 'EOF'
import  { EventEmitter } from 'eventemitter3';
import type { Condition, Effect } from '../types';

interface StoryState {
  currentBeatId: string;
  variables: Record<string, any>;
  counters: Record<string, number>;
  inventory: string[];
  visitedBeats: Set<string>;
  timers: Record<string, number>;
}

export class StoryContext extends EventEmitter {
  private state: StoryState;
  private history: string[] = [];

  constructor(initialState?: Partial<StoryState>) {
    super();
    this.state = {
      currentBeatId: '0',
      variables: {},
      counters: {},
      inventory: [],
      visitedBeats: new Set(),
      timers: {},
      ...initialState
    };
  }

  getVariable(name: string): any {
    return this.state.variables[name];
  }

  setVariable(name: string, value: any): void {
    this.state.variables[name] = value;
    this.emit('variableChanged', { name, value });
  }

  incrementCounter(name: string, value: number = 1): void {
    this.state.counters[name] = (this.state.counters[name] || 0) + value;
    this.emit('counterChanged', { name, value: this.state.counters[name] });
  }

  addToInventory(item: string): void {
    if (!this.state.inventory.includes(item)) {
      this.state.inventory.push(item);
      this.emit('inventoryChanged', { action: 'add', item });
    }
  }

  removeFromInventory(item: string): void {
    const index = this.state.inventory.indexOf(item);
    if (index >= 0) {
      this.state.inventory.splice(index, 1);
      this.emit('inventoryChanged', { action: 'remove', item });
    }
  }

  hasInInventory(item: string): boolean {
    return this.state.inventory.includes(item);
  }

  checkCondition(condition: Condition): boolean {
    const left = this.resolveValue(condition.left);
    const right = condition.right;
    
    switch (condition.operator) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case 'contains': 
        return Array.isArray(left) ? left.includes(right) : false;
      default: return false;
    }
  }

  applyEffect(effect: Effect): void {
    switch (effect.type) {
      case 'setVariable':
        this.setVariable(effect.target, effect.value);
        break;
      case 'addInventory':
        this.addToInventory(effect.target);
        break;
      case 'removeInventory':
        this.removeFromInventory(effect.target);
        break;
      case 'incrementCounter':
        this.incrementCounter(effect.target, effect.value || 1);
        break;
    }
  }

  markBeatVisited(beatId: string): void {
    this.state.visitedBeats.add(beatId);
    this.history.push(beatId);
  }

  private resolveValue(ref: string): any {
    if (ref.startsWith('var:')) {
      return this.getVariable(ref.substring(4));
    }
    if (ref.startsWith('counter:')) {
      return this.state.counters[ref.substring(8)] || 0;
    }
    if (ref === 'inventory') {
      return this.state.inventory;
    }
    return ref;
  }

  getState(): Readonly<StoryState> {
    return Object.freeze({ ...this.state });
  }
}
EOF

cat > packages/core/src/engine/StoryEngine.ts << 'EOF'
import  { EventEmitter } from 'eventemitter3';
import { Story } from './Story';
import { StoryContext } from './StoryContext';
import type { IRenderer } from '../types';

export class StoryEngine extends EventEmitter {
  private story: Story | null = null;
  private context: StoryContext;
  private renderer: IRenderer;
  private running: boolean = false;

  constructor(renderer: IRenderer) {
    super();
    this.renderer = renderer;
    this.context = new StoryContext();
  }

  async loadStory(story: Story): Promise<void> {
    this.story = story;
    this.context = new StoryContext({
      currentBeatId: story.getFirstBeatId()
    });
    this.emit('storyLoaded', story);
  }

  async start(): Promise<void> {
    if (!this.story) {
      throw new Error('No story loaded');
    }
    
    this.running = true;
    let currentBeatId = this.story.getFirstBeatId();
    
    while (this.running && currentBeatId) {
      const beat = this.story.getBeat(currentBeatId);
      if (!beat) {
        throw new Error(`Beat not found: ${currentBeatId}`);
      }
      
      try {
        const nextBeatId = await beat.execute(this.context, this.renderer);
        currentBeatId = nextBeatId || '';
      } catch (error) {
        console.error('Story execution error:', error);
        this.running = false;
        throw error;
      }
    }
  }

  stop(): void {
    this.running = false;
    this.emit('storyStopped');
  }

  getContext(): StoryContext {
    return this.context;
  }
}
EOF

cat > packages/core/src/engine/Story.ts << 'EOF'
import  { Beat } from '../beats/Beat';
import type { StoryMetadata } from '../types';

export class Story {
  private beats: Map<string, Beat> = new Map();
  private metadata: StoryMetadata;
  private settings: any = {};
  private environment: any = {};
  private characters: any[] = [];
  private clusters: string[] = [];

  constructor(metadata?: Partial<StoryMetadata>) {
    this.metadata = {
      firstBeatId: '0',
      title: 'Untitled Story',
      ...metadata
    };
  }

  addBeat(beat: Beat): void {
    this.beats.set(beat.id, beat);
  }

  getBeat(id: string): Beat | undefined {
    return this.beats.get(id);
  }

  getFirstBeatId(): string {
    return this.metadata.firstBeatId;
  }

  getAllBeats(): Beat[] {
    return Array.from(this.beats.values());
  }

  setSettings(settings: any): void {
    this.settings = settings;
  }

  getSettings(): any {
    return this.settings;
  }

  setEnvironment(environment: any): void {
    this.environment = environment;
  }

  getEnvironment(): any {
    return this.environment;
  }

  setCharacters(characters: any[]): void {
    this.characters = characters;
  }

  getCharacters(): any[] {
    return this.characters;
  }

  setClusters(clusters: string[]): void {
    this.clusters = clusters;
  }

  getClusters(): string[] {
    return this.clusters;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!this.beats.has(this.metadata.firstBeatId)) {
      errors.push(`First beat not found: ${this.metadata.firstBeatId}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
EOF

cat > packages/core/src/xml/index.ts << 'EOF'
export { ASMLParser } from './ASMLParser';
export { ASMLGenerator } from './ASMLGenerator';
EOF

cat > packages/core/src/xml/ASMLParser.ts << 'EOF'
import  { Story } from '../engine/Story';
import { Beat } from '../beats/Beat';
import { BeatTypeRegistry } from '../beats/BeatRegistry';
import type { BeatConfig } from '../types';

export class ASMLParser {
  private beatTypeRegistry: BeatTypeRegistry;

  constructor() {
    this.beatTypeRegistry = BeatTypeRegistry.getInstance();
  }

  parseASML(xmlContent: string): Story {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    const story = new Story();
    
    // Parse settings, environment, characters, beats
    // This is a simplified version - full implementation would parse all elements
    
    const beatElements = xmlDoc.querySelectorAll('beat');
    beatElements.forEach(beatElement => {
      const beat = this.parseBeat(beatElement);
      if (beat) {
        story.addBeat(beat);
      }
    });
    
    return story;
  }

  private parseBeat(beatElement: Element): Beat | null {
    const idElement = beatElement.querySelector('id');
    if (!idElement) return null;

    const id = idElement.getAttribute('id') || '';
    const name = idElement.getAttribute('name') || '';
    const functionElement = beatElement.querySelector('function');
    const beatType = functionElement?.getAttribute('kind') || 'titleScreen';

    const config: BeatConfig = {
      id,
      name,
      type: beatType
    };

    try {
      return this.beatTypeRegistry.createBeat(beatType, config);
    } catch (error) {
      console.error(`Failed to create beat ${id}:`, error);
      return null;
    }
  }
}
EOF

cat > packages/core/src/xml/ASMLGenerator.ts << 'EOF'
import  { Story } from '../engine/Story';

export class ASMLGenerator {
  generateASML(story: Story): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<story>',
      '  <settings>',
      '    <!-- Settings here -->',
      '  </settings>',
      '  <environment>',
      '    <!-- Environment here -->',
      '  </environment>',
      '  <characters>',
      '    <!-- Characters here -->',
      '  </characters>',
      '  <plot>'
    ];

    // Generate beats
    story.getAllBeats().forEach(beat => {
      lines.push('    <beat>');
      lines.push(`      <id id="${beat.id}" name="${beat.name}" />`);
      lines.push(`      <function kind="${beat.type}">`);
      lines.push('        <!-- Beat content -->');
      lines.push('      </function>');
      lines.push('    </beat>');
    });

    lines.push('  </plot>');
    lines.push('</story>');

    return lines.join('\n');
  }
}
EOF

echo "✓ Core files created"

# Now build
npm run build:core

echo "✅ Setup complete!"