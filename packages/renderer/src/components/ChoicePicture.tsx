/**
 * The inside of a picture choice (Choose your character, optionStyle
 * 'pictures' | 'picturesOnly'): the character's picture, with the name and
 * description under it ('pictures') or on their own ('picturesOnly' — the
 * host button carries the name as its accessible label).
 *
 * The host owns the button (click, visited, theme box); this draws what is
 * in it. Responsive layout uses the card; a fixed-layout button drawn as a
 * short strip uses the chip (thumbnail beside the name), so boxes placed
 * for text buttons still read without being resized.
 */
import React from 'react';
import { renderMarkdownLite, markdownLiteToPlain } from '../utils/markdownLite';

export type ChoicePictureStyle = 'pictures' | 'picturesOnly';

export function isPictureChoiceStyle(style: unknown): style is ChoicePictureStyle {
  return style === 'pictures' || style === 'picturesOnly';
}

/** What a screen reader and the tooltip get for a picture choice. */
export function pictureChoiceLabel(text: string, description?: string): string {
  const name = markdownLiteToPlain(text);
  return description ? `${name}: ${markdownLiteToPlain(description)}` : name;
}

const md = (t: string) => ({ __html: renderMarkdownLite(t) });

/** A character without a picture: their initial on a soft tile. */
const Placeholder: React.FC<{ text: string }> = ({ text }) => (
  <div
    data-choice-picture-placeholder
    aria-hidden
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(255,255,255,0.14)',
      fontSize: '2.2em',
      fontWeight: 600,
      opacity: 0.85,
    }}
  >
    {markdownLiteToPlain(text).trim().charAt(0).toUpperCase() || '?'}
  </div>
);

const Picture: React.FC<{ url?: string; text: string }> = ({ url, text }) =>
  url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      data-choice-picture-image
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  ) : (
    <Placeholder text={text} />
  );

export const ChoicePicture: React.FC<{
  url?: string;
  text: string;
  description?: string;
  style: ChoicePictureStyle;
  /** card: picture above the name. chip: thumbnail beside the name. */
  layout?: 'card' | 'chip';
  /** Card picture fills the height left by the caption (fixed boxes) instead of keeping 3:4. */
  fill?: boolean;
  /** Cap on a 3:4 card picture's height (short stages); the picture crops to fit. */
  maxPictureHeight?: string;
}> = ({ url, text, description, style, layout = 'card', fill = false, maxPictureHeight }) => {
  // Without a picture the name is the only way to tell options apart.
  const showName = style === 'pictures' || !url;
  const showDescription = style === 'pictures' && !!description;
  const frame: React.CSSProperties = { overflow: 'hidden', borderRadius: 6, flexShrink: 0 };

  if (layout === 'chip') {
    return (
      <span data-choice-picture="chip" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: '100%', minWidth: 0 }}>
        <span style={{ ...frame, height: '100%', aspectRatio: '1 / 1', display: 'block' }}>
          <Picture url={url} text={text} />
        </span>
        {showName && (
          <span style={{ minWidth: 0, textAlign: 'left', lineHeight: 1.2 }}>
            <span style={{ display: 'block' }} dangerouslySetInnerHTML={md(text)} />
            {showDescription && (
              <span data-choice-picture-description style={{ display: 'block', fontSize: '0.75em', fontWeight: 'normal', opacity: 0.85 }} dangerouslySetInnerHTML={md(description!)} />
            )}
          </span>
        )}
      </span>
    );
  }

  return (
    <span data-choice-picture="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', height: fill ? '100%' : undefined, gap: 6 }}>
      <span style={{ ...frame, display: 'block', width: '100%', ...(fill ? { flex: '1 1 0', minHeight: 0 } : { aspectRatio: '3 / 4', maxHeight: maxPictureHeight }) }}>
        <Picture url={url} text={text} />
      </span>
      {showName && (
        <span style={{ display: 'block', lineHeight: 1.2, flexShrink: 0 }}>
          <span style={{ display: 'block' }} dangerouslySetInnerHTML={md(text)} />
          {showDescription && (
            <span data-choice-picture-description style={{ display: 'block', fontSize: '0.72em', fontWeight: 'normal', opacity: 0.85, marginTop: '0.25em', lineHeight: 1.3 }} dangerouslySetInnerHTML={md(description!)} />
          )}
        </span>
      )}
    </span>
  );
};
