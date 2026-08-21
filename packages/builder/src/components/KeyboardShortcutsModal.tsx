import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { category: 'Flowchart', items: [
      { keys: `${modKey} + D`, action: 'Duplicate selected beat(s)' },
      { keys: `${modKey} + C`, action: 'Copy selected beat' },
      { keys: `${modKey} + V`, action: 'Paste beat (at viewport center)' },
      { keys: 'Delete / Backspace', action: 'Delete selected beat(s) — confirms only when links would break' },
      { keys: 'Shift + drag', action: 'Multi-select beats (marquee); ⌘/Ctrl-click adds' },
    ]},
    { category: 'Project', items: [
      { keys: `${modKey} + N`, action: 'New project' },
      { keys: `${modKey} + O`, action: 'Open project…' },
      { keys: `${modKey} + S`, action: 'Save (untitled projects: opens the naming dialog)' },
      { keys: `${modKey} + Shift + S`, action: 'Save a copy (.asaps)…' },
      { keys: `${modKey} + E`, action: 'Export project' },
    ]},
    { category: 'Windows & panels', items: [
      { keys: `${modKey} + Shift + P`, action: 'Preview window' },
      { keys: `${modKey} + Shift + D`, action: 'Debug tools' },
      { keys: `${modKey} + Shift + C`, action: 'Characters' },
      { keys: `${modKey} + ,`, action: 'Story settings' },
      { keys: `${modKey} + F`, action: 'Search & replace' },
      { keys: `${modKey} + Shift + F`, action: 'Transformations (bulk edit)' },
      { keys: `${modKey} + Shift + A`, action: 'Auto-arrange beats' },
      { keys: '?', action: 'This overview' },
    ]},
    { category: 'Editing', items: [
      { keys: `${modKey} + Z`, action: 'Undo' },
      { keys: `${modKey} + Shift + Z / ${modKey} + Y`, action: 'Redo' },
      { keys: 'Arrows / Shift + arrows', action: 'Nudge element 1px / 10px (Visual Editor)' },
    ]},
    { category: 'Version control', items: [
      { keys: `${modKey} + K`, action: 'Commit… (focuses the message box; ⌘⏎ commits)' },
      { keys: `${modKey} + Shift + K / L`, action: 'Push / Pull' },
      { keys: `${modKey} + Shift + G`, action: 'Toggle the VCS panel' },
    ]},
    { category: 'Preview window', items: [
      { keys: 'Space', action: 'Start / pause / resume' },
      { keys: 'Esc', action: 'Stop, or cancel a pending start' },
      { keys: `${modKey} + I`, action: 'Toggle inventory' },
    ]},
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {shortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="font-medium text-gray-700 mb-3">{section.category}</h3>
                <div className="space-y-2">
                  {section.items.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50">
                      <span className="text-sm text-gray-600">{shortcut.action}</span>
                      <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Tip:</strong> These shortcuts work when no input field is focused. 
              Press <kbd className="px-1 py-0.5 text-xs font-semibold bg-blue-100 rounded">?</kbd> anytime to show this help.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
