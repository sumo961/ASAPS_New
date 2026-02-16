/**
 * Font Bundler - Download and inline Google Fonts for offline HTML exports
 *
 * Fetches Google Fonts CSS, downloads referenced .woff2 files, and converts
 * them to base64 data URIs so exported HTML can render non-Latin scripts offline.
 */

import { buildGoogleFontsUrl } from '@asaps/core';

/**
 * Download Google Fonts and inline them as base64 @font-face CSS.
 * Returns a complete CSS string with embedded woff2 data URIs.
 *
 * @param fontNames - Array of Noto font family names (e.g., ['Noto Sans Arabic', 'Noto Sans JP'])
 * @returns CSS string with inlined @font-face rules, or empty string if no fonts needed
 */
export async function downloadAndInlineFonts(fontNames: string[]): Promise<string> {
  if (fontNames.length === 0) return '';

  const url = buildGoogleFontsUrl(fontNames);
  if (!url) return '';

  try {
    // Fetch CSS with modern User-Agent to get woff2 format
    const cssResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!cssResponse.ok) {
      console.warn(`[FontBundler] Failed to fetch Google Fonts CSS: ${cssResponse.status}`);
      return `/* Font bundling failed: HTTP ${cssResponse.status} */`;
    }

    let css = await cssResponse.text();

    // Find all font file URLs in the CSS
    const urlPattern = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;
    const fontUrls = new Set<string>();
    let match;
    while ((match = urlPattern.exec(css)) !== null) {
      fontUrls.add(match[1]);
    }

    console.log(`[FontBundler] Inlining ${fontUrls.size} font files for ${fontNames.join(', ')}`);

    // Download and inline each font file
    for (const fontUrl of fontUrls) {
      try {
        const fontResponse = await fetch(fontUrl);
        if (!fontResponse.ok) {
          console.warn(`[FontBundler] Failed to fetch font: ${fontUrl}`);
          continue;
        }

        const buffer = await fontResponse.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const dataUri = `data:font/woff2;base64,${base64}`;

        // Replace the URL in CSS
        css = css.replace(fontUrl, dataUri);
      } catch (e) {
        console.warn(`[FontBundler] Failed to inline font ${fontUrl}:`, e);
      }
    }

    return css;
  } catch (e) {
    console.warn('[FontBundler] Font bundling failed (no internet?), continuing without fonts:', e);
    return '/* Font bundling failed: network error. Non-Latin scripts may not render correctly offline. */';
  }
}

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
