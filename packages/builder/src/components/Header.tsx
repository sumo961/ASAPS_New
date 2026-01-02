import React, { useState } from 'react';
import { FileText, Download, Upload, Play, Settings, Image, Users, Save, Check, Sparkles, ChevronDown, Bug } from 'lucide-react';
import { ProjectSelector } from './ProjectSelector';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectLibrary } from './ProjectLibrary';
import { UndoRedoToolbar } from './UndoRedoToolbar';
import { SaveStatus } from './SaveStatus';
import { AIConfigDialog } from './ai/AIConfigDialog';
import { StoryGenerator } from './ai/StoryGenerator';
import { NaturalLanguageBeatCreator } from './ai/NaturalLanguageBeatCreator';
import { useSave, useProject, usePersistence } from '../contexts/PersistenceContext';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  projectName?: string | null;
  onExport: () => void;
  onImport: () => void;
  onExportZip?: () => void;
  onExportAsmlWithAssets?: () => void;
  onImportZip?: () => void;
  onPreview?: () => void;
  onSettings?: () => void;
  onAssets?: () => void;
  onCharacters?: () => void;
  onSave?: () => void;
  onDebug?: () => void;
  onInterceptNewProject?: () => boolean;
  onInterceptProjectLibrary?: () => boolean;
  onStoryGenerated?: (story: any) => void;
  onBeatCreated?: (beat: any) => void;
  onSaveProject?: () => void;
  onRenameProject?: (projectId: string, newName: string) => Promise<void>;
  isUntitledProject?: boolean;
  hasUnsavedChanges?: boolean;
  currentProjectId?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onTitleChange,
  projectName,
  onExport,
  onImport,
  onExportZip,
  onExportAsmlWithAssets,
  onImportZip,
  onPreview,
  onSettings,
  onAssets,
  onCharacters,
  onSave,
  onDebug,
  onInterceptNewProject,
  onInterceptProjectLibrary,
  onStoryGenerated,
  onBeatCreated,
  onSaveProject,
  onRenameProject,
  isUntitledProject,
  hasUnsavedChanges,
  currentProjectId
}) => {
  const { status, lastSaved, error: saveError } = useSave();
  const { load } = useProject();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showProjectLibrary, setShowProjectLibrary] = useState(false);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [showStoryGenerator, setShowStoryGenerator] = useState(false);
  const [showBeatCreator, setShowBeatCreator] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleLoadProject = async (projectId: string) => {
    const success = await load(projectId);
    if (!success) {
      alert('Failed to load project');
    }
  };

  // Detect if running in Electron on macOS (traffic lights need space)
  const isElectronMac = typeof window !== 'undefined' &&
    !!(window as any).electronAPI?.isElectron &&
    (window as any).electronAPI?.platform === 'darwin';

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-2">
      {/* Row 1: Logo and Story Title - Draggable on Electron macOS */}
      <div
        className="flex items-center justify-between mb-2"
        style={{
          paddingLeft: isElectronMac ? '64px' : undefined,
          // Make this row draggable for window movement on Electron
          WebkitAppRegion: isElectronMac ? 'drag' : undefined,
        } as React.CSSProperties}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ASAPS
            </span>
          </div>

          {/* Story Title - More prominent, no-drag so it's editable */}
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="px-3 py-1.5 text-lg font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            placeholder="Story Title"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Row 2: All action buttons */}
      <div className="flex items-center justify-between">
        {/* Left: Project, Undo/Redo, Save, Import/Export */}
        <div className="flex items-center space-x-2">
          {/* Project Selector */}
          <ProjectSelector
            onOpenLibrary={() => {
              if (onInterceptProjectLibrary) {
                const intercepted = onInterceptProjectLibrary();
                if (!intercepted) {
                  setShowProjectLibrary(true);
                }
              } else {
                setShowProjectLibrary(true);
              }
            }}
            onCreateProject={() => {
              if (onInterceptNewProject) {
                const intercepted = onInterceptNewProject();
                if (!intercepted) {
                  setShowNewProjectDialog(true);
                }
              } else {
                setShowNewProjectDialog(true);
              }
            }}
          />

          <div className="w-px h-6 bg-gray-300 mx-1" />

          <UndoRedoToolbar
            showDescriptions={false}
            showShortcuts={false}
            orientation="horizontal"
          />

          <div className="w-px h-6 bg-gray-300 mx-1" />

          {/* Save Button and Status */}
          <SaveStatus
            status={status}
            lastSaved={lastSaved}
            error={saveError}
            onSave={onSave}
            onSaveProject={onSaveProject}
            isUntitledProject={isUntitledProject}
            hasUnsavedChanges={hasUnsavedChanges}
            showText={true}
            compact={false}
          />

          <div className="w-px h-6 bg-gray-300 mx-1" />

          {/* Import Menu */}
          <div className="relative">
            <button
              className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              onClick={() => setShowImportMenu(!showImportMenu)}
              title="Import"
            >
              <Upload className="w-4 h-4" />
              Import
              <ChevronDown className="w-3 h-3" />
            </button>

            {showImportMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowImportMenu(false)}
                />
                <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  <button
                    onClick={() => {
                      onImport();
                      setShowImportMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                    title="Import ASML XML file"
                  >
                    <FileText className="w-4 h-4" />
                    Import ASML (XML)
                  </button>
                  {onImportZip && (
                    <button
                      onClick={() => {
                        onImportZip();
                        setShowImportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Import project from ZIP archive"
                    >
                      <Upload className="w-4 h-4" />
                      Import Project (ZIP)
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Export Menu */}
          <div className="relative">
            <button
              className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Export"
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  <button
                    onClick={() => {
                      onExport();
                      setShowExportMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                    title="Export as ASML XML file"
                  >
                    <FileText className="w-4 h-4" />
                    Export ASML (XML only)
                  </button>
                  {onExportAsmlWithAssets && (
                    <button
                      onClick={() => {
                        onExportAsmlWithAssets();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Export ASML XML with organized asset folders"
                    >
                      <FileText className="w-4 h-4" />
                      Export ASML with Assets
                    </button>
                  )}
                  {onExportZip && (
                    <button
                      onClick={() => {
                        onExportZip();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Export project with assets as ZIP"
                    >
                      <Download className="w-4 h-4" />
                      Export Project (ZIP)
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Feature buttons */}
        <div className="flex items-center space-x-2">
          {onCharacters && (
            <button
              className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
              onClick={onCharacters}
            >
              <Users className="w-4 h-4" />
              Characters
            </button>
          )}

          {onAssets && (
            <button
              className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-1.5"
              onClick={onAssets}
            >
              <Image className="w-4 h-4" />
              Assets
            </button>
          )}

          {onSettings && (
            <button
              className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors flex items-center gap-1.5"
              onClick={onSettings}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          )}

          {onDebug && (
            <button
              className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              onClick={onDebug}
              title="Debug Tools"
            >
              <Bug className="w-4 h-4" />
              Debug
            </button>
          )}

          {/* AI Menu Button */}
          <div className="relative">
            <button
              className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-colors flex items-center gap-1.5"
              onClick={() => setShowAIMenu(!showAIMenu)}
              title="AI Tools"
            >
              <Sparkles className="w-4 h-4" />
              AI
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* AI Dropdown Menu */}
            {showAIMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowAIMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  <button
                    onClick={() => {
                      setShowStoryGenerator(true);
                      setShowAIMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Story
                  </button>
                  <button
                    onClick={() => {
                      setShowBeatCreator(true);
                      setShowAIMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
                  >
                    <FileText className="w-4 h-4" />
                    Create Beat from Description
                  </button>
                  <div className="my-2 border-t border-gray-200" />
                  <button
                    onClick={() => {
                      setShowAIConfig(true);
                      setShowAIMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
                  >
                    <Settings className="w-4 h-4" />
                    Configure AI
                  </button>
                </div>
              </>
            )}
          </div>

          {onPreview && (
            <button
              className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-1.5"
              onClick={onPreview}
            >
              <Play className="w-4 h-4" />
              Preview
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
          onExportZip={onExportZip}
          onImportZip={onImportZip}
          onRenameProject={onRenameProject}
          isModal={true}
          onClose={() => setShowProjectLibrary(false)}
          currentProjectId={currentProjectId}
        />
      )}

      {/* AI Configuration Dialog */}
      <AIConfigDialog
        isOpen={showAIConfig}
        onClose={() => setShowAIConfig(false)}
      />

      {/* Story Generator Dialog */}
      {onStoryGenerated && (
        <StoryGenerator
          isOpen={showStoryGenerator}
          onClose={() => setShowStoryGenerator(false)}
          onStoryGenerated={onStoryGenerated}
        />
      )}

      {/* Natural Language Beat Creator Dialog */}
      {onBeatCreated && (
        <NaturalLanguageBeatCreator
          isOpen={showBeatCreator}
          onClose={() => setShowBeatCreator(false)}
          onBeatCreated={onBeatCreated}
        />
      )}
    </header>
  );
};
