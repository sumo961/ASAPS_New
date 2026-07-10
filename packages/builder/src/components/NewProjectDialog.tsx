/**
 * NewProjectDialog - Dialog for creating a new project
 *
 * Phase 2.5 — also prompts up front for the two project-level choices
 * that are awkward to change later: layout mode (fixed vs responsive)
 * and the responsive orientation policy. Both have safe defaults so a
 * user who just hits "Create Project" gets a sensible responsive
 * landscape project. Authors who explicitly want the legacy
 * pixel-precise canvas can pick "Fixed canvas" up front and avoid a
 * later migration.
 */

import React, { useState } from 'react';
import { X, Folder } from 'lucide-react';
import { useProject } from '../contexts/PersistenceContext';

export interface NewProjectDialogProps {
  /** Called when dialog should close */
  onClose: () => void;

  /** Called after project is successfully created */
  onProjectCreated?: (projectId: string) => void;

  /** Show as modal (default: true) */
  isModal?: boolean;
}

type LayoutMode = 'responsive' | 'fixed';
type OrientationPolicy = 'flexible' | 'landscape' | 'portrait';

/**
 * New project dialog component
 */
export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({
  onClose,
  onProjectCreated,
  isModal = true,
}) => {
  const { create, updateGlobalSettings, project: currentProject } = useProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('responsive');
  const [orientation, setOrientation] = useState<OrientationPolicy>('flexible');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const projectId = await create(name.trim(), description.trim() || undefined);

      // Phase 2.5 — apply the wizard's layout choices to the freshly
      // created project. updateGlobalSettings reads the current project
      // from the persistence ref, which create() has just swapped to
      // the new project, so this hits the right record.
      const existing = (currentProject?.globalSettings ?? {}) as Record<string, any>;
      const nextSettings = {
        ...existing,
        project: {
          ...(existing.project ?? {}),
          // Width/height/aspectRatio default in the create path; we only
          // override the two wizard fields. Keep `scalingMode` undefined
          // here so the existing default applies.
          width: existing.project?.width ?? 1024,
          height: existing.project?.height ?? 768,
          aspectRatio: existing.project?.aspectRatio ?? '4:3',
          scalingMode: existing.project?.scalingMode ?? 'fit',
          layoutMode,
          // Orientation is only meaningful when layoutMode is responsive;
          // fixed projects ignore it but we still persist the value so
          // toggling back is non-destructive.
          orientation,
        },
      };
      await updateGlobalSettings(nextSettings as any);

      if (onProjectCreated) {
        onProjectCreated(projectId);
      }

      onClose();
    } catch (err) {
      console.error('[NewProjectDialog] Failed to create project:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to create project: ${message}`);
      setCreating(false);
    }
  };

  const containerClass = isModal
    ? 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
    : '';

  const dialogClass = isModal
    ? 'bg-white rounded-xl shadow-2xl w-full max-w-md'
    : 'bg-white rounded-lg border border-gray-200 w-full';

  return (
    <div className={containerClass} onClick={isModal ? onClose : undefined}>
      <div
        className={dialogClass}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Folder className="text-blue-600" size={20} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">New Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            disabled={creating}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Project name */}
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Story"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              disabled={creating}
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your project..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              disabled={creating}
              maxLength={500}
            />
          </div>

          {/* Phase 2.5 — Layout mode picker. This is the one authoring
              decision worth making up front, so the two cards explain the
              contract in author terms (not renderer jargon). */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Layout Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLayoutMode('responsive')}
                disabled={creating}
                className={`text-left p-3 rounded-lg border transition ${
                  layoutMode === 'responsive'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <span aria-hidden>📱</span> Responsive
                  {layoutMode === 'responsive' && <span className="ml-auto text-[10px] font-medium text-blue-600">✓ selected</span>}
                </div>
                <div className="text-[11px] text-gray-600 leading-snug mt-1">
                  Text, buttons, and images flow and adapt to any screen —
                  phone, tablet, or desktop. You guide the layout; the
                  player's device decides the exact placement.
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  Best for stories played on many devices.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('fixed')}
                disabled={creating}
                className={`text-left p-3 rounded-lg border transition ${
                  layoutMode === 'fixed'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <span aria-hidden>🎯</span> Static (fixed canvas)
                  {layoutMode === 'fixed' && <span className="ml-auto text-[10px] font-medium text-blue-600">✓ selected</span>}
                </div>
                <div className="text-[11px] text-gray-600 leading-snug mt-1">
                  You place every element at exact pixel positions on a
                  fixed stage. What you see in the editor is exactly what
                  the player sees, scaled to fit their screen.
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  Best for precise, hand-crafted compositions.
                </div>
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              You can switch later in Settings → Project — a migrator converts
              existing beats between the two modes.
            </p>
          </div>

          {/* Phase 2.5 — Orientation policy (only meaningful in responsive) */}
          {layoutMode === 'responsive' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Orientation
              </label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                {([
                  ['flexible',  'Flexible',  'Adapts to device rotation'],
                  ['landscape', 'Landscape', 'Locks to landscape'],
                  ['portrait',  'Portrait',  'Locks to portrait'],
                ] as const).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOrientation(value)}
                    disabled={creating}
                    title={hint}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition ${
                      orientation === value
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                Width-responsiveness is always on; locking only restricts
                the orientation axis (the player shows a "rotate your
                device" overlay when held the other way).
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={creating || !name.trim()}
            >
              {creating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
