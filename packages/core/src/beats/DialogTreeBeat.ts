import { Beat } from './Beat';
import type { BeatConfig, Condition, Effect, Location } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { DialogTreeParameters, DialogNode, DialogChoice } from '../generated/beat-types';
import { computeDialogTreeLayout, type DialogTreeLayoutTheme } from '../layout';
import { migrateDialogTreeEffects } from '../migration/effectsMigration';

/**
 * Phase layout override - stores position adjustments for elements that
 * differ from auto-layout defaults
 */
export interface PhaseOverride {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class DialogTreeBeat extends Beat {
  public dialogTree: DialogNode;
  public speaker: string;
  public text: string;
  public emotion?: string;
  public choiceDelay?: number; // Delay in seconds before showing choices
  public responseDelay?: number; // Delay in seconds before NPC responds (for natural chat pacing)
  public markVisited?: boolean; // Show visual indication for choices leading to already-visited beats
  public backgroundUrl?: string; // Direct URL for background from ASML import
  public backgroundAssetId?: string; // Asset ID for background
  public phaseOverrides?: Record<string, Record<string, PhaseOverride>>; // Per-phase visual element overrides
  public presentationMode?: 'positioned' | 'chat-scroll' | 'chat-bubble'; // Dialog presentation style
  public showAvatars?: boolean; // Show character avatars in chat mode
  private currentNode: DialogNode | null = null;

  constructor(config: BeatConfig & {
    parameters?: Partial<DialogTreeParameters>;
  } & Partial<DialogTreeParameters>) {
    super(config);

    // Initialize dialogTree from config or parameters
    // CRITICAL FIX: Ensure dialogTree is ALWAYS a valid object, never undefined
    const dialogTreeParam = config.dialogTree || config.parameters?.dialogTree;
    this.choiceDelay = config.choiceDelay || config.parameters?.choiceDelay;
    this.responseDelay = config.parameters?.responseDelay;
    this.markVisited = config.markVisited ?? config.parameters?.markVisited ?? false;
    this.phaseOverrides = config.parameters?.phaseOverrides as Record<string, Record<string, PhaseOverride>> | undefined;
    this.presentationMode = (config.parameters?.presentationMode as 'positioned' | 'chat-scroll' | 'chat-bubble') || 'positioned';
    this.showAvatars = config.parameters?.showAvatars ?? true;

    if (dialogTreeParam) {
      // Migrate old format to new format if needed
      this.dialogTree = this.migrateDialogTree(dialogTreeParam);
      // Use values from dialogTree for basic properties, but allow parameter overrides
      this.speaker = config.parameters?.speaker || this.dialogTree.speaker;
      this.text = config.parameters?.text || this.dialogTree.text;
      this.emotion = config.parameters?.emotion || this.dialogTree.emotion;
    } else {
      // Initialize basic properties from parameters or defaults
      this.speaker = config.parameters?.speaker || 'Character';
      this.text = config.parameters?.text || 'Hello!';
      this.emotion = config.parameters?.emotion || 'neutral';

      // Create safe default dialogTree with required choices array
      this.dialogTree = {
        id: 'root',
        speaker: this.speaker,
        text: this.text,
        emotion: this.emotion,
        choices: []
      };
    }
  }

  /**
   * Migrate old dialogTree format to new simplified format
   * Old: choice.target could be DialogNode, node.next could exist
   * New: choice.dialogNode for nested nodes, choice.target only for beat IDs
   */
  private migrateDialogTree(node: any): DialogNode {
    if (!node) return { id: 'root', speaker: '', text: '', choices: [] };

    const migrated: DialogNode = {
      id: node.id || 'root',
      speaker: node.speaker || '',
      text: node.text || '',
      emotion: node.emotion,
      conditions: node.conditions,
      effects: node.effects,
      choices: []
    };

    // Migrate choices
    if (node.choices && Array.isArray(node.choices)) {
      migrated.choices = node.choices.map((choice: any) => {
        const migratedChoice: DialogChoice = {
          id: choice.id,
          text: choice.text,
          conditions: choice.conditions,
          effects: choice.effects,
          visible: choice.visible
        };

        // Preserve counter fields temporarily (migrateDialogTreeEffects will convert them)
        if (choice.counter) (migratedChoice as any).counter = choice.counter;
        if (choice.counterOperation) (migratedChoice as any).counterOperation = choice.counterOperation;
        if (choice.counterValue !== undefined) (migratedChoice as any).counterValue = choice.counterValue;

        // Preserve sound effect
        if (choice.soundEffect) (migratedChoice as any).soundEffect = choice.soundEffect;

        // Old format: target was either string (beat ID) or object (nested DialogNode)
        // New format: target is string only, dialogNode is nested node
        if (typeof choice.target === 'string') {
          migratedChoice.target = choice.target;
        } else if (typeof choice.target === 'object' && choice.target) {
          migratedChoice.dialogNode = this.migrateDialogTree(choice.target);
        }

        // Also check for new format dialogNode
        if (choice.dialogNode) {
          migratedChoice.dialogNode = this.migrateDialogTree(choice.dialogNode);
        }

        return migratedChoice;
      });
    }

    // Handle old 'next' property by creating a continue choice
    // (This maintains backward compatibility with old format)
    if (node.next) {
      if (typeof node.next === 'string') {
        // next was a beat ID - add a continue choice
        migrated.choices.push({
          id: 'auto_continue',
          text: '[Continue]',
          target: node.next
        });
      } else if (typeof node.next === 'object') {
        // next was a nested DialogNode - add a continue choice
        migrated.choices.push({
          id: 'auto_continue',
          text: '[Continue]',
          dialogNode: this.migrateDialogTree(node.next)
        });
      }
    }

    // Migrate flat counter fields → canonical effects on all choices
    migrateDialogTreeEffects(migrated);

    return migrated;
  }

  /**
   * Override getConnections to extract all connections from the dialog tree
   * New format: choice.target is beat ID (string), choice.dialogNode is nested node
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];
    const seenConnections = new Set<string>();

    // Guard against undefined dialogTree
    if (!this.dialogTree) {
      console.warn('[DialogTreeBeat] dialogTree is undefined for beat', this.id);
      return super.getConnections();
    }

    // Extract connections from a dialog node recursively
    const extractFromNode = (node: DialogNode | undefined | null, depth: number = 0): void => {
      // Safety check - prevent infinite recursion
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
            if (!choice) return; // Skip null/undefined choices

            // New format: target is always a string (beat ID) to exit
            // Skip __self__ targets - they loop back to root, not to another beat
            if (choice.target && typeof choice.target === 'string' && choice.target !== '__self__') {
              const connectionKey = `${choice.target}-${choice.text || ''}`;
              if (!seenConnections.has(connectionKey)) {
                seenConnections.add(connectionKey);
                connections.push({
                  targetId: choice.target,
                  label: choice.text || 'Choice'
                });
              }
            }

            // New format: dialogNode contains nested dialog
            if (choice.dialogNode) {
              extractFromNode(choice.dialogNode, depth + 1);
            }
          });
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
    // NOTE: speaker/text/emotion are stored ONLY in dialogTree to avoid duplication.
    // The dialogTree is the single source of truth for dialog content.
    // Sync instance properties to dialogTree before returning.
    const dt = this.dialogTree || { id: 'root', speaker: '', text: '', choices: [] };
    dt.speaker = this.speaker;
    dt.text = this.text;
    if (this.emotion) dt.emotion = this.emotion;

    return {
      dialogTree: dt,
      // Do NOT include speaker/text/emotion separately - they're in dialogTree
      node: this.node,
      choiceDelay: this.choiceDelay,
      responseDelay: this.responseDelay,
      markVisited: this.markVisited,
      backgroundUrl: this.backgroundUrl,
      backgroundAssetId: this.backgroundAssetId,
      phaseOverrides: this.phaseOverrides,
      presentationMode: this.presentationMode,
      showAvatars: this.showAvatars
    };
  }

  updateParameters(params: Record<string, any>): void {
    // Increment version for React change detection (used by Inspector to detect parameter changes)
    this._version++;

    // CRITICAL FIX: Update dialogTree first and extract properties FROM it
    // Always run migration to ensure nested dialogNodes have choices arrays
    if (params.dialogTree !== undefined) {
      this.dialogTree = this.migrateDialogTree(params.dialogTree);
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
    if (params.responseDelay !== undefined) this.responseDelay = params.responseDelay;
    if (params.markVisited !== undefined) this.markVisited = params.markVisited;
    if (params.backgroundUrl !== undefined) this.backgroundUrl = params.backgroundUrl;
    if (params.backgroundAssetId !== undefined) this.backgroundAssetId = params.backgroundAssetId;
    if (params.phaseOverrides !== undefined) this.phaseOverrides = params.phaseOverrides;
    if (params.presentationMode !== undefined) this.presentationMode = params.presentationMode;
    if (params.showAvatars !== undefined) this.showAvatars = params.showAvatars;

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
   * NOTE: We rely on getParameters() to include all dialog data in the 'parameters' object.
   * We do NOT add dialogTree/speaker/text/emotion at the top level to avoid duplication.
   * The base toJSON() already includes parameters: this.getParameters().
   */
  toJSON(): any {
    // Just use base toJSON - it already includes parameters from getParameters()
    // which contains dialogTree, speaker, text, emotion, etc.
    // Do NOT add these properties at top-level to avoid duplication.
    return super.toJSON();
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Background is now handled centrally in Beat.execute()

    // Set markVisited state for renderer to use when rendering choices
    renderer.setState('markVisited', this.markVisited || false);

    // Set presentation mode for chat-like dialogs
    renderer.setState('presentationMode', this.presentationMode || 'positioned');
    renderer.setState('showAvatars', this.showAvatars ?? true);
    // Default responseDelay to 1.5s for chat modes if not explicitly set
    const isChatMode = this.presentationMode && this.presentationMode !== 'positioned';
    const defaultDelay = isChatMode ? 1.5 : 0;
    renderer.setState('responseDelay', this.responseDelay ?? defaultDelay);

    // Set player name for chat display (try common variable names)
    const variables = context.getVariables();
    const playerName = variables.playerName || variables.name || variables.player || 'You';
    renderer.setState('playerName', playerName);

    // Clear chat history when starting a new dialog tree in chat mode
    // This ensures messages from previous dialog trees don't persist
    if (this.presentationMode && this.presentationMode !== 'positioned') {
      if (renderer.clearChatHistory) {
        renderer.clearChatHistory();
      }
    }

    this.currentNode = this.dialogTree;

    // Get base locations array for positioned rendering (characters, props, etc.)
    const baseLocations = Array.from(this.locations.values());

    // Track the exit target when user selects a choice with a beat ID target
    let exitTargetBeatId: string | null = null;

    // Track position in the dialog tree for unique visited-choice tracking.
    // Without this, different dialog nodes reuse simple IDs like "1", "2"
    // causing false positives when checking visited choices.
    let nodePath = 'root';

    while (this.currentNode) {
      // Build phase-specific locations by merging base locations with phaseOverrides
      // This ensures dialog/button positions from Visual Editor are respected
      const phaseId = this.currentNode.id || 'root';
      const phaseOverrides = this.phaseOverrides?.[phaseId];

      // Helper to identify dialog locations (can be 'dialog' or 'text' kind)
      const isDialogLoc = (loc: Location) => loc.kind === 'dialog' ||
        (loc.kind === 'text' && !loc.name?.match(/^(choice|button)/i));

      // Start with elements that aren't dialog or button (keep characters, props, etc.)
      // Also filter out 'text' elements that are actually the dialog text box
      let locations = baseLocations.filter(loc =>
        loc.kind !== 'dialog' &&
        loc.kind !== 'button' &&
        !isDialogLoc(loc)
      );

      // Use the shared layout calculation (same function used by visual editor)
      // This ensures WYSIWYG - positions calculated here match visual editor exactly
      // Get layout theme from renderer state (set by PreviewWindow from globalSettings)
      // Falls back to defaults if not set (e.g., standalone player without builder settings)
      const rendererLayoutTheme = renderer.getState?.('layoutTheme') as DialogTreeLayoutTheme | undefined;
      const layoutTheme: DialogTreeLayoutTheme = rendererLayoutTheme || {
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 20,
        maxTextWidthRatio: 0.8,
        maxButtonWidthRatio: 0.6,
        textButtonGap: 20,
        buttonGap: 16,
        startY: 50,
      };

      // Get stage size from renderer state (set by PreviewWindow from projectSettings)
      // Falls back to defaults if not set (e.g., standalone player without builder settings)
      const rendererStageSize = renderer.getState?.('stageSize') as { width: number; height: number } | undefined;
      const stageWidth = rendererStageSize?.width || 1024;
      const stageHeight = rendererStageSize?.height || 768;

      const layout = computeDialogTreeLayout({
        phase: {
          id: phaseId,
          speaker: this.currentNode.speaker || '',
          text: this.currentNode.text || '',
          choices: (this.currentNode.choices || []).map((c, idx) => ({
            id: c.id || `choice_${idx}`,
            text: c.text || '',
          })),
        },
        stageWidth,
        stageHeight,
        theme: layoutTheme,
        overrides: phaseOverrides,
        storedLocations: this.locations, // Pass stored locations from ASML import
      });

      // Add the calculated dialog and button locations
      const layoutLocations = layout.toLocations();
      locations = [...locations, ...layoutLocations];

      // Check conditions on the node
      if (this.currentNode.conditions) {
        const allConditionsMet = this.currentNode.conditions.every(
          cond => context.checkCondition(cond)
        );
        if (!allConditionsMet) {
          // No conditions met and no choices available - exit dialog
          break;
        }
      }

      // Apply effects from the node
      if (this.currentNode.effects) {
        this.currentNode.effects.forEach(effect => context.applyEffect(effect));
      }

      // Process text with variable interpolation
      const processedSpeaker = this.processText(this.currentNode.speaker, context);
      const processedText = this.processText(this.currentNode.text, context);

      // Render the NPC/system dialog
      await renderer.renderDialog(
        processedSpeaker,
        processedText,
        this.currentNode.emotion,
        locations
      );

      // Every node must have choices (new simplified format)
      // Player must click a choice to continue or exit
      if (this.currentNode.choices && this.currentNode.choices.length > 0) {
        const visibleChoices = this.filterVisibleChoices(
          this.currentNode.choices,
          context
        );

        if (visibleChoices.length === 0) {
          // No visible choices - dialog ends here
          break;
        }

        // Apply delay if configured (before showing choices)
        if (this.choiceDelay && this.choiceDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.choiceDelay! * 1000));
        }

        // Process choice text with variable interpolation and render choices
        // Include isExit flag to indicate if choice exits to another beat (skip typing animation)
        // Prefix choice IDs with nodePath so different dialog nodes don't share IDs
        const choiceId = await renderer.renderChoices(
          visibleChoices.map(c => ({
            id: `${nodePath}_${c.id}`,
            text: this.processText(c.text, context),
            isExit: !!c.target && !c.dialogNode, // Exit if has target but no nested dialog
          })),
          locations
        );

        // First try to match by exact ID (strip nodePath prefix if present)
        const rawChoiceId = choiceId?.startsWith(`${nodePath}_`) ? choiceId.substring(nodePath.length + 1) : choiceId;
        let selectedChoice = visibleChoices.find(c => c.id === rawChoiceId || `${nodePath}_${c.id}` === choiceId);

        // Fallback: if choiceId looks like a button index (e.g., "button1", "button2"),
        // try to match by index. This handles cases where ASML import creates
        // button locations with names like "button1" but choices with IDs like "choice_1"
        if (!selectedChoice && choiceId) {
          const indexMatch = choiceId.toLowerCase().match(/button\s*(\d+)/);
          if (indexMatch) {
            const index = parseInt(indexMatch[1], 10) - 1;
            if (index >= 0 && index < visibleChoices.length) {
              selectedChoice = visibleChoices[index];
              console.log(`[DialogTreeBeat] Matched choice by index: ${choiceId} → ${selectedChoice?.id}`);
            }
          }
        }

        // Second fallback: try to match by choice text (for nested dialogs where
        // button locations are named after choice text)
        if (!selectedChoice && choiceId) {
          selectedChoice = visibleChoices.find(c => c.text === choiceId);
          if (selectedChoice) {
            console.log(`[DialogTreeBeat] Matched choice by text: ${choiceId} → ${selectedChoice?.id}`);
          }
        }

        if (selectedChoice) {
          // Record this choice for AI context
          context.recordChoice({
            beatId: this.id,
            beatName: this.name || this.id,
            beatType: 'dialogTree',
            choiceText: selectedChoice.text,
            choiceContext: this.currentNode?.text
              ? `${this.currentNode.speaker || 'NPC'}: "${this.currentNode.text.substring(0, 100)}${this.currentNode.text.length > 100 ? '...' : ''}"`
              : this.name || 'Dialog choice',
          });

          // Apply effects from the selected choice (canonical effects array, migrated from flat counter fields)
          if (selectedChoice.effects) {
            selectedChoice.effects.forEach(effect => context.applyEffect(effect));
          }

          // Play sound effect
          const choiceWithSound = selectedChoice as any;
          if (choiceWithSound.soundEffect && renderer.playSound) {
            await renderer.playSound({ file: choiceWithSound.soundEffect });
          }

          // Mark this choice as visited using path-prefixed ID for unique tracking
          context.markChoiceVisited(this.id, `${nodePath}_${selectedChoice.id}`);

          // Update renderer's visited choice IDs so UI reflects the change
          if (renderer.setVisitedChoiceIds) {
            renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));
          }

          // New format: target is beat ID to exit, dialogNode continues conversation
          if (selectedChoice.target === '__self__') {
            // Loop back to root choices - add delay so user sees their selection
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.currentNode = this.dialogTree;
            nodePath = 'root'; // Reset path when returning to root
            // Continue the while loop (do NOT set exitTargetBeatId)
          } else if (selectedChoice.target) {
            // Exit to another beat - add delay so user can see their choice was selected
            await new Promise(resolve => setTimeout(resolve, 1000));
            exitTargetBeatId = selectedChoice.target;
            this.currentNode = null; // Exit the while loop
          } else if (selectedChoice.dialogNode) {
            // Continue with nested dialog node
            nodePath = `${nodePath}.${selectedChoice.id}`; // Extend path for unique tracking
            this.currentNode = selectedChoice.dialogNode;
          } else {
            // No target or dialogNode - dialog ends
            break;
          }
        } else {
          // No choice selected - should not happen, but break to be safe
          break;
        }
      } else {
        // No choices on this node - dialog ends (shouldn't happen in new format)
        break;
      }
    }

    // Return exit target if captured, otherwise fall back to getNextBeat()
    if (exitTargetBeatId) {
      return exitTargetBeatId;
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
}
