/**
 * Helper Command Preview Component
 *
 * Shows a preview of changes before executing a helper command.
 * Displays affected elements, before/after values, and warnings.
 */

import React, { useState } from 'react';
import { Check, X, AlertTriangle, AlertCircle, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { StructuredAction, ChangePreview, PreviewChange } from '../../types/helperCommand';
import { TextDiffPreview } from './TextDiffPreview';

export interface HelperCommandPreviewProps {
  /** The parsed action */
  action: StructuredAction;

  /** Preview of changes */
  preview: ChangePreview;

  /** Execute callback */
  onExecute: () => void;

  /** Cancel callback */
  onCancel: () => void;
}

export const HelperCommandPreview: React.FC<HelperCommandPreviewProps> = ({
  action,
  preview,
  onExecute,
  onCancel,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAllChanges, setShowAllChanges] = useState(false);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Group changes by element type and property
  const groupedChanges = new Map<string, PreviewChange[]>();
  for (const change of preview.changes) {
    const key = `${change.elementType}:${change.property}`;
    if (!groupedChanges.has(key)) {
      groupedChanges.set(key, []);
    }
    groupedChanges.get(key)!.push(change);
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'none';
    if (typeof value === 'object') {
      if (value.type && value.duration) {
        return `${value.type} ${value.duration}ms`;
      }
      if (value.file) {
        return value.file;
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  const hasErrors = preview.errors.length > 0;
  const hasWarnings = preview.warnings.length > 0;
  const isLowConfidence = action.confidence < 0.8;

  return (
    <div className="mx-4 mt-4 border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Preview Changes</h3>
          <span className={`text-xs px-2 py-1 rounded ${
            isLowConfidence ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
          }`}>
            {Math.round(action.confidence * 100)}% confidence
          </span>
        </div>
      </div>

      {/* Errors */}
      {hasErrors && (
        <div className="p-3 bg-red-50 border-b border-red-200">
          {preview.errors.map((error, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="p-3 bg-yellow-50 border-b border-yellow-200">
          {preview.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">{warning}</p>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="p-3 bg-blue-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-900">
            {preview.totalAffected} element{preview.totalAffected !== 1 ? 's' : ''} will be modified
          </span>
        </div>
      </div>

      {/* Change Groups */}
      <div className="max-h-[300px] overflow-y-auto">
        {Array.from(groupedChanges.entries()).map(([key, changes]) => {
          const [elementType, property] = key.split(':');
          const isExpanded = expandedGroups.has(key);
          const displayChanges = showAllChanges ? changes : changes.slice(0, 5);

          return (
            <div key={key} className="border-b border-gray-100 last:border-b-0">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    {elementType}: {property}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {changes.length} change{changes.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Changes List */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {displayChanges.map((change, i) => (
                    <div key={change.id} className="pl-6 py-2 bg-gray-50 rounded text-sm">
                      <div className="font-medium text-gray-800 truncate">
                        {change.elementName}
                      </div>
                      {change.textDiff ? (
                        <TextDiffPreview diff={change.textDiff} />
                      ) : (
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className="text-gray-500">
                            {formatValue(change.oldValue)}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="text-blue-600 font-medium">
                            {formatValue(change.newValue)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {changes.length > 5 && !showAllChanges && (
                    <button
                      onClick={() => setShowAllChanges(true)}
                      className="text-xs text-blue-600 hover:underline pl-6"
                    >
                      Show {changes.length - 5} more changes...
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 p-3 bg-gray-50 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onExecute}
          disabled={hasErrors || preview.totalAffected === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Check className="w-4 h-4" />
          Apply Changes
        </button>
      </div>

      {/* Reasoning */}
      {action.reasoning && (
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            <span className="font-medium">AI reasoning:</span> {action.reasoning}
          </p>
        </div>
      )}
    </div>
  );
};

export default HelperCommandPreview;
