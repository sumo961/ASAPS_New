# ASAPS MCP Server for Claude Desktop

This MCP (Model Context Protocol) server enables **Claude Desktop** to directly create and inject interactive stories into a running ASAPS Builder instance.

## How It Works

```
Claude Desktop <--> MCP Server <--> ASAPS Builder (localhost:3001)
```

Unlike the AI-powered MCP server (`mcp-server/`), this one requires **NO API KEYS**:

- **Claude Desktop** does all the creative thinking and story generation
- **MCP Server** provides schema documentation and story injection
- **ASAPS Builder** receives and displays the story in real-time

## Installation

### 1. Build the MCP Server

```bash
cd mcp-server-desktop
npm install
npm run build
```

### 2. Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "asaps-desktop": {
      "command": "node",
      "args": ["/full/path/to/asaps-modern/mcp-server-desktop/dist/index.js"]
    }
  }
}
```

**Note on paths with spaces:** The path can contain spaces (e.g., `/Users/me/My Projects/asaps-modern/...`). The MCP SDK passes each `args` array element as a single argument to Node.js's `spawn()`, so spaces are preserved correctly without needing escaping or quotes.

### 3. Start ASAPS Builder

```bash
# In the asaps-modern directory
npm run dev:all

# Or start just the builder with API server
cd packages/builder
npm run api:start  # API server on port 3001
npm run dev        # Builder on port 5173
```

## Available Tools

### `asaps_check_connection`
Verify that ASAPS Builder is running and accessible.

```
Check if the ASAPS Builder is running and accessible.
Call this first to verify the connection before creating stories.
```

### `asaps_get_beat_schema`
Get complete documentation of all beat types and their parameters.

```
Get the complete schema for all ASAPS beat types.
This tells you what beat types are available, their parameters,
and how to structure story data.
```

### `asaps_get_example_story`
Get an example story to use as a template.

```
Get an example story structure showing the correct format
for beats, connections, and metadata.
```

### `asaps_inject_story`
Send a complete story to ASAPS Builder.

```
Inject a complete interactive story into the running ASAPS Builder.
The story will immediately appear in the visual editor.
```

## Usage Example

In Claude Desktop, you can say:

> "Create an interactive story about a detective investigating a haunted house. Include branching dialogue with a mysterious ghost."

Claude will:
1. Call `asaps_get_beat_schema` to understand beat types
2. Create a story structure using its reasoning
3. Call `asaps_inject_story` to send it to the Builder

The story immediately appears in your ASAPS Builder window!

## Beat Types Reference

### Visible Beats (User-Facing)

| Type | Description | Key Parameters |
|------|-------------|----------------|
| `titleScreen` | Opening title with start button | `title`, `author`, `buttonText` |
| `infoText` | Narrative text with continue | `text`, `buttonText` |
| `dialogTree` | Branching conversation | `dialogTree` (nested structure) |
| `movementChoice` | Location navigation | `question`, `choices[]` |
| `pickProp` | Item interaction | `question`, `props[]` |
| `endScreen` | Story ending | `message`, `showRestart` |
| `durScreen` | Timed display | `text`, `duration` |
| `inputText` | User text input | `prompt`, `variable` |
| `hyperText` | Clickable text links | `text`, `hyperlinks[]` |

### Logic Beats (Background)

| Type | Description | Key Parameters |
|------|-------------|----------------|
| `setVariable` | Set/modify variables | `type`, `name`, `value` |
| `conditionBeat` | Conditional branching | `condition`, `trueTarget`, `falseTarget` |
| `randomTarget` | Random next beat | `choices[]` |
| `addRemoveInventory` | Inventory management | `action`, `item`, `character` |
| `setTimer` | Timer management | `name`, `value`, `timerTarget` |

## Story Structure

```json
{
  "metadata": {
    "title": "My Story",
    "author": "Claude Desktop",
    "description": "An interactive adventure"
  },
  "beats": [
    {
      "id": "beat_0",
      "type": "titleScreen",
      "name": "Title",
      "parameters": {
        "title": "My Story",
        "buttonText": "Begin"
      },
      "x": 100,
      "y": 200
    }
  ],
  "connections": [
    { "source": "beat_0", "target": "beat_1" }
  ]
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASAPS_API_URL` | `http://localhost:3001` | URL of the ASAPS Builder API server |

## Troubleshooting

### "Cannot connect to ASAPS Builder"

1. Make sure the Builder is running: `npm run dev:all`
2. Check if the API server is accessible: `curl http://localhost:3001/health`
3. Verify the port isn't blocked by a firewall

### "Tools not showing in Claude Desktop"

1. Restart Claude Desktop after editing config
2. Check the config file path is correct
3. Verify the MCP server is built: `npm run build`

### Story not appearing in Builder

1. Check the browser console for WebSocket connection logs
2. Verify the Builder is connected: look for "[App] WebSocket connected" in console
3. Try refreshing the Builder page

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build
```

## Architecture

```
mcp-server-desktop/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts    # Main MCP server with all tools
└── dist/           # Compiled output
    └── index.js
```

The server is intentionally simple:
- Single file implementation
- No AI API dependencies
- Just HTTP calls to ASAPS Builder API
- Claude Desktop does all the creative work
