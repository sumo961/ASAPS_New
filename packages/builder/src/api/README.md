# ASAPS Builder HTTP API Server

REST API server for ASAPS Builder with WebSocket support for real-time updates.

## Features

- **REST API** for projects, beats, and assets
- **WebSocket** for real-time collaboration
- **CORS** enabled for cross-origin requests
- **Hybrid Storage** integration
- **MCP Server** compatible

## Quick Start

```bash
# Start the API server
npm run api:start -w @asaps/builder

# Start with auto-reload (development)
npm run api:dev -w @asaps/builder
```

The server will start on `http://localhost:3001` by default.

## Environment Variables

```bash
PORT=3001              # Server port (default: 3001)
HOST=localhost         # Server host (default: localhost)
CORS_ORIGIN=*          # CORS origin (default: *)
ENABLE_WS=true         # Enable WebSocket (default: true)
```

## API Endpoints

### Health Check
```
GET /health
```

Returns server status and readiness.

### Projects

```
GET    /api/projects           # List all projects
POST   /api/projects           # Create new project
GET    /api/projects/:id       # Get project by ID
PUT    /api/projects/:id       # Update project
DELETE /api/projects/:id       # Delete project
```

### Beats

```
POST   /api/beats/:projectId   # Add beat to project
```

### Assets

```
GET    /api/assets/:projectId              # List project assets
POST   /api/assets/:projectId              # Upload asset
GET    /api/assets/:projectId/:assetId     # Get asset info
DELETE /api/assets/:projectId/:assetId     # Delete asset
```

### Stories

```
POST   /api/stories/generate   # Generate story with AI
```

## WebSocket Events

The WebSocket server broadcasts real-time events:

- `project:created` - New project created
- `project:updated` - Project updated
- `project:deleted` - Project deleted
- `beat:added` - Beat added to project
- `asset:uploaded` - Asset uploaded
- `asset:deleted` - Asset deleted

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onmessage = (event) => {
  const { event: eventName, data, timestamp } = JSON.parse(event.data);
  console.log(`Event: ${eventName}`, data);
};
```

## MCP Integration

The API server is designed to work with the ASAPS MCP server:

```json
{
  "mcpServers": {
    "asaps-ai": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "ASAPS_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────┐
│           MCP Server / Clients          │
│        (Claude Code, External Apps)     │
└─────────────────┬───────────────────────┘
                  │
                  │ HTTP/WS
                  ↓
┌─────────────────────────────────────────┐
│         ASAPS Builder API Server        │
│  ┌─────────────────────────────────┐   │
│  │  REST Endpoints                  │   │
│  │  - /api/projects                 │   │
│  │  - /api/beats                    │   │
│  │  - /api/assets                   │   │
│  │  - /api/stories                  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  WebSocket Server                │   │
│  │  - Real-time broadcasts          │   │
│  │  - Event notifications           │   │
│  └─────────────────────────────────┘   │
└─────────────────┬───────────────────────┘
                  │
                  │
                  ↓
┌─────────────────────────────────────────┐
│       HybridStorageAdapter              │
│  ┌─────────────────────────────────┐   │
│  │  Size-based routing:             │   │
│  │  - <5MB  → IndexedDB             │   │
│  │  - ≥5MB  → Filesystem/Cache      │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Example Usage

### Create a Project

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "id": "project-123",
    "name": "My Story",
    "description": "An interactive story"
  }'
```

### Get All Projects

```bash
curl http://localhost:3001/api/projects
```

### Add a Beat

```bash
curl -X POST http://localhost:3001/api/beats/project-123 \
  -H "Content-Type: application/json" \
  -d '{
    "id": "beat-1",
    "type": "titleScreen",
    "name": "Title",
    "parameters": {
      "title": "My Story"
    }
  }'
```

## Development

The API server is built with:
- **Express** - HTTP server
- **ws** - WebSocket server
- **cors** - Cross-origin resource sharing
- **HybridStorageAdapter** - Hybrid storage layer

### File Structure

```
src/api/
├── server.ts      # Main server implementation
├── cli.ts         # CLI entry point
├── index.ts       # Exports
└── README.md      # This file
```

## Security Considerations

For production deployments:

1. Set specific CORS origins instead of `*`
2. Add authentication/authorization
3. Use HTTPS/WSS instead of HTTP/WS
4. Implement rate limiting
5. Validate all input data
6. Add request logging

## License

Part of the ASAPS project.
