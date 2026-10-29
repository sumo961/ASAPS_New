/**
 * The Script view's text as Markdown, and back (2026-10-29, class feedback:
 * "Our group resorted to writing large parts of our text in Google Docs and
 * it felt challenging to port text over neatly … I personally enjoy writing
 * in Obsidian").
 *
 * Export writes each beat as a `##` heading with its id in an HTML comment
 * (hidden in Obsidian's reading view), then its fields:
 *
 *   ## Choose Your Path
 *   <!-- asaps:beat_choice_path -->
 *
 *   **Question:** What matters more right now?
 *
 *   **Choice 1:** Visit Grandma
 *
 * A beat whose only text is its Text is written as plain paragraphs.
 * Dialog Tree branches are nested quotes (`> `), one per branching level —
 * indentation would turn into code blocks in Markdown. ASAPS's own
 * `**bold**` / `*italic*` are Markdown already and pass through.
 *
 * Import only updates text the project already has: it finds each beat by
 * its id (or, without one, by a name no other beat has), reads the fields
 * in the order the beat has them, and returns the changes for the author to
 * check. A beat whose fields can't all be found — lines added or removed,
 * a speaker renamed — is reported and left alone; adding beats, choices or
 * lines is the editor's job.
 */
import { scriptFields, type ScriptField } from './scriptFields';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ScriptBeat {
  beat: any;
  fields: ScriptField[];
}

const ID_COMMENT = /^<!--\s*asaps:(\S+?)\s*-->$/;

/** Does a field get written as plain paragraphs, without a label? */
const plainText = (fields: ScriptField[]) => fields.length === 1 && fields[0].kind === 'text' && fields[0].label === 'Text';

const quote = (depth: number) => (depth > 0 ? `${'> '.repeat(depth)}` : '');

/** Keep text lines from being read as headings, id comments or field labels. */
function escapeLine(line: string): string {
  return /^(\s*>|#|<!--|\*\*[^*]+:\*\*|\\)/.test(line) ? `\\${line}` : line;
}
const unescapeLine = (line: string) => (line.startsWith('\\') ? line.slice(1) : line);

export function exportScriptMarkdown(rows: ReadonlyArray<ScriptBeat>, title?: string): string {
  const out: string[] = [];
  if (title) out.push(`# ${title}`, '');
  for (const { beat, fields } of rows) {
    out.push(`## ${String(beat.name || beat.id).replace(/\n/g, ' ')}`, `<!-- asaps:${beat.id} -->`, '');
    if (plainText(fields)) {
      out.push(...fields[0].value.split('\n').map(escapeLine), '');
      continue;
    }
    for (const f of fields) {
      const q = quote(f.depth);
      const [first, ...rest] = f.value.split('\n');
      out.push(`${q}**${f.label}:** ${escapeLine(first ?? '')}`.trimEnd());
      for (const line of rest) out.push(`${q}${escapeLine(line)}`.trimEnd() || q.trimEnd());
      out.push(q.trimEnd());
    }
    if (out[out.length - 1] !== '') out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export interface ScriptChange {
  beatId: string;
  beatName: string;
  path: string;
  label: string;
  before: string;
  after: string;
}

export interface ScriptImport {
  changes: ScriptChange[];
  /** Headings no beat of the project matches. */
  unknown: string[];
  /** Beats whose text no longer lines up with the beat (lines added, removed, renamed). */
  mismatched: string[];
  /** How many beats were read. */
  matched: number;
}

interface Section { heading: string; id?: string; lines: string[] }

function sections(md: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const h = /^##\s+(.*?)\s*#*\s*$/.exec(raw);
    if (h && !raw.startsWith('###')) {
      cur = { heading: h[1], lines: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const id = ID_COMMENT.exec(raw.trim());
    if (id && !cur.id && cur.lines.every((l) => !l.trim())) { cur.id = id[1]; continue; }
    cur.lines.push(raw);
  }
  return out;
}

/** Strip a field's quote level (`> > `) from a line. */
function unquote(line: string): { depth: number; text: string } {
  let depth = 0;
  let rest = line;
  for (;;) {
    const m = /^\s*>\s?/.exec(rest);
    if (!m) break;
    depth++;
    rest = rest.slice(m[0].length);
  }
  return { depth, text: rest };
}

const sameText = (a: string, b: string) => {
  const norm = (v: string) => v.split('\n').map((l) => l.trimEnd()).join('\n').trim();
  return norm(a) === norm(b);
};

const trimBlankLines = (lines: string[]) => {
  let a = 0; let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};

/** The values of `fields`, read from a section's lines in order; null when they don't line up. */
function readFields(fields: ScriptField[], lines: string[]): string[] | null {
  if (plainText(fields)) return [trimBlankLines(lines).map(unescapeLine).join('\n')];
  const values: string[][] = [];
  let k = -1;
  for (const line of lines) {
    const { text } = unquote(line);
    const next = fields[k + 1];
    const marker = next && `**${next.label}:**`;
    if (marker && text.startsWith(marker)) {
      k++;
      values[k] = [text.slice(marker.length).replace(/^ /, '')];
      continue;
    }
    if (k < 0) {
      if (text.trim()) return null; // text before the first field
      continue;
    }
    values[k].push(text);
  }
  if (k !== fields.length - 1) return null;
  return values.map((v) => trimBlankLines(v).map(unescapeLine).join('\n'));
}

export function importScriptMarkdown(md: string, beats: ReadonlyArray<any>): ScriptImport {
  const byId = new Map(beats.map((b) => [b.id, b]));
  const byName = new Map<string, any[]>();
  for (const b of beats) {
    const key = String(b.name || '').trim().toLowerCase();
    if (key) byName.set(key, [...(byName.get(key) || []), b]);
  }
  const result: ScriptImport = { changes: [], unknown: [], mismatched: [], matched: 0 };
  const done = new Set<string>();
  for (const s of sections(md)) {
    const named = byName.get(s.heading.trim().toLowerCase());
    const beat = (s.id && byId.get(s.id)) || (named?.length === 1 ? named[0] : undefined);
    if (!beat || done.has(beat.id)) { result.unknown.push(s.heading); continue; }
    done.add(beat.id);
    const fields = scriptFields(beat);
    const values = readFields(fields, s.lines);
    if (!values) { result.mismatched.push(beat.name || beat.id); continue; }
    result.matched++;
    fields.forEach((f, i) => {
      // Trailing spaces and blank lines around a text don't survive the trip.
      if (sameText(values[i], f.value)) return;
      result.changes.push({ beatId: beat.id, beatName: beat.name || beat.id, path: f.path, label: f.label, before: f.value, after: values[i] });
    });
  }
  return result;
}
