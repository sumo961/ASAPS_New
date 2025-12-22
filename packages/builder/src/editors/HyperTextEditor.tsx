import React, { useState, useRef, useMemo } from 'react';
import { Link, X, Palette, Underline as UnderlineIcon } from 'lucide-react';
import { Beat } from '@asaps/core';

/**
 * Word-based hyperlink format (canonical storage format)
 */
export interface HyperLink {
  word: string;
  targetBeatId: string;
  style?: {
    color?: string;
    underline?: boolean;
  };
}

interface HyperTextEditorProps {
  text: string;
  hyperlinks: HyperLink[];
  onChange: (text: string, hyperlinks: HyperLink[]) => void;
  availableBeats: Beat[];
}

/**
 * Find the position of a word in text (case-insensitive)
 */
function findWordPosition(text: string, word: string): { start: number; end: number } | null {
  const lowerText = text.toLowerCase();
  const lowerWord = word.toLowerCase();
  const index = lowerText.indexOf(lowerWord);
  if (index === -1) return null;
  return { start: index, end: index + word.length };
}

export const HyperTextEditor: React.FC<HyperTextEditorProps> = ({
  text,
  hyperlinks,
  onChange,
  availableBeats
}) => {
  const [selection, setSelection] = useState<{ start: number; end: number; word: string } | null>(null);
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Compute positions for all hyperlinks (for display only)
  const hyperlinksWithPositions = useMemo(() => {
    return hyperlinks.map(link => {
      const pos = findWordPosition(text, link.word);
      return {
        ...link,
        start: pos?.start ?? -1,
        end: pos?.end ?? -1,
        found: pos !== null
      };
    }).filter(link => link.found);
  }, [text, hyperlinks]);

  // Handle text change
  const handleTextChange = (newText: string) => {
    // Filter out hyperlinks whose words no longer exist in the text
    const updatedLinks = hyperlinks.filter(link => {
      const lowerText = newText.toLowerCase();
      return lowerText.includes(link.word.toLowerCase());
    });

    onChange(newText, updatedLinks);
  };

  // Handle text selection in preview
  const handlePreviewMouseUp = () => {
    const windowSelection = window.getSelection();
    if (!windowSelection || windowSelection.rangeCount === 0) return;

    const range = windowSelection.getRangeAt(0);
    const previewEl = previewRef.current;
    if (!previewEl || !previewEl.contains(range.commonAncestorContainer)) return;

    const selectedText = windowSelection.toString().trim();
    if (!selectedText || selectedText.length === 0) return;

    // Calculate actual position by walking through all text nodes
    let currentPos = 0;
    let start = -1;
    let end = -1;

    const findPosition = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent || '';
        const nodeLength = nodeText.length;

        if (node === range.startContainer) {
          start = currentPos + range.startOffset;
        }
        if (node === range.endContainer) {
          end = currentPos + range.endOffset;
          return true;
        }

        currentPos += nodeLength;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of Array.from(node.childNodes)) {
          if (findPosition(child)) return true;
        }
      }
      return false;
    };

    findPosition(previewEl);

    if (start !== -1 && end !== -1 && start < end) {
      const word = text.substring(start, end).trim();
      if (word.length > 0) {
        setSelection({ start, end, word });
      }
    }
  };

  // Add hyperlink from selection
  const handleAddLink = () => {
    if (!selection) return;

    // Check if this word already has a link
    const hasExisting = hyperlinks.some(
      link => link.word.toLowerCase() === selection.word.toLowerCase()
    );

    if (hasExisting) {
      alert('This word already has a hyperlink.');
      setSelection(null);
      return;
    }

    const newLink: HyperLink = {
      word: selection.word,
      targetBeatId: '',
      style: {
        color: '#0066cc',
        underline: true
      }
    };

    onChange(text, [...hyperlinks, newLink]);
    setSelection(null);
    setEditingLinkIndex(hyperlinks.length);
  };

  // Update hyperlink
  const handleUpdateLink = (index: number, updates: Partial<HyperLink>) => {
    const updatedLinks = [...hyperlinks];
    updatedLinks[index] = { ...updatedLinks[index], ...updates };
    onChange(text, updatedLinks);
  };

  // Remove hyperlink
  const handleRemoveLink = (index: number) => {
    const updatedLinks = hyperlinks.filter((_, i) => i !== index);
    onChange(text, updatedLinks);
    if (editingLinkIndex === index) {
      setEditingLinkIndex(null);
    }
  };

  // Render text with hyperlinks highlighted
  const renderPreview = () => {
    if (!text) return <span className="text-gray-400 italic">Enter text above...</span>;

    // Sort links by position
    const sortedLinks = [...hyperlinksWithPositions].sort((a, b) => a.start - b.start);

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedLinks.forEach((link, i) => {
      // Add text before link
      if (link.start > lastIndex) {
        const beforeText = text.substring(lastIndex, link.start);
        parts.push(
          <span key={`text-${lastIndex}`}>{beforeText}</span>
        );
      }

      // Add linked text
      const linkText = text.substring(link.start, link.end);
      const beat = availableBeats.find(b => b.id === link.targetBeatId);
      const originalIndex = hyperlinks.findIndex(h => h.word === link.word);

      parts.push(
        <span
          key={`link-${i}`}
          className={`cursor-pointer hover:opacity-75 transition-opacity ${
            editingLinkIndex === originalIndex ? 'ring-2 ring-blue-400 ring-offset-2' : ''
          }`}
          style={{
            color: link.style?.color || '#0066cc',
            textDecoration: link.style?.underline !== false ? 'underline' : 'none',
            textDecorationColor: link.style?.color || '#0066cc'
          }}
          onClick={(e) => {
            e.stopPropagation();
            setEditingLinkIndex(originalIndex);
          }}
          title={beat ? `→ ${beat.name}` : 'No target set'}
        >
          {linkText}
        </span>
      );

      lastIndex = link.end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      parts.push(
        <span key={`text-${lastIndex}`}>{remainingText}</span>
      );
    }

    return parts;
  };

  return (
    <div className="space-y-4">
      {/* Text Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Main Text <span className="text-red-500">*</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          placeholder="Enter your text here. Select text below to create hyperlinks."
        />
      </div>

      {/* Preview with Selectable Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Preview - Select Text to Create Links
        </label>
        <div
          ref={previewRef}
          className="w-full min-h-[100px] px-3 py-2 border-2 border-gray-300 rounded-lg text-sm bg-gray-50 cursor-text select-text"
          onMouseUp={handlePreviewMouseUp}
          style={{ userSelect: 'text' }}
        >
          {renderPreview()}
        </div>
      </div>

      {/* Selection Actions */}
      {selection && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-medium text-blue-900">
                Selected: "{selection.word}"
              </div>
            </div>
            <button
              onClick={handleAddLink}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1"
            >
              <Link className="w-4 h-4" />
              Create Link
            </button>
          </div>
        </div>
      )}

      {/* Hyperlinks List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            <Link className="w-4 h-4 inline mr-1" />
            Hyperlinks ({hyperlinks.length})
          </label>
        </div>

        {hyperlinks.length === 0 && (
          <div className="text-sm text-gray-500 italic py-2">
            No hyperlinks yet. Select text in the preview above to create one.
          </div>
        )}

        <div className="space-y-2">
          {hyperlinks.map((link, index) => {
            const beat = availableBeats.find(b => b.id === link.targetBeatId);
            const isEditing = editingLinkIndex === index;
            const pos = findWordPosition(text, link.word);
            const isValid = pos !== null;

            return (
              <div
                key={index}
                className={`p-3 rounded-lg border-2 transition-all ${
                  isEditing
                    ? 'bg-blue-50 border-blue-400'
                    : isValid
                    ? 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="font-medium text-sm"
                        style={{
                          color: link.style?.color || '#0066cc',
                          textDecoration: link.style?.underline !== false ? 'underline' : 'none'
                        }}
                      >
                        "{link.word}"
                      </span>
                      {!isValid && (
                        <span className="text-xs text-red-500">
                          (not found in text)
                        </span>
                      )}
                    </div>
                    {beat ? (
                      <div className="text-xs text-gray-600">
                        → {beat.name} ({beat.type})
                      </div>
                    ) : (
                      <div className="text-xs text-red-500">
                        ⚠ No target set
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveLink(index)}
                    className="text-red-500 hover:bg-red-50 p-1 rounded"
                    title="Remove link"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Link Settings */}
                <div className="space-y-2 mt-2 pt-2 border-t border-gray-200">
                  {/* Target Beat */}
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      Target Beat <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={link.targetBeatId}
                      onChange={(e) => handleUpdateLink(index, { targetBeatId: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    >
                      <option value="">Select target...</option>
                      {availableBeats.map(beat => (
                        <option key={beat.id} value={beat.id}>
                          {beat.name} ({beat.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Style Controls */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        <Palette className="w-3 h-3 inline mr-1" />
                        Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={link.style?.color || '#0066cc'}
                          onChange={(e) => handleUpdateLink(index, {
                            style: { ...link.style, color: e.target.value }
                          })}
                          className="w-full h-8 rounded border border-gray-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        <UnderlineIcon className="w-3 h-3 inline mr-1" />
                        Underline
                      </label>
                      <div className="flex items-center h-8">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={link.style?.underline !== false}
                            onChange={(e) => handleUpdateLink(index, {
                              style: { ...link.style, underline: e.target.checked }
                            })}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">
                            {link.style?.underline !== false ? 'On' : 'Off'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-xs text-gray-600 space-y-1">
          <div className="font-medium">How to create hyperlinks:</div>
          <div>1. Type or paste your text in the text area above</div>
          <div>2. In the preview, select the text you want to make clickable</div>
          <div>3. Click "Create Link" when selection appears</div>
          <div>4. Choose the target beat for the link</div>
          <div>5. Customize color and underline style as needed</div>
        </div>
      </div>
    </div>
  );
};
