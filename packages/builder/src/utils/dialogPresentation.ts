/**
 * The Inspector's Dialog Tree "Presentation Mode" picker over the beat's
 * layout. layoutTemplate is authoritative (v0.9.62); the legacy
 * presentationMode is only read when a beat has no layoutTemplate, and both
 * are written together so they can never disagree.
 */
import { isChatLayoutTemplate, normalizeDialogTreeLayoutTemplate } from '@asaps/core';

export { DIALOG_CHAT_RESPONSE_DELAY } from '@asaps/core';

type Params = Record<string, any> | undefined;

/** The beat's chat layout, or null when it is not a chat layout. */
export function dialogChatMode(params: Params): 'chat-scroll' | 'chat-bubble' | null {
  const raw = params?.layoutTemplate ?? (
    params?.presentationMode === 'chat-scroll' || params?.presentationMode === 'chat-bubble'
      ? params.presentationMode
      : undefined
  );
  const template = normalizeDialogTreeLayoutTemplate(raw);
  return isChatLayoutTemplate(template) ? (template as 'chat-scroll' | 'chat-bubble') : null;
}

/**
 * The parameters to write when the picker changes. Leaving chat goes back
 * to the stacked dialog box; a non-chat layout (conversation, custom) stays
 * as it is when "positioned" is picked again.
 */
export function presentationModePatch(params: Params, mode: string): Record<string, any> {
  if (mode === 'chat-scroll' || mode === 'chat-bubble') {
    return { presentationMode: mode, layoutTemplate: mode };
  }
  const current = normalizeDialogTreeLayoutTemplate(params?.layoutTemplate);
  return {
    presentationMode: 'positioned',
    layoutTemplate: isChatLayoutTemplate(current) || !params?.layoutTemplate ? 'stacked' : current,
  };
}
