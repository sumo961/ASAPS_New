#!/bin/bash

# Update ALL visual beats to support background nodes
# Visual beats are those that render content to the screen

echo "=========================================="
echo "Updating ALL Visual Beats with Node Support"
echo "=========================================="
echo ""

BEATS_DIR="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats"

# Counter for progress
TOTAL=8
COUNT=0

# Function to show progress
progress() {
    COUNT=$((COUNT + 1))
    echo "[$COUNT/$TOTAL] $1"
}

# 1. DialogTreeBeat
progress "Updating DialogTreeBeat.ts"
cat > "$BEATS_DIR/DialogTreeBeat.ts" << 'EOFDIALOG'
import { Beat } from './Beat';
import type { BeatConfig, Condition, Effect } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export interface DialogChoice {
  id: string;
  text: string;
  target?: string | DialogNode;
  conditions?: Condition[];
  effects?: Effect[];
  visible?: boolean;
  counter?: string;
  counterOperation?: 'change' | 'set';
  counterValue?: number;
}

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

export class DialogTreeBeat extends Beat {
  public dialogTree: DialogNode;
  public speaker: string;
  public text: string;
  public emotion?: string;
  private currentNode: DialogNode | null = null;

  constructor(config: BeatConfig & {
    dialogTree?: DialogNode;
    speaker?: string;
    text?: string;
    emotion?: string;
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.dialogTree = config.dialogTree || config.parameters?.dialogTree || {
      id: 'root',
      speaker: config.speaker || config.parameters?.speaker || 'Character',
      text: config.text || config.parameters?.text || 'Hello!',
      emotion: config.emotion || config.parameters?.emotion,
      choices: []
    };
    this.speaker = this.dialogTree.speaker;
    this.text = this.dialogTree.text;
    this.emotion = this.dialogTree.emotion;
  }

  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];
    
    if (!this.dialogTree) return connections;
    
    const processNode = (node: DialogNode | string | undefined, parentLabel?: string) => {
      if (!node) return;
      if (typeof node === 'string') {
        connections.push({ targetId: node, label: parentLabel });
        return;
      }
      
      if (node.choices) {
        node.choices.forEach(choice => {
          if (typeof choice.target === 'string') {
            connections.push({
              targetId: choice.target,
              label: choice.text,
              condition: choice.conditions?.[0]
            });
          } else if (choice.target) {
            processNode(choice.target, choice.text);
          }
        });
      }
      
      if (node.next) {
        processNode(node.next, parentLabel);
      }
    };
    
    processNode(this.dialogTree);
    return connections;
  }

  getParameters(): Record<string, any> {
    return {
      dialogTree: this.dialogTree,
      speaker: this.speaker,
      text: this.text,
      emotion: this.emotion,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.dialogTree !== undefined) {
      this.dialogTree = params.dialogTree;
      this.speaker = this.dialogTree.speaker;
      this.text = this.dialogTree.text;
      this.emotion = this.dialogTree.emotion;
    }
    if (params.speaker !== undefined) {
      this.speaker = params.speaker;
      if (this.dialogTree) this.dialogTree.speaker = params.speaker;
    }
    if (params.text !== undefined) {
      this.text = params.text;
      if (this.dialogTree) this.dialogTree.text = params.text;
    }
    if (params.emotion !== undefined) {
      this.emotion = params.emotion;
      if (this.dialogTree) this.dialogTree.emotion = params.emotion;
    }
    if (params.node !== undefined) this.node = params.node;
  }

  toJSON(): any {
    return {
      ...super.toJSON(),
      dialogTree: this.dialogTree
    };
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    this.currentNode = this.dialogTree;
    
    while (this.currentNode) {
      if (this.currentNode.effects) {
        this.currentNode.effects.forEach(effect => context.applyEffect(effect));
      }
      
      await renderer.renderDialog(
        this.currentNode.speaker,
        this.currentNode.text,
        this.currentNode.emotion
      );
      
      if (this.currentNode.choices && this.currentNode.choices.length > 0) {
        const visibleChoices = this.filterVisibleChoices(this.currentNode.choices, context);
        
        if (visibleChoices.length === 0) {
          return null;
        }
        
        const choiceId = await renderer.renderChoices(
          visibleChoices.map(c => ({ id: c.id, text: c.text }))
        );
        
        const selectedChoice = visibleChoices.find(c => c.id === choiceId);
        if (!selectedChoice) return null;
        
        if (selectedChoice.effects) {
          selectedChoice.effects.forEach(effect => context.applyEffect(effect));
        }
        
        if (selectedChoice.counter) {
          if (selectedChoice.counterOperation === 'set') {
            context.setCounter(selectedChoice.counter, selectedChoice.counterValue || 0);
          } else {
            context.incrementCounter(selectedChoice.counter, selectedChoice.counterValue || 1);
          }
        }
        
        const target = this.resolveTarget(selectedChoice.target);
        if (typeof target === 'string') {
          return target;
        } else if (target) {
          this.currentNode = target;
          continue;
        }
      }
      
      if (this.currentNode.next) {
        const nextTarget = this.resolveTarget(this.currentNode.next);
        if (typeof nextTarget === 'string') {
          return nextTarget;
        } else if (nextTarget) {
          this.currentNode = nextTarget;
          continue;
        }
      }
      
      break;
    }
    
    return this.getNextBeat(context);
  }

  private filterVisibleChoices(choices: DialogChoice[], context: StoryContext): DialogChoice[] {
    return choices.filter(choice => {
      if (choice.visible === false) return false;
      if (!choice.conditions || choice.conditions.length === 0) return true;
      return choice.conditions.every(condition => context.checkCondition(condition));
    });
  }

  private resolveTarget(target: string | DialogNode | undefined): string | DialogNode | null {
    if (!target) return null;
    if (typeof target === 'string') {
      const node = this.findNodeById(target);
      return node || target;
    }
    return target;
  }

  private findNodeById(id: string): DialogNode | null {
    const search = (node: DialogNode): DialogNode | null => {
      if (node.id === id) return node;
      if (node.choices) {
        for (const choice of node.choices) {
          if (typeof choice.target !== 'string' && choice.target) {
            const found = search(choice.target);
            if (found) return found;
          }
        }
      }
      if (typeof node.next !== 'string' && node.next) {
        return search(node.next);
      }
      return null;
    };
    return search(this.dialogTree);
  }

  private findNextNode(from: DialogNode): string | null {
    if (from.next) {
      if (typeof from.next === 'string') return from.next;
      return from.next.id;
    }
    return null;
  }
}
EOFDIALOG

# 2. ConversationChoiceBeat
progress "Updating ConversationChoiceBeat.ts"
cat > "$BEATS_DIR/ConversationChoiceBeat.ts" << 'EOFCONV'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class ConversationChoiceBeat extends Beat {
  public questioner: string;
  public question: string;
  public choices: Array<{ id: string; text: string; targetBeat: string }>;

  constructor(config: BeatConfig & {
    questioner?: string;
    question?: string;
    choices?: Array<{ id: string; text: string; targetBeat: string }>;
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.questioner = config.questioner || config.parameters?.questioner || 'Character';
    this.question = config.question || config.parameters?.question || 'What do you choose?';
    this.choices = config.choices || config.parameters?.choices || [];
  }

  getParameters(): Record<string, any> {
    return {
      questioner: this.questioner,
      question: this.question,
      choices: this.choices,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.questioner !== undefined) this.questioner = params.questioner;
    if (params.question !== undefined) this.question = params.question;
    if (params.choices !== undefined) this.choices = params.choices;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    await renderer.renderDialog(this.questioner, this.question);
    
    const choiceId = await renderer.renderChoices(
      this.choices.map(c => ({ id: c.id, text: c.text }))
    );
    
    const selected = this.choices.find(c => c.id === choiceId);
    return selected?.targetBeat || null;
  }
}
EOFCONV

# 3. MovementChoiceBeat
progress "Updating MovementChoiceBeat.ts"
cat > "$BEATS_DIR/MovementChoiceBeat.ts" << 'EOFMOVE'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class MovementChoiceBeat extends Beat {
  public question: string;
  public choices: Array<{
    id: string;
    text: string;
    location: string;
    target: string;
    conditions?: any[];
  }>;

  constructor(config: BeatConfig & {
    question?: string;
    choices?: any[];
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.question = config.question || config.parameters?.question || 'Where do you want to go?';
    this.choices = config.choices || config.parameters?.choices || [];
  }

  getParameters(): Record<string, any> {
    return {
      question: this.question,
      choices: this.choices,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.question !== undefined) this.question = params.question;
    if (params.choices !== undefined) this.choices = params.choices;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    const availableChoices = this.choices.filter(choice => {
      if (!choice.conditions || choice.conditions.length === 0) return true;
      return choice.conditions.every(condition => context.checkCondition(condition));
    });

    if (availableChoices.length === 0) {
      return null;
    }

    const choiceId = await renderer.renderMovement(
      this.question,
      availableChoices.map(c => ({
        id: c.id,
        text: c.text,
        location: c.location
      }))
    );

    const selected = availableChoices.find(c => c.id === choiceId);
    return selected?.target || null;
  }
}
EOFMOVE

# 4. PickPropBeat
progress "Updating PickPropBeat.ts"
cat > "$BEATS_DIR/PickPropBeat.ts" << 'EOFPROP'
import { Beat } from './Beat';
import type { BeatConfig, Effect } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class PickPropBeat extends Beat {
  public question: string;
  public props: Array<{
    id: string;
    name: string;
    description: string;
    target: string;
    conditions?: any[];
    effects?: Effect[];
  }>;

  constructor(config: BeatConfig & {
    question?: string;
    props?: any[];
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.question = config.question || config.parameters?.question || 'Choose an item:';
    this.props = config.props || config.parameters?.props || [];
  }

  getParameters(): Record<string, any> {
    return {
      question: this.question,
      props: this.props,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.question !== undefined) this.question = params.question;
    if (params.props !== undefined) this.props = params.props;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    const availableProps = this.props.filter(prop => {
      if (!prop.conditions || prop.conditions.length === 0) return true;
      return prop.conditions.every(condition => context.checkCondition(condition));
    });

    if (availableProps.length === 0) {
      return null;
    }

    const propId = await renderer.renderPropSelection(
      this.question,
      availableProps.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description
      }))
    );

    const selected = availableProps.find(p => p.id === propId);
    if (selected?.effects) {
      selected.effects.forEach(effect => context.applyEffect(effect));
    }

    return selected?.target || null;
  }
}
EOFPROP

# 5. VideoBeat
progress "Updating VideoBeat.ts"
cat > "$BEATS_DIR/VideoBeat.ts" << 'EOFVIDEO'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class VideoBeat extends Beat {
  public videoFile: string;
  public autoplay: boolean;
  public controls: boolean;
  public skipButton: boolean;

  constructor(config: BeatConfig & {
    videoFile?: string;
    autoplay?: boolean;
    controls?: boolean;
    skipButton?: boolean;
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.videoFile = config.videoFile || config.parameters?.videoFile || '';
    this.autoplay = config.autoplay ?? config.parameters?.autoplay ?? true;
    this.controls = config.controls ?? config.parameters?.controls ?? false;
    this.skipButton = config.skipButton ?? config.parameters?.skipButton ?? true;
  }

  getParameters(): Record<string, any> {
    return {
      videoFile: this.videoFile,
      autoplay: this.autoplay,
      controls: this.controls,
      skipButton: this.skipButton,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.videoFile !== undefined) this.videoFile = params.videoFile;
    if (params.autoplay !== undefined) this.autoplay = params.autoplay;
    if (params.controls !== undefined) this.controls = params.controls;
    if (params.skipButton !== undefined) this.skipButton = params.skipButton;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    await renderer.renderVideo(this.videoFile, this.autoplay, this.controls);
    return this.getNextBeat(context);
  }
}
EOFVIDEO

# 6. SWFBeat
progress "Updating SWFBeat.ts"
cat > "$BEATS_DIR/SWFBeat.ts" << 'EOFSWF'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class SWFBeat extends Beat {
  public swfFile: string;
  public autoplay: boolean;
  public skipButton: boolean;

  constructor(config: BeatConfig & {
    swfFile?: string;
    file?: string;
    autoplay?: boolean;
    skipButton?: boolean;
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.swfFile = config.swfFile || config.file || config.parameters?.swfFile || config.parameters?.file || '';
    this.autoplay = config.autoplay ?? config.parameters?.autoplay ?? true;
    this.skipButton = config.skipButton ?? config.parameters?.skipButton ?? true;
  }

  getParameters(): Record<string, any> {
    return {
      swfFile: this.swfFile,
      autoplay: this.autoplay,
      skipButton: this.skipButton,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.swfFile !== undefined) this.swfFile = params.swfFile;
    if (params.file !== undefined) this.swfFile = params.file;
    if (params.autoplay !== undefined) this.autoplay = params.autoplay;
    if (params.skipButton !== undefined) this.skipButton = params.skipButton;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    await renderer.renderVideo(this.swfFile, this.autoplay, !this.skipButton);
    return this.getNextBeat(context);
  }
}
EOFSWF

# 7. InputTextBeat - Already has node in parameters, just ensure it's in constructor
progress "Updating InputTextBeat.ts (ensuring node support)"
sed -i.bak '/constructor(config: BeatConfig/,/super(config);/ {
  /constructor(config: BeatConfig/,/node\?:/ {
    /node\?:/! s/parameters\?: Record<string, any>;/node?: string;\n    parameters?: Record<string, any>;/
  }
}' "$BEATS_DIR/InputTextBeat.ts"

# 8. HyperTextBeat - Already has node in parameters, just ensure it's in constructor  
progress "Updating HyperTextBeat.ts (ensuring node support)"
sed -i.bak '/constructor(config: BeatConfig/,/super(config);/ {
  /constructor(config: BeatConfig/,/node\?:/ {
    /node\?:/! s/parameters\?: Record<string, any>;/node?: string;\n    parameters?: Record<string, any>;/
  }
}' "$BEATS_DIR/HyperTextBeat.ts"

echo ""
echo "✅ All visual beats updated with node/background support!"
echo ""
echo "Visual beats with backgrounds:"
echo "  ✅ TitleScreenBeat"
echo "  ✅ IntroTextBeat"
echo "  ✅ DurScreenBeat"
echo "  ✅ EndScreenBeat"
echo "  ✅ DialogTreeBeat"
echo "  ✅ ConversationChoiceBeat"
echo "  ✅ MovementChoiceBeat"
echo "  ✅ PickPropBeat"
echo "  ✅ VideoBeat"
echo "  ✅ SWFBeat"
echo "  ✅ InputTextBeat"
echo "  ✅ HyperTextBeat"
echo ""
echo "Non-visual beats (no backgrounds needed):"
echo "  - AddRemoveInventoryBeat (logic only)"
echo "  - ConditionBeat (logic only)"
echo "  - RandomTargetBeat (logic only)"
echo "  - SetTimerBeat (logic only)"
echo "  - SetVariableBeat (logic only)"
echo ""
echo "Now rebuild all packages:"
echo "  npm run build"
