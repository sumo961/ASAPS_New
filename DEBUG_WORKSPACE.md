# Debugging Workspace Links

## After building renderer, run these checks:

### Check 1: Verify renderer dist exists and has exports
```bash
ls -la packages/renderer/dist/
cat packages/renderer/dist/index.d.ts | grep "PositionedBeatView"
```

**Expected:** Should see the export declarations

### Check 2: Verify workspace link in builder
```bash
ls -la packages/builder/node_modules/@asaps/renderer
```

**Expected:** Should be a symlink pointing to `../../renderer`

### Check 3: Check what builder sees
```bash
cat packages/builder/node_modules/@asaps/renderer/dist/index.d.ts | grep "PositionedBeatView"
```

**Expected:** Should show the exports

### Check 4: Verify builder's package.json has renderer dependency
```bash
cat packages/builder/package.json | grep "@asaps/renderer"
```

**Expected:** Should see renderer as a dependency

---

## If Check 2 fails (no symlink or broken):

```bash
cd packages/builder
rm -rf node_modules
npm install
cd ../..
```

Then try building builder again.

---

## If Check 3 shows outdated exports:

The symlink might be pointing to an old version. Try:

```bash
cd packages/builder
rm -rf node_modules/@asaps
npm install --force
cd ../..
```

Then rebuild builder.

---

## Please report back:

What is the output of each check? This will tell us exactly where the linking is broken.
