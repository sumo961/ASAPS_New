import React, { useState } from 'react';
import { FileText, Download, Upload, Play, Settings, Image, Users, Archive } from 'lucide-react';
import { ProjectSelector } from './ProjectSelector';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectLibrary } from './ProjectLibrary';
import { UndoRedoToolbar } from './UndoRedoToolbar';
import { SaveStatus } from './SaveStatus';
import { useSave, useProject } from '../contexts/PersistenceContext';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  projectName?: string | null;
  onExport: () => void;
  onImport: () => void;
  onExportZip?: () => void;
  onImportZip?: () => void;
  onPreview?: () => void;
  onSettings?: () => void;
  onAssets?: () => void;
  onCharacters?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onTitleChange,
  projectName,
  onExport,
  onImport,
  onExportZip,
  onImportZip,
  onPreview,
  onSettings,
  onAssets,
  onCharacters
}) => {
  const { status, lastSaved, error, saveNow } = useSave();
  const { load } = useProject();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showProjectLibrary, setShowProjectLibrary] = useState(false);

  const handleLoadProject = async (projectId: string) => {
    const success = await load(projectId);
    if (!success) {
      alert('Failed to load project');
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <FileText className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ASAPS Builder
            </span>
          </div>

          {/* Project Name Display */}
          {projectName ? (
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg font-medium">
              {projectName}
            </span>
          ) : (
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg font-medium italic">
              Untitled Project
            </span>
          )}

          {/* Project Selector */}
          <ProjectSelector
            onOpenLibrary={() => setShowProjectLibrary(true)}
            onCreateProject={() => setShowNewProjectDialog(true)}
          />

          {/* Story Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="px-4 py-2 text-lg font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Story Title"
          />

          {/* Undo/Redo Toolbar */}
          <UndoRedoToolbar
            showDescriptions={false}
            showShortcuts={false}
            orientation="horizontal"
          />
        </div>

        <div className="flex items-center space-x-2">
          {/* Save Button and Status */}
          <SaveStatus
            status={status}
            lastSaved={lastSaved}
            error={error}
            onSave={saveNow}
            showText={true}
            compact={false}
          />

          {onCharacters && (
            <button 
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 transition-colors flex items-center gap-2"
              onClick={onCharacters}
            >
              <Users className="w-4 h-4" />
              Characters
            </button>
          )}
          
          {onAssets && (
            <button 
              className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors flex items-center gap-2"
              onClick={onAssets}
            >
              <Image className="w-4 h-4" />
              Assets
            </button>
          )}
          
          {onSettings && (
            <button 
              className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors flex items-center gap-2"
              onClick={onSettings}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          )}
          
          {onPreview && (
            <button 
              className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center gap-2"
              onClick={onPreview}
            >
              <Play className="w-4 h-4" />
              Preview
            </button>
          )}
          
          <button
            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
            onClick={onExport}
            title="Export as ASML XML"
          >
            <Download className="w-4 h-4" />
            Export ASML
          </button>

          <button
            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
            onClick={onImport}
            title="Import ASML XML"
          >
            <Upload className="w-4 h-4" />
            Import ASML
          </button>

          {onExportZip && (
            <button
              className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
              onClick={onExportZip}
              title="Export complete project as ZIP with all assets"
            >
              <Archive className="w-4 h-4" />
              Export ZIP
            </button>
          )}

          {onImportZip && (
            <button
              className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
              onClick={onImportZip}
              title="Import project from ZIP file"
            >
              <Archive className="w-4 h-4" />
              Import ZIP
            </button>
          )}
        </div>
      </div>

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <NewProjectDialog
          onClose={() => setShowNewProjectDialog(false)}
          onProjectCreated={(projectId) => {
            handleLoadProject(projectId);
            setShowNewProjectDialog(false);
          }}
        />
      )}

      {/* Project Library */}
      {showProjectLibrary && (
        <ProjectLibrary
          onLoadProject={(projectId) => {
            handleLoadProject(projectId);
            setShowProjectLibrary(false);
          }}
          onCreateProject={() => {
            setShowProjectLibrary(false);
            setShowNewProjectDialog(true);
          }}
          isModal={true}
          onClose={() => setShowProjectLibrary(false)}
        />
      )}
    </header>
  );
};
