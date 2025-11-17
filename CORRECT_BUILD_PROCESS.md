# CORRECT Build Process - Avoiding TypeScript Project References

## The Problem

The root `tsconfig.json` has project references to all packages:
```json
"references": [
  { "path": "./packages/core" },
  { "path": "./packages/builder" },
  { "path": "./packages/renderer" }
]
```

This means TypeScript tries to type-check ALL packages at once, which fails when builder's dist is missing.

## The Solution: Build from Package Directories

Don't use the root build script. Build each package individually:

---

## Step 1: Clean (from project root)

```bash
rm -rf packages/*/dist
```

---

## Step 2: Build Core (from INSIDE core directory)

```bash
cd packages/core
npm run build
```

**Expected:** Core builds successfully without checking builder

---

## Step 3: Build Renderer (from INSIDE renderer directory)

```bash
cd ../renderer
npm run build
```

**Expected:** Renderer builds successfully

---

## Step 4: Build Builder (from INSIDE builder directory)

```bash
cd ../builder
npm run build
```

**Expected:** Builder now sees renderer exports and builds successfully

---

## Step 5: Return to Root

```bash
cd ../..
```

---

## Why This Works

When you run `npm run build` from **inside** each package directory, it uses that package's own `tsconfig.json`, which doesn't have the problematic project references. This way:

- ✅ Core builds independently
- ✅ Renderer builds independently (only depends on core)
- ✅ Builder builds last and sees both core and renderer

---

## Full Command Sequence

From project root:

```bash
rm -rf packages/*/dist
cd packages/core && npm run build && cd ..
cd renderer && npm run build && cd ..
cd builder && npm run build && cd ../..
```

---

## Alternative: Fix the Root Build Script

Edit `package.json` in the root to remove the problematic reference:

**Current (problematic):**
```json
"build": "npm run build -w @asaps/core && npm run build -w @asaps/renderer && npm run build -w @asaps/builder"
```

This should work because `-w` (workspace) flag should isolate each build, but it might be using the root tsconfig.

**Try this instead:**
```bash
npm run build
```

If it still fails, the workspace build is using root tsconfig. Stick with building from inside each directory.

---

*Created: October 12, 2025*  
*Issue: TypeScript project references causing cross-package type checking*  
*Solution: Build from inside each package directory*
