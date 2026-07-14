/**
 * Story digest — a compact, token-budgeted plain-text snapshot of the open
 * project, used as grounding context for the Co-Designer conversation.
 *
 * Deliberately TEXT, not JSON: the model reads it as a design document.
 * Beats are listed in graph order (start beat first where derivable) with
 * their connections inline, so structural questions ("where does the story
 * branch?") are answerable without tools.
 */

export interface DigestBeat {
  id: string;
  type: string;
  name?: string;
  cluster?: string;
  getParameters?: () => Record<string, unknown>;
  parameters?: Record<string, unknown>;
  getConnections?: () => Array<{ targetId?: string; label?: string }>;
  defaultTarget?: string;
}

export interface DigestCharacter {
  id?: string;
  name?: string;
  displayName?: string;
  description?: string;
  traits?: unknown[];
  counters?: Array<{ name?: string; displayName?: string; min?: number; max?: number; value?: number }>;
  variants?: unknown[];
}

export interface StoryDigestInput {
  title?: string;
  beats: DigestBeat[];
  characters?: DigestCharacter[];
  variables?: Array<{ name?: string; initialValue?: unknown }>;
  clusters?: Array<{ id?: string; name?: string }>;
}

export interface StoryDigestOptions {
  /** Hard character budget for the digest text (default 240000 ≈ 60k tokens). */
  maxChars?: number;
  /** Per-beat text snippet length (default 4000 — effectively full text). */
  snippetChars?: number;
}

/** Parameter keys that carry the beat's author-facing prose, in priority order. */
const TEXT_PARAM_KEYS = [
  'text', 'title', 'question', 'prompt', 'analysisPrompt', 'summaryPrompt',
  'openingLine', 'instruction', 'description', 'url',
];

function beatParams(beat: DigestBeat): Record<string, unknown> {
  try {
    if (typeof beat.getParameters === 'function') return beat.getParameters() || {};
  } catch { /* fall through */ }
  return beat.parameters || {};
}

function textSnippet(beat: DigestBeat, limit: number): string {
  const params = beatParams(beat);
  for (const key of TEXT_PARAM_KEYS) {
    const v = params[key];
    if (typeof v === 'string' && v.trim()) {
      const t = v.trim().replace(/\s+/g, ' ');
      return t.length > limit ? `${t.slice(0, limit)}…` : t;
    }
  }
  // dialogTree: surface the root NPC line
  const tree = params.dialogTree as any;
  if (tree && typeof tree.text === 'string' && tree.text.trim()) {
    const t = tree.text.trim().replace(/\s+/g, ' ');
    return t.length > limit ? `${t.slice(0, limit)}…` : t;
  }
  return '';
}

function connectionLines(beat: DigestBeat): string {
  const targets: string[] = [];
  try {
    if (typeof beat.getConnections === 'function') {
      for (const c of beat.getConnections() || []) {
        if (c?.targetId) targets.push(c.label ? `${c.targetId} ("${c.label}")` : c.targetId);
      }
    }
  } catch { /* ignore */ }
  if (beat.defaultTarget && !targets.some(t => t.startsWith(beat.defaultTarget!))) {
    targets.push(`${beat.defaultTarget} (default)`);
  }
  return targets.length > 0 ? ` → ${targets.join(', ')}` : '';
}

/**
 * Build the digest. Never throws — a beat that resists serialization is
 * listed by id/type only.
 */
export function buildStoryDigest(input: StoryDigestInput, options: StoryDigestOptions = {}): string {
  // Full text by default: recommendations grounded in truncated snippets
  // are worse than paying input tokens, and modern models take 200k+ token
  // contexts. The 240k-char budget (~60k tokens) accommodates virtually
  // every real project at FULL text; only genuinely huge stories degrade
  // through the tiered-snippet fallbacks below. Callers can still lower
  // both knobs. The system prompt (and thus the digest) is resent each
  // turn — provider prompt caching keeps repeat cost manageable.
  const maxChars = options.maxChars ?? 240_000;
  const snippetChars = options.snippetChars ?? 4000;

  const lines: string[] = [];
  lines.push(`STORY: "${input.title || 'Untitled'}"`);
  lines.push(`${input.beats.length} beats, ${input.characters?.length ?? 0} characters`);

  if (input.characters && input.characters.length > 0) {
    lines.push('', 'CHARACTERS:');
    for (const c of input.characters) {
      const label = c.displayName || c.name || c.id || '?';
      const bits: string[] = [];
      if (c.name && c.displayName && c.name !== c.displayName) bits.push(`ref: ${c.name}`);
      if (c.description) bits.push(c.description.slice(0, 140));
      if (c.traits && c.traits.length > 0) bits.push(`${c.traits.length} traits`);
      if (c.variants && c.variants.length > 0) bits.push(`${c.variants.length} variants`);
      if (c.counters && c.counters.length > 0) {
        bits.push(`counters: ${c.counters.map(k => k.displayName || k.name).join(', ')}`);
      }
      lines.push(`- ${label}${bits.length ? ` (${bits.join('; ')})` : ''}`);
    }
  }

  if (input.variables && input.variables.length > 0) {
    lines.push('', `VARIABLES: ${input.variables.map(v => v.name).filter(Boolean).join(', ')}`);
  }

  if (input.clusters && input.clusters.length > 0) {
    lines.push('', `CLUSTERS: ${input.clusters.map(c => c.name || c.id).filter(Boolean).join(', ')}`);
  }

  lines.push('', 'BEATS (id [type] "name" — text — → connections):');
  const beatLines: string[] = [];
  for (const beat of input.beats) {
    try {
      const snippet = textSnippet(beat, snippetChars);
      const cluster = beat.cluster ? ` {cluster: ${beat.cluster}}` : '';
      beatLines.push(
        `- ${beat.id} [${beat.type}]${beat.name ? ` "${beat.name}"` : ''}${cluster}` +
        `${snippet ? ` — ${snippet}` : ''}${connectionLines(beat)}`
      );
    } catch {
      beatLines.push(`- ${beat.id} [${beat.type}]`);
    }
  }

  // Budgeting: if over, first shrink snippets, then truncate the beat list.
  let digest = [...lines, ...beatLines].join('\n');
  for (const tier of [1500, 450, 180, 60]) {
    if (digest.length > maxChars && snippetChars > tier) {
      return buildStoryDigest(input, { ...options, snippetChars: tier });
    }
  }
  if (digest.length > maxChars) {
    const kept: string[] = [];
    let used = lines.join('\n').length;
    let dropped = 0;
    for (const bl of beatLines) {
      if (used + bl.length + 1 <= maxChars - 40) {
        kept.push(bl);
        used += bl.length + 1;
      } else {
        dropped++;
      }
    }
    if (dropped > 0) kept.push(`… (+${dropped} more beats omitted for length)`);
    digest = [...lines, ...kept].join('\n');
  }
  return digest;
}
