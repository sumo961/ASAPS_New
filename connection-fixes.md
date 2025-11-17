# ASPS Connection Management Issues & Fixes

## 🔴 Critical Issues Found

### 1. Connection Replacement Bug
**Problem:** When replacing connections in the Inspector:
- Old connections are NOT removed (trying to clear a copy, not the actual array)
- New connections are added on top of old ones
- Flowchart shows both old and new connections
- Export doesn't reflect changes properly

**Root Cause:**
```typescript
// In Inspector.tsx handleSave():
const connections = beat.getConnections(); // Returns a COPY
connections.length = 0;  // Clears the COPY, not the actual connections!
```

### 2. Missing Beat Methods
The Beat class lacks essential connection management methods:
- No `removeConnection()` method
- No `clearConnections()` method
- No `replaceConnection()` method

## 🔧 Required Fixes

### Fix 1: Update Beat Class
Add proper connection management methods to `packages/core/src/beats/Beat.ts`:

```typescript
// Add these methods to Beat class:

clearConnections(): void {
  this.connections = [];
}

removeConnection(targetId: string, label?: string): void {
  this.connections = this.connections.filter(c => 
    !(c.targetId === targetId && (!label || c.label === label))
  );
}

replaceConnections(newConnections: Connection[]): void {
  this.connections = [...newConnections];
}

// Also fix getConnections to return the actual array for modification:
getConnections(): Connection[] {
  return this.connections; // Return actual array, not a copy
}

// Or keep it safe but add a separate method:
getConnectionsForEdit(): Connection[] {
  return this.connections; // Direct access for editing
}
```

### Fix 2: Update Inspector handleSave
Replace the connection handling in `packages/builder/src/components/Inspector.tsx`:

```typescript
const handleSave = () => {
  // ... validation code ...

  if (beat) {
    // ... update other properties ...
    
    // FIXED: Properly clear connections
    if (beat.clearConnections) {
      beat.clearConnections();
    } else {
      // Fallback for older code
      beat.connections = [];
    }
    
    // Re-add connections based on type
    if (connectionType === 'single' && localBeat.connections.length > 0) {
      beat.addConnection(localBeat.connections[0]);
    } else if (connectionType === 'multiple') {
      // ... handle multi-connection beats ...
    }
    // ... rest of the code ...
  }
};
```

### Fix 3: Ensure State Synchronization
Add proper state management to ensure Flowchart updates:

```typescript
// In Builder component, ensure connections are recalculated:
const handleBeatUpdate = (beatId: string, updates: Partial<Beat>) => {
  setStory((prev) => {
    if (!prev) return prev;
    
    const beat = prev.beats.get(beatId);
    if (!beat) return prev;
    
    // Apply updates
    Object.assign(beat, updates);
    
    // Force re-render by creating new Map
    const newBeats = new Map(prev.beats);
    newBeats.set(beatId, beat);
    
    return {
      ...prev,
      beats: newBeats,
      // Trigger connection recalculation
      version: (prev.version || 0) + 1
    };
  });
};
```

## 🔴 Other Export Issues Still Present

### Duration ×1000 Bug
Find in ASMLGenerator where durations are multiplied:
```typescript
// Look for:
duration: transition.duration * 1000  // WRONG
// Should be:
duration: transition.duration  // CORRECT
```

### Missing Data in Export
- **Characters:** Empty section (0 instead of 2)
- **Settings:** Empty section  
- **Environment:** Empty section (props/nodes missing)

## 📋 Testing Steps

1. **Test Connection Replacement:**
   ```
   - Select a beat with a connection
   - Change the target in Inspector
   - Save changes
   - Check: Old connection should be gone, only new one visible
   - Export and verify the new connection is saved
   ```

2. **Test Multi-Choice Beats:**
   ```
   - Create a movementChoice beat with 3 choices
   - Set different targets for each
   - Save and verify all 3 connections show correctly
   - Export and verify all connections are preserved
   ```

3. **Test Duration Values:**
   ```
   - Create beat with transition duration="1000"
   - Export
   - Check exported XML: should be 1000, not 1000000
   ```

## 🚀 Quick Fix Script

Create this as `fix-connections.sh`:

```bash
#!/bin/bash
echo "Fixing connection management issues..."

# Backup current files
cp packages/core/src/beats/Beat.ts packages/core/src/beats/Beat.ts.backup
cp packages/builder/src/components/Inspector.tsx packages/builder/src/components/Inspector.tsx.backup

echo "✅ Backups created"
echo ""
echo "Please apply the fixes to:"
echo "1. packages/core/src/beats/Beat.ts - Add connection management methods"
echo "2. packages/builder/src/components/Inspector.tsx - Fix handleSave()"
echo "3. packages/core/src/xml/ASMLGenerator.ts - Fix duration multiplication"
echo ""
echo "Then rebuild: npm run build"
```

## Priority Order

1. **Fix connection replacement** (Critical - blocks editing)
2. **Fix duration ×1000** (High - corrupts data)
3. **Fix missing sections** (Medium - data loss)
