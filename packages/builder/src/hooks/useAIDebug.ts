/**
 * useAIDebug Hook
 *
 * React hook for AI debug operations.
 * Provides state management and methods for running debug analysis
 * after AI story generation.
 */

import { useState, useCallback, useRef } from 'react';
import { getAIDebugService } from '../services/AIDebugService';
import type { Beat } from '@asaps/core';
import type { AIDebugResult, AIDebugOptions } from '../types/aiDebug';

interface UseAIDebugOptions extends AIDebugOptions {
  /** Delay in ms before running debug (allows state to settle) */
  delay?: number;
  /** Callback when debug completes */
  onComplete?: (result: AIDebugResult) => void;
}

interface UseAIDebugReturn {
  /** Whether debug analysis is currently running */
  isAnalyzing: boolean;
  /** The debug result (null until analysis completes) */
  result: AIDebugResult | null;
  /** Whether to show the debug modal */
  showModal: boolean;
  /** Run debug analysis on the given beats and connections */
  runDebug: (
    beats: Beat[],
    connections: Array<{ source?: string; target?: string; sourceId?: string; targetId?: string }>
  ) => Promise<AIDebugResult | null>;
  /** Close the debug modal */
  closeModal: () => void;
  /** Clear the result and close modal */
  clearResult: () => void;
  /** Open the modal to show existing result */
  openModal: () => void;
}

export function useAIDebug(options: UseAIDebugOptions = {}): UseAIDebugReturn {
  const {
    checkUI = true,
    checkConsole = true,
    verbose = false,
    delay = 500,
    onComplete,
  } = options;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AIDebugResult | null>(null);
  const [showModal, setShowModal] = useState(false);

  const debugService = useRef(getAIDebugService());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const runDebug = useCallback(async (
    beats: Beat[],
    connections: Array<{ source?: string; target?: string; sourceId?: string; targetId?: string }>
  ): Promise<AIDebugResult | null> => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Add delay to allow React state to settle
    await new Promise<void>(resolve => {
      timeoutRef.current = setTimeout(resolve, delay);
    });

    setIsAnalyzing(true);

    try {
      console.log('[useAIDebug] Starting debug analysis...');

      const debugResult = await debugService.current.runDebugAnalysis(
        beats,
        connections,
        {
          checkUI,
          checkConsole,
          verbose,
        }
      );

      setResult(debugResult);
      setShowModal(true);

      // Log summary to console
      console.log('[useAIDebug] Analysis complete:', {
        success: debugResult.success,
        beatsMatched: `${debugResult.summary.totalBeats.matched}/${debugResult.summary.totalBeats.expected}`,
        errors: debugResult.summary.issues.errors,
        warnings: debugResult.summary.issues.warnings,
        duration: `${debugResult.summary.durationMs.toFixed(0)}ms`,
      });

      // Call completion callback
      onComplete?.(debugResult);

      return debugResult;
    } catch (error) {
      console.error('[useAIDebug] Analysis failed:', error);

      const errorResult: AIDebugResult = {
        success: false,
        summary: {
          totalBeats: { expected: 0, actual: beats.length, matched: 0 },
          totalConnections: { expected: 0, actual: connections.length, matched: 0 },
          issues: { errors: 1, warnings: 0, info: 0 },
          timestamp: new Date().toISOString(),
          durationMs: 0,
        },
        beatComparisons: [],
        issues: [{
          id: 'error_exception',
          severity: 'error',
          category: 'beat_missing',
          message: `Debug analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        consoleErrors: [],
      };

      setResult(errorResult);
      setShowModal(true);

      return errorResult;
    } finally {
      setIsAnalyzing(false);
    }
  }, [checkUI, checkConsole, verbose, delay, onComplete]);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const openModal = useCallback(() => {
    if (result) {
      setShowModal(true);
    }
  }, [result]);

  const clearResult = useCallback(() => {
    setResult(null);
    setShowModal(false);
  }, []);

  return {
    isAnalyzing,
    result,
    showModal,
    runDebug,
    closeModal,
    clearResult,
    openModal,
  };
}
