/**
 * AI Debug Service
 *
 * Compares AI-generated debug files against project state
 * to identify discrepancies after story generation.
 */

import type { Beat } from '@asaps/core';
import type {
  AIDebugResult,
  DebugFileData,
  DebugFileBeat,
  BeatComparison,
  DebugIssue,
  DebugSummary,
  AIDebugOptions,
} from '../types/aiDebug';

export class AIDebugService {
  private startTime: number = 0;

  /**
   * Get the latest debug file from localStorage
   */
  getLatestDebugFile(): DebugFileData | null {
    if (typeof window === 'undefined') return null;

    try {
      const data = localStorage.getItem('asaps_latest_debug');
      if (!data) {
        console.warn('[AIDebugService] No debug file found in localStorage');
        return null;
      }
      return JSON.parse(data) as DebugFileData;
    } catch (error) {
      console.error('[AIDebugService] Failed to parse debug file:', error);
      return null;
    }
  }

  /**
   * Get debug history (last 5 files)
   */
  getDebugHistory(): Array<{ filename: string; timestamp: number; data: DebugFileData }> {
    if (typeof window === 'undefined') return [];

    try {
      const history = localStorage.getItem('asaps_debug_history');
      return history ? JSON.parse(history) : [];
    } catch {
      return [];
    }
  }

  /**
   * Run full debug comparison
   */
  async runDebugAnalysis(
    projectBeats: Beat[],
    projectConnections: Array<{ source?: string; target?: string; sourceId?: string; targetId?: string }>,
    options: AIDebugOptions = {}
  ): Promise<AIDebugResult> {
    this.startTime = performance.now();

    const {
      checkUI = true,
      checkConsole = true,
      verbose = false,
    } = options;

    if (verbose) {
      console.log('[AIDebugService] Starting debug analysis...');
    }

    const debugFile = this.getLatestDebugFile();
    if (!debugFile) {
      return this.createErrorResult('No debug file found in localStorage. Generate a story first.');
    }

    if (verbose) {
      console.log('[AIDebugService] Debug file loaded:', debugFile.title);
      console.log('[AIDebugService] Expected beats:', debugFile.beatCount);
      console.log('[AIDebugService] Project beats:', projectBeats.length);
    }

    const issues: DebugIssue[] = [];
    const beatComparisons: BeatComparison[] = [];

    // Step 1: Compare beats
    const { comparisons, beatIssues } = this.compareBeats(
      debugFile.story.beats,
      projectBeats,
      verbose
    );
    beatComparisons.push(...comparisons);
    issues.push(...beatIssues);

    // Step 2: Compare connections
    const connectionIssues = this.compareConnections(
      debugFile.story.beats,
      projectBeats,
      projectConnections,
      verbose
    );
    issues.push(...connectionIssues);

    // Step 3: Check UI rendering
    let consoleErrors: string[] = [];
    if (checkUI) {
      const uiIssues = this.checkUIRendering(projectBeats, verbose);
      issues.push(...uiIssues);

      // Update beat comparisons with UI status
      for (const comp of beatComparisons) {
        comp.renderedInUI = !uiIssues.some(
          i => i.beatId === comp.beatId && i.category === 'ui_not_rendered'
        );
      }
    }

    // Step 4: Check console errors
    if (checkConsole) {
      consoleErrors = this.getRecentConsoleErrors();
      consoleErrors.forEach((error, idx) => {
        issues.push({
          id: `console_${Date.now()}_${idx}`,
          severity: 'error',
          category: 'console_error',
          message: error,
        });
      });
    }

    // Build summary
    const summary = this.buildSummary(debugFile, projectBeats, projectConnections, issues);

    const result: AIDebugResult = {
      success: issues.filter(i => i.severity === 'error').length === 0,
      summary,
      beatComparisons,
      issues,
      consoleErrors,
    };

    if (verbose) {
      console.log('[AIDebugService] Analysis complete:', {
        success: result.success,
        errors: summary.issues.errors,
        warnings: summary.issues.warnings,
        duration: `${summary.durationMs.toFixed(0)}ms`,
      });
    }

    return result;
  }

  /**
   * Compare beats between debug file and project
   */
  private compareBeats(
    debugBeats: DebugFileBeat[],
    projectBeats: Beat[],
    verbose: boolean
  ): { comparisons: BeatComparison[]; beatIssues: DebugIssue[] } {
    const comparisons: BeatComparison[] = [];
    const issues: DebugIssue[] = [];

    const debugBeatMap = new Map(debugBeats.map(b => [b.id, b]));
    const projectBeatMap = new Map(projectBeats.map(b => [b.id, b]));

    if (verbose) {
      console.log(`[AIDebugService] Comparing ${debugBeats.length} debug beats vs ${projectBeats.length} project beats`);
    }

    // Check all debug file beats
    for (const debugBeat of debugBeats) {
      const projectBeat = projectBeatMap.get(debugBeat.id);
      const comparison: BeatComparison = {
        beatId: debugBeat.id,
        beatName: debugBeat.name || debugBeat.id,
        beatType: debugBeat.type,
        inDebugFile: true,
        inProject: !!projectBeat,
        parameterMatches: false,
        connectionMatches: false,
        renderedInUI: false,
        issues: [],
      };

      if (!projectBeat) {
        const issue: DebugIssue = {
          id: `missing_${debugBeat.id}`,
          severity: 'error',
          category: 'beat_missing',
          message: `Beat "${debugBeat.name || debugBeat.id}" (${debugBeat.type}) exists in debug file but not in project`,
          beatId: debugBeat.id,
          beatName: debugBeat.name,
          suggestion: 'Check if the beat was created correctly during import',
        };
        issues.push(issue);
        comparison.issues.push(issue);
      } else {
        // Compare types
        if (debugBeat.type !== projectBeat.type) {
          const issue: DebugIssue = {
            id: `type_${debugBeat.id}`,
            severity: 'error',
            category: 'type_mismatch',
            message: `Beat "${debugBeat.id}" has type "${projectBeat.type}" but expected "${debugBeat.type}"`,
            beatId: debugBeat.id,
            expected: debugBeat.type,
            actual: projectBeat.type,
          };
          issues.push(issue);
          comparison.issues.push(issue);
        }

        // Compare key parameters
        const paramIssues = this.compareParameters(debugBeat, projectBeat);
        comparison.parameterMatches = paramIssues.length === 0;
        issues.push(...paramIssues);
        comparison.issues.push(...paramIssues);
      }

      comparisons.push(comparison);
    }

    // Check for extra beats in project (not in debug file)
    for (const projectBeat of projectBeats) {
      if (!debugBeatMap.has(projectBeat.id)) {
        // This is only a warning - extra beats may be intentional
        const issue: DebugIssue = {
          id: `extra_${projectBeat.id}`,
          severity: 'warning',
          category: 'beat_extra',
          message: `Beat "${projectBeat.name || projectBeat.id}" exists in project but not in debug file`,
          beatId: projectBeat.id,
          beatName: projectBeat.name,
        };
        issues.push(issue);
      }
    }

    return { comparisons, beatIssues: issues };
  }

  /**
   * Compare parameters between debug and project beat
   */
  private compareParameters(debugBeat: DebugFileBeat, projectBeat: Beat): DebugIssue[] {
    const issues: DebugIssue[] = [];
    const debugParams = debugBeat.parameters || {};
    const projectParams = projectBeat.getParameters?.() || (projectBeat as unknown as { parameters?: Record<string, unknown> }).parameters || {};

    // Key parameters to check by beat type
    const keyParams: Record<string, string[]> = {
      titleScreen: ['title', 'subtitle'],
      infoText: ['text', 'buttonText'],
      dialogTree: ['dialogTree'],
      movementChoice: ['text', 'choices'],
      endScreen: ['message'],
      setVariable: ['name', 'value', 'type', 'operation'],
      conditionBeat: ['conditionType', 'variableName', 'operator', 'value'],
      hyperText: ['text', 'hyperlinks'],
      pickProp: ['question', 'props'],
      durScreen: ['duration', 'text'],
      videoBeat: ['videoUrl', 'autoplay'],
      inputText: ['placeholder', 'variableName'],
    };

    const paramsToCheck = keyParams[debugBeat.type] || [];

    for (const param of paramsToCheck) {
      const expected = debugParams[param];
      const actual = projectParams[param];

      if (expected !== undefined && actual === undefined) {
        issues.push({
          id: `param_missing_${debugBeat.id}_${param}`,
          severity: 'warning',
          category: 'parameter_mismatch',
          message: `Beat "${debugBeat.name || debugBeat.id}" missing parameter "${param}"`,
          beatId: debugBeat.id,
          beatName: debugBeat.name,
          expected,
          actual,
        });
      }
    }

    return issues;
  }

  /**
   * Compare connections between debug file and project
   */
  private compareConnections(
    debugBeats: DebugFileBeat[],
    projectBeats: Beat[],
    projectConnections: Array<{ source?: string; target?: string; sourceId?: string; targetId?: string }>,
    verbose: boolean
  ): DebugIssue[] {
    const issues: DebugIssue[] = [];

    // Extract expected connections from debug beats
    const expectedConnections = new Set<string>();
    for (const beat of debugBeats) {
      const targets = this.extractConnectionTargets(beat);
      targets.forEach(target => {
        expectedConnections.add(`${beat.id}->${target}`);
      });
    }

    // Extract actual connections from project
    const actualConnections = new Set<string>();

    // From story-level connections array
    for (const conn of projectConnections) {
      const source = conn.source || conn.sourceId;
      const target = conn.target || conn.targetId;
      if (source && target) {
        actualConnections.add(`${source}->${target}`);
      }
    }

    // From beat-level connections
    for (const beat of projectBeats) {
      const targets = this.extractConnectionTargetsFromBeat(beat);
      targets.forEach(target => {
        actualConnections.add(`${beat.id}->${target}`);
      });
    }

    if (verbose) {
      console.log(`[AIDebugService] Expected connections: ${expectedConnections.size}`);
      console.log(`[AIDebugService] Actual connections: ${actualConnections.size}`);
    }

    // Find missing connections
    for (const expected of expectedConnections) {
      if (!actualConnections.has(expected)) {
        const [source, target] = expected.split('->');
        issues.push({
          id: `conn_missing_${expected.replace('->', '_')}`,
          severity: 'error',
          category: 'connection_missing',
          message: `Connection from "${source}" to "${target}" is missing`,
          beatId: source,
          expected: target,
        });
      }
    }

    return issues;
  }

  /**
   * Extract connection targets from a debug file beat
   */
  private extractConnectionTargets(beat: DebugFileBeat): string[] {
    const targets: string[] = [];

    // Top-level connections array
    if (beat.connections) {
      beat.connections.forEach(c => {
        if (c.targetId) targets.push(c.targetId);
        if (c.target) targets.push(c.target);
      });
    }

    // Parameters-based connections
    const params = beat.parameters || {};

    // Generic connection
    if (typeof params.connection === 'object' && params.connection !== null) {
      const conn = params.connection as { target?: string };
      if (conn.target) targets.push(conn.target);
    }

    // ConditionBeat
    if (params.trueTarget) targets.push(params.trueTarget as string);
    if (params.falseTarget) targets.push(params.falseTarget as string);
    if (typeof params.trueConnection === 'object' && params.trueConnection !== null) {
      const tc = params.trueConnection as { target?: string };
      if (tc.target) targets.push(tc.target);
    }
    if (typeof params.falseConnection === 'object' && params.falseConnection !== null) {
      const fc = params.falseConnection as { target?: string };
      if (fc.target) targets.push(fc.target);
    }

    // MovementChoice / PickProp / RandomTarget
    const choiceArrays = [params.choices, params.props];
    for (const arr of choiceArrays) {
      if (Array.isArray(arr)) {
        arr.forEach((c: { target?: string }) => {
          if (c.target) targets.push(c.target);
        });
      }
    }

    // DialogTree
    if (typeof params.dialogTree === 'object' && params.dialogTree !== null) {
      const dt = params.dialogTree as { choices?: Array<{ target?: string }> };
      if (Array.isArray(dt.choices)) {
        dt.choices.forEach(c => {
          if (c.target) targets.push(c.target);
        });
      }
    }

    // HyperText
    if (Array.isArray(params.hyperlinks)) {
      params.hyperlinks.forEach((link: { targetBeatId?: string }) => {
        if (link.targetBeatId) targets.push(link.targetBeatId);
      });
    }

    // Default target
    if (params.defaultTarget) targets.push(params.defaultTarget as string);

    return [...new Set(targets)]; // Deduplicate
  }

  /**
   * Extract connection targets from a project Beat instance
   */
  private extractConnectionTargetsFromBeat(beat: Beat): string[] {
    const targets: string[] = [];

    // From getConnections() method
    if (typeof beat.getConnections === 'function') {
      const conns = beat.getConnections();
      conns.forEach(c => {
        if (c.targetId) targets.push(c.targetId);
      });
    }

    // From connections array
    const beatAny = beat as unknown as { connections?: Array<{ targetId?: string }> };
    if (Array.isArray(beatAny.connections)) {
      beatAny.connections.forEach(c => {
        if (c.targetId) targets.push(c.targetId);
      });
    }

    return [...new Set(targets)];
  }

  /**
   * Check if beats are rendered in the UI
   */
  private checkUIRendering(projectBeats: Beat[], verbose: boolean): DebugIssue[] {
    const issues: DebugIssue[] = [];

    if (typeof document === 'undefined') {
      if (verbose) console.log('[AIDebugService] DOM not available, skipping UI check');
      return issues;
    }

    // ReactFlow nodes have data-id attributes
    const beatNodes = document.querySelectorAll('[data-id]');
    const renderedBeatIds = new Set<string>();

    beatNodes.forEach(node => {
      const id = node.getAttribute('data-id');
      if (id) renderedBeatIds.add(id);
    });

    if (verbose) {
      console.log(`[AIDebugService] Found ${renderedBeatIds.size} rendered nodes in DOM`);
    }

    for (const beat of projectBeats) {
      if (!renderedBeatIds.has(beat.id)) {
        issues.push({
          id: `ui_missing_${beat.id}`,
          severity: 'warning',
          category: 'ui_not_rendered',
          message: `Beat "${beat.name || beat.id}" is not rendered in the graph editor`,
          beatId: beat.id,
          beatName: beat.name,
          suggestion: 'Try refreshing the graph view or check if beat is in a collapsed cluster',
        });
      }
    }

    return issues;
  }

  /**
   * Get recent console errors
   * Note: In a real implementation, this would use Chrome DevTools MCP
   */
  private getRecentConsoleErrors(): string[] {
    // Chrome DevTools MCP integration would go here
    // For now, we'll return an empty array as console errors
    // need to be captured at runtime
    return [];
  }

  /**
   * Build summary statistics
   */
  private buildSummary(
    debugFile: DebugFileData,
    projectBeats: Beat[],
    projectConnections: Array<{ source?: string; target?: string; sourceId?: string; targetId?: string }>,
    issues: DebugIssue[]
  ): DebugSummary {
    const durationMs = performance.now() - this.startTime;

    const missingBeats = issues.filter(i => i.category === 'beat_missing').length;
    const expectedConnections = debugFile.story.beats.reduce((sum, b) => {
      return sum + this.extractConnectionTargets(b).length;
    }, 0);
    const missingConnections = issues.filter(i => i.category === 'connection_missing').length;

    return {
      totalBeats: {
        expected: debugFile.beatCount,
        actual: projectBeats.length,
        matched: debugFile.beatCount - missingBeats,
      },
      totalConnections: {
        expected: expectedConnections,
        actual: projectConnections.length,
        matched: expectedConnections - missingConnections,
      },
      issues: {
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length,
      },
      timestamp: new Date().toISOString(),
      durationMs,
    };
  }

  /**
   * Create an error result when debug cannot run
   */
  private createErrorResult(message: string): AIDebugResult {
    return {
      success: false,
      summary: {
        totalBeats: { expected: 0, actual: 0, matched: 0 },
        totalConnections: { expected: 0, actual: 0, matched: 0 },
        issues: { errors: 1, warnings: 0, info: 0 },
        timestamp: new Date().toISOString(),
        durationMs: 0,
      },
      beatComparisons: [],
      issues: [{
        id: 'error_init',
        severity: 'error',
        category: 'beat_missing',
        message,
      }],
      consoleErrors: [],
    };
  }
}

// Singleton instance
let debugServiceInstance: AIDebugService | null = null;

export function getAIDebugService(): AIDebugService {
  if (!debugServiceInstance) {
    debugServiceInstance = new AIDebugService();
  }
  return debugServiceInstance;
}
