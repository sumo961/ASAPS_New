import type { Story } from '../engine/Story';
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';

/**
 * Represents a node in a story path
 */
export interface PathNode {
  beatId: string;
  beatName: string;
  beatType: string;
  connections: Connection[];
  conditionsMet?: boolean;
}

/**
 * Represents a complete path through the story
 */
export interface StoryPath {
  id: string;
  nodes: PathNode[];
  length: number;
  hasConditionals: boolean;
  conditions: Condition[];
  endType: 'endBeat' | 'deadEnd' | 'cycle' | 'depthLimit';
  endBeatId?: string;
}

/**
 * Result of path analysis
 */
export interface PathAnalysisResult {
  totalPaths: number;
  uniquePaths: StoryPath[];
  shortestPath: StoryPath | null;
  longestPath: StoryPath | null;
  averagePathLength: number;
  deadEnds: string[]; // Beat IDs with no outgoing connections
  cycles: string[][]; // Arrays of beat IDs in cycles
  endingBeats: string[]; // Beat IDs that are story endings
}

/**
 * Configuration for path analysis
 */
export interface PathAnalysisConfig {
  maxDepth?: number; // Maximum path length (default: 100)
  includeConditionalPaths?: boolean; // Include paths with conditions (default: true)
  trackCycles?: boolean; // Track and report cycles (default: true)
}

/**
 * PathAnalyzer - Analyzes all possible paths through a story
 *
 * Uses depth-first search with cycle detection to discover all paths
 * from the first beat to ending beats or dead ends.
 */
export class PathAnalyzer {
  private story: Story;
  private config: Required<PathAnalysisConfig>;
  private visitedInPath: Set<string>;
  private allPaths: StoryPath[];
  private detectedCycles: Set<string>;
  private pathIdCounter: number;

  constructor(story: Story, config: PathAnalysisConfig = {}) {
    this.story = story;
    this.config = {
      maxDepth: config.maxDepth ?? 100,
      includeConditionalPaths: config.includeConditionalPaths ?? true,
      trackCycles: config.trackCycles ?? true
    };
    this.visitedInPath = new Set();
    this.allPaths = [];
    this.detectedCycles = new Set();
    this.pathIdCounter = 0;
  }

  /**
   * Analyze all possible paths through the story
   */
  public analyze(): PathAnalysisResult {
    console.log('[PathAnalyzer] Starting path analysis...');

    // Reset state
    this.allPaths = [];
    this.detectedCycles = new Set();
    this.pathIdCounter = 0;

    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) {
      console.warn('[PathAnalyzer] No first beat found in story');
      return this.createEmptyResult();
    }

    const firstBeat = this.story.getBeat(firstBeatId);
    if (!firstBeat) {
      console.warn('[PathAnalyzer] First beat not found:', firstBeatId);
      return this.createEmptyResult();
    }

    // Start DFS from first beat
    this.visitedInPath = new Set();
    this.explorePath(firstBeat, []);

    console.log(`[PathAnalyzer] Analysis complete. Found ${this.allPaths.length} paths`);

    return this.compileResults();
  }

  /**
   * Find all paths from a specific beat
   */
  public findPathsFromBeat(beatId: string): StoryPath[] {
    const beat = this.story.getBeat(beatId);
    if (!beat) {
      console.warn('[PathAnalyzer] Beat not found:', beatId);
      return [];
    }

    this.allPaths = [];
    this.visitedInPath = new Set();
    this.pathIdCounter = 0;

    this.explorePath(beat, []);

    return this.allPaths;
  }

  /**
   * Detect all cycles in the story graph
   */
  public detectCycles(): string[][] {
    const allBeats = this.story.getAllBeats();
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (beatId: string, path: string[]): void => {
      if (recursionStack.has(beatId)) {
        // Found a cycle
        const cycleStart = path.indexOf(beatId);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycle.push(beatId); // Complete the cycle
          cycles.push(cycle);
        }
        return;
      }

      if (visited.has(beatId)) {
        return;
      }

      visited.add(beatId);
      recursionStack.add(beatId);
      path.push(beatId);

      const beat = this.story.getBeat(beatId);
      if (beat) {
        const connections = beat.getConnections();
        for (const conn of connections) {
          dfs(conn.targetId, [...path]);
        }

        // Check defaultTarget
        if (beat.defaultTarget) {
          dfs(beat.defaultTarget, [...path]);
        }
      }

      recursionStack.delete(beatId);
    };

    for (const beat of allBeats) {
      if (!visited.has(beat.id)) {
        dfs(beat.id, []);
      }
    }

    return cycles;
  }

  /**
   * Explore a path using DFS
   */
  private explorePath(beat: Beat, currentPath: PathNode[]): void {
    const beatId = beat.id;

    // Check for cycle
    if (this.visitedInPath.has(beatId)) {
      if (this.config.trackCycles) {
        const cycleKey = this.createCycleKey(currentPath, beatId);
        this.detectedCycles.add(cycleKey);
      }

      // Save path that leads to cycle
      this.savePath(currentPath, 'cycle', beatId);
      return;
    }

    // Check depth limit
    if (currentPath.length >= this.config.maxDepth) {
      this.savePath(currentPath, 'depthLimit');
      return;
    }

    // Add current beat to path
    const pathNode: PathNode = {
      beatId: beat.id,
      beatName: beat.name,
      beatType: beat.type,
      connections: beat.getConnections()
    };
    const newPath = [...currentPath, pathNode];

    // Mark as visited in current path
    this.visitedInPath.add(beatId);

    // Get all outgoing connections
    const connections = beat.getConnections();
    const defaultTarget = beat.defaultTarget;

    // Check if this is a terminal beat
    const isEndBeat = beat.type === 'endScreen';
    const hasNoConnections = connections.length === 0 && !defaultTarget;

    if (isEndBeat || hasNoConnections) {
      // Terminal beat - save the path
      this.savePath(newPath, isEndBeat ? 'endBeat' : 'deadEnd', beatId);
      this.visitedInPath.delete(beatId);
      return;
    }

    // Explore all connections
    let exploredAny = false;

    for (const connection of connections) {
      const targetBeat = this.story.getBeat(connection.targetId);
      if (!targetBeat) {
        console.warn(`[PathAnalyzer] Target beat not found: ${connection.targetId}`);
        continue;
      }

      // Check if we should include conditional paths
      if (connection.condition && !this.config.includeConditionalPaths) {
        continue;
      }

      // Mark if path has conditions
      if (connection.condition) {
        pathNode.conditionsMet = false; // Unknown until runtime
      }

      this.explorePath(targetBeat, newPath);
      exploredAny = true;
    }

    // Explore defaultTarget if present
    if (defaultTarget) {
      const targetBeat = this.story.getBeat(defaultTarget);
      if (targetBeat) {
        this.explorePath(targetBeat, newPath);
        exploredAny = true;
      }
    }

    // If we didn't explore any connections, this is a dead end
    if (!exploredAny) {
      this.savePath(newPath, 'deadEnd', beatId);
    }

    // Unmark from current path
    this.visitedInPath.delete(beatId);
  }

  /**
   * Save a discovered path
   */
  private savePath(
    path: PathNode[],
    endType: StoryPath['endType'],
    endBeatId?: string
  ): void {
    if (path.length === 0) return;

    const conditions = path
      .flatMap(node => node.connections)
      .map(conn => conn.condition)
      .filter((cond): cond is Condition => cond !== undefined);

    const storyPath: StoryPath = {
      id: `path_${this.pathIdCounter++}`,
      nodes: path,
      length: path.length,
      hasConditionals: conditions.length > 0,
      conditions,
      endType,
      endBeatId
    };

    this.allPaths.push(storyPath);
  }

  /**
   * Create a unique key for a cycle
   */
  private createCycleKey(path: PathNode[], cycleStartId: string): string {
    const cycleStart = path.findIndex(node => node.beatId === cycleStartId);
    if (cycleStart === -1) return cycleStartId;

    const cyclePath = path.slice(cycleStart).map(n => n.beatId);
    cyclePath.push(cycleStartId);
    return cyclePath.sort().join('->');
  }

  /**
   * Compile final results
   */
  private compileResults(): PathAnalysisResult {
    if (this.allPaths.length === 0) {
      return this.createEmptyResult();
    }

    // Find shortest and longest paths
    let shortestPath = this.allPaths[0];
    let longestPath = this.allPaths[0];
    let totalLength = 0;

    for (const path of this.allPaths) {
      if (path.length < shortestPath.length) {
        shortestPath = path;
      }
      if (path.length > longestPath.length) {
        longestPath = path;
      }
      totalLength += path.length;
    }

    const averagePathLength = totalLength / this.allPaths.length;

    // Find dead ends
    const deadEnds = this.allPaths
      .filter(path => path.endType === 'deadEnd')
      .map(path => path.endBeatId!)
      .filter((id, index, self) => self.indexOf(id) === index); // unique

    // Find ending beats
    const endingBeats = this.allPaths
      .filter(path => path.endType === 'endBeat')
      .map(path => path.endBeatId!)
      .filter((id, index, self) => self.indexOf(id) === index); // unique

    // Extract cycles
    const cycles: string[][] = [];
    for (const cycleKey of this.detectedCycles) {
      cycles.push(cycleKey.split('->'));
    }

    return {
      totalPaths: this.allPaths.length,
      uniquePaths: this.allPaths,
      shortestPath,
      longestPath,
      averagePathLength,
      deadEnds,
      cycles,
      endingBeats
    };
  }

  /**
   * Create empty result when no paths found
   */
  private createEmptyResult(): PathAnalysisResult {
    return {
      totalPaths: 0,
      uniquePaths: [],
      shortestPath: null,
      longestPath: null,
      averagePathLength: 0,
      deadEnds: [],
      cycles: [],
      endingBeats: []
    };
  }
}
