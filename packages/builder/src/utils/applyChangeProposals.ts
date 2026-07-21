/**
 * Main-window executor for Co-Designer change proposals.
 *
 * Validates each selected proposal against LIVE story state (the model
 * worked from a snapshot — beats may have changed or vanished) and applies
 * it through the injected callbacks, which the App wires to its existing
 * undoable command handlers. One result per proposal, never throws:
 * a failed proposal reports why and the rest still apply.
 */

import type { ChangeProposal, ProposalApplyResult } from '../components/ai/codesigner/types';
import { getAllBeatTypeIds } from '../services/beatSchemaVocabulary';
import { applyStanceToTraits } from '../services/prompts/interpersonalStance';

export interface ApplyContext {
  /** Live beats (id, name, getParameters for validation + positioning). */
  beats: Array<{
    id: string;
    name?: string;
    x?: number;
    y?: number;
    notes?: string;
    getParameters?: () => Record<string, unknown>;
  }>;
  /** Undoable field/parameter update (App.handleBeatUpdate). */
  updateBeat: (beatId: string, updates: Record<string, unknown>) => void;
  /** Undoable beat creation; returns the new beat or null (App-side wrapper). */
  addBeat: (
    beatType: string,
    position: { x: number; y: number } | undefined,
    name: string
  ) => { id: string } | null;
  /** Connect source → target with an optional label. */
  connectBeats: (sourceId: string, targetId: string, label?: string) => void;
  /** Live characters for validation (id / ref name / display name) plus
   *  base traits — needed to derive a variant's E/A from its stance. */
  characters?: Array<{ id?: string; name?: string; displayName?: string; traits?: Record<string, number> }>;
  /** Character field update (NOT in the undo history — noted in the result). */
  updateCharacter?: (characterId: string, updates: Record<string, unknown>) => void;
}

export function applyChangeProposals(
  proposals: ChangeProposal[],
  ctx: ApplyContext
): ProposalApplyResult[] {
  const results: ProposalApplyResult[] = [];
  const findBeat = (id: string) => ctx.beats.find(b => b.id === id);
  const knownTypes = new Set(getAllBeatTypeIds());

  proposals.forEach((p, index) => {
    try {
      switch (p.kind) {
        case 'editText': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          ctx.updateBeat(p.beatId, { parameters: { [p.param]: p.newValue } });
          results.push({ index, ok: true, detail: `Set ${p.param} on ${beat.name || p.beatId}` });
          return;
        }

        case 'updateParams': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          ctx.updateBeat(p.beatId, { parameters: p.params });
          results.push({
            index, ok: true,
            detail: `Updated ${Object.keys(p.params).join(', ')} on ${beat.name || p.beatId}`,
          });
          return;
        }

        case 'addBeat': {
          if (!knownTypes.has(p.beatType)) {
            results.push({ index, ok: false, detail: `Unknown beat type "${p.beatType}"` });
            return;
          }
          const anchor = p.connectFrom ? findBeat(p.connectFrom) : undefined;
          if (p.connectFrom && !anchor) {
            results.push({ index, ok: false, detail: `connectFrom ${p.connectFrom} not found` });
            return;
          }
          const position = anchor
            ? { x: (anchor.x || 0) + 300, y: (anchor.y || 0) + 40 }
            : undefined;
          const newBeat = ctx.addBeat(p.beatType, position, p.name);
          if (!newBeat) {
            results.push({ index, ok: false, detail: `Could not create ${p.beatType} beat` });
            return;
          }
          if (p.parameters && Object.keys(p.parameters).length > 0) {
            ctx.updateBeat(newBeat.id, { parameters: p.parameters });
          }
          if (p.connectFrom) ctx.connectBeats(p.connectFrom, newBeat.id, p.connectLabel);
          if (p.connectTo) {
            if (findBeat(p.connectTo)) {
              ctx.connectBeats(newBeat.id, p.connectTo);
            } else {
              results.push({
                index, ok: true,
                detail: `Added "${p.name}" (${newBeat.id}) — connectTo ${p.connectTo} not found, left unwired`,
              });
              return;
            }
          }
          results.push({ index, ok: true, detail: `Added ${p.beatType} "${p.name}" (${newBeat.id})` });
          return;
        }

        case 'updateCharacter': {
          const chars = ctx.characters ?? [];
          const target = chars.find(
            c => c.id === p.characterId || c.name === p.characterId || c.displayName === p.characterId
          );
          if (!target || !target.id) {
            results.push({ index, ok: false, detail: `Character "${p.characterId}" not found` });
            return;
          }
          if (!ctx.updateCharacter) {
            results.push({ index, ok: false, detail: 'Character updates are not available here' });
            return;
          }
          const updates: Record<string, unknown> = { ...(p.updates as any) };
          // Keep the circumplex model consistent: a proposed variant that
          // carries a stance has its extraversion/agreeableness re-derived
          // from the (possibly also-updated) base traits + stance, the same
          // rule the character helper uses — so a stance change actually
          // moves the traits it implies.
          const baseTraits = (updates.traits as Record<string, number>) || target.traits || {};
          if (Array.isArray(updates.variants)) {
            updates.variants = (updates.variants as any[]).map((v) => {
              if (!v?.stance) return v;
              const ea = applyStanceToTraits(baseTraits, v.stance);
              return { ...v, traits: { ...(v.traits || {}), extraversion: ea.extraversion, agreeableness: ea.agreeableness } };
            });
          }
          ctx.updateCharacter(target.id, updates);
          const summary = Object.keys(updates).map(k =>
            k === 'variants' ? `${(updates.variants as any[]).length} variants` : k,
          ).join(', ');
          results.push({
            index, ok: true,
            detail: `Updated ${summary} on character ${target.displayName || target.name || target.id}`,
          });
          return;
        }

        case 'addNote': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          const stamp = `[Co-Designer] ${p.note.trim()}`;
          const existing = typeof beat.notes === 'string' && beat.notes.trim() ? beat.notes : '';
          ctx.updateBeat(p.beatId, { notes: existing ? `${existing}\n\n${stamp}` : stamp });
          results.push({ index, ok: true, detail: `Added note to ${beat.name || p.beatId}` });
          return;
        }
      }
    } catch (err) {
      results.push({
        index, ok: false,
        detail: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  return results;
}
