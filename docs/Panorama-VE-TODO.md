# Panorama VE — Remaining TODO Items

## Completed

### ~~Cylindrical Projection Curvature~~
- **Fixed:** Added `partial: true` to `CylindricalProjection` in both VisualWorkspace.tsx and PanoramaView.tsx
- Root cause was the library assuming a full 360° wrap for partial phone panoramas
- Note: `EquirectProjection` has NO `partial` option (by design — equirect is always full-sphere)

---

## 1. Viewport Indicator Aspect Ratio
- Camera View rectangle uses hardcoded 16:9 aspect ratio → should use project ratio (4:3)
- Label says "Camera View (16:9)" → should show actual project ratio
- **File:** `packages/builder/src/components/visual/VisualBeatEditor.tsx` line ~1771

## 2. Hotspot Styling Consistency (Layout ↔ Preview)
- **Layout mode:** Circular 32px markers with arrow icon (blue border, white bg)
- **Preview mode:** Rectangular yellow dashed boxes with text
- They must look identical — use the yellow rectangular style in both
- **File:** `packages/builder/src/components/visual/VisualBeatEditor.tsx` lines ~1327-1375

## 3. Full Panorama Image in VE Layout
- Currently uses `background-size: cover` which crops the panorama
- Should use `100% 100%` for panorama beats to show the full image
- **File:** `packages/renderer/src/components/PositionedBeatView.tsx` line ~1341

## 4. Click-to-Place Hotspot Creation
- Hotspot creation should work like movementChoice/pickProp (click-to-place on stage)
- `syncPanoramaHotspotsFromElements` only UPDATES existing entries, needs to also CREATE new ones
- **File:** `packages/builder/src/components/visual/VisualWorkspace.tsx` lines ~674-702

---

## egjs-view360 API Reference (for implementation)

### Projection Options

| Projection | `partial` option | Use case |
|---|---|---|
| `EquirectProjection` | No (not available) | Full 360x180° sphere (drone, 360 camera) |
| `CylindricalProjection` | `partial?: boolean` | Phone panorama sweep (partial or full) |

- **Cylindrical `partial: true`**: Treats image as covering only part of the cylinder (our case)
- **Cylindrical `partial: false` (default)**: Assumes image wraps full 360° horizontally

### Hotspot System

egjs-view360 has **built-in hotspot support** via DOM elements. No manual coordinate projection needed.

#### HTML Structure
```html
<View360 projection={projection} hotspot={{ zoom: true }}>
  <div className="view360-hotspots">
    <div className="view360-hotspot" data-yaw="90" data-pitch="-10">
      <!-- Any HTML content inside -->
    </div>
  </div>
</View360>
```

#### Positioning
- **`data-yaw`**: Y-axis rotation in degrees (horizontal angle)
- **`data-pitch`**: X-axis rotation in degrees (vertical angle)
- **`data-position`**: Alternative — direct 3D coordinates as `"x y z"` (use one or the other)

#### HotspotOptions (passed to `<View360 hotspot={...}>`)
- **`zoom: boolean`** — When `true`, hotspot size scales with the panorama (zoom in = bigger hotspots). Default `false`.
- Our PanoramaView.tsx already uses `hotspot={{ zoom: true }}`.

#### Hotspot Refresh
After dynamically adding/removing hotspot DOM elements, call:
```ts
view360Ref.current.hotspot.refresh();
```
This re-scans the `view360-hotspots` container for new/removed elements.

#### Click Handling
Hotspot clicks are handled via standard React `onClick` on the hotspot element. Use `onPointerDown` + `stopPropagation()` to prevent the click from also triggering a pan gesture.

#### Styling
- Hotspots can contain **any HTML** — text, images, icons, complex layouts
- The library positions the element; you style the content inside
- Use `transform: translate(-50%, -50%)` to center the content on the hotspot position

### Current Implementation Status
- **VisualWorkspace.tsx** (VE Preview): Renders hotspots with `data-yaw`/`data-pitch`, yellow dashed style, click-to-select
- **PanoramaView.tsx** (Player/Preview Window): Same hotspot rendering, `hotspot={{ zoom: true }}` enabled, click triggers `onHotspotClick` callback
- Both use inline styles for hotspot appearance — consider extracting to a shared component or CSS class
