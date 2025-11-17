# Build Instructions for Monorepo - October 12, 2025

## Why Build is Needed

TypeScript packages in a monorepo must be built in dependency order. When we updated the renderer package exports, those changes need to be compiled before the builder package can see them.

## Proper Build Sequence

### Step 1: Build Core Package
```bash
cd packages/core
npm run build
```

**Why:** Core has no dependencies, build it first.

### Step 2: Build Renderer Package
```bash
cd packages/renderer
npm run build
```

**Why:** Renderer depends on Core. This compiles the new exports we added.

### Step 3: Build Builder Package
```bash
cd packages/builder
npm run build
```

**Why:** Builder depends on both Core and Renderer. Now it will see the updated exports.

---

## Expected Results

After building in this order:

✅ **Core** - Compiles with updated Location type (assetId, sound)  
✅ **Renderer** - Compiles with new exports (PositionedBeatView, EditCallbacks, etc.)  
✅ **Builder** - Can import from @asaps/renderer successfully

---

## If Build Fails

### Core Build Failure
- Check Location type in `packages/core/src/types/index.ts`
- Should have `assetId?: string` and `sound?: string`

### Renderer Build Failure
- Check exports in `packages/renderer/src/index.ts`
- Check PositionedBeatView component exists
- Check ReactRenderer has protected methods

### Builder Build Failure
- **CRITICAL:** Delete duplicate file first:
  ```bash
  rm "packages/builder/src/components/visual/shared/PositionedBeatRenderer.tsx"
  ```
- **RECOMMENDED:** Delete unused file:
  ```bash
  rm "packages/builder/src/components/visual/UnifiedVisualEditor.tsx"
  ```

---

## Alternative: Build All at Once

If you have a root-level build script:

```bash
cd /Users/hartmut/Library/Mobile\ Documents/com~apple~CloudDocs/Coding/Project\ Phoenix/asaps-modern
npm run build
```

This should build all packages in the correct order.

---

## Quick Build Script

Create this script to build in correct order:

```bash
#!/bin/bash
echo "Building ASPS Modern packages..."
cd packages/core && npm run build && \
cd ../renderer && npm run build && \
cd ../builder && npm run build
echo "Build complete!"
```

---

## Verification After Build

Check that these files exist (build output):
- `packages/core/dist/` or `packages/core/lib/`
- `packages/renderer/dist/` or `packages/renderer/lib/`
- `packages/builder/dist/` or `packages/builder/lib/`

---

*Created: October 12, 2025*  
*Status: Packages need rebuild after source changes*  
*Priority: Build renderer package to expose new exports*
