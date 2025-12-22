/**
 * AI Debug Types
 * Type definitions for the AI debugging system that compares
 * debug files against project state after AI story generation.
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueCategory =
  | 'beat_missing'        // Beat in debug file but not in project
  | 'beat_extra'          // Beat in project but not in debug file
  | 'parameter_mismatch'  // Parameter value differs between debug and project
  | 'connection_missing'  // Expected connection not found
  | 'connection_extra'    // Unexpected connection found
  | 'ui_not_rendered'     // Beat not rendered in graph editor
  | 'console_error'       // JavaScript error in console
  | 'type_mismatch';      // Beat type differs between debug and project

/**
 * A single debug issue found during analysis
 */
export interface DebugIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  beatId?: string;
  beatName?: string;
  expected?: unknown;
  actual?: unknown;
  suggestion?: string;
}

/**
 * Comparison result for a single beat
 */
export interface BeatComparison {
  beatId: string;
  beatName: string;
  beatType: string;
  inDebugFile: boolean;
  inProject: boolean;
  parameterMatches: boolean;
  connectionMatches: boolean;
  renderedInUI: boolean;
  issues: DebugIssue[];
}

/**
 * Summary statistics for the debug analysis
 */
export interface DebugSummary {
  totalBeats: {
    expected: number;  // From debug file
    actual: number;    // In project
    matched: number;   // Successfully matched
  };
  totalConnections: {
    expected: number;
    actual: number;
    matched: number;
  };
  issues: {
    errors: number;
    warnings: number;
    info: number;
  };
  timestamp: string;
  durationMs: number;
}

/**
 * Complete debug analysis result
 */
export interface AIDebugResult {
  success: boolean;  // True if no errors (warnings ok)
  summary: DebugSummary;
  beatComparisons: BeatComparison[];
  issues: DebugIssue[];
  consoleErrors: string[];
  screenshotPath?: string;
}

/**
 * Structure of the debug file saved by AIService.exportStoryDebug()
 */
export interface DebugFileData {
  title: string;
  generatedAt: string;
  status: 'success' | 'failed';
  beatCount: number;
  beatTypes: string[];
  errors: unknown[];
  warnings: unknown[];
  story: {
    metadata: {
      title: string;
      author: string;
      firstBeatId?: string;
    };
    beats: DebugFileBeat[];
    variables?: unknown[];
    characters?: unknown[];
  };
}

/**
 * Beat structure as stored in debug file
 */
export interface DebugFileBeat {
  id: string;
  name?: string;
  type: string;
  parameters?: Record<string, unknown>;
  connections?: Array<{
    targetId?: string;
    target?: string;
    label?: string;
    condition?: unknown;
  }>;
  x?: number;
  y?: number;
  cluster?: string;
}

/**
 * Options for running debug analysis
 */
export interface AIDebugOptions {
  checkUI?: boolean;       // Check if beats rendered in DOM
  checkConsole?: boolean;  // Check for console errors
  takeScreenshot?: boolean; // Capture screenshot (future)
  verbose?: boolean;       // Log detailed progress
}
