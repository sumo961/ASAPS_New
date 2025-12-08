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
import { Plus, Folder, Trash2, Clock, Calendar, Search, Grid, List, Archive, CheckSquare, Square } from 'lucide-react';
import { usePersistence, useProject } from '../contexts/PersistenceContext';
import type { Project } from '../storage/types';

export interface ProjectLibraryProps {
  /** Called when a project is selected to load */
  onLoadProject: (projectId: string) => void;

  /** Called when requesting to create a new project */
  onCreateProject: () => void;

  /** ZIP export handler */
  onExportZip?: () => void;

  /** ZIP import handler */
  onImportZip?: () => void;

  /** Called when renaming a project */
  onRenameProject?: (projectId: string, newName: string) => Promise<void>;

  /** Show as modal dialog */
  isModal?: boolean;

  /** Called when modal should close */
  onClose?: () => void;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

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
}> = ({ project, onLoad, onDelete, onRename, viewMode, isSelected = false, onToggleSelect, showCheckbox = false }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [isSavingRename, setIsSavingRename] = useState(false);

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
        className={`flex items-center gap-4 p-4 bg-white border rounded-lg hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group ${
          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
        }`}
        onClick={onLoad}
      >
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
      className={`bg-white border rounded-lg p-6 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}
      onClick={onLoad}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          {showCheckbox && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              className="p-1 rounded hover:bg-gray-100"
            >
              {isSelected ? (
                <CheckSquare className="text-blue-600" size={20} />
              ) : (
                <Square className="text-gray-400" size={20} />
              )}
            </button>
          )}
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <Folder className="text-blue-600" size={24} />
          </div>
        </div>
        <button
          onClick={handleDelete}
          className={`p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100 ${
            showDeleteConfirm
              ? 'bg-red-500 text-white'
              : 'hover:bg-red-50 text-red-600'
          }`}
          title={showDeleteConfirm ? 'Click again to confirm' : 'Delete project'}
        >
          <Trash2 size={16} />
        </button>
      </div>

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

          {project.description && (
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>
          )}
        </>
      )}

      <div className="space-y-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span>Modified {formatDate(project.modifiedAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={12} />
          <span>Created {formatDate(project.createdAt)}</span>
        </div>
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
  onExportZip,
  onImportZip,
  onRenameProject,
  isModal = false,
  onClose,
}) => {
  const { storage } = usePersistence();
  const { updateMetadata } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'modified' | 'created' | 'name'>('modified');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

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
    try {
      const result = await storage.deleteProject(projectId);
      if (result.success) {
        await loadProjects(); // Reload list
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
      // Delete all selected projects
      const deletePromises = Array.from(selectedProjects).map(id =>
        storage.deleteProject(id)
      );
      await Promise.all(deletePromises);

      // Clear selection and reload
      setSelectedProjects(new Set());
      setShowBulkDeleteConfirm(false);
      setSelectionMode(false);
      await loadProjects();
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
        className={contentClass}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Project Library</h2>
            <div className="flex gap-2">
              <button
                onClick={onCreateProject}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
              >
                <Plus size={20} />
                New Project
              </button>
              {onExportZip && (
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  onClick={onExportZip}
                  title="Export complete project as ZIP with all assets"
                >
                  <Archive className="w-4 h-4" />
                  Export ZIP
                </button>
              )}
              {onImportZip && (
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                  onClick={onImportZip}
                  title="Import project from ZIP file"
                >
                  <Archive className="w-4 h-4" />
                  Import ZIP
                </button>
              )}
            </div>
          </div>

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
              <p className="text-gray-500 mb-6">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create your first project to get started'}
              </p>
              {!searchQuery && (
                <button
                  onClick={onCreateProject}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  <Plus size={20} />
                  Create Project
                </button>
              )}
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                  : 'space-y-3'
              }
            >
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
                  showCheckbox={selectionMode}
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
