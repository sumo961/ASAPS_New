# Responsive Background-Anchored Animation — Design Decision

**Status: DECISION PENDING (Hartmut) · gates Field App P0**
**Date: 2026-08-31 · Author: session work from the pre-Field-App triage**

## The question

Can background-anchored animations be responsive? An author draws a path
that walks Red to the cottage door *in the background image*. On a phone —
the harshest aspect-ratio environment, and the Field App's home — the
image is cover-cropped. Does the path still end at the door?

The answer must be settled before Field App P0, because the mobile player
inherits whichever mechanism we choose, and retrofitting coordinate
semantics after stories ship is a migration, not a patch.

## What exists today (verified in code, 2026-08-31)

Three coordinate regimes already live in the renderer:

1. **Fixed canvas** (first-class, not legacy): elements and the beat
   background both live on the authored stage; ScaledStage scales the
   whole stage uniformly — `fit` letterboxes, `cover` crops, but stage
   and background transform **together**, so a path drawn to the door
   stays on the door. Fixed mode is already correct under crop whenever
   the background fills the authored stage. (`ReactRenderer.tsx`
   ScaledStage; mobile currently defaults to `cover`.)

2. **Responsive flow** (Phase 1 slots): content tracks the *viewport*
   box. Animation waypoints already carry `xPercent`/`yPercent`
   (percent-of-stage), and `PathInterpolator` prefers them — so paths
   survive reflow, but they track the **stage box, not the image**.
   Behind a cover-cropped background, "70% across the stage" is a
   different image point on every device. **This is the gap.**
   (`types/animation.ts`, `PathInterpolator.ts:268-301`.)

3. **Spatial layer** (Phase 3, shipped further than the plan assumed):
   `SpatialFlowView` resolves the letterboxed image rect and positions
   normalized 0–1 **image-coordinate** hotspots against it; dialogTree
   nodes and movementChoice already compose through it. And
   `spatialAnimation.ts` already animates the *camera* in image space —
   ken-burns/pan/zoom presets plus a `'path'` preset whose waypoints are
   normalized over the image rect, recomputed per frame against the live
   rect so motion survives reflow and orientation. Image-coordinate
   anchoring is not a proposal; it is shipped mechanism — for the
   camera and for click regions. What lacks it is **element motion**.

## The gap, precisely

In responsive mode, an `AnimationPath` on a positioned element cannot be
expressed in image coordinates. Camera motion can (spatialAnimation);
click regions can (hotspots); a walking character cannot. On a 4:3 image
cover-cropped into a 9:19.5 portrait phone, ~45% of the image width is
offscreen — a stage-percent path aimed at the door points at forest.

## Options

### A — Image-coordinate anchoring for element paths (extend the shipped mechanism)

Add an anchor declaration to `AnimationPath` (and optionally per
waypoint): `anchor: 'stage' | 'image'`. Image-anchored waypoints store
normalized 0–1 coordinates over the image rect — the *same* coordinate
system hotspots and spatial `'path'` camera keyframes use — and the
renderer resolves them against the same live rect resolver
(`imageRectInsets` + a cover-rect variant). This is the
`anchor.relativeTo: 'spatialLayer'` slot reserved in the responsive
layout design, made concrete.

- Pros: one coordinate grammar across hotspots, camera, and elements;
  paths genuinely responsive; authoring in the VE can reuse the spatial
  overlay (draw on the image, store normalized).
- Cons: renderer must recompute element transforms against the image
  rect per resize (the machinery exists for hotspots); PathCanvas needs
  an anchor toggle + normalized storage; AI-generation guidance must
  learn the new field in the same change (house rule).

### B — Fixed-frame island (per-beat fallback)

A beat that needs pixel-faithful bg-anchored motion opts out of
responsive reflow: it renders as a fixed-mode stage, letterboxed at its
authored aspect inside the responsive story. Guaranteed correct on every
device; costs letterbox bars on phones.

- Pros: zero new coordinate semantics; fixed mode already behaves this
  way; trivially explainable ("this scene keeps its shape").
- Cons: bars on exactly the devices the Field App targets; doesn't make
  responsive elements *track* the image — it sidesteps the question
  per beat.

### C — Recommended: A as the mechanism, B as the escape hatch

- New paths on beats with a spatial/background image default to
  `anchor: 'image'`; existing paths keep `'stage'` untouched (no silent
  behavior change to authored work — house rule).
- The fixed-frame island stays available per beat for compositions that
  are *designed* as a frame (title cards, illustrated spreads).
- Field App P0 inherits: mobile renderer resolves image-anchored paths
  against its cover rect; no mobile-only coordinate system.

## Decisions needed (Hartmut)

1. **Adopt C?** (A alone, B alone, or A+B as recommended.)
2. **Default anchor for new paths** on beats with a background image:
   `image` (recommended) or explicit opt-in per path?
3. **Authoring surface**: extend PathCanvas with an anchor toggle and
   draw-over-the-image editing (recommended), or author image-anchored
   paths only in the VE spatial overlay?
4. **Island granularity**: per beat (recommended) or also per cluster?
5. **Aspect preview**: should the VE grow a phone-crop preview strip
   (show the cover frame for 9:16 / 9:19.5 over the image) so authors
   see what a phone keeps? (Cheap, high value for Field App authoring.)

## Consequences if we defer

Field App P0 ships with stage-percent paths that visibly miss their
background targets on phones, or with `fit` letterboxing everywhere —
both read as broken to authors who placed things carefully. The cost of
deciding now is one schema field and one resolver reuse; the cost of
deciding later is migrating shipped story data.
