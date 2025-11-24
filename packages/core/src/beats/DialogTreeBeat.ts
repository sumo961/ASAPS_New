import { Beat } from './Beat';
import type { BeatConfig, Condition, Effect } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { DialogTreeParameters, DialogNode, DialogChoice } from '../generated/beat-types';

export class DialogTreeBeat extends Beat {
  public dialogTree: DialogNode;
  public speaker: string;
  public text: string;
  public emotion?: string;
  public choiceDelay?: number; // Delay in seconds before showing choices
  private currentNode: DialogNode | null = null;

  constructor(config: BeatConfig & {
    parameters?: Partial<DialogTreeParameters>;
  } & Partial<DialogTreeParameters>) {
    super(config);

    // Initialize dialogTree from config or parameters
    // CRITICAL FIX: Ensure dialogTree is ALWAYS a valid object, never undefined
    const dialogTreeParam = config.dialogTree || config.parameters?.dialogTree;
    this.choiceDelay = config.choiceDelay || config.parameters?.choiceDelay;

    if (dialogTreeParam) {
      this.dialogTree = dialogTreeParam;
      // Use values from dialogTree for basic properties, but allow parameter overrides
      this.speaker = config.parameters?.speaker || dialogTreeParam.speaker;
      this.text = config.parameters?.text || dialogTreeParam.text;
      this.emotion = config.parameters?.emotion || dialogTreeParam.emotion;
    } else {
      // Initialize basic properties from parameters or defaults
      this.speaker = config.parameters?.speaker || 'Character';
      this.text = config.parameters?.text || 'Hello!';
      this.emotion = config.parameters?.emotion || 'neutral';

      // Create safe default dialogTree
      this.dialogTree = {
        id: 'root',
        speaker: this.speaker,
        text: this.text,
        emotion: this.emotion
      };
    }
  }

  /**
   * Override getConnections to extract all connections from the dialog tree
   * CRITICAL FIX: Added null checks and safety guards
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];
    const seenConnections = new Set<string>();

    // CRITICAL FIX: Guard against undefined dialogTree
    if (!this.dialogTree) {
      console.warn('[DialogTreeBeat] dialogTree is undefined for beat', this.id);
      return super.getConnections();
    }

    // Extract connections from a dialog node recursively
    const extractFromNode = (node: DialogNode | undefined | null, depth: number = 0): void => {
      // CRITICAL FIX: Safety check - prevent infinite recursion
      if (!node || depth > 20) {
        if (depth > 20) {
          console.warn('[DialogTreeBeat] Max recursion depth reached for beat', this.id);
        }
        return;
      }

      try {
        // Check choices for targets
        if (node.choices && Array.isArray(node.choices)) {
          node.choices.forEach((choice) => {
            if (!choice) return; // CRITICAL FIX: Skip null/undefined choices
            
            if (typeof choice.target === 'string' && choice.target) {
              const connectionKey = `${choice.target}-${choice.text || ''}`;
              if (!seenConnections.has(connectionKey)) {
                seenConnections.add(connectionKey);
                connections.push({
                  targetId: choice.target,
                  label: choice.text || 'Choice'
                });
              }
            } else if (typeof choice.target === 'object' && choice.target) {
              // Recursively extract from nested dialog nodes
              extractFromNode(choice.target, depth + 1);
            }
          });
        }

        // Check next for targets
        if (typeof node.next === 'string' && node.next) {
          const connectionKey = `${node.next}-Continue`;
          if (!seenConnections.has(connectionKey)) {
            seenConnections.add(connectionKey);
            connections.push({
              targetId: node.next,
              label: 'Continue'
            });
          }
        } else if (typeof node.next === 'object' && node.next) {
          extractFromNode(node.next, depth + 1);
        }
      } catch (error) {
        console.error('[DialogTreeBeat] Error extracting connections:', error);
      }
    };

    // Start extraction from root dialog tree
    try {
      extractFromNode(this.dialogTree, 0);
    } catch (error) {
      console.error('[DialogTreeBeat] Fatal error in getConnections:', error);
    }

    // Also include regular connections from base class
    try {
      const baseConnections = super.getConnections();
      baseConnections.forEach(conn => {
        const connectionKey = `${conn.targetId}-${conn.label || ''}`;
        if (!seenConnections.has(connectionKey)) {
          seenConnections.add(connectionKey);
          connections.push(conn);
        }
      });
    } catch (error) {
      console.error('[DialogTreeBeat] Error getting base connections:', error);
    }

    return connections;
  }

  getParameters(): Record<string, any> {
    return {
      dialogTree: this.dialogTree || { id: 'root', speaker: this.speaker, text: this.text },
      speaker: this.speaker,
      text: this.text,
      emotion: this.emotion,
      node: this.node,
      choiceDelay: this.choiceDelay
    };
  }

  updateParameters(params: Record<string, any>): void {
    // CRITICAL FIX: Update dialogTree first and extract properties FROM it
    if (params.dialogTree !== undefined) {
      this.dialogTree = params.dialogTree;
      // Extract speaker/text/emotion from the new dialogTree
      if (this.dialogTree.speaker !== undefined) this.speaker = this.dialogTree.speaker;
      if (this.dialogTree.text !== undefined) this.text = this.dialogTree.text;
      if (this.dialogTree.emotion !== undefined) this.emotion = this.dialogTree.emotion;
    }

    // Then allow direct speaker/text/emotion overrides (these take priority)
    if (params.speaker !== undefined) this.speaker = params.speaker;
    if (params.text !== undefined) this.text = params.text;
    if (params.emotion !== undefined) this.emotion = params.emotion;
    if (params.node !== undefined) this.node = params.node;
    if (params.choiceDelay !== undefined) this.choiceDelay = params.choiceDelay;

    // Sync instance properties back to dialogTree
    if (this.dialogTree && typeof this.dialogTree === 'object') {
      this.dialogTree.speaker = this.speaker;
      this.dialogTree.text = this.text;
      if (this.emotion) {
        this.dialogTree.emotion = this.emotion;
      }
    }
  }

  /**
   * Override toJSON to ensure dialogTree is safely serialized
   */
  toJSON(): any {
    const base = super.toJSON();
    return {
      ...base,
      dialogTree: this.dialogTree || { id: 'root', speaker: this.speaker, text: this.text },
      speaker: this.speaker,
      text: this.text,
      emotion: this.emotion,
      choiceDelay: this.choiceDelay
    };
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Set background asset ID in renderer state so it can be resolved
    if (this.node) {
      renderer.setState('backgroundAssetId', this.node);
    }

    this.currentNode = this.dialogTree;

    // Get locations array for positioned rendering
    const locations = Array.from(this.locations.values());

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

      // Process text with variable interpolation
      const processedSpeaker = this.processText(this.currentNode.speaker, context);
      const processedText = this.processText(this.currentNode.text, context);

      await renderer.renderDialog(
        processedSpeaker,
        processedText,
        this.currentNode.emotion,
        locations
      );

      if (this.currentNode.choices && this.currentNode.choices.length > 0) {
        const visibleChoices = this.filterVisibleChoices(
          this.currentNode.choices,
          context
        );

        if (visibleChoices.length === 0) {
          this.currentNode = this.findNextNode(this.currentNode);
        } else {
          // Apply delay if configured (before showing choices)
          if (this.choiceDelay && this.choiceDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.choiceDelay! * 1000));
          }

          // Process choice text with variable interpolation
          const choiceId = await renderer.renderChoices(
            visibleChoices.map(c => ({ id: c.id, text: this.processText(c.text, context) })),
            locations
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
