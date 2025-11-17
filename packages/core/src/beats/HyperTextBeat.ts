import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { HyperTextParameters } from '../generated/beat-types';

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
  public locs: any[] = []; // Visual elements (will include hypertext markers)
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    parameters?: Partial<HyperTextParameters>;
  } & Partial<HyperTextParameters>) {
    super(config);
    
    // Initialize from direct properties or parameters object
    this.text = config.text || config.parameters?.text || 'Click on any word to explore.';
    this.hyperlinks = (config.hyperlinks || config.parameters?.hyperlinks || []) as Array<{
      word: string;
      targetBeatId: string;
      style?: { color?: string; underline?: boolean; bold?: boolean; };
    }>;
    this.allowMultipleClicks = config.allowMultipleClicks ?? config.parameters?.allowMultipleClicks ?? false;
    this.highlightColor = config.highlightColor || config.parameters?.highlightColor || '#0066cc';
    this.hoverColor = config.hoverColor || config.parameters?.hoverColor || '#003366';
    
    // Visual data
    this.node = config.node || config.parameters?.node;
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
    // Set background asset ID in renderer state so it can be resolved
    if (this.node) {
      renderer.setState('backgroundAssetId', this.node);
    }

    // Process text with variable interpolation
    const processedText = this.processText(this.text, context);

    // Get locations array for positioned rendering
    const locations = Array.from(this.locations.values());

    // Prepare hypertext data for renderer
    const hypertextData = {
      text: processedText,
      links: this.hyperlinks.map(link => ({
        word: this.processText(link.word, context),
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
    const selectedTargetId = await renderer.renderHyperText(hypertextData, locations);

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
