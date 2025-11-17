# Cleanup Tasks - October 12, 2025

## Files to Remove

### 1. Duplicate PositionedBeatRenderer ❌ DELETE THIS

**File:** `packages/builder/src/components/visual/shared/PositionedBeatRenderer.tsx`

**Reason:** This is a duplicate of the renderer package version. The visual editor now imports from `@asaps/renderer` instead.

**Action Required:**
```bash
rm packages/builder/src/components/visual/shared/PositionedBeatRenderer.tsx
```

**Impact:** None - file is no longer imported by any code

---

### 2. Empty Directory (After Cleanup)

**Directory:** `packages/builder/src/components/visual/shared/`

**Action After Removing File:**
```bash
# If directory is empty after removing the file:
rmdir packages/builder/src/components/visual/shared/
```

---

## Verification After Cleanup

After removing these files, verify:

1. **Application still compiles:**
   ```bash
   cd packages/builder && npm run build
   ```

2. **No import errors:**
   - Check that VisualBeatEditor imports from `@asaps/renderer`
   - No references to `./shared/PositionedBeatRenderer`

3. **Visual editor still works:**
   - Open application
   - Select beat
   - Switch to Visual tab
   - Verify rendering

---

## Current Import Structure (Correct)

```typescript
// VisualBeatEditor.tsx - CORRECT
import { 
  PositionedBeatView,
  createPositionedElementData,
  type PositionedElementData 
} from '@asaps/renderer';

// ReactRenderer.tsx - CORRECT  
import { 
  PositionedBeatView, 
  createPositionedElementData, 
  type PositionedElementData 
} from '../components/PositionedBeatView';
```

---

*Created: October 12, 2025*  
*Status: Cleanup needed after unification*
