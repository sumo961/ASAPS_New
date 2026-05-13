/**
 * Render an Ideator transcript as a downloadable Markdown document.
 *
 * The exported format is plain Markdown so it's readable directly, easy to
 * paste into a thesis/notebook/issue tracker, and lossless enough that a
 * future "Import session" feature could parse it back if we ever want one.
 *
 * Web search tool-use chips become block-quote lines so they survive the
 * round-trip and stay visually distinct from regular dialogue.
 */

import type { IdeatorSession } from './ideatorSessionStore';
import type { IdeatorMessage } from './types';
import type { StoryGenerationRequest } from '../../../types/ai';

interface BuildTranscriptInput {
  messages: IdeatorMessage[];
  createdAt?: number;
  lastUpdatedAt?: number;
  handedOff?: boolean;
  draftRequest?: StoryGenerationRequest | null;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  // Local-time, ISO-ish. We deliberately avoid locale-specific date strings
  // so the file's metadata is comparable across machines.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildTranscriptMarkdown(input: BuildTranscriptInput): string {
  const { messages, createdAt, lastUpdatedAt, handedOff, draftRequest } = input;
  const lines: string[] = [];

  lines.push('# Ideator session');
  lines.push('');
  if (createdAt) lines.push(`- **Created:** ${fmtDate(createdAt)}`);
  if (lastUpdatedAt) lines.push(`- **Last updated:** ${fmtDate(lastUpdatedAt)}`);
  lines.push(`- **Status:** ${handedOff ? 'Handed off to story generator' : 'In progress'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    if (msg.kind === 'tool_use') {
      const meta = msg.toolMeta;
      if (meta?.type === 'web_search') {
        lines.push(
          `> 🔎 **Web search:** _"${meta.query}"_ (${meta.resultCount} ${
            meta.resultCount === 1 ? 'result' : 'results'
          })`
        );
        lines.push('');
      }
      continue;
    }
    const speaker = msg.role === 'user' ? 'You' : 'Ideator';
    lines.push(`**${speaker}:**`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
  }

  if (draftRequest) {
    lines.push('---');
    lines.push('');
    lines.push('## Synthesized prompt');
    lines.push('');
    lines.push(draftRequest.prompt ?? '_(empty)_');
    lines.push('');
    const meta: [string, string | number | boolean | undefined][] = [
      ['Genre', draftRequest.genre],
      ['Length', draftRequest.length],
      ['Branching complexity', draftRequest.complexity],
      ['Affect depth', draftRequest.affectDepth],
      ['Include AI-powered beats', draftRequest.includeAIBeats],
    ];
    const populated = meta.filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (populated.length > 0) {
      for (const [k, v] of populated) {
        lines.push(`- **${k}:** ${v}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function transcriptFilename(input: { createdAt?: number; firstUserMessage?: string }): string {
  const stamp = input.createdAt ? fmtDate(input.createdAt).replace(/[ :]/g, '-') : 'session';
  const slug = (input.firstUserMessage ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = slug ? `-${slug}` : '';
  return `ideator-${stamp}${suffix}.md`;
}

/**
 * Trigger a browser download for the given Markdown string.
 */
export function downloadMarkdown(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the click time to start the download, then revoke.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convenience: build + download in one call. Used by both the live-export
 * button and the per-row export action in the SessionsPanel.
 */
export function exportSessionMarkdown(session: Pick<
  IdeatorSession,
  'messages' | 'createdAt' | 'lastUpdatedAt' | 'handedOff' | 'draftRequest'
>): void {
  const markdown = buildTranscriptMarkdown({
    messages: session.messages,
    createdAt: session.createdAt,
    lastUpdatedAt: session.lastUpdatedAt,
    handedOff: session.handedOff,
    draftRequest: session.draftRequest,
  });
  const firstUser = session.messages.find(m => m.role === 'user' && m.kind !== 'tool_use');
  downloadMarkdown(
    transcriptFilename({
      createdAt: session.createdAt,
      firstUserMessage: firstUser?.content,
    }),
    markdown
  );
}
