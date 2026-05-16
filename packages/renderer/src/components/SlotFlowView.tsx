/**
 * SlotFlowView — Phase 1 responsive slot renderer (test bed: endScreen).
 *
 * The deliberate departure from the absolute-position path: this component
 * renders OUTSIDE the ScaledStage uniform `transform: scale()`. Text is NOT
 * dragged by the stage-fit factor. Instead, font size is a clamped-fluid
 * value:
 *
 *     clamp( device-aware FLOOR , fluid-around-authored-size , CEILING )
 *
 * - At the authored 1024px stage width the body renders at exactly the
 *   theme's authored size (the fluid term is authored + (100vw-1024)*k, so
 *   the offset is 0 at 1024).
 * - It scales gently with viewport away from 1024 but can never cross the
 *   readability FLOOR (raised on coarse-pointer / touch where viewing
 *   distance is arm's length) or the comfortable-reading CEILING (this is
 *   what structurally retires the recurring giant-endScreen bug class).
 * - When content still overflows at the FLOOR, the body scrolls; the action
 *   row stays pinned and visible so buttons can never be overlapped.
 *
 * Layout: a full-viewport flex column, safe-area-inset padded (notches /
 * home indicator). Body = flex:1 scroll region with a readable max-width
 * column. Actions = fixed-height bottom bar, always visible.
 *
 * See project_responsive_layout_system memory for the full rationale.
 */

import React from 'react';
import { DEFAULT_THEME, type RenderThemeSettings } from './PositionedBeatView';
import type { SlotSpec } from '../utils/slotLayout';

interface SlotFlowViewProps {
  beatType: string;
  slots: SlotSpec[];
  content: Record<string, any>;
  /** May be undefined (no theme set); falls back to DEFAULT_THEME like the absolute path. */
  theme?: RenderThemeSettings;
  backgroundUrl?: string | null;
  backgroundColor: string;
  /** Resolve a button click to the action id the beat expects. */
  onAction: (id: string) => void;
}

// Authored design width — the fluid font term is zero-offset here so a beat
// renders at the theme's authored size on the canvas it was designed for.
const DESIGN_WIDTH = 1024;
// Comfortable reading ceiling for body prose (px). Caps the giant-text case.
const BODY_CEILING = 28;
// Title ceiling — larger than body but still bounded so AI-generated long
// titles can't blow up the layout on wide displays.
const TITLE_CEILING = 44;
// Tap-target / button ceiling.
const BUTTON_CEILING = 22;
// Readable column width so body lines don't run edge-to-edge on wide screens.
const READABLE_MAX_WIDTH = 760;

let uidCounter = 0;

export const SlotFlowView: React.FC<SlotFlowViewProps> = ({
  slots,
  content,
  theme: themeProp,
  backgroundUrl,
  backgroundColor,
  onAction,
}) => {
  const theme = themeProp ?? DEFAULT_THEME;
  // Stable unique class so the scoped <style> (media-query font floor,
  // scrollbar) doesn't leak to other mounts.
  const scopeRef = React.useRef<string>('');
  if (!scopeRef.current) {
    uidCounter += 1;
    scopeRef.current = `slotflow-${uidCounter}`;
  }
  const scope = scopeRef.current;

  const titleSlot = slots.find(s => s.role === 'title');
  const bodySlot = slots.find(s => s.role === 'body');
  const actionSlot = slots.find(s => s.role === 'action');

  const authoredBody = theme.fonts.textFontSize ?? 18;
  const authoredTitle = theme.fonts.titleFontSize ?? 32;
  const authoredButton = theme.fonts.buttonFontSize ?? 16;

  // Fluid term: authored size at DESIGN_WIDTH, growing on wider viewports.
  // The downward side is clamped to 0 via max() so a NARROW window never
  // shrinks the font below the authored size — narrowing should rewrap the
  // text at a readable size, not shrink it. (Aggressive downward scaling was
  // the "AI Info Text too small / unbounded" bug.) clamp()'s floor var is
  // the comfortable narrative minimum; the ceiling caps the giant case.
  const grow = (k: number) => `max(0px, (100vw - ${DESIGN_WIDTH}px)) * ${k}`;
  const bodyFluid = `calc(${authoredBody}px + ${grow(0.012)})`;
  const titleFluid = `calc(${authoredTitle}px + ${grow(0.016)})`;
  const buttonFluid = `calc(${authoredButton}px + ${grow(0.008)})`;

  const titleText: string = titleSlot?.source ? (content[titleSlot.source] ?? '') : '';
  const bodyText: string = bodySlot?.source ? (content[bodySlot.source] ?? '') : '';

  // Two action shapes: a single "continue" button (aiInfoText / onlineContent
  // — the beat ignores the returned value, any click advances), or the
  // restart/credits pair (endScreen / aiSummary — value is interpreted by
  // EndScreenBeat's substring contract).
  const actionButtons = actionSlot?.buttons ?? [];
  const isContinueAction = actionButtons.includes('continueButton');
  const continueText = content.buttonText || 'Continue';
  const showRestart = content.showRestart !== false;
  const showCredits = content.showCredits === true;
  const restartText = content.restartText || 'Play Again';
  const creditsText = content.creditsText || 'Credits';

  const rootStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: backgroundUrl ? undefined : backgroundColor,
    backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    // Safe-area insets (notch / Dynamic Island / home indicator). env()
    // resolves to 0 on desktop, so this is free there.
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    color: theme.colors?.textColor || '#fff',
    fontFamily: theme.fonts.textFont || 'serif',
  };

  const handleRestart = () => onAction('restart');
  const handleCredits = () => onAction('credits');
  const handleContinue = () => onAction('continue');

  return (
    <div className={`${scope} slotflow-root`} style={rootStyle}>
      <style>{`
        /* Comfortable NARRATIVE minimum — not the 16px absolute-legibility
           floor. Long-form story prose below ~18px reads as cramped/lost
           even though it's technically legible. */
        .${scope} { --slotflow-body-floor: 18px; --slotflow-btn-floor: 16px; }
        @media (pointer: coarse) {
          .${scope} { --slotflow-body-floor: 20px; --slotflow-btn-floor: 18px; }
        }
        .${scope} .slotflow-scroll::-webkit-scrollbar { width: 8px; }
        .${scope} .slotflow-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.25); border-radius: 4px;
        }
        .${scope} .slotflow-btn { transition: background-color 0.15s ease; }
        .${scope} .slotflow-btn:hover { background: ${theme.button?.hoverBackgroundColor || theme.button?.backgroundColor || '#333'}; }
      `}</style>

      {/* Body slot — grows, scrolls, never pushes the action row */}
      <div
        className="slotflow-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            maxWidth: READABLE_MAX_WIDTH,
            width: '100%',
            padding: 'clamp(24px, 5vh, 64px) clamp(20px, 5vw, 48px)',
            margin: '0 auto',
            // Vertically center short endings; long ones top-align + scroll.
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {titleSlot && titleText && (
            <div
              style={{
                fontFamily: theme.fonts.titleFont || theme.fonts.textFont || 'serif',
                fontWeight: 700,
                lineHeight: 1.25,
                textAlign: 'center',
                marginBottom: 'clamp(16px, 3vh, 32px)',
                fontSize: `clamp(calc(var(--slotflow-body-floor) + 4px), ${titleFluid}, ${TITLE_CEILING}px)`,
              }}
            >
              {titleText}
            </div>
          )}
          <div
            style={{
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
              textAlign: 'center',
              fontSize: `clamp(var(--slotflow-body-floor), ${bodyFluid}, ${BODY_CEILING}px)`,
            }}
          >
            {bodyText}
          </div>
        </div>
      </div>

      {/* Action slot — pinned, always visible, overlap-proof.
          Single continue (aiInfoText/onlineContent) vs restart/credits
          (endScreen/aiSummary). */}
      {actionSlot && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 'clamp(12px, 2vw, 24px)',
            padding: 'clamp(16px, 3vh, 28px) 16px',
          }}
        >
          {isContinueAction ? (
            <button
              className="slotflow-btn"
              onClick={handleContinue}
              style={buttonStyle(theme, buttonFluid)}
            >
              {continueText}
            </button>
          ) : (
            <>
              {showCredits && (
                <button
                  className="slotflow-btn"
                  onClick={handleCredits}
                  style={buttonStyle(theme, buttonFluid)}
                >
                  {creditsText}
                </button>
              )}
              {showRestart && (
                <button
                  className="slotflow-btn"
                  onClick={handleRestart}
                  style={buttonStyle(theme, buttonFluid)}
                >
                  {restartText}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

function buttonStyle(theme: RenderThemeSettings, fluid: string): React.CSSProperties {
  return {
    fontFamily: theme.fonts.buttonFont || theme.fonts.textFont || 'serif',
    fontSize: `clamp(var(--slotflow-btn-floor), ${fluid}, ${BUTTON_CEILING}px)`,
    color: theme.button?.textColor || '#fff',
    background: theme.button?.backgroundColor || 'rgba(255,255,255,0.12)',
    border: `${theme.button?.borderWidth ?? 1}px solid ${theme.button?.borderColor || 'rgba(255,255,255,0.4)'}`,
    borderRadius: `${theme.button?.borderRadius ?? 8}px`,
    padding: '0 clamp(20px, 3vw, 36px)',
    minHeight: 44, // Apple HIG minimum tap target
    minWidth: 120,
    cursor: 'pointer',
    fontWeight: 600,
  };
}
