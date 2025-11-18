# ASAPS MCP Server

MCP (Model Context Protocol) server for AI-assisted interactive story creation in ASAPS Modern.

## Features

- 🎭 **Story Generation**: Create complete interactive story structures from natural language prompts
- 💬 **Dialog Writing**: Generate branching dialogue trees for character conversations
- 🎯 **Beat Suggestions**: Get AI-powered suggestions for next beats based on story context
- 🔨 **Beat Creation**: Create beats from natural language descriptions
- 📖 **Story Context**: Read current project state for context-aware AI operations

## Installation

```bash
npm install
npm run build
```

## Usage

### With Claude Code

Add to your `.claude/mcp_config.json`:

```json
{
  "mcpServers": {
    "asaps-ai": {
      "command": "node",
      "args": ["/path/to/asaps-modern/mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Available Tools

#### `generate_story`
Generate a complete interactive story from a prompt.

**Arguments:**
- `prompt` (string, required): Description of the story to create
- `genre` (string, optional): Story genre (mystery, fantasy, scifi, etc.)
- `length` (string, optional): "short", "medium", or "long"
- `complexity` (string, optional): "linear", "moderate", or "complex"

**Example:**
```json
{
  "prompt": "A mystery in a haunted mansion with 3 suspects",
  "genre": "mystery",
  "length": "medium",
  "complexity": "moderate"
}
```

#### `write_dialog`
Generate a branching dialogue tree for a conversation.

**Arguments:**
- `scene` (string, required): Description of the scene/conversation
- `character` (string, optional): Name of the speaking character
- `goal` (string, optional): Goal of the conversation
- `branchingFactor` (number, optional): Number of player choices (default: 3)

**Example:**
```json
{
  "scene": "Interrogating the butler about the murder",
  "character": "Detective",
  "goal": "Extract information while reading reactions",
  "branchingFactor": 3
}
```

#### `suggest_beats`
Suggest next beats based on current story context.

**Arguments:**
- `currentBeatId` (string, required): ID of the current beat
- `count` (number, optional): Number of suggestions (default: 3)

**Example:**
```json
{
  "currentBeatId": "beat_5",
  "count": 3
}
```

#### `create_beat`
Create a beat from natural language description.

**Arguments:**
- `description` (string, required): Natural language description of the beat

**Example:**
```json
{
  "description": "Add a choice where the player decides to help the merchant or walk away"
}
```

#### `get_story_context`
Get the current story state for context.

**Returns:**
- Story metadata
- All beats
- Variables
- Characters

#### `apply_story_changes`
Apply AI-generated changes to the active project.

**Arguments:**
- `changes` (object, required): Story changes to apply
  - `beats` (array, optional): Beats to add
  - `connections` (array, optional): Connections to create
  - `variables` (array, optional): Variables to define

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY`: API key for Claude (required)
- `OPENAI_API_KEY`: API key for OpenAI (optional)
- `AI_PROVIDER`: Provider to use ("claude" or "openai", default: "claude")
- `AI_MODEL`: Model to use (e.g., "claude-sonnet-4", default: provider default)
- `AI_TEMPERATURE`: Creativity setting 0-1 (default: 0.7)

### Project Database

The server reads and writes to the IndexedDB database used by the ASAPS Builder at:
- Database: `asaps-builder-db`
- Stores: `projects`, `assets`, `history`

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Start server
npm start
```

## Architecture

```
mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/                # MCP tool implementations
│   │   ├── generateStory.ts  # Story generation tool
│   │   ├── writeDialog.ts    # Dialog writing tool
│   │   ├── suggestBeats.ts   # Beat suggestion tool
│   │   └── createBeat.ts     # Beat creation tool
│   └── utils/
│       ├── storageAdapter.ts # IndexedDB access
│       └── schemaValidator.ts # Validation utilities
└── package.json
```

## License

MIT
