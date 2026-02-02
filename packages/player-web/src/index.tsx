/**
 * ASAPS Player Web - Embeddable web player for HTML export
 */

// Import Tailwind CSS for bundling
import './styles.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebPlayer, type WebPlayerProps } from './WebPlayer';
import { WebAIService, isAIConfigured, clearAIConfig } from './WebAIProvider';

export { WebPlayer, WebAIService, isAIConfigured, clearAIConfig };
export type { WebPlayerProps };

/**
 * Initialize a player from a script tag or module import
 * Usage: ASAPSPlayer.init('#container', { story: 'story.asaps.zip' })
 */
export function init(
  container: HTMLElement | string,
  options: Omit<WebPlayerProps, 'story'> & { story: string | ArrayBuffer }
): { destroy: () => void } {
  console.log('[ASAPSPlayer] init() called with container:', container);
  console.log('[ASAPSPlayer] options:', { ...options, story: typeof options.story === 'string' ? `string(${options.story.length} chars)` : 'ArrayBuffer' });

  // Get container element
  const containerEl = typeof container === 'string'
    ? document.querySelector<HTMLElement>(container)
    : container;

  if (!containerEl) {
    console.error('[ASAPSPlayer] Container not found:', container);
    throw new Error(`Container not found: ${container}`);
  }

  console.log('[ASAPSPlayer] Container element found, creating React root...');

  // Create React root
  const root = createRoot(containerEl);

  // Render player
  console.log('[ASAPSPlayer] Rendering WebPlayer component...');
  root.render(
    React.createElement(WebPlayer, options)
  );

  console.log('[ASAPSPlayer] WebPlayer rendered');

  // Return cleanup function
  return {
    destroy: () => {
      root.unmount();
    },
  };
}

/**
 * Auto-initialize players from data attributes
 * <div data-asaps-story="story.asaps.zip"></div>
 */
export function autoInit(): void {
  document.querySelectorAll<HTMLElement>('[data-asaps-story]').forEach((el) => {
    const storyUrl = el.dataset.asapsStory;
    if (!storyUrl) return;

    const enableAI = el.dataset.asapsAi !== 'false';

    init(el, {
      story: storyUrl,
      enableAI,
    });
  });
}

// Auto-initialize on DOM ready if this is the main bundle
if (typeof window !== 'undefined') {
  // Expose global API
  (window as any).ASAPSPlayer = {
    init,
    autoInit,
    WebAIService,
    isAIConfigured,
    clearAIConfig,
  };

  // Auto-initialize if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Only auto-init if not disabled
      if (!document.querySelector('[data-asaps-no-auto-init]')) {
        autoInit();
      }
    });
  } else {
    // DOM already loaded
    setTimeout(() => {
      if (!document.querySelector('[data-asaps-no-auto-init]')) {
        autoInit();
      }
    }, 0);
  }
}
