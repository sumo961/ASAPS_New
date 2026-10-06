import { Beat } from './Beat';
import type { BeatConfig, Effect } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { RandomTargetParameters } from '../generated/beat-types';

/**
 * One way out of a random branch. `effects` run when this branch is drawn
 * (e.g. record which case variant this playthrough uses); `weight` makes a
 * branch more or less likely (default 1; 0 = never drawn).
 */
export interface RandomBranch {
  target: string;
  weight?: number;
  effects?: Effect[];
  label?: string;
}

/**
 * Every shape a random branch has been stored in: a bare beat id (the
 * original and still the common form), { target } / { id, target } (legacy
 * import), { targetId } (Connection form), and the full RandomBranch.
 *
 * A branch without a target is kept: it is one the author just added in the
 * Inspector and hasn't pointed anywhere yet. Dropping it here made "Add
 * Branch" do nothing (GitHub #4) — the new row vanished on the round trip
 * through the beat. Untargeted branches get no graph link and are never drawn.
 */
function toBranch(raw: any): RandomBranch | null {
  if (typeof raw === 'string') return { target: raw };
  if (!raw || typeof raw !== 'object') return null;
  const target = raw.target || raw.targetId || raw.id || '';
  if (typeof target !== 'string') return null;
  const b: RandomBranch = { target };
  if (typeof raw.weight === 'number' && Number.isFinite(raw.weight) && raw.weight >= 0) b.weight = raw.weight;
  if (Array.isArray(raw.effects) && raw.effects.length > 0) b.effects = raw.effects;
  if (typeof raw.label === 'string' && raw.label) b.label = raw.label;
  return b;
}

export class RandomTargetBeat extends Beat {
  private branches: RandomBranch[];

  constructor(config: BeatConfig & {
    choices?: Array<string | Record<string, unknown>>;
    parameters?: Partial<RandomTargetParameters>;
  }) {
    super(config);
    const params = (config.parameters || {}) as any;
    // `targets` is what the story generator taught for a year ("targets:
    // [{targetId, weight}]"); the runtime only read `choices`, so those
    // beats had no branches. Accept it.
    const raw = params.choices || config.choices || params.targets || (config as any).targets || [];
    this.branches = (Array.isArray(raw) ? raw : []).map(toBranch).filter(Boolean) as RandomBranch[];
    this.updateConnections();
  }

  private updateConnections(): void {
    // Graph links, one per branch. Effects stay on the branch (applied in
    // performAction), NOT on these links — so they can't fire twice.
    this.connections = [];
    this.branches.forEach((b, index) => {
      if (!b.target) return;
      const weight = b.weight !== undefined && b.weight !== 1 ? ` (×${b.weight})` : '';
      this.addConnection({ targetId: b.target, label: b.label || `Random ${index + 1}${weight}` });
    });
  }

  getParameters(): Record<string, any> {
    // Plain branches stay plain beat ids: stories that never use weights or
    // effects save exactly as before (and older builds can still read them).
    const plain = this.branches.every((b) => b.weight === undefined && !b.effects && !b.label);
    return {
      choices: plain ? this.branches.map((b) => b.target) : this.branches.map((b) => ({ ...b })),
    };
  }

  updateParameters(params: Record<string, any>): void {
    const incoming = params.choices !== undefined ? params.choices : params.targets;
    if (incoming !== undefined) {
      this.branches = (Array.isArray(incoming) ? incoming : []).map(toBranch).filter(Boolean) as RandomBranch[];
      this.updateConnections();
    }
  }

  /** Weighted draw; weights default to 1, and all-zero falls back to an even draw. */
  private draw(): RandomBranch | null {
    // Branches the author hasn't pointed anywhere yet are not drawn.
    const branches = this.branches.filter((b) => b.target);
    if (branches.length === 0) return null;
    const weights = branches.map((b) => (b.weight === undefined ? 1 : b.weight));
    const total = weights.reduce((a, w) => a + w, 0);
    if (total <= 0) return branches[Math.floor(Math.random() * branches.length)];
    let r = Math.random() * total;
    for (let i = 0; i < branches.length; i++) {
      r -= weights[i];
      if (r < 0 && weights[i] > 0) return branches[i];
    }
    // Float edge: the last branch that can be drawn.
    for (let i = branches.length - 1; i >= 0; i--) if (weights[i] > 0) return branches[i];
    return branches[branches.length - 1];
  }

  protected async performAction(
    context: StoryContext,
    _renderer: IRenderer
  ): Promise<string | null> {
    const branch = this.draw();
    if (!branch) {
      console.warn(`RandomTargetBeat ${this.id} has no valid choices`);
      return this.getNextBeat(context);
    }
    for (const effect of branch.effects ?? []) {
      try {
        context.applyEffect(effect);
      } catch (err) {
        console.warn(`RandomTargetBeat ${this.id}: effect failed`, effect, err);
      }
    }
    console.log(`RandomTargetBeat ${this.id}: drew -> ${branch.target}${branch.effects?.length ? ` (${branch.effects.length} effect(s))` : ''}`);
    return branch.target;
  }
}
