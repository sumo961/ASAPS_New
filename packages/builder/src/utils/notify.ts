/**
 * App-wide notices and confirms — the replacement for native alert() /
 * confirm() (UX-Eval B4; `no-alert` is an ESLint error in the builder).
 *
 * Native dialogs stop the whole app (and every Electron window's renderer),
 * look foreign, and interrupt for news the UI could show ambiently. The
 * evaluation counted ~45 of them per expert-hour. Routing (§3.6):
 *
 *   - success / info      → `notify.success/info` — auto-dismissing toast
 *   - failures            → `notify.error`        — sticky until dismissed
 *   - soft problems       → `notify.warning`      — e.g. validation, missing prerequisites
 *   - undoable deletes    → NO confirm; `notify.success('Deleted …', { action: undo })`
 *   - decisions that earn a modal (data that cannot come back, history
 *     rewrites, deletes that break links) → `await confirmAction({...})`
 *
 * The bus is module-level and framework-free so any code — hooks, services,
 * plain utils — can raise a notice; `NoticeHost` (mounted once per window in
 * main.tsx) renders it. With no host mounted (tests, headless), notices go to
 * the console and confirms resolve to the given `fallback` (default false —
 * never destroy data without an answer).
 */

export type NoticeKind = 'success' | 'info' | 'warning' | 'error';

export interface NoticeAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
  /** Secondary line(s) — technical detail, file paths. */
  detail?: string;
  /** One inline action, e.g. Undo or Reload from disk. */
  action?: NoticeAction;
  /** Stays until dismissed. Default: true for errors, false otherwise. */
  sticky: boolean;
  /** Auto-dismiss delay in ms for non-sticky notices. */
  durationMs: number;
}

export interface NoticeOptions {
  detail?: string;
  action?: NoticeAction;
  sticky?: boolean;
  durationMs?: number;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message?: string;
  /** Label of the button that proceeds. Name the action ("Delete 3 beats"), not "OK". */
  confirmLabel: string;
  cancelLabel: string;
  /** Styles the confirm button as destructive (red). */
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Answer when no NoticeHost is mounted. Default false. */
  fallback?: boolean;
}

type NoticeListener = (notice: Notice) => void;
type ConfirmListener = (request: ConfirmRequest) => void;

const DEFAULT_DURATION_MS = 6000;
let nextId = 0;
const noticeListeners = new Set<NoticeListener>();
const confirmListeners = new Set<ConfirmListener>();

function emit(kind: NoticeKind, message: string, opts: NoticeOptions = {}): number {
  const notice: Notice = {
    id: ++nextId,
    kind,
    message,
    detail: opts.detail,
    action: opts.action,
    sticky: opts.sticky ?? kind === 'error',
    durationMs: opts.durationMs ?? (opts.action ? DEFAULT_DURATION_MS * 1.5 : DEFAULT_DURATION_MS),
  };
  if (noticeListeners.size === 0) {
    const line = `[notice:${kind}] ${message}${opts.detail ? ` — ${opts.detail}` : ''}`;
    if (kind === 'error' || kind === 'warning') console.warn(line);
    else console.info(line);
  }
  for (const l of noticeListeners) l(notice);
  return notice.id;
}

export const notify = {
  success: (message: string, opts?: NoticeOptions) => emit('success', message, opts),
  info: (message: string, opts?: NoticeOptions) => emit('info', message, opts),
  warning: (message: string, opts?: NoticeOptions) => emit('warning', message, opts),
  error: (message: string, opts?: NoticeOptions) => emit('error', message, opts),
};

/** "Failed to X: <reason>" from an unknown thrown value. */
export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

/**
 * Ask the author to decide. Resolves true when they confirm, false when
 * they cancel (button, Escape, or backdrop). Use only where §3.6 says a
 * modal is earned; prefer undo + a notice for anything reversible.
 */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  if (confirmListeners.size === 0) {
    console.warn(`[confirm] no NoticeHost mounted — "${opts.title}" answered ${opts.fallback ?? false}`);
    return Promise.resolve(opts.fallback ?? false);
  }
  return new Promise<boolean>((resolve) => {
    const request: ConfirmRequest = {
      id: ++nextId,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Continue',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      destructive: opts.destructive ?? false,
      resolve,
    };
    for (const l of confirmListeners) l(request);
  });
}

/** NoticeHost subscription. Returns the unsubscribe function. */
export function subscribeNotices(onNotice: NoticeListener, onConfirm: ConfirmListener): () => void {
  noticeListeners.add(onNotice);
  confirmListeners.add(onConfirm);
  return () => {
    noticeListeners.delete(onNotice);
    confirmListeners.delete(onConfirm);
  };
}
