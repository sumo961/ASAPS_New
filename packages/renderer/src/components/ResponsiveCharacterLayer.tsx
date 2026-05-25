/**
 * ResponsiveCharacterLayer — free-positioned avatars / props inside the
 * responsive composite. Mirrors what PositionedBeatView's character /
 * prop rendering does in fixed mode, but expressed in percent-of-stage
 * coordinates so the same positions survive viewport / orientation
 * changes:
 *
 *  - Each location of `kind: 'character' | 'prop'` is rendered as an
 *    absolutely-positioned <img> at (xPercent, yPercent) of the
 *    container, with size derived from widthPercent / heightPercent
 *    when present (fallback to pixel width/height at the project
 *    stage size when not — the migrator now writes both, but legacy
 *    data may have only pixel coords).
 *
 *  - Each AnimationPath in `animations` whose elementId matches a
 *    location.name is started through the shared AnimationEngine on
 *    mount. Its `onUpdate` reports the current position; we override
 *    the sprite's transform every frame. The engine receives the
 *    container's live size as `stage`, so `xPercent` / `yPercent` on
 *    each waypoint resolve to pixels against the current viewport
 *    (path tracks reflow).
 *
 *  - Sprite-sheet awareness is intentionally minimal here: we render
 *    a static first frame for now (or the natural image if no
 *    sprite-sheet metadata is supplied). Frame cycling along the path
 *    is the next iteration.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnimationPath, Location } from '@asaps/core';
import { getAnimationManager } from '../animation/AnimationEngine';
import type { SpriteSheetData } from './PositionedBeatView';

export interface ResponsiveCharacterLayerProps {
  /** Subset of beat.locations with kind 'character' or 'prop'. */
  locations: Location[];
  /** beat.parameters.animations — full list; we filter by elementId
   *  match against `locations[].name`. */
  animations?: AnimationPath[];
  /** characterId → sprite-sheet URL. Fixed mode wires this up via
   *  setCharacterResolver; the responsive layer reuses the same
   *  resolver so the URL stays in sync with character variant /
   *  state changes the engine doesn't need to know about. */
  characterResolver?: (characterId: string, stateId?: string) => string | undefined;
  /** assetId → asset URL. Used for prop locations and as the fallback
   *  for character locations whose characterResolver returns nothing. */
  assetResolver?: (assetId: string) => string | undefined;
  /** characterId → sprite-sheet metadata. Optional; when present we
   *  size the sprite by `frameWidth × frameHeight` and use background-
   *  image to crop to the first frame. */
  spriteDataResolver?: (characterId: string) => SpriteSheetData | null;
}

interface AnimatedPosition {
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  flipX?: boolean;
  /**
   * Per-segment sprite-frame state forwarded by the AnimationEngine.
   * `spriteFrames` is the sequence of sheet indices to cycle through
   * during this segment of the path; `spriteFrameDuration` is the ms
   * per frame; `spriteAnimation` is the source animation name (just
   * for debug / keying). When any are undefined the segment doesn't
   * cycle and we render the sheet's default frame.
   */
  spriteAnimation?: string;
  spriteFrames?: number[];
  spriteFrameDuration?: number;
}

export const ResponsiveCharacterLayer: React.FC<ResponsiveCharacterLayerProps> = ({
  locations,
  animations,
  characterResolver,
  assetResolver,
  spriteDataResolver,
}) => {
  // Animated-position map, keyed by location.name (which legacy
  // AnimationPath.elementId matches against).
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, AnimatedPosition>>({});
  // Per-character active sprite-frame index. Driven by the cycler
  // effect below; resets when the segment's frames array changes.
  const [spriteFrameIdx, setSpriteFrameIdx] = useState<Record<string, number>>({});

  // Container ref so we can size percent coords against the live box.
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Tracks the latest stage size for the AnimationEngine's `stage` fn.
  const stageSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  // Force re-render on resize so the px positions recompute.
  const [, setResizeTick] = useState(0);

  // Resize observer — keeps stageSizeRef live and triggers a re-render
  // so the static (non-animated) sprites also reposition under reflow.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      stageSizeRef.current = { width: r.width, height: r.height };
      setResizeTick(t => t + 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Subset of animations that actually target one of our locations
  // AND should auto-start on beat enter. Animations with explicit
  // triggers ('onClick', 'onVariable') wait for their trigger; only
  // 'onLoad' (or omitted, which defaults to onLoad) plays on mount.
  // Mirrors the gating PositionedBeatView does in fixed mode so a
  // beat with a click-triggered character path doesn't silently play
  // the moment it appears.
  const relevantAnimations = useMemo(() => {
    const names = new Set(locations.map(l => l.name));
    return (animations ?? []).filter(a => {
      if (!names.has(a.elementId)) return false;
      const trigger = a.trigger;
      return trigger === undefined || trigger === 'onLoad';
    });
  }, [animations, locations]);

  // Run path animations through the shared AnimationEngine. Each
  // animation gets a stable id so play / stop is idempotent across
  // re-renders. Stage is a function so resizes update the resolution
  // without restarting the engine.
  useEffect(() => {
    const manager = getAnimationManager();
    const ids = relevantAnimations.map(a => a.id);
    for (const anim of relevantAnimations) {
      manager.play(anim.id, anim, {
        stage: () => stageSizeRef.current,
        onUpdate: (state) => {
          setAnimatedPositions(prev => ({
            ...prev,
            [anim.elementId]: {
              x: state.currentPosition.x,
              y: state.currentPosition.y,
              scale: state.currentTransform?.scale,
              rotation: state.currentTransform?.rotation,
              opacity: state.currentTransform?.opacity,
              flipX: state.currentTransform?.flipX,
              spriteAnimation: state.currentTransform?.spriteAnimation,
              spriteFrames: state.currentTransform?.spriteFrames,
              spriteFrameDuration: state.currentTransform?.spriteFrameDuration,
            },
          }));
        },
        onComplete: () => {
          // Leave the final position in place — the engine reports
          // last-waypoint coords on its last onUpdate. Don't clear
          // animatedPositions or the sprite would snap back to its
          // static start. Hot-path: do nothing.
        },
      });
    }
    return () => {
      for (const id of ids) manager.stop(id);
    };
  }, [relevantAnimations]);

  // Sprite-frame cycler. One rAF loop walks every character with an
  // ACTIVE frame sequence and advances its index at the configured
  // ms cadence. The sequence comes from either:
  //   - `animPos.spriteFrames` (inline list per legacy AnimationPath
  //     waypoint), or
  //   - the named animation on the character's sprite-sheet metadata
  //     when `animPos.spriteAnimation` is set (e.g. 'walk' → look up
  //     spriteData.animations[name].frames).
  // Per-character timing is independent so a segment switch restarts
  // cleanly. Self-stops when no character has an active sequence.
  const lastTickRef = useRef<Record<string, number>>({});
  // Resolve a character's active frames + frame duration. Returns
  // null when there's nothing to cycle. Shared by the cycler effect
  // and the render-loop above so both stay in sync.
  const resolveActive = useCallback(
    (loc: Location, pos: AnimatedPosition | undefined): { frames: number[]; dur: number } | null => {
      if (!pos) return null;
      if (Array.isArray(pos.spriteFrames) && pos.spriteFrames.length > 1) {
        return { frames: pos.spriteFrames, dur: Math.max(1, pos.spriteFrameDuration ?? 100) };
      }
      if (pos.spriteAnimation && loc.kind === 'character' && loc.characterId && spriteDataResolver) {
        const sd = spriteDataResolver(loc.characterId);
        const named = sd?.animations?.find((a: { name: string }) => a.name === pos.spriteAnimation);
        if (named && Array.isArray(named.frames) && named.frames.length > 1) {
          return { frames: named.frames, dur: Math.max(1, pos.spriteFrameDuration ?? named.frameDuration ?? 100) };
        }
      }
      return null;
    },
    [spriteDataResolver],
  );
  useEffect(() => {
    const active: Array<{ name: string; frames: number[]; dur: number }> = [];
    for (const loc of locations) {
      const r = resolveActive(loc, animatedPositions[loc.name]);
      if (r) active.push({ name: loc.name, frames: r.frames, dur: r.dur });
    }
    if (active.length === 0) return;
    let raf = 0;
    const step = (now: number) => {
      let didChange = false;
      const next: Record<string, number> = { ...spriteFrameIdx };
      for (const entry of active) {
        const last = lastTickRef.current[entry.name] ?? now;
        if (now - last >= entry.dur) {
          const idx = ((spriteFrameIdx[entry.name] ?? 0) + 1) % entry.frames.length;
          next[entry.name] = idx;
          lastTickRef.current[entry.name] = now;
          didChange = true;
        }
      }
      if (didChange) setSpriteFrameIdx(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animatedPositions, spriteFrameIdx, locations, resolveActive]);

  // Helper: resolve a location's image URL via the same priority chain
  // PositionedBeatView uses — character (via characterId), then
  // assetId, then direct imageUrl.
  const resolveImg = (loc: Location): { url: string | undefined; sprite: SpriteSheetData | null } => {
    let url: string | undefined;
    let sprite: SpriteSheetData | null = null;
    if (loc.kind === 'character' && loc.characterId && characterResolver) {
      url = characterResolver(loc.characterId, loc.stateId);
      if (spriteDataResolver) sprite = spriteDataResolver(loc.characterId);
    }
    if (!url && loc.assetId && assetResolver) {
      url = assetResolver(loc.assetId);
    }
    if (!url && loc.imageUrl) url = loc.imageUrl;
    return { url, sprite };
  };

  return (
    <div
      ref={containerRef}
      data-layer="characters"
      style={{
        position: 'absolute',
        inset: 0,
        // Sprites should never block clicks on choices / buttons; the
        // sprite layer is purely visual.
        pointerEvents: 'none',
        // Sits above the spatial image / hotspots (z 2) and below the
        // flow text/buttons (z 1 in SpatialFlowView's stack); using a
        // mid value here lets adjacent layers re-stack without
        // colliding with the sprite layer.
        zIndex: 2,
      }}
    >
      {locations.map((loc, idx) => {
        const { url, sprite } = resolveImg(loc);
        if (!url) return null;
        const stage = stageSizeRef.current;

        // Resolve position. Animated > xPercent > pixel x.
        const animPos = animatedPositions[loc.name];
        let x: number;
        let y: number;
        if (animPos) {
          x = animPos.x;
          y = animPos.y;
        } else if (typeof loc.xPercent === 'number' && typeof loc.yPercent === 'number' && stage.width && stage.height) {
          x = (loc.xPercent / 100) * stage.width;
          y = (loc.yPercent / 100) * stage.height;
        } else {
          x = loc.x;
          y = loc.y;
        }

        // Resolve size. widthPercent > pixel width.
        let w: number;
        let h: number;
        if (typeof loc.widthPercent === 'number' && stage.width) {
          w = (loc.widthPercent / 100) * stage.width;
        } else {
          w = loc.width;
        }
        if (typeof loc.heightPercent === 'number' && stage.height) {
          h = (loc.heightPercent / 100) * stage.height;
        } else {
          h = loc.height;
        }

        // Sprite-sheet frame crop. Frame index priority:
        // (1) inline spriteFrames sequence forwarded per-segment by
        //     the engine (legacy AnimationPath form).
        // (2) NAMED sprite-sheet animation — the engine reports
        //     `spriteAnimation: 'walk'` per waypoint and the actual
        //     frame array lives on the character's sprite-sheet
        //     metadata; we look it up here. Mirrors PositionedBeatView's
        //     AnimatedSprite resolution path.
        // (3) the sheet's defaultFrame as a static fallback.
        // No sprite sheet at all → render the image natively (covers
        // the prop / static-image case).
        const useSprite = !!sprite && sprite.frameWidth && sprite.frameHeight;
        const frameW = sprite?.frameWidth ?? 0;
        const frameH = sprite?.frameHeight ?? 0;
        const defaultFrame = sprite?.defaultFrame ?? 0;
        let activeFrames: number[] | undefined = animPos?.spriteFrames;
        if ((!activeFrames || activeFrames.length === 0) && animPos?.spriteAnimation && sprite?.animations) {
          const named = sprite.animations.find((a: { name: string }) => a.name === animPos.spriteAnimation);
          if (named && Array.isArray(named.frames) && named.frames.length > 0) {
            activeFrames = named.frames;
          }
        }
        const activeFrameIdx = activeFrames && activeFrames.length > 0
          ? activeFrames[Math.min(spriteFrameIdx[loc.name] ?? 0, activeFrames.length - 1)]
          : defaultFrame;
        const sheetCols = sprite?.imageWidth ? Math.max(1, Math.floor(sprite.imageWidth / Math.max(1, frameW))) : 1;
        const frameRow = Math.floor(activeFrameIdx / sheetCols);
        const frameCol = activeFrameIdx % sheetCols;
        const bgX = -(frameCol * frameW);
        const bgY = -(frameRow * frameH);

        // Visual width/height: a sprite-sheet sprite uses the FRAME
        // dimensions; a non-sprite image uses the location's resolved
        // w/h (so prop placement matches authored size).
        const visualW = useSprite ? frameW : w;
        const visualH = useSprite ? frameH : h;

        // Common transform — scale / rotate / flip per animation state.
        const transformParts: string[] = [];
        if (animPos?.scale != null) transformParts.push(`scale(${animPos.scale})`);
        if (animPos?.rotation != null) transformParts.push(`rotate(${animPos.rotation}deg)`);
        if (animPos?.flipX) transformParts.push('scaleX(-1)');
        const transform = transformParts.length ? transformParts.join(' ') : undefined;

        const commonStyle: React.CSSProperties = {
          position: 'absolute',
          left: x,
          top: y,
          width: visualW,
          height: visualH,
          opacity: animPos?.opacity,
          transform,
          transformOrigin: 'center center',
          imageRendering: 'pixelated',
        };

        if (useSprite) {
          return (
            <div
              key={loc.id ?? `${loc.name}-${idx}`}
              data-character-name={loc.name}
              style={{
                ...commonStyle,
                backgroundImage: `url(${url})`,
                backgroundPosition: `${bgX}px ${bgY}px`,
                backgroundRepeat: 'no-repeat',
              }}
            />
          );
        }
        return (
          <img
            key={loc.id ?? `${loc.name}-${idx}`}
            data-character-name={loc.name}
            src={url}
            alt=""
            draggable={false}
            style={commonStyle}
          />
        );
      })}
    </div>
  );
};
