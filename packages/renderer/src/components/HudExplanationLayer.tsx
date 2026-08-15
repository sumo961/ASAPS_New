/**
 * HudExplanationLayer — callout labels over the live HUDs.
 *
 * The explanation system has one mechanism and two triggers: the standalone
 * `explanation` beat (a text screen with the HUDs annotated behind it) and the
 * overlay form (`Beat.explainHuds`, which annotates the HUDs on top of an
 * ordinary beat and holds it inert until acknowledged). Both mount THIS layer.
 *
 * Positions come from layoutScreenHuds — the same packer the runtime uses — so
 * a callout can never drift from the HUD it points at: move a HUD, add a
 * character, or let the stack re-pack and the pointers follow automatically.
 * Nothing here hardcodes a corner.
 *
 * Only HUDs that are actually on screen get a callout. There is no separate
 * "explain the timer" vs "explain the inventory" code path — what differs is
 * the caption, which is data.
 */
import React from 'react';
import type { HudBox, HudPlacement } from '../utils/hudLayout';
import type { HudKind } from '../utils/hudLayout';

/** Built-in captions, phrased for a player rather than an author. */
export const DEFAULT_HUD_CAPTIONS: Record<HudKind, string> = {
  // Player chrome is reserved space, not part of the story — an explanation
  // beat annotates what the author put on screen, so this stays unlabelled.
  chrome: '',
  timer: 'The time in the story.',
  countdown: 'How long you have left.',
  meter: "A character's values as they change.",
  inventory: "What you're carrying.",
  mood: 'How a character is feeling.',
};

export interface HudExplanationLayerProps {
  /** The HUD boxes that were packed (kind + size). */
  boxes: ReadonlyArray<HudBox>;
  /** Their resolved placements, by box id. */
  placements: ReadonlyMap<string, HudPlacement>;
  /** Stage the placements were computed against. */
  stage: { width: number; height: number };
  /** Per-kind caption overrides; falls back to DEFAULT_HUD_CAPTIONS. */
  captions?: Record<string, string>;
  /** HUD kinds to leave unannotated. */
  skipKinds?: ReadonlyArray<string>;
  /**
   * Acknowledge handler. Supplied by the OVERLAY trigger, which must gate
   * forward progress; omitted by the standalone beat, whose own continue
   * button already advances the story (no second button competing with it).
   */
  onAcknowledge?: () => void;
  /** Acknowledge button label (overlay trigger only). */
  acknowledgeText?: string;
  /** Theme hooks so callouts read as part of the story's chrome. */
  accentColor?: string;
  /** Text colour on the accent fill — matches the story's own buttons. */
  accentTextColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
}

/** Which side of the stage a box sits on — callouts point inward from there. */
function isRightHalf(p: HudPlacement, box: HudBox, stageWidth: number): boolean {
  return p.left + box.width / 2 > stageWidth / 2;
}

export const HudExplanationLayer: React.FC<HudExplanationLayerProps> = ({
  boxes, placements, stage, captions, skipKinds,
  onAcknowledge, acknowledgeText = 'Got it',
  accentColor = '#d9a441', accentTextColor = '#201607',
  textColor = '#eae7de', backgroundColor = '#1b1f2b',
  fontFamily,
}) => {
  const skip = new Set(skipKinds || []);
  // A box with no caption gets no callout — reserved player chrome occupies a
  // corner but is not something an explanation beat should point at.
  const annotated = boxes.filter(
    (b) => !skip.has(b.kind) && placements.has(b.id)
      && !!(captions?.[b.kind] || DEFAULT_HUD_CAPTIONS[b.kind]),
  );
  if (annotated.length === 0) return null;

  const CALLOUT_W = 168;
  const GAP = 10;

  /* The overlay trigger dims the beat beneath so the acknowledge control reads
     as the only live thing on screen. Without it, a brass "Got it" sits against
     the beat's own brass "Continue" and there's no telling which is active.
     The standalone `explanation` beat gets NO scrim — its own continue button
     IS the action, so dimming the screen it just drew would be wrong. */
  const isOverlay = !!onAcknowledge;

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 70,
        // The overlay trigger must swallow clicks aimed at the beat beneath it;
        // the standalone beat leaves its own continue button reachable.
        pointerEvents: onAcknowledge ? 'auto' : 'none',
        fontFamily,
      }}
      data-testid="hud-explanation-layer"
    >
      {isOverlay && (
        <div
          data-testid="hud-explanation-scrim"
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(10, 12, 18, 0.62)',
            pointerEvents: 'none',
          }}
        />
      )}
      {annotated.map((box) => {
        const p = placements.get(box.id)!;
        const right = isRightHalf(p, box, stage.width);
        // Sit the callout alongside the HUD, pushed toward the stage interior,
        // and clamp so it can never hang off the edge on a small viewport.
        const rawLeft = right ? p.left - CALLOUT_W - GAP : p.left + box.width + GAP;
        const left = Math.max(8, Math.min(rawLeft, stage.width - CALLOUT_W - 8));
        const top = Math.max(8, Math.min(p.top, stage.height - 56));
        const caption = captions?.[box.kind] || DEFAULT_HUD_CAPTIONS[box.kind];
        return (
          <div
            key={`callout-${box.id}`}
            data-hud-callout={box.kind}
            style={{
              position: 'absolute', left, top, width: CALLOUT_W,
              background: backgroundColor,
              color: textColor,
              border: `1px solid ${accentColor}`,
              borderRadius: 10,
              padding: '8px 10px',
              fontSize: 13,
              lineHeight: 1.35,
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}
          >
            {/* Connector toward the HUD this callout describes. */}
            <span
              aria-hidden
              style={{
                position: 'absolute', top: 16,
                [right ? 'right' : 'left']: -GAP,
                width: GAP, height: 2, background: accentColor,
              } as React.CSSProperties}
            />
            {caption}
          </div>
        );
      })}

      {onAcknowledge && (
        <button
          onClick={onAcknowledge}
          data-testid="hud-explanation-acknowledge"
          style={{
            position: 'absolute',
            // Dead centre: the packer only ever uses the six corners, so the
            // middle is the one region no HUD can occupy — and with the beat
            // dimmed behind it, a full-strength button here is unmistakably
            // the live control.
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '12px 30px',
            // Matches the story's own buttons (pill + accent) so it reads as a
            // real button rather than overlay furniture — the scrim, not the
            // styling, is what separates it from the beat.
            borderRadius: 999,
            border: 'none',
            background: accentColor,
            color: accentTextColor,
            fontSize: 17,
            fontWeight: 700,
            cursor: 'pointer',
            pointerEvents: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontFamily,
          }}
        >
          {acknowledgeText}
        </button>
      )}
    </div>
  );
};
