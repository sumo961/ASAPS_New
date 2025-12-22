/**
 * AI Debug Modal
 *
 * Displays comprehensive debug analysis results comparing
 * AI-generated debug files against project state.
 */

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Bug,
  Zap,
  Link2,
  Monitor,
  Terminal,
} from 'lucide-react';
import type { AIDebugResult, DebugIssue, BeatComparison } from '../../types/aiDebug';

interface AIDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: AIDebugResult | null;
}

export const AIDebugModal: React.FC<AIDebugModalProps> = ({
  isOpen,
  onClose,
  result,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['summary', 'errors'])
  );
  const [expandedBeats, setExpandedBeats] = useState<Set<string>>(new Set());

  if (!isOpen || !result) return null;

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const toggleBeat = (beatId: string) => {
    const newExpanded = new Set(expandedBeats);
    if (newExpanded.has(beatId)) {
      newExpanded.delete(beatId);
    } else {
      newExpanded.add(beatId);
    }
    setExpandedBeats(newExpanded);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'beat_missing':
      case 'beat_extra':
        return <Zap className="w-4 h-4" />;
      case 'connection_missing':
      case 'connection_extra':
        return <Link2 className="w-4 h-4" />;
      case 'ui_not_rendered':
        return <Monitor className="w-4 h-4" />;
      case 'console_error':
        return <Terminal className="w-4 h-4" />;
      default:
        return <Bug className="w-4 h-4" />;
    }
  };

  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const beatsWithIssues = result.beatComparisons.filter(b => b.issues.length > 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[800px] max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              result.success ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {result.success
                ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                : <XCircle className="w-6 h-6 text-red-600" />
              }
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AI Debug Report</h2>
              <p className="text-sm text-gray-500">
                {result.success
                  ? 'All checks passed'
                  : `${errors.length} error${errors.length !== 1 ? 's' : ''} found`
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Summary Section */}
          <div className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('summary')}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium text-gray-700">Summary</span>
              {expandedSections.has('summary')
                ? <ChevronDown className="w-5 h-5 text-gray-400" />
                : <ChevronRight className="w-5 h-5 text-gray-400" />
              }
            </button>
            {expandedSections.has('summary') && (
              <div className="px-4 pb-4 grid grid-cols-4 gap-3">
                <SummaryCard
                  value={`${result.summary.totalBeats.matched}/${result.summary.totalBeats.expected}`}
                  label="Beats Matched"
                  color="blue"
                />
                <SummaryCard
                  value={`${result.summary.totalConnections.matched}/${result.summary.totalConnections.expected}`}
                  label="Connections"
                  color="purple"
                />
                <SummaryCard
                  value={result.summary.issues.errors}
                  label="Errors"
                  color="red"
                />
                <SummaryCard
                  value={result.summary.issues.warnings}
                  label="Warnings"
                  color="yellow"
                />
              </div>
            )}
          </div>

          {/* Errors Section */}
          {errors.length > 0 && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('errors')}
                className="w-full flex items-center justify-between p-3 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-red-700">
                    Errors ({errors.length})
                  </span>
                </div>
                {expandedSections.has('errors')
                  ? <ChevronDown className="w-5 h-5 text-red-400" />
                  : <ChevronRight className="w-5 h-5 text-red-400" />
                }
              </button>
              {expandedSections.has('errors') && (
                <div className="p-3 space-y-2 bg-white">
                  {errors.map(issue => (
                    <IssueRow key={issue.id} issue={issue} getCategoryIcon={getCategoryIcon} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Warnings Section */}
          {warnings.length > 0 && (
            <div className="border border-yellow-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('warnings')}
                className="w-full flex items-center justify-between p-3 bg-yellow-50 hover:bg-yellow-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <span className="font-medium text-yellow-700">
                    Warnings ({warnings.length})
                  </span>
                </div>
                {expandedSections.has('warnings')
                  ? <ChevronDown className="w-5 h-5 text-yellow-400" />
                  : <ChevronRight className="w-5 h-5 text-yellow-400" />
                }
              </button>
              {expandedSections.has('warnings') && (
                <div className="p-3 space-y-2 bg-white">
                  {warnings.map(issue => (
                    <IssueRow key={issue.id} issue={issue} getCategoryIcon={getCategoryIcon} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Beat Details Section */}
          <div className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('beats')}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-700">
                  Beat Details ({result.beatComparisons.length})
                </span>
                {beatsWithIssues.length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                    {beatsWithIssues.length} with issues
                  </span>
                )}
              </div>
              {expandedSections.has('beats')
                ? <ChevronDown className="w-5 h-5 text-gray-400" />
                : <ChevronRight className="w-5 h-5 text-gray-400" />
              }
            </button>
            {expandedSections.has('beats') && (
              <div className="p-3 space-y-1 max-h-64 overflow-y-auto bg-white">
                {result.beatComparisons.map(comp => (
                  <BeatComparisonRow
                    key={comp.beatId}
                    comparison={comp}
                    isExpanded={expandedBeats.has(comp.beatId)}
                    onToggle={() => toggleBeat(comp.beatId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Console Errors Section */}
          {result.consoleErrors.length > 0 && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('console')}
                className="w-full flex items-center justify-between p-3 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-red-700">
                    Console Errors ({result.consoleErrors.length})
                  </span>
                </div>
                {expandedSections.has('console')
                  ? <ChevronDown className="w-5 h-5 text-red-400" />
                  : <ChevronRight className="w-5 h-5 text-red-400" />
                }
              </button>
              {expandedSections.has('console') && (
                <div className="p-3 space-y-2 bg-white">
                  {result.consoleErrors.map((error, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-red-50 border border-red-200 rounded text-sm font-mono text-red-700 break-all"
                    >
                      {error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Success Message */}
          {result.success && errors.length === 0 && warnings.length === 0 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
                <div>
                  <p className="font-medium text-green-700">All checks passed!</p>
                  <p className="text-sm text-green-600">
                    The AI-generated story matches the project state correctly.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            Analysis completed in {result.summary.durationMs.toFixed(0)}ms
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-components

interface SummaryCardProps {
  value: string | number;
  label: string;
  color: 'blue' | 'red' | 'yellow' | 'green' | 'purple';
}

const SummaryCard: React.FC<SummaryCardProps> = ({ value, label, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
  };

  return (
    <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-75">{label}</div>
    </div>
  );
};

interface IssueRowProps {
  issue: DebugIssue;
  getCategoryIcon: (category: string) => React.ReactNode;
}

const IssueRow: React.FC<IssueRowProps> = ({ issue, getCategoryIcon }) => {
  const severityColors = {
    error: 'border-red-200 bg-red-50',
    warning: 'border-yellow-200 bg-yellow-50',
    info: 'border-blue-200 bg-blue-50',
  };

  const iconColors = {
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500',
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${severityColors[issue.severity]}`}>
      <div className={`mt-0.5 flex-shrink-0 ${iconColors[issue.severity]}`}>
        {issue.severity === 'error' && <XCircle className="w-4 h-4" />}
        {issue.severity === 'warning' && <AlertTriangle className="w-4 h-4" />}
        {issue.severity === 'info' && <Info className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-gray-400">{getCategoryIcon(issue.category)}</span>
          <span className="text-sm font-medium text-gray-700">{issue.message}</span>
        </div>
        {issue.beatId && (
          <div className="text-xs text-gray-500">
            Beat ID: <code className="bg-gray-100 px-1 rounded">{issue.beatId}</code>
          </div>
        )}
        {issue.suggestion && (
          <div className="text-xs text-blue-600 mt-1">
            Suggestion: {issue.suggestion}
          </div>
        )}
        {issue.expected !== undefined && issue.actual !== undefined && (
          <div className="text-xs text-gray-500 mt-1 font-mono">
            Expected: {JSON.stringify(issue.expected)} | Actual: {JSON.stringify(issue.actual)}
          </div>
        )}
      </div>
    </div>
  );
};

interface BeatComparisonRowProps {
  comparison: BeatComparison;
  isExpanded: boolean;
  onToggle: () => void;
}

const BeatComparisonRow: React.FC<BeatComparisonRowProps> = ({
  comparison,
  isExpanded,
  onToggle,
}) => {
  const hasIssues = comparison.issues.length > 0;

  return (
    <div className={`rounded-lg border ${hasIssues ? 'border-red-200' : 'border-gray-200'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {hasIssues
            ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          }
          <span className="text-sm font-medium text-gray-700 truncate">
            {comparison.beatName}
          </span>
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {comparison.beatType}
          </span>
          {hasIssues && (
            <span className="text-xs text-red-600">
              ({comparison.issues.length} issue{comparison.issues.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!comparison.inProject && (
            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Missing</span>
          )}
          {!comparison.renderedInUI && comparison.inProject && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Not Rendered</span>
          )}
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-gray-400" />
            : <ChevronRight className="w-4 h-4 text-gray-400" />
          }
        </div>
      </button>
      {isExpanded && comparison.issues.length > 0 && (
        <div className="px-3 pb-3 space-y-1 border-t border-gray-100">
          {comparison.issues.map(issue => (
            <div key={issue.id} className="text-xs text-gray-600 py-1 pl-6">
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                issue.severity === 'error' ? 'bg-red-500' : 'bg-yellow-500'
              }`} />
              {issue.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AIDebugModal;
