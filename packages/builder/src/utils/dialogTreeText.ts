/**
 * A Dialog Tree as plain text, and back (student request, 2026-10-21: a
 * dialog tree was lost and with it a day's edits — "it would be nice to
 * have a text version of the dialogue instead of copy-paste from each
 * response"). Readable on its own, and complete enough to rebuild the
 * conversation:
 *
 *   # E2 - Victim&Friend
 *   Friend: I saw what happened at lunch.
 *     > Me too. I should have done something.
 *       Friend: Then let's talk to Vic together.
 *         > Okay, let's go.  -> Talk to Vic
 *     > It's none of my business.  {if courage < 2}
 *       Friend: Or would that just make things worse?
 *     then Teacher: Everything all right here?
 *
 * `Name: text` is a character's line, `> text` a player reply (its answer
 * indented under it), `then Name: text` the next line without a reply.
 * `-> Beat` is where it leads, `{if …}` a condition, `{…}` an effect. The
 * common conditions and effects are written readably; any other is kept in
 * its stored form, `{if {…}}` / `{effect {…}}`, so nothing is lost. Speaker
 * looks, emotions, reply sounds and visibility are left out (the header says
 * so). Indentation is two spaces per level.
 */

type Json = Record<string, any>;

export interface DialogTextBeat { id: string; name: string }

export interface DialogTextImport {
  tree: Json;
  /** Things the text asked for that could not be resolved (unknown beats …). */
  warnings: string[];
}

const INDENT = '  ';
const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', 'contains', 'not'];

// ---------------------------------------------------------------------------
// Text escaping: line text must not be mistaken for the syntax around it.
// ---------------------------------------------------------------------------

function escapeText(text: string): string {
  let out = String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/\{/g, '\\{')
    .replace(/->/g, '-\\>');
  if (/^(>|#|then )/.test(out)) out = `\\${out}`;
  return out;
}

/** Speakers end at the first ": " — keep a colon in a name from looking like that. */
function escapeSpeaker(name: string): string {
  return String(name || 'NPC').replace(/\\/g, '\\\\').replace(/: /g, '\\: ');
}

// ---------------------------------------------------------------------------
// Conditions and effects: readable where that maps back exactly.
// ---------------------------------------------------------------------------

function only(obj: Json, keys: string[]): boolean {
  return Object.keys(obj).every((k) => keys.includes(k) && obj[k] !== undefined);
}

function valueText(v: unknown): string {
  return typeof v === 'string' && /^[A-Za-z_][\w-]*$/.test(v) && !['true', 'false', 'null'].includes(v)
    ? v
    : JSON.stringify(v);
}

function conditionText(c: Json, beatName: (id: string) => string): string {
  const name = c.variableName;
  if ((c.type === 'counter' || c.type === 'variable') && typeof name === 'string' && /^[\w.-]+$/.test(name)
    && OPERATORS.includes(c.operator) && only(c, ['type', 'variableName', 'operator', 'value'])) {
    return `if ${c.type === 'variable' ? 'var ' : ''}${name} ${c.operator} ${valueText(c.value)}`;
  }
  if (c.type === 'inventory' && typeof c.item === 'string' && (c.checkType === undefined || c.checkType === 'has' || c.checkType === 'notHas')
    && only(c, ['type', 'item', 'checkType']) && !/[{}()]/.test(c.item)) {
    return `if ${c.checkType === 'notHas' ? 'lacks' : 'has'} ${c.item}`;
  }
  if (c.type === 'visitedBeat' && typeof c.beatId === 'string' && (c.operator === undefined || c.operator === 'not')
    && only(c, ['type', 'beatId', 'operator'])) {
    return `if ${c.operator === 'not' ? 'not ' : ''}visited ${escapeTarget(beatName(c.beatId))}`;
  }
  return `if ${JSON.stringify(c)}`;
}

function effectText(e: Json): string {
  const who = typeof e.character === 'string' && e.character && !/[()]/.test(e.character) ? ` (${e.character})` : '';
  const name = typeof e.target === 'string' && /^[\w.-]+$/.test(e.target) ? e.target : null;
  if (e.type === 'incrementCounter' && name && (e.value === undefined || typeof e.value === 'number')
    && only(e, ['type', 'target', 'value', 'character']) && (who || e.character === undefined)) {
    const n = e.value ?? 1;
    return `${name} ${n >= 0 ? '+' : ''}${n}${who}`;
  }
  if (e.type === 'setCounter' && name && typeof e.value === 'number'
    && only(e, ['type', 'target', 'value', 'character']) && (who || e.character === undefined)) {
    return `${name} = ${e.value}${who}`;
  }
  if (e.type === 'setVariable' && name && only(e, ['type', 'target', 'value'])) {
    return `set ${name} = ${JSON.stringify(e.value ?? null)}`;
  }
  if ((e.type === 'addInventory' || e.type === 'removeInventory') && typeof e.target === 'string' && !/[{}()]/.test(e.target)
    && only(e, ['type', 'target', 'character']) && (who || e.character === undefined)) {
    return `${e.type === 'addInventory' ? 'give' : 'take'} ${e.target}${who}`;
  }
  return `effect ${JSON.stringify(e)}`;
}

function escapeTarget(name: string): string {
  return name.replace(/[{}]/g, '');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function dialogTreeToText(
  tree: Json,
  opts: { title?: string; beats?: DialogTextBeat[]; appVersion?: string } = {},
): string {
  const beats = opts.beats ?? [];
  const nameCount = new Map<string, number>();
  for (const b of beats) nameCount.set(b.name, (nameCount.get(b.name) ?? 0) + 1);
  /** A beat by name when that name is unique, else by id. */
  const beatName = (id: string): string => {
    if (id === '__self__') return '(start)';
    const b = beats.find((x) => x.id === id);
    return b && b.name && nameCount.get(b.name) === 1 && !/^beat_|^\(/.test(b.name) ? b.name : id;
  };

  const lines: string[] = [];
  if (opts.title) lines.push(`# ${opts.title.replace(/\n/g, ' ')}`);
  lines.push(`# Dialog Tree as text${opts.appVersion ? `, ASAPS ${opts.appVersion}` : ''}. Left out: speaker looks, emotions, reply sounds and visibility.`);
  lines.push('# Import it in the Dialog Editor to rebuild the conversation as a new beat.');
  lines.push('');

  const tags = (conditions?: Json[], effects?: Json[], target?: string): string => {
    const parts: string[] = [];
    for (const c of conditions ?? []) parts.push(`{${conditionText(c, beatName)}}`);
    for (const e of effects ?? []) parts.push(`{${effectText(e)}}`);
    return (parts.length ? `  ${parts.join(' ')}` : '') + (target ? `  -> ${escapeTarget(beatName(target))}` : '');
  };

  const writeNode = (node: Json, level: number, prefix = '', choiceAnnotations = '') => {
    const pad = INDENT.repeat(level);
    const nodeTags = prefix
      // A continued line: its step's conditions on the line; the line's own
      // (rare) conditions/effects in their stored form.
      ? choiceAnnotations + ((node.conditions?.length || node.effects?.length)
        ? ` {node ${JSON.stringify({ conditions: node.conditions ?? [], effects: node.effects ?? [] })}}`
        : '') + (node.target ? `  -> ${escapeTarget(beatName(node.target))}` : '')
      : tags(node.conditions, node.effects, node.target);
    lines.push(`${pad}${prefix}${escapeSpeaker(node.speaker)}: ${escapeText(node.text ?? '')}${nodeTags}`);
    for (const choice of node.choices ?? []) {
      if (choice.continue) {
        if (choice.dialogNode) {
          writeNode(choice.dialogNode, level + 1, 'then ', tags(choice.conditions, choice.effects, choice.target));
        }
        continue;
      }
      lines.push(`${pad}${INDENT}> ${escapeText(choice.text ?? '')}${tags(choice.conditions, choice.effects, choice.target)}`);
      if (choice.dialogNode) writeNode(choice.dialogNode, level + 2);
    }
  };
  writeNode(tree, 0);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Split a line into its text and the {tags} / -> target after it. */
function splitLine(raw: string): { text: string; tags: string[]; target?: string } {
  let text = '';
  const tags: string[] = [];
  let target: string | undefined;
  let i = 0;
  let seenTag = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (!seenTag) text += next === 'n' ? '\n' : next;
      i += 2;
      continue;
    }
    if (ch === '{') {
      // Balanced braces, honouring JSON strings inside.
      let depth = 0;
      let j = i;
      let inString = false;
      for (; j < raw.length; j++) {
        const c = raw[j];
        if (inString) {
          if (c === '\\') j++;
          else if (c === '"') inString = false;
          continue;
        }
        if (c === '"') inString = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
      }
      tags.push(raw.slice(i + 1, j).trim());
      seenTag = true;
      i = j + 1;
      continue;
    }
    if (ch === '-' && raw[i + 1] === '>') {
      target = raw.slice(i + 2).trim();
      break;
    }
    if (!seenTag) text += ch;
    i++;
  }
  return { text: text.trim(), tags, target };
}

function parseValue(v: string): unknown {
  const t = v.trim();
  try { return JSON.parse(t); } catch { return t; }
}

function parseCondition(tag: string, resolveBeat: (name: string) => string | null, warn: (m: string) => void): Json | null {
  const body = tag.replace(/^if\s+/, '').trim();
  if (body.startsWith('{')) {
    try { return JSON.parse(body); } catch { warn(`Could not read the condition "${tag}"`); return null; }
  }
  let m = /^(has|lacks)\s+(.+)$/.exec(body);
  if (m) return m[1] === 'has' ? { type: 'inventory', item: m[2].trim(), checkType: 'has' } : { type: 'inventory', item: m[2].trim(), checkType: 'notHas' };
  m = /^(not\s+)?visited\s+(.+)$/.exec(body);
  if (m) {
    const id = resolveBeat(m[2].trim());
    if (!id) { warn(`"visited ${m[2].trim()}": no beat of that name — the condition was kept with that name`); }
    return { type: 'visitedBeat', beatId: id ?? m[2].trim(), ...(m[1] ? { operator: 'not' } : {}) };
  }
  m = /^(var\s+)?([\w.-]+)\s+(==|!=|>=|<=|>|<|contains|not)\s+(.+)$/.exec(body);
  if (m) return { type: m[1] ? 'variable' : 'counter', variableName: m[2], operator: m[3], value: parseValue(m[4]) };
  warn(`Could not read the condition "{${tag}}"`);
  return null;
}

function parseEffect(tag: string, warn: (m: string) => void): Json | null {
  const t = tag.trim();
  if (t.startsWith('effect ')) {
    try { return JSON.parse(t.slice(7)); } catch { warn(`Could not read the effect "{${t}}"`); return null; }
  }
  const who = /\s+\(([^()]+)\)$/.exec(t);
  const body = who ? t.slice(0, who.index).trim() : t;
  const character = who ? { character: who[1].trim() } : {};
  let m = /^(give|take)\s+(.+)$/.exec(body);
  if (m) return { type: m[1] === 'give' ? 'addInventory' : 'removeInventory', target: m[2].trim(), ...character };
  m = /^set\s+([\w.-]+)\s*=\s*(.+)$/.exec(body);
  if (m) return { type: 'setVariable', target: m[1], value: parseValue(m[2]) };
  m = /^([\w.-]+)\s*([+-]\s*\d+(?:\.\d+)?)$/.exec(body);
  if (m) return { type: 'incrementCounter', target: m[1], value: Number(m[2].replace(/\s/g, '')), ...character };
  m = /^([\w.-]+)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(body);
  if (m) return { type: 'setCounter', target: m[1], value: Number(m[2]), ...character };
  warn(`Could not read the effect "{${t}}"`);
  return null;
}

export function textToDialogTree(text: string, opts: { beats?: DialogTextBeat[] } = {}): DialogTextImport {
  const beats = opts.beats ?? [];
  const warnings: string[] = [];
  const warn = (m: string) => { if (!warnings.includes(m)) warnings.push(m); };
  const resolveBeat = (name: string): string | null => {
    if (name === '(start)') return '__self__';
    const byName = beats.filter((b) => b.name === name);
    if (byName.length === 1) return byName[0].id;
    if (beats.some((b) => b.id === name)) return name;
    return null;
  };
  const targetOf = (name: string | undefined, lineNo: number): string | undefined => {
    if (!name) return undefined;
    const id = resolveBeat(name);
    if (!id) warn(`Line ${lineNo}: no beat called "${name}" — connect that reply in the editor`);
    return id ?? undefined;
  };

  type Frame = { level: number; node: Json; isThen?: boolean; sameLevel?: boolean };
  let root: Json | null = null;
  const stack: Frame[] = []; // nodes by indentation
  let lastReply: { level: number; choice: Json } | null = null;

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) return;
    const indentMatch = /^( *)/.exec(rawLine)!;
    const level = Math.floor(indentMatch[1].length / INDENT.length);
    let body = rawLine.slice(indentMatch[1].length);

    if (body.startsWith('> ') || body === '>') {
      // A player reply belongs to the nearest line one level up.
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) { warn(`Line ${lineNo}: a reply before any character line was skipped`); return; }
      const { text: replyText, tags, target } = splitLine(body.slice(1).trimStart());
      const choice: Json = { text: replyText };
      for (const tag of tags) {
        if (/^if\s/.test(tag)) { const c = parseCondition(tag, resolveBeat, warn); if (c) (choice.conditions ??= []).push(c); }
        else { const e = parseEffect(tag, warn); if (e) (choice.effects ??= []).push(e); }
      }
      const t = targetOf(target, lineNo);
      if (t) choice.target = t;
      parent.node.choices.push(choice);
      lastReply = { level, choice };
      return;
    }

    const isThen = body.startsWith('then ');
    if (isThen) body = body.slice(5);
    // "Name: text" — the first unescaped ": " ends the speaker.
    let speaker = '';
    let i = 0;
    let found = false;
    while (i < body.length) {
      if (body[i] === '\\' && i + 1 < body.length) { speaker += body[i + 1]; i += 2; continue; }
      if (body[i] === ':' && body[i + 1] === ' ') { found = true; break; }
      speaker += body[i];
      i++;
    }
    if (!found) { warn(`Line ${lineNo} is not "Name: text", "> reply" or "then Name: text" — skipped`); return; }
    const { text: lineText, tags, target } = splitLine(body.slice(i + 2));
    const node: Json = { speaker: speaker.trim() || 'NPC', text: lineText, choices: [] };
    const stepConditions: Json[] = [];
    const stepEffects: Json[] = [];
    for (const tag of tags) {
      if (tag.startsWith('node ')) {
        try {
          const extra = JSON.parse(tag.slice(5));
          if (extra.conditions?.length) node.conditions = extra.conditions;
          if (extra.effects?.length) node.effects = extra.effects;
        } catch { warn(`Line ${lineNo}: could not read "{${tag}}"`); }
        continue;
      }
      if (/^if\s/.test(tag)) { const c = parseCondition(tag, resolveBeat, warn); if (c) (isThen ? stepConditions : (node.conditions ??= [])).push(c); }
      else { const e = parseEffect(tag, warn); if (e) (isThen ? stepEffects : (node.effects ??= [])).push(e); }
    }
    const t = targetOf(target, lineNo);
    if (t) node.target = t;

    if (!root) {
      root = node;
      stack.push({ level, node });
      return;
    }
    if (isThen) {
      // The next line after the line one level up (as exported). Written by
      // hand it often sits at the SAME level as the line it follows — accept
      // that too, unless that line is itself a "then" step (several steps at
      // one level are alternatives for the line above them).
      while (stack.length && stack[stack.length - 1].level > level) stack.pop();
      const top = stack[stack.length - 1];
      // Exported form: a step at this level is an alternative for the line
      // one level up, not a follow-up of the step before it.
      if (top && top.level === level && top.isThen && !top.sameLevel) stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) { warn(`Line ${lineNo}: "then" without a line before it was skipped`); return; }
      parent.node.choices.push({
        text: '', continue: true, dialogNode: node,
        ...(stepConditions.length ? { conditions: stepConditions } : {}),
        ...(stepEffects.length ? { effects: stepEffects } : {}),
      });
      // Same-level form (hand-written): the next "then" at this level follows
      // THIS line — a sequence, as written.
      stack.push({ level, node, isThen: true, sameLevel: parent.level === level });
      return;
    }
    // A character's answer to the reply one level up.
    const reply = lastReply as { level: number; choice: Json } | null;
    if (!reply || reply.level !== level - 1 || reply.choice.dialogNode) {
      warn(`Line ${lineNo}: a character line must follow a reply ("> …") one level up — skipped`);
      return;
    }
    reply.choice.dialogNode = node;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, node });
  });

  if (!root) {
    return { tree: { speaker: 'NPC', text: '', choices: [] }, warnings: ['No character line found — nothing to import'] };
  }
  return { tree: root, warnings };
}
