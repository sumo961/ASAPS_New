import { Beat } from './Beat';
import type { BeatConfig, Effect } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { PickPropParameters, PropOption } from '../generated/beat-types';
import { migrateChoiceEffects } from '../migration/effectsMigration';

export class PickPropBeat extends Beat {
  public question: string;
  public props: PropOption[];
  public choiceDelay?: number; // Delay in seconds before showing choices
  public markVisited?: boolean; // Block and dim choices leading to previously visited beats

  constructor(config: BeatConfig & {
    parameters?: Partial<PickPropParameters>;
  } & Partial<PickPropParameters>) {
    super(config);
    this.question = config.question || config.parameters?.question || 'What do you want to interact with?';
    this.props = config.props || config.parameters?.props || [];
    this.choiceDelay = config.choiceDelay || config.parameters?.choiceDelay;
    this.markVisited = config.markVisited ?? config.parameters?.markVisited ?? false;

    // Migrate flat counter fields → canonical effects on all props
    this.props.forEach(p => migrateChoiceEffects(p as any));
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

    // Reset visited choice IDs to this beat's choices (empty on first visit).
    // Prevents stale visitedChoiceIds from a previous beat causing false-positive dimming.
    if (renderer.setVisitedChoiceIds) {
      renderer.setVisitedChoiceIds(context.getVisitedChoicesForBeat(this.id));
    }

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
        displayName: p.displayName ? this.processText(p.displayName, context) : undefined,
        description: this.processText(p.description, context),
        locationName: p.locationName,  // For visual element association (like movementChoice)
        // P3-3c-8 — normalized spatial hotspot. Routes through SpatialFlowView
        // when any prop has it AND there are no baked locations.
        hotspot: (p as any).hotspot,
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
      // Record this choice for AI context
      context.recordChoice({
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'pickProp',
        choiceText: `Picked up ${selectedProp.displayName || selectedProp.name}`,
        choiceContext: this.question,
      });

      // Apply prop effects (canonical effects array, migrated from flat counter fields)
      if (selectedProp.effects) {
        selectedProp.effects.forEach(effect => context.applyEffect(effect));
      }

      // Add prop to inventory with fallback chain: inventoryName → locationName → name
      const inventoryItemName = selectedProp.inventoryName || selectedProp.locationName || selectedProp.name;
      context.addToInventory(inventoryItemName);

      // Play sound effect
      if (selectedProp.soundEffect && renderer.playSound) {
        await renderer.playSound({ file: selectedProp.soundEffect });
      }

      return selectedProp.target;
    }

    console.warn(`[PickPropBeat] No matching prop found for "${propId}". Available: ${availableProps.map(p => p.id || p.name).join(', ')}`);
    return this.getNextBeat(context);
  }
}
