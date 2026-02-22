/**
 * Smart Sizing Utility
 *
 * Helper functions for computing auto font size and text alignment.
 * These mirror the logic in PositionedBeatView's TextElement/DialogElement
 * and can be used when creating elements to set initial font size/alignment.
 *
 * NOTE: Smart sizing of text boxes (width/height expansion, collision detection)
 * is now computed at render time by PositionedBeatView, not pre-computed here.
 */

import type { RenderThemeSettings } from '@asaps/renderer';

/**
 * Compute auto font size based on content length.
 * Mirrors the logic in PositionedBeatView TextElement.
 */
export function computeAutoFontSize(
  content: string,
  locationName: string,
  theme: RenderThemeSettings
): number {
  const contentLength = content?.length || 0;
  const isTitleElement = locationName?.toLowerCase().includes('title') ||
                         locationName?.toLowerCase().includes('author');

  if (isTitleElement && theme.fonts.titleFontSize) {
    return theme.fonts.titleFontSize;
  }
  if (!isTitleElement && theme.fonts.textFontSize) {
    return theme.fonts.textFontSize;
  }

  // Auto-size based on content length
  if (contentLength > 400) return 11;
  if (contentLength > 200) return 12;
  if (contentLength > 80) return 14;
  if (contentLength < 30) return 36;
  return 16;
}

/**
 * Compute auto text alignment based on content length.
 * Mirrors the logic in PositionedBeatView TextElement/DialogElement.
 */
export function computeAutoTextAlign(content: string): 'left' | 'center' {
  return (content?.length || 0) > 200 ? 'left' : 'center';
}
