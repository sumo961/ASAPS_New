/**
 * AI Helper for Story Generation
 *
 * Provides AI-powered story generation using Claude API or simulation mode
 */
/**
 * Beat type definitions for generation
 *
 * CONNECTION RULES:
 * - SINGLE CONNECTION beats: Can only connect to ONE target beat via the connections array
 *   titleScreen, introText, durScreen, videoBeat, endScreen, setVariable, addRemoveInventory, setTimer, inputText
 *
 * - MULTIPLE CONNECTION beats: Support multiple targets via their parameters (NOT the connections array)
 *   - dialogTree: targets defined in dialogTree.choices[].target
 *   - movementChoice: targets defined in choices[].target
 *   - pickProp: targets defined in props[].target
 *   - hyperText: targets defined in hyperlinks[].targetBeatId
 *   - conditionBeat: uses trueTarget and falseTarget parameters
 *   - randomTarget: targets defined in choices[].target
 *
 * DEFAULT TARGET (Timed Auto-Advance):
 * Most visible beats (EXCEPT durScreen) can have an OPTIONAL defaultTarget parameter with a timeout.
 * This auto-advances to a different beat if the interactor doesn't act within the specified time.
 * - Set via parameters: defaultTarget (beat ID) and defaultTargetTimeout (milliseconds)
 * - Example: { defaultTarget: "beat_timeout", defaultTargetTimeout: 30000 } = auto-advance after 30 seconds
 * - Useful for: creating urgency, handling inactive users, timed puzzles
 * - NOT available on durScreen (which already auto-advances by design)
 *
 * CLUSTERS (Organizational Containers):
 * Clusters help organize larger projects into logical sections (e.g., "In the House", "In the Forest").
 * - Add a "cluster" property to beats with the cluster name (string)
 * - All beats with the same cluster value will be grouped together
 * - Clusters appear as collapsible containers in the flowchart and folders in the sidebar
 * - Example: { cluster: "forest_section" } on multiple beats groups them together
 * - Use clusters when a story has 15+ beats or distinct geographical/thematic sections
 * - Beats without a cluster property remain ungrouped at the top level
 *
 * IMPORTANT: For branching story points, use dialogTree or movementChoice, NOT multiple connections from introText!
 */
export const BEAT_TYPES = {
    // Story structure - SINGLE CONNECTION (one Continue button)
    titleScreen: 'Start screen with title and author. SINGLE CONNECTION: only one target via connections array. Supports optional defaultTarget for timed auto-advance.',
    introText: 'Narrative text with Continue button. SINGLE CONNECTION: only one target via connections array. For branching, use movementChoice or dialogTree instead. Supports optional defaultTarget for timed auto-advance.',
    endScreen: 'End screen with message. SINGLE CONNECTION or no connections (story ends here). Supports optional defaultTarget for timed auto-advance.',
    // Interactive content - MULTIPLE CONNECTIONS via parameters
    dialogTree: 'Branching dialogue with character conversations. MULTIPLE TARGETS: define targets in dialogTree.choices[].target parameter, NOT in connections array. Supports optional defaultTarget for timed auto-advance if no choice is made.',
    movementChoice: 'Choice of locations/actions. MULTIPLE TARGETS: define targets in choices[].target parameter, NOT in connections array. Supports optional defaultTarget for timed auto-advance if no choice is made.',
    pickProp: 'Interactive prop selection. MULTIPLE TARGETS: define targets in props[].target parameter. Supports optional defaultTarget for timed auto-advance.',
    hyperText: 'Text with clickable words leading to different beats. MULTIPLE TARGETS: define in hyperlinks[].targetBeatId. Supports optional defaultTarget for timed auto-advance.',
    inputText: 'Player text input with validation. SINGLE CONNECTION: only one target. Supports optional defaultTarget for timed auto-advance if no input is provided.',
    // Timed content - SINGLE CONNECTION (NO defaultTarget - already timed by design)
    durScreen: 'Timed screen that auto-advances after duration. SINGLE CONNECTION: only one target. NO defaultTarget (already auto-advances by design).',
    videoBeat: 'Video playback. SINGLE CONNECTION: only one target after video ends. Supports optional defaultTarget for timed auto-advance.',
    // Logic beats (invisible - no defaultTarget needed)
    conditionBeat: 'Conditional branching. TWO TARGETS: uses trueTarget and falseTarget parameters, NOT connections array.',
    setVariable: 'Set ONE variable/counter per beat. IMPORTANT: Can only modify ONE variable at a time! To set multiple variables, use multiple consecutive setVariable beats chained together. SINGLE CONNECTION: executes then continues to one target.',
    addRemoveInventory: 'Modify player inventory. SINGLE CONNECTION: executes then continues to one target.',
    randomTarget: 'Random branching. MULTIPLE TARGETS: define targets in choices[].target parameter.',
    setTimer: 'Set/check timers. SINGLE CONNECTION: plus optional timerTarget parameter for timeout.',
};
/**
 * Generate a complete story using AI or simulation
 */
export async function generateStory(config) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
        return generateStorySimulation(config);
    }
    try {
        return await generateStoryWithAI(config, apiKey);
    }
    catch (error) {
        console.error('[AI] Failed to generate with AI, falling back to simulation:', error);
        return generateStorySimulation(config);
    }
}
/**
 * Generate story using Claude API
 */
async function generateStoryWithAI(config, apiKey) {
    const { prompt, genre = 'adventure', length = 'medium', complexity = 'moderate', context } = config;
    // Determine beat count based on length
    const beatCount = length === 'short' ? '5-8' : length === 'medium' ? '10-15' : '20-30';
    const branchingDesc = complexity === 'linear' ? 'mostly linear with few choices' :
        complexity === 'moderate' ? 'moderate branching with 2-3 choices per decision point' :
            'complex branching with multiple paths and consequences';
    const systemPrompt = `You are a creative interactive story author. Generate complete interactive story structures in JSON format.

Available beat types:
${Object.entries(BEAT_TYPES).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

Return a JSON object with this structure:
{
  "metadata": {
    "title": "Story Title",
    "author": "AI Assistant",
    "description": "Brief description",
    "genre": "genre"
  },
  "beats": [
    {
      "id": "beat-0",
      "type": "titleScreen",
      "label": "Title",
      "parameters": { "title": "...", "subtitle": "...", "buttonText": "Begin" }
    }
  ],
  "connections": [
    { "id": "conn-0", "sourceId": "beat-0", "targetId": "beat-1", "label": "Continue" }
  ],
  "reasoning": "Explanation of story structure"
}

CRITICAL CONNECTION RULES:
- SINGLE CONNECTION beats (titleScreen, introText, durScreen, videoBeat, endScreen, inputText, setVariable, addRemoveInventory, setTimer): Can ONLY have ONE connection in the connections array. For branching, use dialogTree or movementChoice instead.
- MULTIPLE CONNECTION beats (dialogTree, movementChoice, pickProp, hyperText, randomTarget): Define targets in their PARAMETERS (choices[].target, props[].target, etc.), NOT in the connections array.
- conditionBeat: Uses trueTarget and falseTarget PARAMETERS, not connections array.

CRITICAL setVariable LIMITATION:
- setVariable beats can ONLY modify ONE variable/counter per beat!
- If you need to set multiple variables (e.g., "Creative +1, Temper -1"), you MUST create SEPARATE setVariable beats chained together.
- Example: Instead of one beat named "Creative +1, Temper -1", create TWO beats:
  1. "Creative +1" (setVariable for creative_energy) → connects to →
  2. "Temper -1" (setVariable for temper_control) → connects to next story beat
- NEVER name a setVariable beat with multiple operations - split them into multiple beats!

CLUSTERS (Organizational Containers):
For larger stories (15+ beats) with distinct sections, use clusters to organize beats:
- Add a "cluster" property (string) to each beat that belongs to a group
- All beats with the same cluster value will be grouped together in the UI
- Example: beats in "In the House" section all have { cluster: "house_section" }
- Clusters make large flowcharts more navigable and help authors understand story structure
- Use clusters for: geographical areas, time periods, character arcs, or thematic sections
- Beats without a cluster property remain at the top level ungrouped

Important:
- Use descriptive labels for beats
- Create engaging, coherent narrative flow
- Use appropriate beat types for each story moment
- NEVER put multiple connections from introText - use movementChoice or dialogTree for branching
- For dialogTree beats, targets go in dialogTree.choices[].target parameter
- For movementChoice beats, targets go in choices[].target parameter
- For pickProp beats, targets go in props[].target parameter
- Ensure all beat IDs are unique and all connections reference valid beat IDs`;
    const userPrompt = `Create an interactive story with these requirements:

Prompt: ${prompt}
Genre: ${genre}
Length: ${beatCount} beats
Complexity: ${branchingDesc}
${context ? `Additional context: ${context}` : ''}

Generate a complete, engaging interactive story structure.`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{
                    role: 'user',
                    content: userPrompt,
                }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const content = data.content[0].text;
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
    const jsonStr = jsonMatch[1] || content;
    const generated = JSON.parse(jsonStr);
    // Add placeholder positions to beats if not present
    // Note: The builder's TreeLayoutAlgorithm will recalculate proper tree positions
    // based on connections when the story is injected
    const beatsWithPositions = generated.beats.map((beat, index) => ({
        ...beat,
        position: beat.position || {
            x: 100 + (index % 4) * 300,
            y: 100 + Math.floor(index / 4) * 200,
        },
    }));
    return {
        ...generated,
        beats: beatsWithPositions,
    };
}
/**
 * Generate story using simulation (fallback when no API key)
 */
function generateStorySimulation(config) {
    const { prompt, genre = 'adventure', length = 'medium', complexity = 'moderate' } = config;
    const title = extractTitleFromPrompt(prompt);
    const beatCount = length === 'short' ? 5 : length === 'medium' ? 10 : 20;
    const beats = [];
    const connections = [];
    // Title screen
    beats.push({
        id: 'beat-0',
        type: 'titleScreen',
        label: 'Title Screen',
        parameters: {
            title,
            subtitle: genre.charAt(0).toUpperCase() + genre.slice(1),
            buttonText: 'Begin',
        },
        position: { x: 100, y: 100 },
    });
    // Introduction
    beats.push({
        id: 'beat-1',
        type: 'introText',
        label: 'Introduction',
        parameters: {
            text: `${prompt}\n\nYour adventure begins here...`,
            buttonText: 'Continue',
        },
        position: { x: 400, y: 100 },
    });
    connections.push({
        id: 'conn-0',
        sourceId: 'beat-0',
        targetId: 'beat-1',
        label: 'Start',
    });
    // Middle beats - vary based on complexity
    const middleCount = beatCount - 3;
    for (let i = 0; i < middleCount; i++) {
        const beatId = `beat-${i + 2}`;
        const isChoice = complexity !== 'linear' && i % 3 === 0;
        if (isChoice && i < middleCount - 1) {
            // Add a choice beat
            beats.push({
                id: beatId,
                type: 'movementChoice',
                label: `Choice ${Math.floor(i / 3) + 1}`,
                parameters: {
                    prompt: `What do you do next?`,
                    choices: [
                        { id: `choice-${i}-a`, text: 'Take the left path', location: 'Left Path', target: `beat-${i + 3}` },
                        { id: `choice-${i}-b`, text: 'Take the right path', location: 'Right Path', target: `beat-${i + 3}` },
                    ],
                },
                position: { x: 100 + (i % 4) * 300, y: 300 + Math.floor(i / 4) * 200 },
            });
        }
        else {
            // Add narrative beat
            beats.push({
                id: beatId,
                type: 'introText',
                label: `Scene ${i + 1}`,
                parameters: {
                    text: `Part ${i + 1} of your ${genre} adventure continues...`,
                    buttonText: 'Continue',
                },
                position: { x: 100 + (i % 4) * 300, y: 300 + Math.floor(i / 4) * 200 },
            });
            connections.push({
                id: `conn-${i + 1}`,
                sourceId: `beat-${i + 1}`,
                targetId: beatId,
            });
        }
    }
    // End screen
    const endBeatId = `beat-${beatCount - 1}`;
    beats.push({
        id: endBeatId,
        type: 'endScreen',
        label: 'The End',
        parameters: {
            endMessage: `The End\n\nThank you for experiencing this ${genre} adventure!`,
            showRestart: true,
            showCredits: false,
        },
        position: { x: 400, y: 500 + Math.floor(middleCount / 4) * 200 },
    });
    connections.push({
        id: `conn-end`,
        sourceId: `beat-${beatCount - 2}`,
        targetId: endBeatId,
    });
    return {
        metadata: {
            title,
            author: 'AI Assistant (Simulation Mode)',
            description: prompt,
            genre,
        },
        beats,
        connections,
        reasoning: `Generated ${beatCount} beats with ${complexity} complexity (simulation mode - no AI API key provided)`,
    };
}
/**
 * Extract a title from the prompt
 */
function extractTitleFromPrompt(prompt) {
    const words = prompt.trim().split(/\s+/).slice(0, 5);
    return words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}
/**
 * Generate a dialog tree using AI or simulation
 */
export async function generateDialog(config) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
        return generateDialogSimulation(config);
    }
    try {
        return await generateDialogWithAI(config, apiKey);
    }
    catch (error) {
        console.error('[AI] Failed to generate with AI, falling back to simulation:', error);
        return generateDialogSimulation(config);
    }
}
/**
 * Generate dialog using Claude API
 */
async function generateDialogWithAI(config, apiKey) {
    const { scene, character, goal, branchingFactor = 3, context } = config;
    const systemPrompt = `You are a creative dialogue writer for interactive fiction. Generate branching dialogue trees in JSON format.

Dialog tree structure uses the "dialogTree" beat type with nested dialogue nodes and choices.

Return a JSON object with this structure:
{
  "beat": {
    "id": "dialog-1",
    "type": "dialogTree",
    "label": "Conversation Title",
    "parameters": {
      "rootNode": {
        "id": "node-0",
        "speaker": "Character Name",
        "text": "Opening dialogue...",
        "choices": [
          {
            "id": "choice-0",
            "text": "Player response option",
            "target": "node-1"
          }
        ]
      }
    }
  },
  "reasoning": "Explanation of dialogue structure"
}

Important:
- Create ${branchingFactor} meaningful choices per decision point
- Write natural, engaging dialogue
- Include character emotions and motivations
- Create consequences for choices when appropriate
- Use nested nodes for multi-turn conversations`;
    const userPrompt = `Create a branching dialogue for this scene:

Scene: ${scene}
${character ? `Speaking Character: ${character}` : ''}
${goal ? `Conversation Goal: ${goal}` : ''}
${context ? `Additional Context: ${context}` : ''}

Generate an engaging, branching dialogue tree with ${branchingFactor} choices.`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{
                    role: 'user',
                    content: userPrompt,
                }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
    const jsonStr = jsonMatch[1] || content;
    return JSON.parse(jsonStr);
}
/**
 * Generate dialog using simulation
 */
function generateDialogSimulation(config) {
    const { scene, character = 'NPC', branchingFactor = 3 } = config;
    return {
        beat: {
            id: `dialog-${Date.now()}`,
            type: 'dialogTree',
            label: `Conversation: ${character}`,
            parameters: {
                rootNode: {
                    id: 'node-0',
                    speaker: character,
                    text: `${scene}\n\nHow do you respond?`,
                    choices: Array.from({ length: branchingFactor }, (_, i) => ({
                        id: `choice-${i}`,
                        text: `Response option ${i + 1}`,
                        target: `node-${i + 1}`,
                    })),
                },
            },
        },
        reasoning: `Generated ${branchingFactor}-choice dialogue (simulation mode)`,
    };
}
/**
 * Suggest next beats based on context
 */
export async function suggestBeats(config) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
        return suggestBeatsSimulation(config);
    }
    try {
        return await suggestBeatsWithAI(config, apiKey);
    }
    catch (error) {
        console.error('[AI] Failed to suggest with AI, falling back to simulation:', error);
        return suggestBeatsSimulation(config);
    }
}
/**
 * Suggest beats using Claude API
 */
async function suggestBeatsWithAI(config, apiKey) {
    const { currentBeatId, storyContext, count = 3 } = config;
    const systemPrompt = `You are a story structure consultant for interactive fiction. Suggest logical next beats based on story context.

Available beat types:
${Object.entries(BEAT_TYPES).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

Return a JSON object with this structure:
{
  "beats": [
    {
      "type": "beatType",
      "label": "Beat Name",
      "description": "What this beat does",
      "rationale": "Why this beat makes sense here"
    }
  ],
  "reasoning": "Overall strategic thinking"
}`;
    const userPrompt = `Suggest ${count} logical next beats after beat "${currentBeatId}".

Current Story Context:
${JSON.stringify(storyContext, null, 2)}

Provide ${count} diverse, story-appropriate beat suggestions.`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{
                    role: 'user',
                    content: userPrompt,
                }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
    const jsonStr = jsonMatch[1] || content;
    return JSON.parse(jsonStr);
}
/**
 * Suggest beats using simulation
 */
function suggestBeatsSimulation(config) {
    const { count = 3 } = config;
    const suggestions = [
        { type: 'dialogTree', label: 'Conversation', description: 'Add a dialogue with choices', rationale: 'Engage player with character interaction' },
        { type: 'movementChoice', label: 'Location Choice', description: 'Player chooses where to go', rationale: 'Provide exploration options' },
        { type: 'introText', label: 'Narrative', description: 'Continue the story', rationale: 'Advance the plot' },
    ];
    return {
        beats: suggestions.slice(0, count),
        reasoning: `Suggested ${count} diverse beat types (simulation mode)`,
    };
}
/**
 * Create a beat from natural language
 */
export async function createBeatFromDescription(config) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
        return createBeatSimulation(config);
    }
    try {
        return await createBeatWithAI(config, apiKey);
    }
    catch (error) {
        console.error('[AI] Failed to create with AI, falling back to simulation:', error);
        return createBeatSimulation(config);
    }
}
/**
 * Create beat using Claude API
 */
async function createBeatWithAI(config, apiKey) {
    const { description, context } = config;
    const systemPrompt = `You are a beat creation assistant. Convert natural language descriptions into properly structured beat objects.

Available beat types:
${Object.entries(BEAT_TYPES).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

Return a JSON beat object:
{
  "id": "beat-id",
  "type": "beatType",
  "label": "Beat Name",
  "parameters": { /* appropriate parameters for the beat type */ }
}`;
    const userPrompt = `Create a beat from this description:

${description}
${context ? `\nContext: ${context}` : ''}

Generate the appropriate beat with proper parameters.`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{
                    role: 'user',
                    content: userPrompt,
                }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
    const jsonStr = jsonMatch[1] || content;
    return JSON.parse(jsonStr);
}
/**
 * Create beat using simulation
 */
function createBeatSimulation(config) {
    const { description } = config;
    return {
        id: `beat-${Date.now()}`,
        type: 'introText',
        label: 'New Beat',
        parameters: {
            text: description,
            buttonText: 'Continue',
        },
    };
}
//# sourceMappingURL=aiHelper.js.map