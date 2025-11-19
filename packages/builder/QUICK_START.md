# ASAPS Builder - Quick Start Guide

## 🎉 Week 4 Complete - Full Stack Ready!

All storage backends, API infrastructure, and MCP server integration are complete and tested. The complete AI-assisted story creation system is now functional.

---

## 📋 Current Status

- ✅ **Week 1**: Storage abstraction layer (IStorageAdapter, HybridStorageAdapter)
- ✅ **Week 2**: HTTP API server infrastructure (Express, WebSocket)
- ✅ **Week 3**: Node.js storage backends (FilesystemStorageAdapter, comprehensive tests)
- ✅ **Week 4**: MCP server integration (HTTP API client, tool updates, E2E testing)

**All 71 storage tests passing** ✅
**All 7 integration tests passing** ✅

---

## 🚀 Quick Start

### 1. Start the API Server

```bash
# Default (filesystem storage at ~/.asaps-storage)
npm run api:start -w @asaps/builder

# With custom storage path
STORAGE_PATH=~/my-projects npm run api:start -w @asaps/builder

# Development mode (in-memory, data lost on restart)
STORAGE_TYPE=memory npm run api:start -w @asaps/builder
```

**Server runs at:** `http://localhost:3001`

### 2. Test the API

```bash
# Health check
curl http://localhost:3001/health

# List projects
curl http://localhost:3001/api/projects

# Create a project
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-project",
    "name": "My Story",
    "description": "A test story",
    "version": "1.0.0",
    "createdAt": "2025-11-18T00:00:00.000Z",
    "modifiedAt": "2025-11-18T00:00:00.000Z",
    "metadata": {},
    "rootBeatId": "start",
    "beats": [],
    "connections": []
  }'

# Get a project
curl http://localhost:3001/api/projects/my-project
```

### 3. Run Tests

```bash
# All storage tests
npm run test -w @asaps/builder -- --run FilesystemStorageAdapter.test.ts MemoryStorageAdapter.test.ts

# Specific test file
npm run test -w @asaps/builder -- FilesystemStorageAdapter.test.ts

# Interactive test UI
npm run test:ui -w @asaps/builder

# All tests
npm run test -w @asaps/builder
```

---

## 📁 Storage Location

**Default storage path:** `~/.asaps-storage/`

```
~/.asaps-storage/
├── projects/          # Project JSON files
│   └── {projectId}.json
├── assets/            # Binary asset files
│   └── {projectId}/
│       ├── backgrounds/
│       ├── characters/
│       ├── props/
│       ├── sounds/
│       └── fonts/
├── metadata/          # Asset metadata JSON
│   └── {assetId}.json
├── history/           # Undo/redo history
│   └── {projectId}.json
└── drafts/            # Auto-save drafts
    └── {projectId}/
        └── {timestamp}.json
```

**View stored data:**
```bash
# List projects
ls ~/.asaps-storage/projects/

# View a project
cat ~/.asaps-storage/projects/my-project.json | jq

# See storage size
du -sh ~/.asaps-storage/
```

---

## 🧪 Testing

### Test Summary
- **FilesystemStorageAdapter**: 35 tests ✅
- **MemoryStorageAdapter**: 36 tests ✅
- **HybridStorageAdapter**: 31 tests ✅
- **Total**: 71 tests passing

### Test Categories
1. **Initialization** - Storage setup and configuration
2. **Project Operations** - CRUD for projects
3. **Asset Operations** - Asset storage and retrieval
4. **Storage Management** - Stats, cleanup, compaction
5. **History & Drafts** - Undo/redo and auto-save
6. **Singleton Pattern** - Instance management

---

## 🔧 Configuration

### Environment Variables

```bash
# Storage type (default: filesystem)
STORAGE_TYPE=filesystem|memory

# Storage path (default: ~/.asaps-storage)
STORAGE_PATH=~/my-path

# Server port (default: 3001)
PORT=3001

# Server host (default: localhost)
HOST=localhost

# CORS origin (default: *)
CORS_ORIGIN=http://localhost:5173

# WebSocket enabled (default: true)
ENABLE_WS=true|false
```

### Example: Production Configuration

```bash
STORAGE_TYPE=filesystem \
STORAGE_PATH=/var/lib/asaps \
PORT=3001 \
HOST=0.0.0.0 \
CORS_ORIGIN=https://myapp.com \
npm run api:start -w @asaps/builder
```

---

## 📚 API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Get project by ID
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Beats
- `POST /api/beats/:projectId` - Add beat to project

### Assets
- `GET /api/assets/:projectId` - List project assets
- `GET /api/assets/:projectId/:assetId` - Get asset info
- `POST /api/assets/:projectId` - Upload asset
- `DELETE /api/assets/:projectId/:assetId` - Delete asset

### Stories
- `POST /api/stories/generate` - Generate story (placeholder for AI)

### Health
- `GET /health` - Health check
- `GET /api` - API info

---

## 🐛 Troubleshooting

### Issue: Server won't start
**Solution:** Check if port 3001 is already in use
```bash
lsof -i :3001
kill -9 <PID>
```

### Issue: Tests failing
**Solution:** Ensure you're in the correct directory
```bash
cd packages/builder
npm run test
```

### Issue: Storage not persisting
**Solution:** Check if using memory storage (dev mode)
```bash
# Use filesystem storage instead
STORAGE_TYPE=filesystem npm run api:start -w @asaps/builder
```

### Issue: Permission denied on ~/.asaps-storage
**Solution:** Check directory permissions
```bash
ls -la ~/.asaps-storage
chmod 755 ~/.asaps-storage
```

---

## 📖 Documentation

- **API README**: `packages/builder/src/api/README.md`
- **Progress Doc**: `packages/builder/STORAGE_API_PROGRESS.md`
- **This Guide**: `packages/builder/QUICK_START.md`

### Key Files
- `src/storage/FilesystemStorageAdapter.ts` - Filesystem storage implementation
- `src/storage/MemoryStorageAdapter.ts` - In-memory storage implementation
- `src/storage/HybridStorageAdapter.ts` - Browser storage implementation
- `src/storage/IStorageAdapter.ts` - Storage interface definition
- `src/api/server.ts` - API server implementation
- `src/api/cli.ts` - CLI entry point

---

## 🎯 Week 4 Complete: MCP Server Integration

### What Was Accomplished
1. ✅ Created HTTP API client (`mcp-server/src/utils/apiClient.ts`)
2. ✅ Updated `get_story_context` tool to call HTTP API
3. ✅ Updated `apply_story_changes` tool to call HTTP API
4. ✅ Full end-to-end testing (7 integration tests passing)

### MCP Server Usage

The MCP server is pre-built and ready to use. Just install dependencies and run:

```bash
# Install dependencies (first time only)
cd mcp-server
npm install

# Start the API server first (in another terminal)
cd packages/builder
STORAGE_TYPE=filesystem npm run api:start

# Run the MCP server (already built in dist/)
cd mcp-server
node dist/index.js

# Or test the integration
npx tsx test-integration.ts
```

### Integration Test Results
- ✅ Test 1: Health Check - API server connectivity
- ✅ Test 2: Create Test Project - Project creation via API
- ✅ Test 3: Get Story Context (list all) - List all projects
- ✅ Test 4: Get Story Context (specific) - Get single project details
- ✅ Test 5: Apply Story Changes (add beats) - Add beats and connections
- ✅ Test 6: Verify Changes - Confirm changes persisted
- ✅ Test 7: Auto-create Project - Create project via applyStoryChanges

### Optional Next Steps
- Add "clean" ASML export (strip editor metadata)
- Integrate HybridStorageAdapter with builder UI
- Create storage migration utility
- Add more MCP tools (generate_story, write_dialog, etc.)
- Implement WebSocket support in MCP server for real-time updates

---

## 💡 Tips

1. **Development**: Use memory storage for quick testing
   ```bash
   STORAGE_TYPE=memory npm run api:start -w @asaps/builder
   ```

2. **Production**: Use filesystem storage with custom path
   ```bash
   STORAGE_PATH=/var/lib/asaps npm run api:start -w @asaps/builder
   ```

3. **Testing**: Run specific tests for faster feedback
   ```bash
   npm run test -w @asaps/builder -- FilesystemStorageAdapter.test.ts
   ```

4. **Debugging**: Enable verbose logging (if needed)
   ```bash
   DEBUG=* npm run api:start -w @asaps/builder
   ```

---

**Last Updated**: 2025-11-18
**Version**: Week 3 Complete ✅
