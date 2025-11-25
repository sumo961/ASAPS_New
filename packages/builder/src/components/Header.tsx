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
  hasUnsavedChanges
}) => {
  const { status, lastSaved, error: saveError } = useSave();
  const { load } = useProject();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showProjectLibrary, setShowProjectLibrary] = useState(false);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [showStoryGenerator, setShowStoryGenerator] = useState(false);
  const [showBeatCreator, setShowBeatCreator] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);

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
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg font-medium" title={hasUnsavedChanges ? "Unsaved changes" : ""}>
              {hasUnsavedChanges && isUntitledProject ? "● " : ""}{projectName}
            </span>
          ) : (
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg font-medium italic" title={hasUnsavedChanges ? "Unsaved changes" : ""}>
              {hasUnsavedChanges && isUntitledProject ? "● " : ""}Untitled Project
            </span>
          )}

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
            error={saveError}
            onSave={onSave}
            onSaveProject={onSaveProject}
            isUntitledProject={isUntitledProject}
            hasUnsavedChanges={hasUnsavedChanges}
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

          {onDebug && (
            <button
              className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors flex items-center gap-2"
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
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-colors flex items-center gap-2"
              onClick={() => setShowAIMenu(!showAIMenu)}
              title="AI Tools"
            >
              <Sparkles className="w-4 h-4" />
              AI
              <ChevronDown className="w-4 h-4" />
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
