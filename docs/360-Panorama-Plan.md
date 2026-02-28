# Feature: 360-Degree Panorama Beat Type

## Context

ASAPS stories currently use flat background images with elements positioned at x/y pixel coordinates. Adding 360-degree panorama support enables immersive exploration scenes — the interactor can look around a scene by dragging/swiping and discover hotspots that advance the story.

### Why a New Beat Type (Not a Background Replacement)

Making 360 a background mode for all beats would require:
- Retrofitting the entire visual editor (x/y pixel → pitch/yaw spherical coordinates)
- Modifying PositionedBeatView's absolute positioning system
- Changing the Location interface for every element type
- Touching 15+ components that render positioned elements

A **dedicated `PanoramaBeat`** is far cleaner:
- Self-contained rendering with its own coordinate system
- Natural mapping to exploration/choice mechanics (like MovementChoice with hotspots in 360 space)
- No impact on existing beats or the visual editor
- Can be implemented incrementally

---

## Design: PanoramaBeat

### Beat Behavior

A visible beat that displays an equirectangular 360 image. The interactor navigates by dragging (mouse/touch) or keyboard arrows. Clickable **hotspots** are placed at pitch/yaw coordinates in the panorama. Each hotspot can:
- Navigate to a target beat (like MovementChoice)
- Display a tooltip/label on hover
- Optionally show an icon or highlight

The beat waits until the interactor clicks a hotspot, then transitions to the target beat.

### Library Choice: Pannellum

| Option | Size | Hotspots | React | Verdict |
|--------|------|----------|-------|---------|
| **Pannellum** | 21 KB | Built-in (pitch/yaw) | react-pannellum | Best fit — tiny, proven, hotspot-native |
| Photo Sphere Viewer | 55 KB | Advanced markers | Wrapper available | Overkill for our needs |
| Three.js / R3F | 500 KB+ | Manual | Excellent | Too heavy, we don't need 3D |

Pannellum is purpose-built for this: equirectangular images with interactive hotspots, mouse/touch/keyboard controls, and a 21 KB footprint.

### Controls

- **Mouse**: Click-drag to pan, scroll to zoom
- **Touch**: Swipe to pan, pinch to zoom
- **Keyboard**: Arrow keys to pan
- **Auto-rotate** (optional): Slowly rotates until user interacts

---

## Implementation Plan

### Phase 1: Core Beat + Renderer

#### 1.1 PanoramaBeat Class

**Create:** `packages/core/src/beats/PanoramaBeat.ts`

Following existing beat patterns (e.g., `MovementChoiceBeat.ts`):

```typescript
interface PanoramaHotspot {
  id: string;
  pitch: number;       // -90 to 90 (vertical angle)
  yaw: number;         // -180 to 180 (horizontal angle)
  text: string;        // Label shown on hover
  displayText?: string; // Translated label
  target: string;      // Target beat ID
  icon?: string;       // Optional icon: 'arrow' | 'info' | 'door' | 'eye'
  conditions?: Condition[];
  effects?: Effect[];
}

// Parameters:
// - panoramaAssetId: string (equirectangular image asset)
// - hotspots: PanoramaHotspot[]
// - initialPitch: number (default 0 — horizon)
// - initialYaw: number (default 0 — front-center)
// - hfov: number (horizontal field of view, default 100)
// - autoRotate: number (degrees/sec, 0 = off)
// - showCompass: boolean
// - prompt?: string (optional instruction text, e.g. "Look around to explore")
```

- `getConnections()` returns one connection per hotspot (like MovementChoice)
- `performAction()` calls `renderer.renderPanorama(...)` and waits for hotspot selection

#### 1.2 Beat Registration

**Modify:** `packages/core/src/beats/BeatTypeRegistry.ts`

Register `PanoramaBeat` in `registerDefaultBeats()`.

#### 1.3 Beat Definition

**Modify:** `beat-definitions/core-beats.json`

Add `panorama` beat type with full schema definition.

#### 1.4 IRenderer Interface

**Modify:** `packages/core/src/types/index.ts`

Add optional render method:
```typescript
renderPanorama?(panoramaUrl: string, options: {
  hotspots: Array<{
    id: string;
    pitch: number;
    yaw: number;
    text: string;
    icon?: string;
  }>;
  initialPitch?: number;
  initialYaw?: number;
  hfov?: number;
  autoRotate?: number;
  prompt?: string;
}): Promise<string>;  // Returns selected hotspot ID
```

#### 1.5 ReactRenderer + PanoramaView Component

**Modify:** `packages/renderer/src/renderers/ReactRenderer.tsx`

Implement `renderPanorama()` — renders a new `PanoramaView` component.

**Create:** `packages/renderer/src/components/PanoramaView.tsx`

Wraps Pannellum viewer:
- Loads equirectangular image from asset URL
- Renders hotspots at pitch/yaw coordinates with labels
- Calls `onAction(hotspotId)` when a hotspot is clicked
- Handles visited-hotspot dimming (reuse existing `visitedBeats` pattern)
- Optional prompt text overlay at the bottom
- Full mouse/touch/keyboard navigation controls

#### 1.6 Install Pannellum

**Modify:** `packages/renderer/package.json`

Add `pannellum` dependency. If react-pannellum is well-maintained, use it; otherwise use pannellum directly with a thin React wrapper.

### Phase 2: Builder / Inspector Support

#### 2.1 Beat Inspector Panel

The schema-driven inspector will auto-generate fields for most parameters. The `hotspots` array needs a custom editor section:

- Table showing each hotspot: label, pitch, yaw, target beat
- "Add Hotspot" button
- Target beat dropdown (reuse existing beat selector)
- Pitch/yaw as numeric inputs for manual fine-tuning

#### 2.2 Panorama Hotspot Editor

**Create:** `packages/builder/src/components/visual/PanoramaEditor.tsx`

A specialized editor (instead of VisualBeatEditor) for panorama beats:
- Renders the panorama using Pannellum in the workspace area
- **Click on the panorama to place a new hotspot** at the clicked pitch/yaw
- Drag existing hotspots to reposition
- Click hotspot to select and edit its properties in the inspector
- Shows hotspot labels and icons in the panorama view
- Manual pitch/yaw fine-tuning available in the inspector panel

This replaces the visual workspace for panorama beats only — regular beats still use VisualBeatEditor.

#### 2.3 Asset Upload

Panorama images are just regular images uploaded through the existing asset system. Equirectangular images are typically JPEG files with 2:1 aspect ratio. No special handling needed.

#### 2.4 TreeLayoutAlgorithm

**Modify:** `packages/builder/src/utils/TreeLayoutAlgorithm.ts`

Add edge extraction for panorama hotspot targets in `extractConnectionsFromBeats()`.

### Phase 3: Translation Support

Hotspot `text` / `displayText` fields should be translatable. The translation string extractor handles:
- `beat:{beatId}.parameters.hotspots.{index}.text`
- `beat:{beatId}.parameters.prompt`

---

## Decisions Made

- **Full 360° equirectangular only** for initial implementation (partial panoramas can be added later)
- **Click-to-place hotspots** as primary UX, with **manual pitch/yaw fine-tuning** in the inspector
- **Pannellum** as the rendering library (21 KB, hotspot-native, proven)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/beats/PanoramaBeat.ts` | **Create** | Beat class with hotspot connections |
| `packages/core/src/beats/BeatTypeRegistry.ts` | Modify | Register PanoramaBeat |
| `packages/core/src/types/index.ts` | Modify | Add `renderPanorama()` to IRenderer |
| `beat-definitions/core-beats.json` | Modify | Add panorama beat schema |
| `packages/renderer/src/components/PanoramaView.tsx` | **Create** | Pannellum wrapper component |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Modify | Implement renderPanorama() |
| `packages/renderer/package.json` | Modify | Add pannellum dependency |
| `packages/builder/src/components/visual/PanoramaEditor.tsx` | **Create** | 360 hotspot placement editor |
| `packages/builder/src/utils/TreeLayoutAlgorithm.ts` | Modify | Hotspot target edges |
| `scripts/generate-beat-types.ts` | Modify | Include panorama in generated types |

---

## Verification

1. `npm run build` — all packages build with new beat type
2. `npm run test -w @asaps/core` — PanoramaBeat tests pass
3. Create a panorama beat in the builder — equirectangular image renders in 360 viewer
4. Place hotspots via click — they appear at correct positions in the panorama
5. Click hotspot in preview — navigates to target beat
6. Mouse drag / touch swipe / arrow keys — panorama pans smoothly
7. Flowchart shows edges from panorama to all hotspot targets
8. Hotspot labels appear in translation string extraction
