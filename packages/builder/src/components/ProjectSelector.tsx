/**
 * ProjectSelector - Compact project switcher for toolbar
 *
 * Provides:
 * - Current project display
 * - Quick switch to recent projects
 * - Open full project library
 * - Create new project
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Folder, Library } from 'lucide-react';
import { usePersistence, useProject } from '../contexts/PersistenceContext';
import type { Project } from '../storage/types';

export interface ProjectSelectorProps {
  /** Called when user wants to open full project library */
  onOpenLibrary?: () => void;

  /** Maximum number of recent projects to show (default: 5) */
  maxRecentProjects?: number;

  /** Show "Open Library" button (default: true) */
  showLibraryButton?: boolean;

  /** Compact mode - show only icon (default: false) */
  compact?: boolean;
}

/**
 * Project selector dropdown component
 */
export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  onOpenLibrary,
  maxRecentProjects = 12,
  showLibraryButton = true,
  compact = false,
}) => {
  const { storage } = usePersistence();
  const { project, load } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Load recent projects
   */
  useEffect(() => {
    const loadRecentProjects = async () => {
      setLoading(true);
      try {
        const result = await storage.listProjects({
          sortBy: 'modified',
          sortDirection: 'desc',
          limit: maxRecentProjects,
        });

        if (result.success && result.data) {
          // Filter out current project from list
          const filtered = result.data.filter(p => p.id !== project?.id);
          setRecentProjects(filtered);
        }
      } catch (error) {
        console.error('[ProjectSelector] Failed to load recent projects:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadRecentProjects();
    }
  }, [isOpen, storage, project, maxRecentProjects]);

  /**
   * Close dropdown when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  /**
   * Handle project selection
   */
  const handleSelectProject = async (projectId: string) => {
    setIsOpen(false);
    const success = await load(projectId);
    if (!success) {
      alert('Failed to load project');
    }
  };

  /**
   * Handle open library
   */
  const handleOpenLibrary = () => {
    setIsOpen(false);
    if (onOpenLibrary) {
      onOpenLibrary();
    }
  };

  // Trigger no longer repeats the project name — the title input
  // above already shows it. "Projects" is the canonical label so
  // first-time users know what the button does without hover state.
  const currentProjectName = project?.name || 'No Project';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        title={compact ? currentProjectName : 'Switch projects, open the library, or start a new one'}
      >
        <Folder className="text-blue-600" size={18} />
        {!compact && (
          <>
            <span className="text-sm font-medium text-gray-900">
              Projects
            </span>
            <ChevronDown
              size={16}
              className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Current project */}
          {project && (
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <div className="text-xs font-medium text-blue-600 mb-1">CURRENT PROJECT</div>
              <div className="flex items-center gap-2">
                <Folder className="text-blue-600" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {project.name}
                  </div>
                  {project.description && (
                    <div className="text-xs text-gray-600 truncate">
                      {project.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Recent projects */}
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Loading projects...
            </div>
          ) : recentProjects.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              <div className="px-4 py-2 text-xs font-medium text-gray-500">
                RECENT PROJECTS
              </div>
              {recentProjects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => handleSelectProject(proj.id)}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-50 transition text-left"
                >
                  <Folder className="text-gray-400 flex-shrink-0" size={16} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {proj.name}
                    </div>
                    {proj.description && (
                      <div className="text-xs text-gray-500 truncate">
                        {proj.description}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatTimeAgo(proj.modifiedAt)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No recent projects
            </div>
          )}

          {/* Browse all projects — opens the start screen / Project
              Browser, which doubles as the recent-projects surface
              for anything beyond the top-5 shortcut list above.
              The + New entry that used to live here was removed when
              the dedicated + New toolbar button took over the
              create-project entry point; keeping both created
              inconsistency over which new-project flow ran. */}
          {showLibraryButton && onOpenLibrary && (
            <div className="border-t border-gray-200">
              <button
                onClick={handleOpenLibrary}
                className="w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-50 transition text-left"
              >
                <Library className="text-gray-600" size={18} />
                <span className="text-sm font-medium text-gray-900">Browse all projects…</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Format time ago for display
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

/**
 * Minimal project badge - just shows current project name
 */
export const ProjectBadge: React.FC<{
  onClick?: () => void;
}> = ({ onClick }) => {
  const { project } = useProject();

  if (!project) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition"
      title={project.description}
    >
      <Folder size={14} />
      <span className="max-w-[150px] truncate">{project.name}</span>
    </button>
  );
};
