import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Play, RotateCcw, ChevronRight, Info, Eye, EyeOff, ChevronDown, Database } from 'lucide-react';
import { Story, StoryEngine, Beat } from '@asaps/core';
import type { StatePreset } from '@asaps/core';
import { ReactRenderer } from '@asaps/renderer';
import { convertGlobalSettingsToTheme } from '../../utils/themeConverter';
import type { Asset } from '../assets/AssetManager';
import type { Character } from '../../types/character';
import { StatePresetManager } from '../debug/StatePresetManager';
import { StatePresetEditor } from '../debug/StatePresetEditor';

interface StoryPreviewProps {
  story: Story;
  settings?: any;
  assets?: Asset[];
  characters?: Character[];
  onClose: () => void;
}

export const StoryPreview: React.FC<StoryPreviewProps> = ({ story, settings, assets = [], characters = [], onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [activeTimers, setActiveTimers] = useState<any[]>([]);
  const [debugStartBeat, setDebugStartBeat] = useState<string | null>(null);
  const boxVisibility = settings?.textbox?.boxVisibility || 'all';
  const containerRef = useRef<HTMLDivElement>(null);

  // Store as ReactRenderer, cast to any when passing to StoryEngine to bypass type checking
  const rendererRef = useRef<ReactRenderer | null>(null);
  const engineRef = useRef<StoryEngine | null>(null);

  // State preset management
  const [activeTab, setActiveTab] = useState<'preview' | 'presets'>('preview');
  const [presets, setPresets] = useState<StatePreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<StatePreset | null>(null);
  const [editingPreset, setEditingPreset] = useState<StatePreset | null | undefined>(undefined);
  const [showPresetEditor, setShowPresetEditor] = useState(false);

  // Load presets from localStorage
  useEffect(() => {
    const loadPresets = () => {
      const key = `story-presets-${story.getMetadata().title}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setPresets(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load presets:', e);
        }
      }
    };
    loadPresets();
  }, [story]);

  // Save presets to localStorage
  const savePresets = useCallback((newPresets: StatePreset[]) => {
    const key = `story-presets-${story.getMetadata().title}`;
    localStorage.setItem(key, JSON.stringify(newPresets));
    setPresets(newPresets);
  }, [story]);

  // Preset management handlers
  const handleCreatePreset = useCallback(() => {
    setEditingPreset(null);
    setShowPresetEditor(true);
  }, []);

  const handleEditPreset = useCallback((preset: StatePreset) => {
    setEditingPreset(preset);
    setShowPresetEditor(true);
  }, []);

  const handleSavePreset = useCallback((presetData: Omit<StatePreset, 'id' | 'createdAt' | 'modifiedAt'>) => {
    const now = new Date().toISOString();

    if (editingPreset) {
      // Update existing preset
      const updated = presets.map(p =>
        p.id === editingPreset.id
          ? { ...presetData, id: p.id, createdAt: p.createdAt, modifiedAt: now }
          : p
      );
      savePresets(updated);
    } else {
      // Create new preset
      const newPreset: StatePreset = {
        ...presetData,
        id: `preset_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        createdAt: now,
        modifiedAt: now
      };
      savePresets([...presets, newPreset]);
    }

    setShowPresetEditor(false);
    setEditingPreset(undefined);
  }, [editingPreset, presets, savePresets]);

  const handleDeletePreset = useCallback((presetId: string) => {
    const updated = presets.filter(p => p.id !== presetId);
    savePresets(updated);
    if (selectedPreset?.id === presetId) {
      setSelectedPreset(null);
    }
  }, [presets, savePresets, selectedPreset]);

  const handleLoadPreset = useCallback((preset: StatePreset) => {
    setSelectedPreset(preset);
    setActiveTab('preview');
    // We'll apply the preset when starting the preview
  }, []);

  useEffect(() => {
    // Only initialize once when container is ready
    if (!containerRef.current) return;

    console.log('[StoryPreview] Effect running, current renderer:', !!rendererRef.current);

    if (!rendererRef.current) {
      console.log('[StoryPreview] Creating new renderer and engine');

      // Create renderer with the preview container
      const reactRenderer = new ReactRenderer({
        container: containerRef.current,
        width: 1024,
        height: 768,
      });

      // Set up asset resolver to provide URLs for assetIds
      if (assets && assets.length > 0) {
        reactRenderer.setAssetResolver((assetId: string) => {
          const asset = assets.find(a => a.id === assetId);
          return asset ? asset.url : undefined;
        });
        console.log('[StoryPreview] Asset resolver set up with', assets.length, 'assets');
      }

      // Create story engine - cast renderer to any to bypass type check
      // ReactRenderer DOES implement IRenderer, but TS can't see it across packages
      const engine = new StoryEngine(reactRenderer as any);

      rendererRef.current = reactRenderer;
      engineRef.current = engine;

      console.log('[StoryPreview] Renderer and engine created');
    } else {
      console.log('[StoryPreview] Renderer exists, ensuring it is valid');
      const renderer = rendererRef.current as any;
      if (!renderer.root && renderer.initialize) {
        console.log('[StoryPreview] Re-initializing renderer for current container');
        renderer.context.container = containerRef.current;
        renderer.initialize();
      }
    }

    return () => {
      console.log('[StoryPreview] Cleanup - stopping engine');
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, [assets]); // Re-run if assets change

  // Update renderer visibility settings when dropdown changes
  useEffect(() => {
    if (rendererRef.current) {
      const hideText = boxVisibility === 'hideText' || boxVisibility === 'hideAll';
      const hideButtons = boxVisibility === 'hideAll';

      if ('setHideTextBoxes' in rendererRef.current) {
        (rendererRef.current as any).setHideTextBoxes(hideText);
      }
      if ('setHideButtonBoxes' in rendererRef.current) {
        (rendererRef.current as any).setHideButtonBoxes(hideButtons);
      }

      console.log('[StoryPreview] Updated box visibility:', { hideText, hideButtons });
    }
  }, [boxVisibility]);

  // Update renderer theme when settings change
  useEffect(() => {
    if (rendererRef.current && settings) {
      const theme = convertGlobalSettingsToTheme(settings);
      if ('setTheme' in rendererRef.current) {
        (rendererRef.current as any).setTheme(theme);
      }
      console.log('[StoryPreview] Updated theme:', theme);
    }
  }, [settings]);

  const startPreview = useCallback(async () => {
    if (!engineRef.current || !rendererRef.current) return;

    try {
      setIsRunning(true);

      // Set up asset resolver for backgrounds
      if (rendererRef.current && 'setAssetResolver' in rendererRef.current) {
        const environment = story.getEnvironment();
        (rendererRef.current as any).setAssetResolver((assetId: string) => {
          // Look up asset in environment.nodes
          const node = environment?.nodes?.find((n: any) => n.id === assetId);
          if (node) {
            return node.url || node.path || node.src;
          }
          // Also check story assets
          const asset = story.getAssets()?.find((a: any) => a.id === assetId);
          if (asset) {
            return asset.url || asset.path || asset.src;
          }
          return undefined;
        });
        console.log('[StoryPreview] Asset resolver configured');
      }

      await engineRef.current.loadStory(story);

      const context = engineRef.current.getContext();

      // Apply selected preset state if available
      if (selectedPreset) {
        console.log('[StoryPreview] Applying preset state:', selectedPreset.name);

        // Apply variables
        Object.entries(selectedPreset.state.variables).forEach(([key, value]) => {
          context.setVariable(key, value);
        });

        // Apply counters
        Object.entries(selectedPreset.state.counters).forEach(([key, value]) => {
          context.setCounter(key, value);
        });

        // Apply inventory
        selectedPreset.state.inventory.forEach(item => {
          context.addToInventory(item);
        });

        // Mark visited beats
        selectedPreset.state.visitedBeats.forEach(beatId => {
          context.markBeatVisited(beatId);
        });

        // Apply timers if provided
        if (selectedPreset.state.timers) {
          Object.entries(selectedPreset.state.timers).forEach(([name, timer]) => {
            const timerData = timer as { value: number; target?: string };
            context.setTimer(name, timerData.value, timerData.target);
          });
        }
      }
      
      const originalMarkVisited = context.markBeatVisited.bind(context);
      context.markBeatVisited = (beatId: string) => {
        originalMarkVisited(beatId);
        const beat = story.getBeat(beatId);
        setCurrentBeat(beat || null);
        setDebugInfo({
          currentBeatId: beatId,
          visitedBeats: context.getVisitedBeats(),
          variables: context.getVariables(),
          counters: context.getCounters(),
          inventory: context.getInventory(),
        });
      };
      
      const timerManager = context.getTimerManager();
      
      const updateTimers = () => {
        setActiveTimers(timerManager.getActiveTimers());
      };
      
      timerManager.on('timerStarted', updateTimers);
      timerManager.on('timerTick', updateTimers);
      timerManager.on('timerStopped', updateTimers);
      
      timerManager.on('timerExpired', async ({ name, targetBeat }) => {
        if (targetBeat && rendererRef.current) {
          console.log(`Timer "${name}" expired, navigating to: ${targetBeat}`);
          const beat = story.getBeat(targetBeat);
          if (beat) {
            if (engineRef.current) {
              engineRef.current.stop();
            }
            context.markBeatVisited(targetBeat);
            try {
              // Cast to any to bypass type check
              const nextBeatId = await beat.execute(context, rendererRef.current as any);
              if (nextBeatId) {
                const nextBeat = story.getBeat(nextBeatId);
                if (nextBeat) {
                  context.markBeatVisited(nextBeatId);
                  await nextBeat.execute(context, rendererRef.current as any);
                }
              }
            } catch (error) {
              console.error('Error executing timer target beat:', error);
            }
          }
        }
      });

      // Check for debug start beat override
      const debugFirstBeat = settings?.debug?.firstbeat;
      const startBeatId = (debugFirstBeat && debugFirstBeat.trim() !== '') ? debugFirstBeat.trim() : undefined;

      if (startBeatId && startBeatId !== story.getFirstBeatId()) {
        console.log(`[StoryPreview] DEBUG MODE: Starting from beat "${startBeatId}" (Story normally starts at "${story.getFirstBeatId()}")`);
        setDebugStartBeat(startBeatId);
      } else {
        setDebugStartBeat(null);
      }

      await engineRef.current.start(startBeatId);

    } catch (error) {
      console.error('Preview error:', error);
      alert('Error during preview: ' + error);
    } finally {
      setIsRunning(false);
    }
  }, [story, settings, selectedPreset]);

  const handleRestart = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.clear();
    }
    setCurrentBeat(null);
    setDebugInfo({});
    setActiveTimers([]);
    startPreview();
  }, [startPreview]);

  const stopPreview = useCallback(() => {
    if (engineRef.current) {
      const context = engineRef.current.getContext();
      const timerManager = context.getTimerManager();
      timerManager.stopAllTimers();
      engineRef.current.stop();
    }
    if (rendererRef.current) {
      rendererRef.current.clear();
    }
    setIsRunning(false);
    setCurrentBeat(null);
    setActiveTimers([]);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Play className="w-5 h-5" />
            Story Preview
          </h2>
          <div className="flex items-center gap-2">
            {activeTab === 'preview' && !isRunning && !currentBeat && (
              <button
                onClick={startPreview}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {selectedPreset ? `Start with "${selectedPreset.name}"` : 'Start Preview'}
              </button>
            )}
            {activeTab === 'preview' && isRunning && (
              <button
                onClick={stopPreview}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Stop
              </button>
            )}
            {activeTab === 'preview' && currentBeat && !isRunning && (
              <button
                onClick={handleRestart}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'preview'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-gray-800'
            }`}
          >
            Preview
            {selectedPreset && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                {selectedPreset.name}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'presets'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-gray-800'
            }`}
          >
            <Database className="w-4 h-4" />
            State Presets
            {presets.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {presets.length}
              </span>
            )}
          </button>
        </div>

        {/* Debug Mode Indicator */}
        {debugStartBeat && (
          <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 flex items-center gap-2 text-sm">
            <Info className="w-4 h-4 text-yellow-700" />
            <span className="text-yellow-900 font-medium">DEBUG MODE:</span>
            <span className="text-yellow-800">
              Starting from beat <code className="bg-yellow-200 px-1 rounded">{debugStartBeat}</code>
              {' '}(Story normally starts at <code className="bg-yellow-200 px-1 rounded">{story.getFirstBeatId()}</code>)
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'preview' ? (
            <>
              {/* Preview Area */}
              <div className="flex-1 bg-gray-50">
                <div
                  ref={containerRef}
                  className="h-full w-full bg-white overflow-auto"
                >
                  {!currentBeat && !isRunning && (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <Play className="w-16 h-16 mx-auto mb-4" />
                        <p>Click "Start Preview" to test your story</p>
                        {selectedPreset && (
                          <p className="text-sm mt-2 text-blue-600">
                            Preset "{selectedPreset.name}" will be loaded
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

          {/* Debug Panel */}
          <div className="w-80 bg-gray-100 p-4 border-l overflow-y-auto">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Debug Info
            </h3>
            
            {currentBeat && (
              <div className="space-y-3">
                <div className="bg-white p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-600">Current Beat</div>
                  <div className="font-semibold">{currentBeat.name}</div>
                  <div className="text-xs text-gray-500">{currentBeat.type} • {currentBeat.id}</div>
                </div>

                {debugInfo.visitedBeats && debugInfo.visitedBeats.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Visited Beats ({debugInfo.visitedBeats.length})</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {debugInfo.visitedBeats.map((beatId: string) => (
                        <div key={beatId} className="text-xs text-gray-600 flex items-center gap-1">
                          <ChevronRight className="w-3 h-3" />
                          {beatId}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {debugInfo.variables && Object.keys(debugInfo.variables).length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Variables</div>
                    <div className="space-y-1">
                      {Object.entries(debugInfo.variables).map(([key, value]) => (
                        <div key={key} className="text-xs">
                          <span className="font-mono text-gray-600">{key}:</span>
                          <span className="ml-2">{JSON.stringify(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {debugInfo.counters && Object.keys(debugInfo.counters).length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Counters</div>
                    <div className="space-y-1">
                      {Object.entries(debugInfo.counters).map(([key, value]) => (
                        <div key={key} className="text-xs">
                          <span className="font-mono text-gray-600">{key}:</span>
                          <span className="ml-2 font-bold">{value as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {debugInfo.inventory && debugInfo.inventory.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Inventory</div>
                    <div className="space-y-1">
                      {debugInfo.inventory.map((item: string) => (
                        <div key={item} className="text-xs text-gray-600">
                          • {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {activeTimers.length > 0 && (
                  <div className="bg-white p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-600 mb-2">Active Timers</div>
                    <div className="space-y-2">
                      {activeTimers.map((timer: any) => (
                        <div key={timer.name} className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-bold text-blue-900">{timer.name}</div>
                          <div className="text-sm font-mono text-blue-700">{timer.remainingTime}s</div>
                          {timer.targetBeat && (
                            <div className="text-xs text-blue-600">Target: {timer.targetBeat}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!currentBeat && !isRunning && (
              <div className="text-sm text-gray-500 text-center mt-8">
                <p>Debug information will appear here when the story is running.</p>
              </div>
            )}
          </div>
            </>
          ) : (
            /* Presets Tab */
            <div className="flex-1 p-4 overflow-y-auto">
              <StatePresetManager
                story={story}
                presets={presets}
                selectedPresetId={selectedPreset?.id}
                onLoad={handleLoadPreset}
                onEdit={handleEditPreset}
                onCreate={handleCreatePreset}
                onDelete={handleDeletePreset}
              />
            </div>
          )}
        </div>

        {/* Preset Editor Modal */}
        {showPresetEditor && (
          <StatePresetEditor
            story={story}
            preset={editingPreset || undefined}
            currentContext={engineRef.current?.getContext()}
            onSave={handleSavePreset}
            onCancel={() => {
              setShowPresetEditor(false);
              setEditingPreset(undefined);
            }}
          />
        )}
      </div>
    </div>
  );
};
