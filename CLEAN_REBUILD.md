# CRITICAL FIX: Clean Rebuild Required

## Problem

The exports ARE in the renderer package (verified in `dist/index.d.ts`), but the builder package is seeing an old cached version.

## Solution: Complete Clean Rebuild

Run these commands **one at a time** from the project root:

### Step 1: Clean Everything
```bash
rm -rf packages/core/dist packages/renderer/dist packages/builder/dist
rm -rf packages/core/node_modules packages/renderer/node_modules packages/builder/node_modules
```

### Step 2: Reinstall Dependencies
```bash
npm install
```

This will reinstall and properly link the workspace packages.

### Step 3: Build Core
```bash
cd packages/core && npm run build && cd ../..
```

### Step 4: Build Renderer
```bash
cd packages/renderer && npm run build && cd ../..
```

### Step 5: Build Builder
```bash
cd packages/builder && npm run build && cd ../..
```

## Why This Works

1. **Removes stale build artifacts** - Old dist folders with outdated exports
2. **Clears cached dependencies** - Old node_modules with stale links
3. **Reinstalls with fresh workspace links** - npm install creates proper links between packages
4. **Builds in dependency order** - Each package sees the latest version of its dependencies

## Verification

After the build completes, you should see:

✅ Core built successfully  
✅ Renderer built successfully (with PositionedBeatView exports)  
✅ Builder built successfully (can import from renderer)  

## Alternative: Use the Script

I created `clean-rebuild.sh` which does all of the above:

```bash
chmod +x clean-rebuild.sh
./clean-rebuild.sh
```

---

## What I Verified

✅ `packages/renderer/dist/index.d.ts` **DOES** contain:
- `export declare const PositionedBeatView`
- `export declare interface PositionedBeatViewProps`
- `export declare interface PositionedElementData`
- `export declare function createPositionedElementData`

The exports are there! The builder just needs to see the fresh version.

---

*Created: October 12, 2025*  
*Issue: Stale package cache*  
*Solution: Clean rebuild with fresh dependencies*
*Status: Exports verified in renderer, just need clean rebuild*
