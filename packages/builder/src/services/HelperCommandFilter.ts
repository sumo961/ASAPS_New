/**
 * Helper Command Filter Service
 *
 * Queries beats, locations, and clusters based on selectors.
 * Used by helper commands to find elements to modify.
 */

import type { Beat, Cluster, Location, ContainerBeatPosition } from '@asaps/core';
import type {
  ElementSelector,
  SelectorFilters,
  SelectorTargetType,
  LocationKind,
} from '../types/helperCommand';

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a filter query
 */
export interface FilterResult {
  /** Matched beats (for beat/location selectors) */
  beats: Beat[];

  /** Matched locations within beats */
  locations: LocationMatch[];

  /** Matched clusters */
  clusters: Cluster[];

  /** Total count of matched elements */
  totalCount: number;
}

/**
 * A matched location with its parent beat
 */
export interface LocationMatch {
  beat: Beat;
  location: Location;
}

/**
 * Context for filtering
 */
export interface FilterContext {
  beats: Beat[];
  clusters: Cluster[];
  containerBeatPositions: ContainerBeatPosition[];
}

// ============================================================================
// Filter Service
// ============================================================================

/**
 * Filter service for helper commands
 */
export class HelperCommandFilter {
  private beats: Beat[] = [];
  private clusters: Cluster[] = [];
  private containerBeatPositions: ContainerBeatPosition[] = [];

  /**
   * Set the data to filter
   */
  setContext(context: FilterContext): void {
    this.beats = context.beats;
    this.clusters = context.clusters;
    this.containerBeatPositions = context.containerBeatPositions;
  }

  /**
   * Query elements based on selector
   */
  query(selector: ElementSelector, exclusion?: ElementSelector): FilterResult {
    let result: FilterResult;

    switch (selector.targetType) {
      case 'beat':
        result = this.queryBeats(selector.filters);
        break;
      case 'location':
        result = this.queryLocations(selector.filters);
        break;
      case 'cluster':
        result = this.queryClusters(selector.filters);
        break;
      case 'connection':
        // Connections are part of beats, filter beats first
        result = this.queryBeats(selector.filters);
        break;
      case 'text':
        // Text is part of beats, filter beats that have text content
        result = this.queryBeatsWithText(selector.filters);
        break;
      default:
        result = { beats: [], locations: [], clusters: [], totalCount: 0 };
    }

    // Apply exclusion if provided
    if (exclusion) {
      result = this.applyExclusion(result, exclusion);
    }

    return result;
  }

  /**
   * Query beats based on filters
   */
  private queryBeats(filters: SelectorFilters): FilterResult {
    let matchedBeats = [...this.beats];

    // Filter by beat type
    if (filters.beatTypes && filters.beatTypes.length > 0) {
      const types = new Set(filters.beatTypes.map(t => t.toLowerCase()));
      matchedBeats = matchedBeats.filter(beat =>
        types.has(beat.type.toLowerCase())
      );
    }

    // Filter by beat IDs
    if (filters.beatIds && filters.beatIds.length > 0) {
      const ids = new Set(filters.beatIds);
      matchedBeats = matchedBeats.filter(beat => ids.has(beat.id));
    }

    // Filter by beat name pattern
    if (filters.beatNamePattern) {
      const pattern = this.createPattern(filters.beatNamePattern);
      matchedBeats = matchedBeats.filter(beat => pattern.test(beat.name));
    }

    // Filter by cluster
    if (filters.clusterName || filters.clusterId) {
      const cluster = this.findCluster(filters.clusterName, filters.clusterId);
      if (cluster) {
        const beatsInCluster = this.getBeatsInCluster(cluster.id);
        const beatIdsInCluster = new Set(beatsInCluster.map(b => b.id));
        matchedBeats = matchedBeats.filter(beat => beatIdsInCluster.has(beat.id));
      } else {
        // Cluster not found, no matches
        matchedBeats = [];
      }
    }

    // Filter by property presence
    if (filters.hasProperty) {
      matchedBeats = matchedBeats.filter(beat =>
        this.beatHasProperty(beat, filters.hasProperty!)
      );
    }

    // Filter by property value
    if (filters.propertyValue) {
      matchedBeats = matchedBeats.filter(beat =>
        this.beatMatchesPropertyValue(beat, filters.propertyValue!)
      );
    }

    // Filter by connections
    if (filters.connectsTo && filters.connectsTo.length > 0) {
      const targets = new Set(filters.connectsTo);
      matchedBeats = matchedBeats.filter(beat =>
        beat.connections.some(conn => targets.has(conn.targetId))
      );
    }

    if (filters.connectedFrom && filters.connectedFrom.length > 0) {
      const sources = new Set(filters.connectedFrom);
      const connectedBeatIds = new Set<string>();
      for (const beat of this.beats) {
        if (sources.has(beat.id)) {
          for (const conn of beat.connections) {
            connectedBeatIds.add(conn.targetId);
          }
        }
      }
      matchedBeats = matchedBeats.filter(beat => connectedBeatIds.has(beat.id));
    }

    return {
      beats: matchedBeats,
      locations: [],
      clusters: [],
      totalCount: matchedBeats.length,
    };
  }

  /**
   * Query locations within beats
   */
  private queryLocations(filters: SelectorFilters): FilterResult {
    // First, get the beats to search in
    const beatsResult = this.queryBeats(filters);
    const locations: LocationMatch[] = [];

    for (const beat of beatsResult.beats) {
      for (const [, location] of beat.locations) {
        // Filter by location kind
        if (filters.locationKind && filters.locationKind.length > 0) {
          if (!filters.locationKind.includes(location.kind as LocationKind)) {
            continue;
          }
        }

        // Filter by location name pattern
        if (filters.locationNamePattern) {
          const pattern = this.createPattern(filters.locationNamePattern);
          if (!pattern.test(location.name)) {
            continue;
          }
        }

        locations.push({ beat, location });
      }
    }

    return {
      beats: beatsResult.beats,
      locations,
      clusters: [],
      totalCount: locations.length,
    };
  }

  /**
   * Query clusters based on filters
   */
  private queryClusters(filters: SelectorFilters): FilterResult {
    let matchedClusters = [...this.clusters];

    // Filter by cluster name
    if (filters.clusterName) {
      const pattern = this.createPattern(filters.clusterName);
      matchedClusters = matchedClusters.filter(cluster =>
        pattern.test(cluster.name)
      );
    }

    // Filter by cluster ID
    if (filters.clusterId) {
      matchedClusters = matchedClusters.filter(cluster =>
        cluster.id === filters.clusterId
      );
    }

    return {
      beats: [],
      locations: [],
      clusters: matchedClusters,
      totalCount: matchedClusters.length,
    };
  }

  /**
   * Query beats that have text content
   */
  private queryBeatsWithText(filters: SelectorFilters): FilterResult {
    // For text queries, if no beat types specified, search ALL beats with text
    const textBeatTypes = [
      'infoText', 'titleScreen', 'endScreen', 'durScreen',
      'dialogTree', 'hyperText', 'inputText', 'movementChoice',
      'pickProp', 'aiDialogTree', 'aiSummary'
    ];

    // If beat types are specified, use them; otherwise search all text-containing beat types
    let matchedBeats: Beat[];

    if (filters.beatTypes && filters.beatTypes.length > 0) {
      // User specified specific beat types - use the regular query
      const beatsResult = this.queryBeats(filters);
      matchedBeats = beatsResult.beats.filter(beat => textBeatTypes.includes(beat.type));
    } else {
      // No beat types specified - search all beats that could have text
      // Start with all beats that have text-bearing types
      matchedBeats = this.beats.filter(beat => textBeatTypes.includes(beat.type));

      // Apply other filters (cluster, name pattern, etc.) if specified
      if (filters.clusterName || filters.clusterId) {
        const cluster = this.findCluster(filters.clusterName, filters.clusterId);
        if (cluster) {
          const beatsInCluster = this.getBeatsInCluster(cluster.id);
          const beatIdsInCluster = new Set(beatsInCluster.map(b => b.id));
          matchedBeats = matchedBeats.filter(beat => beatIdsInCluster.has(beat.id));
        } else {
          matchedBeats = [];
        }
      }

      if (filters.beatNamePattern) {
        const pattern = this.createPattern(filters.beatNamePattern);
        matchedBeats = matchedBeats.filter(beat => pattern.test(beat.name));
      }
    }

    return {
      beats: matchedBeats,
      locations: [],
      clusters: [],
      totalCount: matchedBeats.length,
    };
  }

  /**
   * Apply exclusion filter
   */
  private applyExclusion(result: FilterResult, exclusion: ElementSelector): FilterResult {
    const excluded = this.query(exclusion);
    const excludedBeatIds = new Set(excluded.beats.map(b => b.id));
    const excludedClusterIds = new Set(excluded.clusters.map(c => c.id));

    // Also exclude beats in excluded clusters
    for (const cluster of excluded.clusters) {
      const beatsInCluster = this.getBeatsInCluster(cluster.id);
      for (const beat of beatsInCluster) {
        excludedBeatIds.add(beat.id);
      }
    }

    return {
      beats: result.beats.filter(b => !excludedBeatIds.has(b.id)),
      locations: result.locations.filter(l => !excludedBeatIds.has(l.beat.id)),
      clusters: result.clusters.filter(c => !excludedClusterIds.has(c.id)),
      totalCount: result.totalCount - excluded.totalCount,
    };
  }

  /**
   * Find a cluster by name or ID
   */
  private findCluster(name?: string, id?: string): Cluster | undefined {
    if (id) {
      return this.clusters.find(c => c.id === id);
    }
    if (name) {
      // Try exact match first
      const exact = this.clusters.find(c =>
        c.name.toLowerCase() === name.toLowerCase()
      );
      if (exact) return exact;

      // Try pattern match
      const pattern = this.createPattern(name);
      return this.clusters.find(c => pattern.test(c.name));
    }
    return undefined;
  }

  /**
   * Get all beats in a cluster
   */
  private getBeatsInCluster(clusterId: string): Beat[] {
    const beatIds = this.containerBeatPositions
      .filter(pos => pos.clusterId === clusterId)
      .map(pos => pos.beatId);

    const beatIdSet = new Set(beatIds);
    return this.beats.filter(beat => beatIdSet.has(beat.id));
  }

  /**
   * Check if a beat has a property
   */
  private beatHasProperty(beat: Beat, property: string): boolean {
    // Check direct properties
    if (property in beat && (beat as any)[property] !== undefined) {
      return true;
    }

    // Check parameters
    const params = beat.getParameters();
    if (property in params && params[property] !== undefined) {
      return true;
    }

    return false;
  }

  /**
   * Check if a beat matches a property value filter
   */
  private beatMatchesPropertyValue(
    beat: Beat,
    filter: NonNullable<SelectorFilters['propertyValue']>
  ): boolean {
    // Get the value
    let value: any = (beat as any)[filter.property];
    if (value === undefined) {
      const params = beat.getParameters();
      value = params[filter.property];
    }

    if (value === undefined) {
      return false;
    }

    const operator = filter.operator || 'equals';
    const filterValue = filter.value;

    switch (operator) {
      case 'equals':
        return value === filterValue;
      case 'contains':
        return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'startsWith':
        return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
      case 'endsWith':
        return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
      case 'regex':
        try {
          const regex = new RegExp(String(filterValue), 'i');
          return regex.test(String(value));
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Create a pattern from a string with wildcards
   */
  private createPattern(pattern: string): RegExp {
    // Escape special regex characters except * and ?
    let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // Convert wildcards to regex
    escaped = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Fuzzy match an asset name
   */
  findAssetByName(
    name: string,
    assets: { id: string; name: string }[]
  ): { id: string; name: string } | undefined {
    // Try exact match first
    const exact = assets.find(a =>
      a.name.toLowerCase() === name.toLowerCase()
    );
    if (exact) return exact;

    // Try contains match
    const contains = assets.find(a =>
      a.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(a.name.toLowerCase())
    );
    if (contains) return contains;

    // Try pattern match
    const pattern = this.createPattern(name);
    return assets.find(a => pattern.test(a.name));
  }

  /**
   * Get text content from a beat
   */
  getTextContent(beat: Beat): { field: string; text: string }[] {
    const result: { field: string; text: string }[] = [];
    const params = beat.getParameters();

    // Common text fields
    if (params.text) {
      result.push({ field: 'text', text: params.text });
    }
    if (params.title) {
      result.push({ field: 'title', text: params.title });
    }
    if (params.message) {
      result.push({ field: 'message', text: params.message });
    }
    if (params.buttonText) {
      result.push({ field: 'buttonText', text: params.buttonText });
    }
    if (params.author) {
      result.push({ field: 'author', text: params.author });
    }
    // inputText beat uses 'prompt' for its text content
    if (params.prompt) {
      result.push({ field: 'prompt', text: params.prompt });
    }
    // hyperText and other beats may use 'content'
    if (params.content && typeof params.content === 'string') {
      result.push({ field: 'content', text: params.content });
    }
    // description field used by various beats
    if (params.description) {
      result.push({ field: 'description', text: params.description });
    }

    // Dialog tree text
    if (params.dialogTree) {
      this.extractDialogText(params.dialogTree, result, 'dialogTree');
    }

    // Button/choice labels from locations
    for (const [name, location] of beat.locations) {
      if (location.kind === 'button' && name) {
        result.push({ field: `location.${name}`, text: name });
      }
    }

    return result;
  }

  /**
   * Extract text from dialog tree recursively
   */
  private extractDialogText(
    node: any,
    result: { field: string; text: string }[],
    path: string
  ): void {
    if (!node) return;

    if (node.text) {
      result.push({ field: `${path}.text`, text: node.text });
    }

    if (node.choices && Array.isArray(node.choices)) {
      for (let i = 0; i < node.choices.length; i++) {
        const choice = node.choices[i];
        if (choice.text) {
          result.push({ field: `${path}.choices[${i}].text`, text: choice.text });
        }
        if (choice.target && typeof choice.target === 'object') {
          this.extractDialogText(choice.target, result, `${path}.choices[${i}].target`);
        }
      }
    }

    if (node.next && typeof node.next === 'object') {
      this.extractDialogText(node.next, result, `${path}.next`);
    }
  }
}

// Singleton instance
let filterInstance: HelperCommandFilter | null = null;

/**
 * Get the singleton filter instance
 */
export function getHelperCommandFilter(): HelperCommandFilter {
  if (!filterInstance) {
    filterInstance = new HelperCommandFilter();
  }
  return filterInstance;
}
