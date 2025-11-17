# Step-by-Step Clean Rebuild - EXACT COMMANDS

## Current Situation

The renderer package HAS the exports (I verified in dist/index.d.ts), but the builder can't see them due to workspace linking issues.

## DO NOT build builder yet!

The error you're seeing is because builder is trying to compile before renderer is properly available. Follow this EXACT sequence:

---

## Step 1: Clean Everything (from project root)

```bash
rm -rf packages/core/dist packages/renderer/dist packages/builder/dist
rm -rf packages/core/node_modules packages/renderer/node_modules packages/builder/node_modules
```

**Expected:** Directories removed (no output)

---

## Step 2: Reinstall All Dependencies (from project root)

```bash
npm install
```

**Expected:** You'll see npm installing and linking workspace packages
**Wait for:** "added X packages" message

---

## Step 3: Build ONLY Core (from project root)

```bash
cd packages/core
npm run build
cd ../..
```

**Expected:** 
```
✓ built in XXXms
```

**Do NOT see builder errors here** - if you do, it means a watch process is running. Stop it with Ctrl+C.

---

## Step 4: Build ONLY Renderer (from project root)

```bash
cd packages/renderer
npm run build
cd ../..
```

**Expected:**
```
vite v5.x.x building for production...
✓ XX modules transformed
dist/asaps-renderer.es.js
dist/asaps-renderer.cjs.js
✓ built in XXXms
```

**Verify renderer built correctly:**
```bash
ls -la packages/renderer/dist/
```

**Should see:**
- asaps-renderer.es.js
- asaps-renderer.cjs.js
- index.d.ts

---

## Step 5: NOW Build Builder (from project root)

```bash
cd packages/builder
npm run build
cd ../..
```

**Expected:** Should now compile without errors!

---

## If Step 5 STILL Shows Errors

### Check 1: Verify renderer exports are accessible
```bash
cat packages/renderer/dist/index.d.ts | grep "PositionedBeatView"
```

**Should see:**
```
export declare const PositionedBeatView: ...
```

### Check 2: Verify workspace link
```bash
ls -la packages/builder/node_modules/@asaps/renderer
```

**Should be a symlink** pointing to `../../renderer`

### Check 3: If link is broken, reinstall builder dependencies
```bash
cd packages/builder
npm install
cd ../..
```

Then try building builder again.

---

## Alternative: Force Clean Workspace

If the above doesn't work, the workspace might be corrupted:

```bash
# From project root
rm -rf node_modules package-lock.json
rm -rf packages/*/node_modules packages/*/package-lock.json
npm install
```

Then rebuild: core → renderer → builder

---

## What to Report Back

If it still fails, please show me:

1. Output from building renderer (Step 4)
2. The exact error from building builder (Step 5)
3. Result of: `ls -la packages/builder/node_modules/@asaps/`

This will help me diagnose the workspace linking issue.

---

*Created: October 12, 2025*  
*Issue: Workspace linking problem*  
*Key: Build renderer BEFORE builder, verify links*
