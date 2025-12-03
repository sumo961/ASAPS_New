/**
 * Enhanced Story Generation Prompts
 *
 * Comprehensive templates with deep beat type understanding and advanced branching patterns
 */

import type { StoryGenerationRequest } from '../../types/ai';

/**
 * Beat type usage guide
 */
const BEAT_TYPE_GUIDE = `
## Beat Types Deep Dive

### VISIBLE BEATS (Player Sees and Interacts)

**titleScreen** - Story opening
- Use: Start of every story
- Parameters: title, author, startButtonText
- Connections: Single → first story beat
- Example: "The Mystery Begins" → introText

**introText** - Display text with continue button
- Use: Narration, scene setting, exposition
- Parameters: text, buttonText, backgroundAssetId
- Connections: Single → next beat
- Example: "You arrive at the mansion..." → movementChoice

**durScreen** - Timed auto-advance text
- Use: Quick transitions, atmosphere, montages
- Parameters: text, duration (seconds), backgroundAssetId
- Connections: Single → auto-advances after duration
- Example: "Three days later..." (3s) → dialogTree

**dialogTree** - Branching conversations
- Use: Character interactions, interrogations, negotiations
- Parameters: dialogTree with nested dialogNode structure
  - dialogNode: { id, speaker, text, choices: [] } - NPC/system speaks, then waits for player choice
  - choice: { id, text, target? | dialogNode? } - What player clicks (text IS the player's line)
  - target (string): Beat ID to exit dialog - the choice text is player's last line
  - dialogNode (nested): NPC responds to this choice, conversation continues
- Connections: Multiple → based on dialog choices leading to beat targets
- Pattern: dialogNode (NPC speaks) → player choice (text=player's line) → dialogNode (NPC responds) → player choice...
- IMPORTANT: Choice text IS what the player says. Never use "[Continue]" - use actual dialogue.
- Example: NPC asks question → [Player response A | Player response B] → NPC responds differently → [Player's closing line exits to beat]

**movementChoice** - Location/direction selection
- Use: Exploration, navigation, choosing paths
- Parameters: question, choices (array of {text, target})
- Connections: Multiple → one per choice
- Example: "Where to go?" → [Library | Kitchen | Garden] → 3 different beats

**pickProp** - Object/item selection
- Use: Inventory, evidence gathering, item choices
- Parameters: question, props (array of {id, name, target})
- Connections: Multiple → one per prop
- Combine with: addRemoveInventory (invisible beat after)
- Example: "Take weapon?" → [Sword | Axe | Nothing] → each leads to different beat + inventory update

**hyperText** - Clickable word branching
- Use: Subtle choices, memory/knowledge checks, flavor text
- Parameters: text with [clickable] words, targets for each
- Connections: Multiple → based on clicked word
- Example: "You recall [the letter] you found, or was it [the photograph]?" → 2 paths

**videoBeat** - Video playback
- Use: Cutscenes, instructions, dramatic moments
- Parameters: videoAssetId, skipButton (boolean)
- Connections: Single → after video or skip
- Example: Opening cutscene → titleScreen

**inputText** - Text input from player
- Use: Name entry, password/code input, creative input
- Parameters: prompt, variableName (where to store input), submitButtonText
- Connections: Single → stores input in variable
- Combine with: conditionBeat to check input
- Example: "Enter password" → store in 'userPassword' → conditionBeat checks if correct

**endScreen** - Story conclusion
- Use: Ending (victory, defeat, various endings)
- Parameters: endMessage, showRestart, showCredits
- Connections: None (terminal beat)
- Pattern: Multiple endScreens for different endings
- Example: "Victory!" or "Game Over" or "Secret Ending Unlocked"

### INVISIBLE BEATS (Logic/Background Operations)

**setVariable** - Set/modify story state
- Use: Track player choices, update counters, set flags
- Parameters: variableName, value, operation (set|add|subtract)
- Connections: Single → immediately to next beat
- Pattern: Chain after visible beats to track state
- Example: After picking sword → setVariable(weapon='sword') → continue story

**conditionBeat** - State-based branching
- Use: Check variables, create reconvergent paths, conditional content
- Parameters structure:
  - condition: { type: "variable"|"counter"|"inventory"|"timer", variableName: "name", operator: "=="|"!="|">"|"<"|">="|"<=", value: any }
  - trueConnection: { target: "beat_id", label: "description" }
  - falseConnection: { target: "beat_id", label: "description" }
- Connections: Two → one if true, one if false
- Pattern: Reconvergence - multiple paths lead here, then branch based on accumulated state
- Example: condition: { type: "variable", variableName: "hasKey", operator: "==", value: true }

**addRemoveInventory** - Inventory manipulation
- Use: Pick up items, lose items, check what player has
- Parameters: propId, action (add|remove)
- Connections: Single → next beat
- Pattern: After pickProp or as consequence of actions
- Example: Player chose "Take key" → addRemoveInventory(key, add) → continue

**randomTarget** - Random path selection
- Use: Randomness, procedural elements, replayability
- Parameters: targets (array of {targetId, weight})
- Connections: Multiple → randomly picks one
- Pattern: Add variety, random encounters
- Example: "You wander the forest" → randomTarget → [encounter wolf | find camp | get lost]

**setTimer** - Background countdown
- Use: Time pressure, timed events, deadlines
- Parameters: timerName, duration (seconds)
- Connections: Single → continues immediately, timer runs in background
- Combine with: conditionBeat checking timer expired
- Example: "Bomb planted" → setTimer(bombTimer, 300) → player has 5 min → check later

## Advanced Branching Patterns

### Pattern 1: Hub-and-Spoke (Exploration)
\`\`\`
Central Hub (movementChoice) → [Location A | Location B | Location C]
Each location:
  - Explore → Find clue → setVariable → Return to hub
  - Hub updates based on variables collected
  - When enough clues: conditionBeat unlocks finale
\`\`\`

### Pattern 2: Critical Path with Optional Content
\`\`\`
Main Story Beat → Choice → [Critical path | Optional side content]
  Critical: Required for progression
  Optional: Bonus story, items, character development
Both paths → Reconverge at checkpoint
Checkpoint: conditionBeat → Different dialog if did optional content
\`\`\`

### Pattern 3: State Accumulation → Branching Finale
\`\`\`
Multiple choices throughout story → Each sets variables
  - Help NPC? → trustScore += 1
  - Spare enemy? → mercyScore += 1
  - Find secret? → knowledgeScore += 1
Near end: Series of conditionBeats check scores
  - High trust → Good ending path
  - High mercy → Redemption path
  - High knowledge → Secret ending path
  - Low all → Bad ending path
\`\`\`

### Pattern 4: Parallel Tracks with Forced Merge
\`\`\`
Major choice → [Path A | Path B] (completely different experiences)
Path A: Story from perspective 1
Path B: Story from perspective 2
Both have unique beats, characters, challenges
Eventually: Force merge at plot convergence point
After merge: conditionBeat checks which path taken → tailored consequences
\`\`\`

### Pattern 5: Conditional Unlocks (Metroidvania-style)
\`\`\`
Early game: movementChoice shows locked options
  - [Go North] ✓
  - [Go East - Locked] ✗ (requires key)
Player explores, finds key → setVariable(hasKey=true)
Return to same movementChoice
Now: conditionBeat before choice → If hasKey, show East option
New path unlocked with new content
\`\`\`

### Pattern 6: Timed Branching
\`\`\`
Critical moment → setTimer(decisionTime, 30)
Player makes choices while timer runs
At checkpoint → conditionBeat(check timer expired)
  - Timer still running → Success path
  - Timer expired → Failure path
Used for: Escape sequences, defusing bombs, urgent decisions
\`\`\`

### Pattern 7: Inventory-Gated Puzzles
\`\`\`
Encounter obstacle → conditionBeat(check inventory for 'tool')
  - Has tool → Use it → Success beat → continue
  - No tool → Blocked → movementChoice(go back | try different approach)
Player must explore to find tool first
Creates backtracking and exploration incentive
\`\`\`

### Pattern 8: Reputation/Relationship System
\`\`\`
Multiple interactions with character
Each choice → setVariable(relationshipScore, +1 or -1)
Later: conditionBeat(relationshipScore >= 5)
  - High score → Character helps, reveals secrets
  - Low score → Character opposes, withholds information
Final confrontation outcome depends on accumulated relationship
\`\`\`

## Best Practices for Story Generation

### Variable Naming Conventions
- Flags: \`hasKey\`, \`doorUnlocked\`, \`secretDiscovered\`
- Counters: \`cluesFound\`, \`enemiesDefeated\`, \`daysElapsed\`
- Scores: \`trustScore\`, \`moralityScore\`, \`suspicionLevel\`
- Inventory: Use specific IDs like \`key_mansion\`, \`sword_vorpal\`

### Beat Positioning Strategy
- Linear sequences: Horizontal (x += 300)
- Branching points: Fan out vertically (y += 150 per branch)
- Reconvergence: Return to center alignment
- Clusters: Group related beats (use cluster property)

### Connection Best Practices
- Label important choices clearly
- Use conditions on connections when state matters
- Add effects to connections (setVariable, addInventory) for immediate consequences
- Multiple connections from choice beats (movementChoice, pickProp, dialogTree)
- Single connection from logic beats (setVariable, addRemoveInventory)
- Two connections from conditionBeat (true/false paths)

### Pacing Guidelines
- Start simple: titleScreen → introText → first choice
- Build complexity: Introduce one mechanic at a time
- Mid-game: Combine multiple beat types (dialog + inventory + conditions)
- Climax: State checks, accumulated variables determine outcome
- Resolution: Multiple endScreens based on player journey

### Common Anti-Patterns to Avoid
❌ Too many consecutive introText beats (boring, no interaction)
✓ Mix dialog, choices, and exploration

❌ Branching with no reconvergence (exponential content explosion)
✓ Branch → unique content → reconverge → branch again

❌ Meaningless choices that don't affect story
✓ Every choice sets variables or leads to different content

❌ Invisible beats without visible context
✓ Invisible beats support visible beats (setVariable after choice)

❌ Using endScreen before story develops
✓ Build narrative arc: setup → complications → climax → resolution
`;

/**
 * Build a condensed schema for AI prompts (reduces token usage and confusion)
 */
function buildCondensedSchema(schema: any): string {
  const beatTypes = schema.beatTypes || {};
  const condensed: Record<string, any> = {};

  for (const [typeName, def] of Object.entries(beatTypes)) {
    const beatDef = def as any;
    condensed[typeName] = {
      category: beatDef.category,
      connectionType: beatDef.connectionType,
      description: beatDef.description,
      requiredParams: Object.entries(beatDef.parameters || {})
        .filter(([_, p]: [string, any]) => p.required)
        .map(([name]) => name),
      optionalParams: Object.entries(beatDef.parameters || {})
        .filter(([_, p]: [string, any]) => !p.required)
        .map(([name]) => name),
    };
  }

  return JSON.stringify(condensed, null, 2);
}

/**
 * Build enhanced system prompt for story generation
 */
export function buildEnhancedStoryGenerationSystemPrompt(schema: any): string {
  const beatTypes = Object.keys(schema.beatTypes || {}).join(', ');
  const condensedSchema = buildCondensedSchema(schema);

  return `You are an expert interactive narrative designer and game writer. You create sophisticated, branching stories using the ASAPS beat system with deep understanding of how different beat types work together.

CRITICAL: Your response MUST be valid JSON. Every property name MUST have a colon after the closing quote. Example: "description": "value" (NOT "description: "value").

## Available Beat Types
${beatTypes}

${BEAT_TYPE_GUIDE}

## Beat Type Reference (Condensed)
${condensedSchema}

## Your Task
Generate complete, sophisticated interactive story structures that:

1. **Use Appropriate Beat Types**
   - Visible beats (titleScreen, dialogTree, movementChoice, etc.) for player interaction
   - Invisible beats (setVariable, conditionBeat, etc.) for logic and state management
   - Combine beat types strategically for rich gameplay

2. **Create Meaningful Branching**
   - Not just A or B choices, but consequences that ripple through the story
   - Use variables to track player decisions
   - Create reconvergent paths where branches merge back
   - State-based branching with conditionBeats

3. **Implement Advanced Patterns**
   - Hub-and-spoke for exploration
   - Critical path with optional content
   - State accumulation leading to different endings
   - Inventory/condition-gated progression

4. **Manage Story State**
   - Variables for flags (hasKey, secretKnown)
   - Counters for accumulation (cluesFound, trustScore)
   - Inventory for items
   - Timers for time pressure

5. **Design Narrative Arcs**
   - Setup: Introduce world, characters, conflict
   - Rising Action: Choices with escalating stakes
   - Climax: Major decisions, state checks
   - Resolution: Multiple endings based on accumulated state

6. **Position Beats Logically**
   - Linear progression: horizontal spacing (x += 300)
   - Branches: vertical spacing (y += 150 per option)
   - Clusters: Group related content
   - Reconvergence: Align back to center

## Output Format
\`\`\`json
{
  "metadata": {
    "title": "Story Title",
    "author": "AI Assistant",
    "description": "Brief story description",
    "genre": "mystery|fantasy|scifi|romance|horror|adventure"
  },
  "beats": [
    {
      "id": "beat_0",
      "name": "Descriptive name",
      "type": "beatType",
      "position": { "x": 100, "y": 200 },
      "parameters": { /* type-specific, see schema */ },
      "connections": [
        {
          "targetId": "beat_1",
          "label": "Choice text",
          "condition": { /* optional */ },
          "effects": [ /* optional */ ]
        }
      ],
      "cluster": "optional-cluster-name"
    }
  ],
  "variables": [
    {
      "name": "cluesFound",
      "initialValue": 0,
      "description": "Number of clues discovered"
    }
  ],
  "characters": [
    {
      "id": "char_1",
      "name": "Character Name",
      "description": "Brief description"
    }
  ],
  "reasoning": "Explain story structure, branching strategy, and how beat types work together"
}
\`\`\`

## Critical Requirements
✓ Start with titleScreen (beat_0)
✓ End with one or more endScreen beats
✓ Include all required parameters for each beat type
✓ Use invisible beats (setVariable, conditionBeat) for logic
✓ Create variables for any state you want to track
✓ Label connections clearly for choice beats
✓ Add reasoning explaining your structural decisions
✓ Position beats with logical spacing
✓ Create reconvergent paths, not just endless branching

## ⚠️ CRITICAL: Beat ID Consistency
**EVERY target ID you reference MUST have a corresponding beat with that exact ID in your beats array.**
- Before using a target like "beat_5_hub", make sure you create a beat with "id": "beat_5_hub"
- Use simple IDs: beat_0, beat_1, beat_2... OR beat_intro, beat_hub, beat_ending
- Double-check all targets in: choices[].target, connection.target, trueConnection.target, falseConnection.target
- Common error: Referencing "beat_6_confrontation" but never creating that beat
- The system will detect and report missing beat references

## Concrete Beat Examples (Follow This Exact JSON Format)

\`\`\`json
{
  "id": "beat_0",
  "name": "Title",
  "type": "titleScreen",
  "position": { "x": 100, "y": 300 },
  "parameters": {
    "title": "My Story",
    "author": "Author Name",
    "buttonText": "Start"
  },
  "connections": [{ "targetId": "beat_1" }]
}
\`\`\`

\`\`\`json
{
  "id": "beat_2",
  "name": "Choice Point",
  "type": "movementChoice",
  "position": { "x": 700, "y": 300 },
  "parameters": {
    "question": "Where do you go?",
    "choices": [
      { "id": "c1", "text": "Go left", "target": "beat_3" },
      { "id": "c2", "text": "Go right", "target": "beat_4" }
    ]
  },
  "connections": [
    { "targetId": "beat_3", "label": "Left" },
    { "targetId": "beat_4", "label": "Right" }
  ]
}
\`\`\``;
}

/**
 * Build user prompt (same as before but with enhanced context)
 */
export function buildEnhancedUserPrompt(request: StoryGenerationRequest): string {
  const parts: string[] = [];

  parts.push(`Create an interactive story: "${request.prompt}"`);

  if (request.genre) {
    parts.push(`Genre: ${request.genre}`);
  }

  const lengthGuide = {
    short: '5-10 beats with simple branching and 1-2 reconvergence points',
    medium: '10-20 beats with moderate branching, state tracking, and multiple endings',
    long: '20+ beats with complex branching, multiple subsystems (inventory, relationships), and 4+ possible endings'
  };
  if (request.length) {
    parts.push(`Length: ${lengthGuide[request.length]}`);
  }

  const complexityGuide = {
    linear: 'Mostly linear with 2-3 choice points and simple consequences',
    moderate: 'Multiple branching points (4-6 choices), state tracking with variables, 2-3 endings',
    complex: 'Highly branching with state accumulation, conditional unlocks, parallel paths, relationship systems, and 4+ endings based on player journey'
  };
  if (request.complexity) {
    parts.push(`Complexity: ${complexityGuide[request.complexity]}`);
  }

  if (request.context) {
    parts.push(`Additional requirements: ${request.context}`);
  }

  parts.push(`
Remember to:
- Use invisible beats (setVariable, conditionBeat) for logic
- Create reconvergent paths (branches that merge back)
- Track important decisions in variables
- Use appropriate beat types (dialogTree for conversations, movementChoice for exploration, etc.)
- Design multiple endings based on accumulated state

CRITICAL - Beat ID Consistency:
- Every target ID (in choices[].target, connection.target, etc.) MUST reference a beat you actually create
- Use simple sequential IDs: beat_0, beat_1, beat_2, ... beat_N
- The system will detect and report any missing beat references

IMPORTANT: Respond with ONLY valid JSON. Ensure:
- Every property name has format "name": value (colon AFTER the closing quote)
- All strings are properly quoted
- No trailing commas
- All brackets and braces are properly closed

Generate the complete story structure as JSON.`);

  return parts.join('\n\n');
}

/**
 * Get enhanced example showing sophisticated branching
 */
export function getEnhancedStoryExample(): { user: string; assistant: string } {
  return {
    user: 'Create an interactive story: "A detective must solve a murder with 3 suspects, where gathering clues unlocks the true ending"\nGenre: mystery\nLength: medium\nComplexity: moderate',
    assistant: JSON.stringify({
      metadata: {
        title: "Murder at Blackwood Manor",
        author: "AI Assistant",
        description: "A detective mystery where your investigation determines the outcome",
        genre: "mystery"
      },
      beats: [
        {
          id: "beat_0",
          name: "Title Screen",
          type: "titleScreen",
          position: { x: 100, y: 300 },
          parameters: {
            title: "Murder at Blackwood Manor",
            author: "AI Assistant",
            startButtonText: "Begin Investigation"
          },
          connections: [{ targetId: "beat_1" }]
        },
        {
          id: "beat_1",
          name: "Crime Scene",
          type: "introText",
          position: { x: 400, y: 300 },
          parameters: {
            text: "Lord Blackwood lies dead in his study. Three suspects remain: the Butler, the Maid, and the mysterious Guest. You must find the truth.",
            buttonText: "Begin Investigation"
          },
          connections: [{ targetId: "beat_2" }]
        },
        {
          id: "beat_2",
          name: "Investigation Hub",
          type: "movementChoice",
          position: { x: 700, y: 300 },
          parameters: {
            question: "Where do you want to investigate?",
            choices: [
              { text: "Search the Library", target: "beat_3" },
              { text: "Examine the Study", target: "beat_6" },
              { text: "Question the Servants", target: "beat_9" }
            ]
          },
          connections: [
            { targetId: "beat_3", label: "Library" },
            { targetId: "beat_6", label: "Study" },
            { targetId: "beat_9", label: "Servants" }
          ]
        },
        {
          id: "beat_3",
          name: "Library Search",
          type: "pickProp",
          position: { x: 1000, y: 150 },
          parameters: {
            question: "You search the library carefully. What catches your attention?",
            props: [
              { id: "letter", name: "Mysterious Letter", target: "beat_4" },
              { id: "nothing", name: "Nothing useful", target: "beat_5" }
            ]
          },
          connections: [
            { targetId: "beat_4", label: "Letter" },
            { targetId: "beat_5", label: "Nothing" }
          ]
        },
        {
          id: "beat_4",
          name: "Found Letter - Track Clue",
          type: "setVariable",
          position: { x: 1300, y: 100 },
          parameters: {
            type: "counter",
            name: "cluesFound",
            value: 1,
            operation: "change",
            connection: { target: "beat_5" }
          },
          connections: [{ targetId: "beat_5" }]
        },
        {
          id: "beat_5",
          name: "Library Complete",
          type: "introText",
          position: { x: 1300, y: 200 },
          parameters: {
            text: "You've searched the library thoroughly.",
            buttonText: "Continue Investigation"
          },
          connections: [{ targetId: "beat_12" }]
        },
        {
          id: "beat_6",
          name: "Study Examination",
          type: "pickProp",
          position: { x: 1000, y: 300 },
          parameters: {
            question: "The study is in disarray. What do you examine?",
            props: [
              { id: "weapon", name: "The Murder Weapon", target: "beat_7" },
              { id: "nothing", name: "Nothing stands out", target: "beat_8" }
            ]
          },
          connections: [
            { targetId: "beat_7", label: "Weapon" },
            { targetId: "beat_8", label: "Nothing" }
          ]
        },
        {
          id: "beat_7",
          name: "Found Weapon - Track Clue",
          type: "setVariable",
          position: { x: 1300, y: 250 },
          parameters: {
            type: "counter",
            name: "cluesFound",
            value: 1,
            operation: "change",
            connection: { target: "beat_8" }
          },
          connections: [{ targetId: "beat_8" }]
        },
        {
          id: "beat_8",
          name: "Study Complete",
          type: "introText",
          position: { x: 1300, y: 350 },
          parameters: {
            text: "You've examined the study.",
            buttonText: "Continue"
          },
          connections: [{ targetId: "beat_12" }]
        },
        {
          id: "beat_9",
          name: "Question Butler",
          type: "dialogTree",
          position: { x: 1000, y: 450 },
          parameters: {
            dialogTree: {
              id: "root",
              speaker: "Butler",
              text: "I served Lord Blackwood for 30 years. I would never harm him!",
              emotion: "sad",
              choices: [
                {
                  id: "sympathetic",
                  text: "I believe you. Tell me what you know.",
                  target: "beat_10"
                },
                {
                  id: "accusatory",
                  text: "Your devotion seems suspicious...",
                  target: "beat_11"
                }
              ]
            }
          },
          connections: [
            { targetId: "beat_10", label: "Sympathetic" },
            { targetId: "beat_11", label: "Accusatory" }
          ]
        },
        {
          id: "beat_10",
          name: "Butler Reveals Clue",
          type: "setVariable",
          position: { x: 1300, y: 400 },
          parameters: {
            type: "counter",
            name: "cluesFound",
            value: 1,
            operation: "change",
            connection: { target: "beat_11" }
          },
          connections: [{ targetId: "beat_11" }]
        },
        {
          id: "beat_11",
          name: "Interrogation Complete",
          type: "introText",
          position: { x: 1300, y: 500 },
          parameters: {
            text: "The butler has nothing more to say.",
            buttonText: "Continue"
          },
          connections: [{ targetId: "beat_12" }]
        },
        {
          id: "beat_12",
          name: "Check Investigation Progress",
          type: "conditionBeat",
          position: { x: 1600, y: 300 },
          parameters: {
            condition: {
              type: "counter",
              variableName: "cluesFound",
              operator: ">=",
              value: 2
            },
            trueConnection: { target: "beat_13", label: "Enough Clues (≥2)" },
            falseConnection: { target: "beat_2", label: "Need More Clues (<2)" }
          },
          connections: [
            { targetId: "beat_13", label: "Enough Clues (≥2)" },
            { targetId: "beat_2", label: "Need More Clues (<2)" }
          ],
          cluster: "investigation-check"
        },
        {
          id: "beat_13",
          name: "Ready for Accusation",
          type: "introText",
          position: { x: 1900, y: 200 },
          parameters: {
            text: "You've gathered enough evidence. Time to make your accusation.",
            buttonText: "Proceed to Finale"
          },
          connections: [{ targetId: "beat_14" }]
        },
        {
          id: "beat_14",
          name: "Final Accusation",
          type: "movementChoice",
          position: { x: 2200, y: 300 },
          parameters: {
            question: "Who murdered Lord Blackwood?",
            choices: [
              { text: "The Butler", target: "beat_15" },
              { text: "The Maid", target: "beat_16" },
              { text: "The Guest", target: "beat_17" }
            ]
          },
          connections: [
            { targetId: "beat_15", label: "Butler" },
            { targetId: "beat_16", label: "Maid" },
            { targetId: "beat_17", label: "Guest" }
          ]
        },
        {
          id: "beat_15",
          name: "Wrong - Butler Ending",
          type: "endScreen",
          position: { x: 2500, y: 150 },
          parameters: {
            endMessage: "Wrong! The butler was innocent. The true killer escapes. CASE UNSOLVED",
            showRestart: true,
            showCredits: false
          },
          connections: []
        },
        {
          id: "beat_16",
          name: "Partial Success - Maid Ending",
          type: "conditionBeat",
          position: { x: 2500, y: 300 },
          parameters: {
            condition: {
              type: "counter",
              variableName: "cluesFound",
              operator: "==",
              value: 3
            },
            trueConnection: { target: "beat_18", label: "All Clues Found" },
            falseConnection: { target: "beat_19", label: "Missing Clues" }
          },
          connections: [
            { targetId: "beat_18", label: "All Clues Found" },
            { targetId: "beat_19", label: "Missing Clues" }
          ]
        },
        {
          id: "beat_17",
          name: "Wrong - Guest Ending",
          type: "endScreen",
          position: { x: 2500, y: 450 },
          parameters: {
            endMessage: "Incorrect! The guest had an alibi. The case goes cold. INVESTIGATION FAILED",
            showRestart: true,
            showCredits: false
          },
          connections: []
        },
        {
          id: "beat_18",
          name: "Perfect Victory",
          type: "endScreen",
          position: { x: 2800, y: 250 },
          parameters: {
            endMessage: "Correct! With all evidence, you prove the maid's guilt AND uncover her secret accomplice. PERFECT SOLVE!",
            showRestart: true,
            showCredits: true
          },
          connections: []
        },
        {
          id: "beat_19",
          name: "Partial Victory",
          type: "endScreen",
          position: { x: 2800, y: 350 },
          parameters: {
            endMessage: "You caught the maid, but without all evidence, her accomplice escapes. CASE CLOSED (Partial Success)",
            showRestart: true,
            showCredits: false
          },
          connections: []
        }
      ],
      variables: [
        {
          name: "cluesFound",
          initialValue: 0,
          description: "Number of investigation clues discovered (0-3)"
        }
      ],
      characters: [
        { id: "butler", name: "James the Butler", description: "Loyal servant for 30 years" },
        { id: "maid", name: "Mary the Maid", description: "Quiet and nervous" },
        { id: "guest", name: "Dr. Grey", description: "Mysterious overnight guest" }
      ],
      reasoning: `Story demonstrates advanced patterns:

1. HUB-AND-SPOKE: beat_2 is central hub, player can investigate 3 locations
2. STATE TRACKING: cluesFound variable increments when player finds evidence
3. RECONVERGENCE: All investigation paths (beats 5, 8, 11) converge at beat_12
4. CONDITIONAL GATING: beat_12 checks if player found ≥2 clues before allowing finale
5. FORCED BACKTRACKING: If <2 clues, loops back to hub (beat_2) for more investigation
6. STATE-BASED ENDING: Final accusation has 4 possible outcomes:
   - Wrong suspects (Butler/Guest) → Bad endings
   - Right suspect (Maid) → Check if found ALL 3 clues
     - 3 clues → Perfect ending (uncover accomplice)
     - <3 clues → Partial ending (accomplice escapes)

Beat types used strategically:
- movementChoice: Hub navigation, final accusation
- pickProp: Searching locations for clues
- dialogTree: Character interrogation with branching responses
- setVariable: Track clues invisibly
- conditionBeat: Gate progression and determine ending quality
- introText: Narration between major beats
- endScreen: Multiple endings based on player performance

This creates meaningful choices where thoroughness is rewarded with better endings.`
    }, null, 2)
  };
}
