/**
 * Screenshot capture utility for save slot thumbnails
 */

export interface ScreenshotOptions {
  /** Image quality (0-1, default: 0.5) */
  quality?: number;
  /** Maximum width to scale down to (default: 160) */
  maxWidth?: number;
  /** Maximum height to scale down to (default: 90) */
  maxHeight?: number;
  /** Image format (default: 'image/jpeg') */
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Capture a screenshot from a container element
 * Tries canvas first, then falls back to html2canvas if available
 *
 * @param container - The HTML element to capture
 * @param options - Screenshot options
 * @returns Base64 data URL of the screenshot, or undefined if capture failed
 */
export async function captureScreenshot(
  container: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<string | undefined> {
  const {
    quality = 0.5,
    maxWidth = 160,
    maxHeight = 90,
    format = 'image/jpeg',
  } = options;

  try {
    // Try canvas element first (most efficient for canvas-based rendering)
    const canvas = container.querySelector('canvas');
    if (canvas) {
      return resizeAndExport(canvas, { quality, maxWidth, maxHeight, format });
    }

    // Try html2canvas if available (loaded dynamically)
    if (typeof (window as any).html2canvas === 'function') {
      const capturedCanvas = await (window as any).html2canvas(container, {
        scale: 0.5, // Lower scale for thumbnails
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#1a1a2e',
      });
      return resizeAndExport(capturedCanvas, { quality, maxWidth, maxHeight, format });
    }

    // Try to create a snapshot from the DOM content
    // This is a fallback that creates a basic representation
    const domCanvas = await createDomSnapshot(container, maxWidth, maxHeight);
    if (domCanvas) {
      return domCanvas.toDataURL(format, quality);
    }

    console.warn('[Screenshot] No capture method available');
    return undefined;
  } catch (error) {
    console.warn('[Screenshot] Failed to capture:', error);
    return undefined;
  }
}

/**
 * Resize a canvas and export as data URL
 */
function resizeAndExport(
  sourceCanvas: HTMLCanvasElement,
  options: Required<ScreenshotOptions>
): string {
  const { quality, maxWidth, maxHeight, format } = options;

  // Calculate scaled dimensions maintaining aspect ratio
  const aspectRatio = sourceCanvas.width / sourceCanvas.height;
  let width = maxWidth;
  let height = maxHeight;

  if (aspectRatio > maxWidth / maxHeight) {
    // Width is the limiting factor
    height = Math.round(maxWidth / aspectRatio);
  } else {
    // Height is the limiting factor
    width = Math.round(maxHeight * aspectRatio);
  }

  // Create a smaller canvas for the thumbnail
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = width;
  thumbCanvas.height = height;

  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) {
    return sourceCanvas.toDataURL(format, quality);
  }

  // Draw scaled image
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  return thumbCanvas.toDataURL(format, quality);
}

/**
 * Create a basic snapshot from DOM elements
 * This is a fallback when no canvas or html2canvas is available
 */
async function createDomSnapshot(
  container: HTMLElement,
  width: number,
  height: number
): Promise<HTMLCanvasElement | null> {
  try {
    // Create a canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fill with background color
    const bgColor = getComputedStyle(container).backgroundColor || '#1a1a2e';
    ctx.fillStyle = bgColor === 'rgba(0, 0, 0, 0)' ? '#1a1a2e' : bgColor;
    ctx.fillRect(0, 0, width, height);

    // Try to find and draw any images in the container
    const images = container.querySelectorAll('img');
    for (const img of Array.from(images)) {
      if (img.complete && img.naturalWidth > 0) {
        try {
          const rect = img.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          // Calculate relative position and scale
          const relX = (rect.left - containerRect.left) / containerRect.width;
          const relY = (rect.top - containerRect.top) / containerRect.height;
          const relW = rect.width / containerRect.width;
          const relH = rect.height / containerRect.height;

          ctx.drawImage(
            img,
            relX * width,
            relY * height,
            relW * width,
            relH * height
          );
        } catch {
          // Cross-origin images may fail, skip them
        }
      }
    }

    return canvas;
  } catch {
    return null;
  }
}

/**
 * Create a placeholder thumbnail with text
 * Used when no screenshot can be captured
 */
export function createPlaceholderThumbnail(
  text: string = 'No Preview',
  width: number = 160,
  height: number = 90
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Dark gradient background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#2d2d44');
  gradient.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);

  return canvas.toDataURL('image/jpeg', 0.5);
}
