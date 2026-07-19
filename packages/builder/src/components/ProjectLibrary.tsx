/**
 * ProjectLibrary - Project management UI
 *
 * Displays all projects with:
 * - Grid/list view of projects
 * - Create new project
 * - Load/delete projects
 * - Search and sort
 * - Project metadata display
 */

import React, { useState, useEffect } from 'react';
import { Plus, Folder, Trash2, Clock, Calendar, Search, Grid, List, Archive, CheckSquare, Square, FileText, Sparkles, Wand2, Download } from 'lucide-react';
import { usePersistence, useProject } from '../contexts/PersistenceContext';
import { TemplateShelf } from './TemplateGallery';
import type { Project } from '../storage/types';
import { getProjectMeta } from '../utils/projectMeta';

export interface ProjectLibraryProps {
  /** Called when a project is selected to load */
  onLoadProject: (projectId: string) => void;

  /** Called when requesting to create a new project */
  onCreateProject: () => void;

  /** Called when the From Prompt card is picked. The library closes
   *  itself; the parent opens the AI Story Generator. Omit to leave
   *  the card disabled with the SOON badge. */
  onOpenStoryFromPrompt?: () => void;

  /** Called when the Ideator card is picked. Closes the library;
   *  parent opens the SessionsPanel. Omit to leave the card SOON. */
  onOpenIdeator?: () => void;

  /** ZIP export handler */
  onExportZip?: () => void;

  /** ZIP import handler — opens the file picker. */
  onImportZip?: () => void;

  /** ZIP import handler that takes a pre-selected File. Used by the
   *  drag-drop zone on the Browser surface so authors can drop a
   *  .asaps zip directly without going through the file picker. */
  onImportZipFile?: (file: File) => Promise<void>;

  /** Called when renaming a project */
  onRenameProject?: (projectId: string, newName: string) => Promise<void>;

  /** Show as modal dialog */
  isModal?: boolean;

  /** Called when modal should close */
  onClose?: () => void;

  /** Currently active/open project ID. In the in-editor modal mode
   *  this is the project the editor has loaded; in non-modal mode
   *  (the StartWindow page) this is the last-session project read
   *  from localStorage, surfaced as a Continue CTA. */
  currentProjectId?: string;

  /** Optional handler for the Continue banner CTA when the Library
   *  is rendered as a non-modal page (StartWindow). When omitted,
   *  the banner falls back to onClose if the Library is modal.
   *  Picks the existing project and routes the user into the
   *  editor — typically via electronAPI.start.pick. */
  onContinueLast?: () => void;

  /** Called after the currently open project is deleted so the host can reset */
  onCurrentProjectDeleted?: () => void;
}

/**
 * Format date for display.
 *
 * Uses calendar-day comparison (local timezone) rather than rolling-24h
 * windows. A timestamp from yesterday at 19:54, viewed today at 13:33,
 * is ~17.5 hours ago — under the prior rolling-24h logic that fell into
 * the same bucket as "1 hour ago" and was mislabelled "Today 19:54".
 * Now it correctly reads "Yesterday 19:54".
 */
function formatDate(date: Date): string {
  const now = new Date();
  const time = date.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // Compare on calendar-day boundaries in the local timezone.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
  // Future timestamps (clock skew, edited future-dated metadata) and
  // anything older than a week fall through to the locale date format.
  return date.toLocaleDateString();
}

// getProjectMeta moved to ../utils/projectMeta — see import above.

/**
 * Project card component
 */
const ProjectCard: React.FC<{
  project: Project;
  onLoad: () => void;
  onDelete: () => void;
  onRename?: (newName: string) => Promise<void>;
  viewMode: 'grid' | 'list';
  isSelected?: boolean;
  onToggleSelect?: () => void;
  showCheckbox?: boolean;
  isCurrentProject?: boolean;
}> = ({ project, onLoad, onDelete, onRename, viewMode, isSelected = false, onToggleSelect, showCheckbox = false, isCurrentProject = false }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [isSavingRename, setIsSavingRename] = useState(false);
  const meta = getProjectMeta(project);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    } else {
      onDelete();
    }
  };

  const handleRename = async () => {
    console.log('[ProjectLibrary] handleRename called - onRename:', !!onRename, 'renameValue:', renameValue);
    if (!onRename) {
      console.log('[ProjectLibrary] No onRename handler, aborting');
      return;
    }
    if (renameValue.trim() === project.name.trim()) {
      console.log('[ProjectLibrary] Name unchanged, cancelling rename');
      setIsRenaming(false);
      return;
    }
    if (renameValue.trim().length === 0) {
      console.log('[ProjectLibrary] Name empty, showing error');
      alert('Project name cannot be empty');
      return;
    }
    console.log('[ProjectLibrary] Starting rename to:', renameValue.trim());
    setIsSavingRename(true);
    try {
      await onRename(renameValue.trim());
      console.log('[ProjectLibrary] Rename successful');
      setIsRenaming(false);
    } catch (error) {
      console.error('[ProjectLibrary] Rename failed:', error);
      alert('Failed to rename project');
    } finally {
      setIsSavingRename(false);
    }
  };

  if (viewMode === 'list') {
    return (
      <div
        className={`flex items-center gap-4 p-4 border rounded-lg hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group ${
          isCurrentProject
            ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
            : isSelected
            ? 'border-blue-500 bg-blue-50'
            : 'bg-white border-gray-200'
        }`}
        onClick={onLoad}
      >
        {/* Current project indicator */}
        {isCurrentProject && (
          <div className="flex-shrink-0 px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded">
            OPEN
          </div>
        )}
        {showCheckbox && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-100"
          >
            {isSelected ? (
              <CheckSquare className="text-blue-600" size={20} />
            ) : (
              <Square className="text-gray-400" size={20} />
            )}
          </button>
        )}
        <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <Folder className="text-blue-600" size={24} />
        </div>

        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename();
                  }
                  if (e.key === 'Escape') {
                    setIsRenaming(false);
                    setRenameValue(project.name);
                  }
                }}
                disabled={isSavingRename}
                className="px-2 py-1 border border-gray-300 rounded text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                maxLength={100}
              />
              <button
                onClick={handleRename}
                disabled={isSavingRename}
                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
              >
                {isSavingRename ? '...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setIsRenaming(false);
                  setRenameValue(project.name);
                }}
                disabled={isSavingRename}
                className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <h3
                className="text-lg font-semibold text-gray-900 truncate hover:text-blue-600 cursor-pointer flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRename) setIsRenaming(true);
                }}
                title={onRename ? "Click to rename" : project.name}
              >
                <span>{project.name}</span>
                {onRename && (
                  <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    ✏️
                  </span>
                )}
              </h3>
              {project.description && (
                <p className="text-sm text-gray-600 truncate">{project.description}</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <Clock size={14} />
            <span>{formatDate(project.modifiedAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar size={14} />
            <span>{formatDate(project.createdAt)}</span>
          </div>
        </div>

        <button
          onClick={handleDelete}
          className={`flex-shrink-0 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100 ${
            showDeleteConfirm
              ? 'bg-red-500 text-white'
              : 'hover:bg-red-50 text-red-600'
          }`}
          title={showDeleteConfirm ? 'Click again to confirm' : 'Delete project'}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative border rounded-lg p-5 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group ${
        isCurrentProject
          ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
          : isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'bg-white border-gray-200'
      }`}
      onClick={onLoad}
    >
      {/* Current-project badge — small inline pill at top-left now
          that the thumbnail strip is gone. Sits above the title row. */}
      {isCurrentProject && (
        <div className="mb-2 inline-block px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded">
          OPEN
        </div>
      )}
      {/* Hover-revealed selection + delete controls. Selection
          pinned top-left when in selection mode (slides in over the
          OPEN badge in a wash of white so both stay readable);
          delete pinned top-right. */}
      {showCheckbox && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          className="absolute top-3 left-3 z-10 p-1 rounded bg-white/95 hover:bg-white shadow"
        >
          {isSelected ? (
            <CheckSquare className="text-blue-600" size={20} />
          ) : (
            <Square className="text-gray-400" size={20} />
          )}
        </button>
      )}
      <button
        onClick={handleDelete}
        className={`absolute top-3 right-3 z-10 p-1.5 rounded-md transition-opacity opacity-0 group-hover:opacity-100 ${
          showDeleteConfirm
            ? 'bg-red-500 text-white'
            : 'bg-white/90 hover:bg-red-50 text-red-600 shadow-sm'
        }`}
        title={showDeleteConfirm ? 'Click again to confirm' : 'Delete project'}
      >
        <Trash2 size={16} />
      </button>

      {isRenaming ? (
        <div className="mb-4" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRename();
              }
              if (e.key === 'Escape') {
                setIsRenaming(false);
                setRenameValue(project.name);
              }
            }}
            disabled={isSavingRename}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            maxLength={100}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleRename}
              disabled={isSavingRename}
              className="flex-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
            >
              {isSavingRename ? '...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsRenaming(false);
                setRenameValue(project.name);
              }}
              disabled={isSavingRename}
              className="flex-1 px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3
            className="text-lg font-semibold text-gray-900 mb-2 truncate hover:text-blue-600 cursor-pointer flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              if (onRename) setIsRenaming(true);
            }}
            title={onRename ? "Click to rename" : project.name}
          >
            <span>{project.name}</span>
            {onRename && (
              <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                ✏️
              </span>
            )}
          </h3>

          {/* Badges row — beat count, layout mode, character count.
              Dot-separated to read at a glance without burning a
              second vertical row each. Pieces that aren't meaningful
              (e.g. layoutLabel null on a never-edited project) drop
              out entirely rather than rendering as 'unknown'. */}
          <div className="text-xs text-gray-500 mb-2 truncate">
            {meta.beatCount > 0 && (
              <span>{meta.beatCount} {meta.beatCount === 1 ? 'beat' : 'beats'}</span>
            )}
            {meta.beatCount > 0 && meta.layoutLabel && <span className="mx-1.5">·</span>}
            {meta.layoutLabel && <span>{meta.layoutLabel}</span>}
            {(meta.beatCount > 0 || meta.layoutLabel) && meta.characterCount > 0 && (
              <span className="mx-1.5">·</span>
            )}
            {meta.characterCount > 0 && (
              <span>{meta.characterCount} {meta.characterCount === 1 ? 'character' : 'characters'}</span>
            )}
            {meta.beatCount === 0 && !meta.layoutLabel && meta.characterCount === 0 && (
              <span className="italic text-gray-400">empty project</span>
            )}
          </div>

          {project.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{project.description}</p>
          )}
        </>
      )}

      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Clock size={12} />
        <span>Modified {formatDate(project.modifiedAt)}</span>
      </div>
    </div>
  );
};

/**
 * Project library component
 */
export const ProjectLibrary: React.FC<ProjectLibraryProps> = ({
  onLoadProject,
  onCreateProject,
  onOpenStoryFromPrompt,
  onOpenIdeator,
  onExportZip,
  onImportZip,
  onImportZipFile,
  onRenameProject,
  isModal = false,
  onClose,
  currentProjectId,
  onContinueLast,
  onCurrentProjectDeleted,
}) => {
  const { storage } = usePersistence();
  const { updateMetadata, delete: deleteProjectFromContext } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'modified' | 'created' | 'name'>('modified');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  // Drag-drop import overlay state. Counter (not boolean) because
  // child elements fire enter/leave events as the cursor moves over
  // them — a counter increment-on-enter / decrement-on-leave reliably
  // tracks whether the cursor is still within the modal, immune to
  // re-firing on internal boundaries.
  const [dragCounter, setDragCounter] = useState(0);
  const isDragOver = dragCounter > 0;

  const dragImportAvailable = !!onImportZipFile;
  const handleDragEnter = (e: React.DragEvent) => {
    if (!dragImportAvailable) return;
    // Only react when a file is being dragged; ignores text / DOM
    // drags that don't carry the 'Files' transfer type (avoids the
    // overlay flashing when the user drags a beat from the palette).
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setDragCounter(c => c + 1);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!dragImportAvailable) return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setDragCounter(c => Math.max(0, c - 1));
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!dragImportAvailable) return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = async (e: React.DragEvent) => {
    if (!dragImportAvailable) return;
    e.preventDefault();
    setDragCounter(0);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Lenient extension check — the import flow's own validator will
    // surface a friendly error for non-zip payloads, but we filter
    // obvious mismatches here to fail fast.
    const name = file.name.toLowerCase();
    if (!name.endsWith('.zip') && !name.endsWith('.asaps') && !name.endsWith('.asaps.zip') && !name.endsWith('.asapst')) {
      alert(`Only .zip / .asaps / .asapst files are supported for drag-drop import.\nReceived: ${file.name}`);
      return;
    }
    await onImportZipFile!(file);
    // Close the modal after a drop-import so the editor is visible
    // on the newly-loaded project. Without this, the user is left
    // staring at the Browser modal while the editor behind it has
    // already switched to the imported project. The Import card
    // closure handler runs the same way once it triggers a project
    // load, but the drag-drop path needs an explicit nudge because
    // the host doesn't know whether onImportZipFile loaded a project
    // or surfaced an error.
    if (isModal) onClose?.();
  };

  /**
   * Load projects from storage
   */
  const loadProjects = async () => {
    setLoading(true);
    try {
      const result = await storage.listProjects({
        sortBy,
        sortDirection: 'desc',
      });

      if (result.success && result.data) {
        setProjects(result.data);
      }
    } catch (error) {
      console.error('[ProjectLibrary] Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load projects on mount and when sort changes
  useEffect(() => {
    loadProjects();
  }, [sortBy]);

  /**
   * Handle project deletion
   */
  const handleDeleteProject = async (projectId: string) => {
    const isDeletingCurrent = projectId === currentProjectId;
    try {
      const success = await deleteProjectFromContext(projectId);
      if (success) {
        await loadProjects();
        if (isDeletingCurrent && onCurrentProjectDeleted) {
          onCurrentProjectDeleted();
        }
      } else {
        alert('Failed to delete project');
      }
    } catch (error) {
      console.error('[ProjectLibrary] Delete failed:', error);
      alert('Failed to delete project');
    }
  };

  /**
   * Handle project rename
   */
  const handleRenameProject = async (projectId: string, newName: string) => {
    console.log('[ProjectLibrary] handleRenameProject called - projectId:', projectId, 'newName:', newName);
    try {
      if (onRenameProject) {
        console.log('[ProjectLibrary] Using external onRenameProject handler');
        // Use external handler if provided
        await onRenameProject(projectId, newName);
      } else {
        console.log('[ProjectLibrary] Using updateMetadata directly');
        // Use updateMetadata directly
        await updateMetadata({ name: newName });
      }
      console.log('[ProjectLibrary] Reloading projects to show updated name');
      await loadProjects(); // Reload to show updated name
      console.log('[ProjectLibrary] Projects reloaded after rename');
    } catch (error) {
      console.error('[ProjectLibrary] Rename failed:', error);
      throw error;
    }
  };

  /**
   * Toggle selection for a project
   */
  const handleToggleSelect = (projectId: string) => {
    setSelectedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  /**
   * Select all visible projects
   */
  const handleSelectAll = () => {
    const allIds = new Set(filteredProjects.map(p => p.id));
    setSelectedProjects(allIds);
  };

  /**
   * Deselect all projects
   */
  const handleDeselectAll = () => {
    setSelectedProjects(new Set());
  };

  /**
   * Toggle selection mode
   */
  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      // Exiting selection mode - clear selections
      setSelectedProjects(new Set());
      setShowBulkDeleteConfirm(false);
    }
    setSelectionMode(!selectionMode);
  };

  /**
   * Handle bulk delete
   */
  const handleBulkDelete = async () => {
    if (selectedProjects.size === 0) return;

    if (!showBulkDeleteConfirm) {
      setShowBulkDeleteConfirm(true);
      setTimeout(() => setShowBulkDeleteConfirm(false), 5000);
      return;
    }

    try {
      const deletingCurrent = currentProjectId && selectedProjects.has(currentProjectId);
      // Delete all selected projects
      const deletePromises = Array.from(selectedProjects).map(id =>
        deleteProjectFromContext(id)
      );
      await Promise.all(deletePromises);

      // Clear selection and reload
      setSelectedProjects(new Set());
      setShowBulkDeleteConfirm(false);
      setSelectionMode(false);
      await loadProjects();
      if (deletingCurrent && onCurrentProjectDeleted) {
        onCurrentProjectDeleted();
      }
    } catch (error) {
      console.error('[ProjectLibrary] Bulk delete failed:', error);
      alert('Some projects failed to delete');
    }
  };

  /**
   * Filter projects by search query
   */
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const containerClass = isModal
    ? 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
    : 'w-full h-full';

  const contentClass = isModal
    ? 'bg-white rounded-xl shadow-2xl max-w-6xl max-h-[90vh] overflow-hidden flex flex-col'
    : 'h-full flex flex-col';

  return (
    <div className={containerClass} onClick={isModal ? onClose : undefined}>
      <div
        className={`${contentClass} relative`}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag-drop import overlay — visible while a file drag is in
            progress. Visual cue + giant drop target so the author
            doesn't have to land precisely on the small Import card. */}
        {isDragOver && dragImportAvailable && (
          <div
            className="absolute inset-0 z-30 bg-blue-50/95 border-4 border-dashed border-blue-400 rounded-xl flex flex-col items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <Download className="w-16 h-16 text-blue-500 mb-3" />
            <div className="text-xl font-bold text-blue-700">Drop to import</div>
            <div className="text-sm text-blue-600 mt-2">
              .asaps zip — will be added to your projects
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
          </div>

          {/* Phase 3 — Continue-editing banner. When the Browser is
              opened while a project is loaded (user clicks Projects,
              or boot's 24h staleness check fires), show the loaded
              project at the top with a single CTA that returns the
              user to the editor exactly where they left off. The
              banner only renders when we can identify the project in
              the list — otherwise we'd flash an empty banner during
              the storage fetch. */}
          {(() => {
            if (!currentProjectId) return null;
            // Pick the right handler for whichever surface mounted us:
            //   - modal (in-editor): clicking Continue closes the modal,
            //     returning the user to the editor on the loaded project
            //   - non-modal (StartWindow): clicking Continue dispatches
            //     the pick to main, opening the editor on the last
            //     project. No onClose here because there's no overlay.
            const handler = isModal ? onClose : onContinueLast;
            if (!handler) return null;
            const currentProj = projects.find(p => p.id === currentProjectId);
            if (!currentProj) return null;
            // Different labels for the two contexts. In modal mode the
            // user is already in the editor — "Currently editing" is
            // accurate. In the cold-launch start window they aren't,
            // so we say "Last project" to keep the framing honest.
            const label = isModal ? 'Currently editing' : 'Last project';
            return (
              <div className="mb-4 flex items-center justify-between gap-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <Folder className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                      {label}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {currentProj.name}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handler}
                  className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                  Continue editing →
                </button>
              </div>
            );
          })()}

          {/* Start a new project — four create paths. Empty + Import are
              wired to existing flows; Prompt + Ideator are surfaced now
              so the layout is final, with disabled affordances until the
              AI scaffold + Ideator session integrations land in their
              own phases. */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Start a new project
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={onCreateProject}
                className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-left group"
              >
                <FileText className="w-6 h-6 text-blue-600 group-hover:scale-110 transition-transform" />
                <div className="text-sm font-semibold text-gray-900">Empty project</div>
                <div className="text-xs text-gray-600 leading-snug">
                  Pick layout up front, then start adding beats
                </div>
              </button>

              <button
                type="button"
                onClick={onOpenStoryFromPrompt}
                disabled={!onOpenStoryFromPrompt}
                className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white relative"
                title={onOpenStoryFromPrompt
                  ? 'Describe your idea in a sentence and the AI drafts the rest'
                  : 'Coming soon — describe your idea in a sentence and the AI drafts the rest'}
              >
                <Wand2 className="w-6 h-6 text-purple-500 group-hover:scale-110 transition-transform" />
                <div className="text-sm font-semibold text-gray-900">Build from a prompt</div>
                <div className="text-xs text-gray-600 leading-snug">
                  Your prompt → AI drafts the rest
                </div>
                {!onOpenStoryFromPrompt && (
                  <span className="absolute top-2 right-2 text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">SOON</span>
                )}
              </button>

              <button
                type="button"
                onClick={onOpenIdeator}
                disabled={!onOpenIdeator}
                className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white relative"
                title={onOpenIdeator
                  ? 'Develop your idea in a conversation with an AI agent'
                  : 'Coming soon — develop your idea in a conversation with an AI agent'}
              >
                <Sparkles className="w-6 h-6 text-emerald-500 group-hover:scale-110 transition-transform" />
                <div className="text-sm font-semibold text-gray-900">Co-write with AI</div>
                <div className="text-xs text-gray-600 leading-snug">
                  Develop your idea in conversation
                </div>
                {!onOpenIdeator && (
                  <span className="absolute top-2 right-2 text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">SOON</span>
                )}
              </button>

              <button
                type="button"
                onClick={onImportZip}
                disabled={!onImportZip}
                className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white"
              >
                <Download className="w-6 h-6 text-orange-500 group-hover:scale-110 transition-transform" />
                <div className="text-sm font-semibold text-gray-900">Import</div>
                <div className="text-xs text-gray-600 leading-snug">
                  .asaps zip or ASML XML file
                </div>
              </button>
            </div>
          </div>

          {/* Template shelf — worked examples instantiated as copies via the
              zip-import pipeline. Full cards while the library is small (the
              first-run audience that needs the showcase), a slim line once
              it's established. */}
          {onImportZipFile && (
            <TemplateShelf
              projectCount={projects.length}
              onUseTemplate={async (file) => {
                await onImportZipFile(file);
                // Same nudge as the drag-drop path: the import switched the
                // editor behind the modal to the new project.
                if (isModal) onClose?.();
              }}
            />
          )}

          {/* Search and controls */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="modified">Recently Modified</option>
              <option value="created">Recently Created</option>
              <option value="name">Name (A-Z)</option>
            </select>

            {/* View mode */}
            <div className="flex gap-1 border border-gray-300 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${
                  viewMode === 'grid'
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="Grid view"
              >
                <Grid size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${
                  viewMode === 'list'
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="List view"
              >
                <List size={20} />
              </button>
            </div>

            {/* Selection mode toggle */}
            <button
              onClick={handleToggleSelectionMode}
              className={`px-3 py-2 rounded-lg border transition ${
                selectionMode
                  ? 'bg-blue-100 text-blue-600 border-blue-300'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
              title={selectionMode ? 'Exit selection mode' : 'Select multiple projects'}
            >
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
          </div>

          {/* Selection controls bar */}
          {selectionMode && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={selectedProjects.size === filteredProjects.length ? handleDeselectAll : handleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                {selectedProjects.size === filteredProjects.length ? (
                  <>
                    <CheckSquare size={16} />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square size={16} />
                    Select All ({filteredProjects.length})
                  </>
                )}
              </button>

              <div className="flex-1 text-sm text-gray-500">
                {selectedProjects.size} selected
              </div>

              <button
                onClick={handleBulkDelete}
                disabled={selectedProjects.size === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  selectedProjects.size === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : showBulkDeleteConfirm
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-red-500 text-white hover:bg-red-600'
                }`}
                title={showBulkDeleteConfirm ? 'Click again to confirm deletion' : 'Delete selected projects'}
              >
                <Trash2 size={16} />
                {showBulkDeleteConfirm ? 'Click to Confirm' : `Delete (${selectedProjects.size})`}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">Loading projects...</div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Folder className="text-gray-300 mb-4" size={64} />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                {searchQuery ? 'No projects found' : 'No projects yet'}
              </h3>
              <p className="text-gray-500">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Pick one of the options above to get started.'}
              </p>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                  : 'space-y-3'
              }
            >
              {/* List view header with Select All checkbox */}
              {viewMode === 'list' && filteredProjects.length > 0 && (
                <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-600">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedProjects.size === filteredProjects.length) {
                        handleDeselectAll();
                      } else {
                        handleSelectAll();
                      }
                    }}
                    className="flex-shrink-0 p-1 rounded hover:bg-gray-200"
                    title={selectedProjects.size === filteredProjects.length ? 'Deselect all' : 'Select all'}
                  >
                    {selectedProjects.size === filteredProjects.length && filteredProjects.length > 0 ? (
                      <CheckSquare className="text-blue-600" size={20} />
                    ) : selectedProjects.size > 0 ? (
                      <div className="relative">
                        <Square className="text-gray-400" size={20} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-2 h-2 bg-blue-600 rounded-sm" />
                        </div>
                      </div>
                    ) : (
                      <Square className="text-gray-400" size={20} />
                    )}
                  </button>
                  <span className="flex-shrink-0 w-12" /> {/* Spacer for folder icon */}
                  <div className="flex-1">Project Name</div>
                  <div className="w-32 text-center">Modified</div>
                  <div className="w-32 text-center">Created</div>
                  <div className="w-10" /> {/* Spacer for delete button */}
                </div>
              )}
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onLoad={() => {
                    if (selectionMode) {
                      handleToggleSelect(project.id);
                    } else {
                      onLoadProject(project.id);
                    }
                  }}
                  onDelete={() => handleDeleteProject(project.id)}
                  onRename={onRenameProject ? (newName) => handleRenameProject(project.id, newName) : undefined}
                  viewMode={viewMode}
                  isSelected={selectedProjects.has(project.id)}
                  onToggleSelect={() => handleToggleSelect(project.id)}
                  showCheckbox={selectionMode || viewMode === 'list'}
                  isCurrentProject={project.id === currentProjectId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {isModal && onClose && (
          <div className="flex-shrink-0 border-t border-gray-200 px-6 py-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
