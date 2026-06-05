import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { WebViewParameters } from '../generated/beat-types';

/**
 * WebViewBeat - Embeds a live external web page. The player exits via:
 *   - the Done button (resolves with 'done')
 *   - automatic navigation match against exitUrlPattern (resolves with the URL)
 *   - a postMessage from the page (resolves with the posted value)
 *
 * Variables listed in passContext are URL-encoded and appended as a
 * hash fragment so the embedded page can read them without an API call.
 * This stays neutral across runtime targets (web iframe, Electron
 * webview, iOS WKWebView, Android WebView all read URL hashes).
 */
export class WebViewBeat extends Beat {
  public url: string;
  public prompt?: string;
  public exitUrlPattern?: string;
  public passContext: string[];
  public saveTo?: string;
  public doneButtonText: string;

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<WebViewParameters>;
  } & Partial<WebViewParameters>) {
    super(config);

    const p = config.parameters ?? ({} as Partial<WebViewParameters>);
    this.url = (config as any).url || p.url || 'https://example.com';
    this.prompt = (config as any).prompt ?? p.prompt;
    this.exitUrlPattern = (config as any).exitUrlPattern ?? p.exitUrlPattern;
    this.passContext = Array.isArray((config as any).passContext)
      ? (config as any).passContext
      : Array.isArray(p.passContext) ? p.passContext : [];
    this.saveTo = (config as any).saveTo ?? p.saveTo;
    this.doneButtonText = (config as any).doneButtonText || p.doneButtonText || 'Done';
    this.node = config.node || (p as any).node;
  }

  getParameters(): Record<string, any> {
    return {
      url: this.url,
      prompt: this.prompt,
      exitUrlPattern: this.exitUrlPattern,
      passContext: this.passContext,
      saveTo: this.saveTo,
      doneButtonText: this.doneButtonText,
      node: this.node,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.url !== undefined) this.url = params.url;
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.exitUrlPattern !== undefined) this.exitUrlPattern = params.exitUrlPattern;
    if (params.passContext !== undefined) {
      this.passContext = Array.isArray(params.passContext) ? params.passContext : [];
    }
    if (params.saveTo !== undefined) this.saveTo = params.saveTo;
    if (params.doneButtonText !== undefined) this.doneButtonText = params.doneButtonText;
    if (params.node !== undefined) this.node = params.node;
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!renderer.renderWebView) {
      console.warn(`[WebViewBeat ${this.id}] renderer.renderWebView unavailable; skipping`);
      return this.getNextBeat(context);
    }

    // Build the context hash from passContext. URL-encode keys and
    // values; skip variables that don't resolve so the page doesn't
    // see "key=undefined" garbage.
    let contextHash: string | undefined;
    if (this.passContext.length > 0) {
      const parts: string[] = [];
      for (const name of this.passContext) {
        const value = context.getVariable(name);
        if (value === undefined || value === null) continue;
        parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
      }
      if (parts.length > 0) contextHash = parts.join('&');
    }

    const processedPrompt = this.prompt ? this.processText(this.prompt, context) : undefined;
    const processedUrl = this.processText(this.url, context);

    const locations = Array.from(this.locations.values());

    const result = await renderer.renderWebView(
      {
        url: processedUrl,
        prompt: processedPrompt,
        exitUrlPattern: this.exitUrlPattern,
        contextHash,
        doneButtonText: this.doneButtonText,
      },
      locations
    );

    // 'done' / matched URL / postMessage value — anything that isn't
    // the literal 'done' may be a value worth recording.
    if (result !== 'done' && this.saveTo) {
      context.setVariable(this.saveTo, result);
    }

    context.recordChoice({
      beatId: this.id,
      beatName: this.name || this.id,
      beatType: 'webView',
      choiceText: result === 'done' ? 'Closed the web view' : `Returned: ${result}`,
      choiceContext: this.url,
    });

    return this.getNextBeat(context);
  }
}
