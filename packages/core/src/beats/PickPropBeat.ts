import { Beat } from './Beat';
import type { BeatConfig, Effect } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { PickPropParameters, PropOption } from '../generated/beat-types';

export class PickPropBeat extends Beat {
  public question: string;
  public props: PropOption[];
  public choiceDelay?: number; // Delay in seconds before showing choices
  public markVisited?: boolean; // Show visual indication for choices leading to already-visited beats

  constructor(config: BeatConfig & {
    parameters?: Partial<PickPropParameters>;
  } & Partial<PickPropParameters>) {
    super(config);
    this.question = config.question || config.parameters?.question || 'What do you want to interact with?';
    this.props = config.props || config.parameters?.props || [];
    this.choiceDelay = config.choiceDelay || config.parameters?.choiceDelay;
    this.markVisited = config.markVisited ?? config.parameters?.markVisited ?? false;
  }

  getParameters(): Record<string, any> {
    return {
      question: this.question,
      props: this.props,
      node: this.node,
      choiceDelay: this.choiceDelay,
      markVisited: this.markVisited
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.question !== undefined) this.question = params.question;
    if (params.props !== undefined) {
      this.props = params.props;
      // CRITICAL FIX: Rebuild connections from props to ensure they're in sync
      // This fixes the bug where targets added later weren't reflected
      this.clearConnections();
      for (const prop of this.props) {
        if (prop.target) {
          this.addConnection({
            targetId: prop.target,
            label: prop.name || prop.id
          });
        }
      }
    }
    if (params.node !== undefined) this.node = params.node;
    if (params.choiceDelay !== undefined) this.choiceDelay = params.choiceDelay;
    if (params.markVisited !== undefined) this.markVisited = params.markVisited;
  }

  /**
   * Override getConnections to extract all connections from prop options
   * This ensures connections are dynamically generated from props array
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];

    // Extract connections from each prop
    if (this.props && Array.isArray(this.props)) {
      for (const prop of this.props) {
        if (prop.target) {
          connections.push({
            targetId: prop.target,
            label: prop.name || prop.id,
            condition: prop.conditions
          });
        }
      }
    }

    // Also include regular connections from base class (if any)
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
      // Avoid duplicates
      if (!connections.some(c => c.targetId === conn.targetId && c.label === conn.label)) {
        connections.push(conn);
      }
    }

    return connections;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Background is now handled centrally in Beat.execute()

    // Set markVisited state for renderer to use when rendering choices
    renderer.setState('markVisited', this.markVisited || false);

    // Filter props based on conditions
    const availableProps = this.props.filter(prop => {
      if (!prop.conditions) return true;
      return prop.conditions.every(condition => context.checkCondition(condition));
    });

    if (availableProps.length === 0) {
      console.warn(`No available props for beat ${this.id}`);
      return this.getNextBeat(context);
    }

    // Process text with variable interpolation
    const processedQuestion = this.processText(this.question, context);

    // Get locations array for positioned rendering
    const locations = Array.from(this.locations.values());

    // Apply delay if configured (before showing any content)
    if (this.choiceDelay && this.choiceDelay > 0) {
      // Wait for the delay duration before rendering
      await new Promise(resolve => setTimeout(resolve, this.choiceDelay! * 1000));
    }

    // Render the prop selection interface with locations
    // Include locationName for Visual Editor element association
    const propId = await renderer.renderPropSelection(
      processedQuestion,
      availableProps.map(p => ({
        id: p.id,
        name: this.processText(p.name, context),
        description: this.processText(p.description, context),
        locationName: p.locationName  // For visual element association (like movementChoice)
      })),
      locations
    );

    // Find selected prop - match by id first, then by name (for props without id)
    let selectedProp = availableProps.find(p => p.id === propId);
    if (!selectedProp) {
      // Fallback: match by name (case-insensitive)
      const propIdLower = propId?.toLowerCase();
      selectedProp = availableProps.find(p =>
        p.name?.toLowerCase() === propIdLower
      );
    }

    if (selectedProp) {
      // Apply prop effects (e.g., add to inventory)
      if (selectedProp.effects) {
        selectedProp.effects.forEach(effect => context.applyEffect(effect));
      }

      // Add prop to inventory with fallback chain: inventoryName → locationName → name
      const inventoryItemName = selectedProp.inventoryName || selectedProp.locationName || selectedProp.name;
      context.addToInventory(inventoryItemName);

      // Apply direct counter fields (new feature)
      if (selectedProp.counter) {
        const operation = selectedProp.counterOperation || 'change';
        const value = selectedProp.counterValue ?? 1;
        if (operation === 'set') {
          context.setCounter(selectedProp.counter, value);
        } else {
          context.incrementCounter(selectedProp.counter, value);
        }
      }

      // Play sound effect (new feature)
      if (selectedProp.soundEffect && renderer.playSound) {
        await renderer.playSound({ file: selectedProp.soundEffect });
      }

      return selectedProp.target;
    }

    console.warn(`[PickPropBeat] No matching prop found for "${propId}". Available: ${availableProps.map(p => p.id || p.name).join(', ')}`);
    return this.getNextBeat(context);
  }
}
