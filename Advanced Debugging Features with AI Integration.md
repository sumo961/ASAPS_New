Advanced Debugging Features with AI Integration - Complete 
     Implementation Plan

     Overview

     Three interconnected debugging features enhanced with AI capabilities, 
     designed for large-scale stories (100-600+ beats).

     ---
     FEATURE 1: Path Analysis & Visualization

     Core Functionality

     Purpose: Analyze all possible story paths with statistics and 
     interactive visualization

     New Files:
     - packages/core/src/analysis/PathAnalyzer.ts - DFS algorithm for path 
     discovery
     - packages/builder/src/components/debug/PathVisualization.tsx - Path 
     statistics UI
     - packages/builder/src/components/debug/PathHighlighter.tsx - Graph 
     highlighting

     Algorithms:
     - Depth-first search with cycle detection
     - Handles conditional connections, choice-based beats, randomTarget
     - Path depth limit: 100 beats (configurable)
     - Statistics: total paths, shortest/longest, average, dead ends, 
     infinite loops

     AI Enhancement

     Purpose: Transform raw path data into narrative insights

     AI Capabilities:
     1. Path Quality Analysis - Evaluate narrative coherence, detect plot 
     holes, identify unsatisfying endings
     2. Diversity Assessment - Find false choices, suggest branching 
     improvements
     3. Pacing Analysis - Analyze length distribution, suggest beat 
     additions/removals
     4. Auto-Description - Generate natural language path summaries and 
     titles

     New Prompt: packages/builder/src/services/prompts/pathAnalysis.ts
     - Analyzes narrative quality, character consistency, plot coherence
     - Returns quality scores (0-1), issues, actionable suggestions per path

     UI Integration:
     Path Analysis Panel:
     ├─ Statistics (immediate, no AI)
     ├─ Path List with filtering
     └─ AI Insights Tab (optional)
         ├─ Quality Scores per path
         ├─ Diversity analysis
         ├─ Pacing recommendations
         └─ Generated path descriptions

     ---
     FEATURE 2: State Presets for Context-Based Debugging

     Core Functionality

     Purpose: Start preview from any beat with predefined state (variables, 
     counters, inventory, visitedBeats)

     Data Structure (add to types/index.ts):
     interface StatePreset {
       id: string;
       name: string;
       description?: string;
       beatId: string;
       state: {
         variables: Record<string, any>;
         counters: Record<string, number>;
         inventory: string[];
         visitedBeats: string[];
       };
       aiGenerated: boolean; // NEW: Track AI-generated presets
     }

     New Files:
     - packages/builder/src/components/debug/StatePresetManager.tsx - CRUD UI
      for presets
     - packages/builder/src/components/debug/StatePresetEditor.tsx - Tabbed 
     editor (variables, counters, inventory, visited beats)

     Storage: Presets saved in story metadata, persisted with project

     AI Enhancement

     Purpose: Intelligently generate test-worthy state combinations

     AI Capabilities:
     1. Intelligent Generation - Analyze story structure to create realistic 
     state combinations
     2. Strategic Presets - Generate presets for: diverse paths, critical 
     branches, edge cases, all endings
     3. Auto-Naming - Generate meaningful preset names and descriptions
     4. Validation - Check if preset is reachable, warn about impossible 
     state combos

     New Prompt: packages/builder/src/services/prompts/presetGeneration.ts
     - Input: Story structure, generation strategy 
     (diverse/critical-path/edge-cases/endings)
     - Output: 5-10 presets with names, descriptions, complete state, 
     reachability validation

     UI Integration:
     State Preset Manager:
     ├─ Manual Creation (existing)
     ├─ Capture from Preview (existing)
     └─ AI Generation (NEW)
         ├─ Strategy selector (diverse/critical/edge/endings)
         ├─ Generate button
         └─ Review/edit generated presets before saving

     StoryPreview Integration: Load preset state before starting engine, mark
      as "DEBUG MODE: Using preset '[name]'"

     ---
     FEATURE 3: Reachability Analysis & Issue Detection

     Core Functionality

     Purpose: Detect unreachable beats and impossible conditions

     New Files:
     - packages/core/src/analysis/ReachabilityAnalyzer.ts - BFS + condition 
     analysis
     - packages/builder/src/components/debug/ReachabilityReport.tsx - Issues 
     UI with fixes

     Algorithms:
     1. BFS for Unconditional Reachability - Fast traversal of guaranteed 
     paths
     2. Counter Range Analysis - Calculate min/max achievable counter values
     3. Condition Satisfiability - Check if conditions can ever be true
     4. Orphan Detection - Find beats with no incoming connections

     Detection Types:
     - Impossible conditions (e.g., requires courage ≥ 15, max achievable = 
     10)
     - Orphaned beats (no incoming connections)
     - Unreachable parents (beat's only path blocked)

     AI Enhancement

     Purpose: Explain issues in plain language and suggest specific fixes

     AI Capabilities:
     1. Root Cause Analysis - Explain WHY beat is unreachable in natural 
     language
     2. Automatic Fix Suggestions - Specific parameter changes, new 
     connections, condition modifications
     3. Structural Issue Detection - Identify deadlocks, circular 
     dependencies, orphaned clusters
     4. Optimization Suggestions - Find redundant beats, consolidation 
     opportunities

     New Prompt: packages/builder/src/services/prompts/reachabilityFixes.ts
     - Input: Unreachable beats, reachable beats, connections, conditions
     - Output: Per-beat explanations, fix suggestions with confidence scores,
      structural issues

     Fix Types AI Can Suggest:
     - ADD-CONNECTION: "Add connection from beat_5 to beat_12 with label 
     'Continue'"
     - MODIFY-CONDITION: "Change courage threshold from 15 to 10"
     - ADD-BRIDGE-BEAT: "Insert intermediate beat between X and Y"
     - REMOVE-CONDITION: "Remove blocking condition on connection"

     UI Integration:
     Reachability Report:
     ├─ Summary (X reachable, Y unreachable)
     ├─ Error List
     │   ├─ Beat name + reason
     │   ├─ [Highlight on Graph]
     │   └─ AI Explanation (NEW)
     │       ├─ Natural language why it's unreachable
     │       ├─ Blocking conditions traced back
     │       └─ Suggested fixes with [Apply] buttons
     └─ Structural Issues (NEW)
         └─ Deadlocks, orphaned clusters, optimizations

     Graph Visualization: Red badge for unreachable, yellow for warnings, 
     visual glow for issues

     ---
     CROSS-CUTTING: Narrative Consistency Checker

     AI-Only Feature

     Purpose: Deep narrative analysis across all paths

     New Prompt: 
     packages/builder/src/services/prompts/narrativeConsistency.ts

     Checks:
     1. Character Consistency - Characters behaving differently without 
     explanation
     2. Plot Holes - Events contradicting established facts
     3. Variable Misuse - Variables set but never checked, or vice versa
     4. Abandoned Threads - Plot elements introduced but never resolved
     5. Continuity Errors - Impossible event sequences

     UI: Separate panel in debug tools, severity-rated issues 
     (critical/major/minor)

     ---
     STORYCONTEXT ENHANCEMENTS

     New Fields (add to StoryContext):

     interface EnhancedStoryState extends StoryState {
       // Debug session tracking
       debugSession?: {
         sessionId: string;
         startTime: number;
         currentPath: string[];
         pathHistory: string[][];
       };
       
       // Analysis results cache (avoid repeated AI calls)
       analysisCache?: {
         reachability?: { timestamp: number; results: any; aiAnalysis?: any 
     };
         paths?: { timestamp: number; results: any; aiAnalysis?: any };
       };
       
       // AI suggestions tracking
       aiSuggestions?: {
         fixes: Array<{ id: string; type: string; description: string; 
     applied: boolean }>;
         presets: StatePreset[];
       };
     }

     New Methods:

     - startDebugSession() / endDebugSession()
     - getCurrentPath() / getPathHistory()
     - cacheReachabilityResults() / getCachedReachability()
     - invalidateAnalysisCache() (when story changes)
     - addAISuggestion() / applySuggestion() / getSuggestions()

     ---
     AI SERVICE INTEGRATION

     New Service: AIDebugService

     File: packages/builder/src/services/AIDebugService.ts

     Methods:
     class AIDebugService {
       async analyzePathsWithAI(request: PathAnalysisRequest): 
     Promise<PathAnalysisResponse>
       async generateStatePresets(request: PresetGenerationRequest): 
     Promise<PresetGenerationResponse>
       async suggestReachabilityFixes(request: ReachabilityAnalysisRequest): 
     Promise<ReachabilityAnalysisResponse>
       async checkNarrativeConsistency(request: NarrativeConsistencyRequest):
      Promise<NarrativeConsistencyResponse>
     }

     Integration Pattern:
     1. Core analyzer runs first (fast, deterministic)
     2. Results displayed immediately
     3. Optional: AI enhancement triggered (user button: "Enhance with AI")
     4. AI insights displayed in separate panel
     5. User can apply AI suggestions interactively

     Key Design Principles:
     - AI is optional (all features work without it)
     - Progressive enhancement (AI adds insights, doesn't replace core)
     - Caching (avoid repeated API calls)
     - User control (explicit triggers, not automatic)
     - Transparency (show reasoning and confidence scores)

     ---
     UI INTEGRATION

     Debug Menu in Header

     Location: packages/builder/src/components/Header.tsx

     [Debug ▼]
     ├─ Analyze Paths
     ├─ State Presets
     ├─ Check Reachability
     ├─ Narrative Consistency (AI-only)
     └─ Preview Story

     Alternative: Debug Tab in WorkspaceView

     Add "Debug" tab alongside Flowchart/Visual Editor with unified panel

     Graph Enhancements

     Files: GraphEditor.tsx, BeatNode.tsx
     - Support highlightedPath prop for path visualization
     - Visual indicators: red badge (unreachable), yellow warning icon
     - Glow effect for highlighted paths
     - Click beat to show reachability details

     ---
     NEW FILES SUMMARY (20 total)

     Core Package (4 + tests)

     1. src/analysis/PathAnalyzer.ts
     2. src/analysis/ReachabilityAnalyzer.ts
     3. tests/analysis/PathAnalyzer.test.ts
     4. tests/analysis/ReachabilityAnalyzer.test.ts

     Builder Package - Components (6 + tests)

     5. components/debug/PathVisualization.tsx
     6. components/debug/PathHighlighter.tsx
     7. components/debug/StatePresetManager.tsx
     8. components/debug/StatePresetEditor.tsx
     9. components/debug/ReachabilityReport.tsx
     10. components/debug/DebugPanel.tsx (unified container)
     11-14. Component tests (4 files)

     Builder Package - Services (5)

     15. services/AIDebugService.ts
     16. services/prompts/pathAnalysis.ts
     17. services/prompts/presetGeneration.ts
     18. services/prompts/reachabilityFixes.ts
     19. services/prompts/narrativeConsistency.ts

     Builder Package - Tests (1)

     20. services/__tests__/AIDebugService.test.ts

     ---
     MODIFIED FILES (9)

     Core Package (2)

     1. src/types/index.ts - Add StatePreset, enhanced interfaces
     2. src/engine/StoryContext.ts - Add debug session, cache, AI tracking

     Builder Package (7)

     3. src/components/Header.tsx - Add debug dropdown menu
     4. src/components/WorkspaceView.tsx - Optional debug tab
     5. src/components/App.tsx - Wire up modals, state
     6. src/components/graph/GraphEditor.tsx - Add highlighting support
     7. src/components/graph/BeatNode.tsx - Add visual indicators
     8. src/components/preview/StoryPreview.tsx - Load state presets
     9. src/engine/Story.ts - Store presets in metadata

     ---
     IMPLEMENTATION PHASES

     Phase 1: Core Analysis (Week 1)

     Goal: Working analyzers without UI
     - PathAnalyzer implementation
     - ReachabilityAnalyzer implementation
     - Unit tests for both
     - StoryContext enhancements

     Phase 2: State Presets (Week 2)

     Goal: Manual preset management
     - StatePreset data structure
     - StatePresetManager UI
     - StatePresetEditor UI
     - StoryPreview integration
     - Preset storage in story metadata

     Phase 3: Visualization UIs (Week 3)

     Goal: User-facing debug tools
     - PathVisualization UI
     - ReachabilityReport UI
     - Graph highlighting integration
     - Debug menu in Header
     - Wire up all features in App.tsx

     Phase 4: AI Integration (Week 4)

     Goal: AI-enhanced insights
     - AIDebugService implementation
     - All 4 AI prompts (path, preset, reachability, consistency)
     - AI enhancement buttons in UIs
     - Caching in StoryContext
     - AI suggestion application

     Phase 5: Polish & Testing (Week 5)

     Goal: Production ready
     - Performance optimization (Web Workers for >200 beats)
     - Comprehensive testing
     - Documentation
     - Error handling and edge cases
     - User feedback and iteration

     ---
     PERFORMANCE CONSIDERATIONS

     Core Analysis Optimization

     - Path depth limit: 100 beats (configurable)
     - BFS over DFS for reachability (more efficient)
     - Memoization for counter range calculations
     - Early termination for impossible conditions

     AI Call Optimization

     - Cache results in StoryContext (invalidate on story change)
     - Batch AI requests where possible
     - Show progress indicators for long analyses
     - Web Workers for CPU-intensive graph analysis (stories >200 beats)

     ---
     DATA PERSISTENCE

     IndexedDB Storage

     State presets stored with project in story metadata:
     {
       "statePresets": [
         {
           "id": "preset_123",
           "name": "After Forest Path",
           "beatId": "forest_exit",
           "state": { ... },
           "aiGenerated": true
         }
       ]
     }

     Export/Import

     - JSON format for sharing presets
     - Include in project ZIP exports
     - Import presets from other projects

     ---
     SUCCESS METRICS

     Core Functionality

     - ✓ Analyze 600-beat story in <5 seconds
     - ✓ Detect all unreachable beats correctly
     - ✓ Generate realistic state presets
     - ✓ Highlight paths on graph without lag

     AI Enhancement

     - ✓ AI path analysis completes in <30 seconds
     - ✓ 80%+ of AI fix suggestions are valid
     - ✓ Generated presets are reachable and useful
     - ✓ Narrative consistency finds real issues

     ---
     DEPENDENCIES

     Existing

     - ReactFlow (graph visualization) ✓
     - AI Service infrastructure ✓
     - AIValidator ✓
     - Zustand (state management) ✓

     New

     - None - uses existing tech stack

     ---
