/**
 * ChoiceConditionsEditor — "Show only if…" guards on a single choice.
 *
 * Edits a plain Condition[] (the shape DialogTreeBeat / MultiChoiceBeat
 * already evaluate at runtime with .every(), i.e. AND semantics). This is
 * the AUTHORING surface; the same guard renders on the choice's edge in
 * the flowchart (dashed + ◇ + summary) so the logic stays visible where
 * it acts. Covers the gating set — inventory / variable / counter /
 * visited-beat / feeling (a character's sentiment toward someone, the
 * gate the bake-off stories reached for and the editor could not offer);
 * mood / emotion / sensor gating stay the ConditionCheck beat's territory.
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Beat, Condition } from '@asaps/core';
import { SmartNameDropdown } from './SmartNameDropdown';
import { summarizeConditions } from '../utils/conditionSummary';
import { RoleHolderConditionFields } from './RoleHolderConditionFields';
import { useProjectRoles } from '../contexts/RolesContext';

interface AvailableOption {
  name: string;
  displayName?: string;
  description?: string;
  characterName?: string;
  /** Declared type (Project Settings variables) — picks the value control. */
  type?: 'string' | 'number' | 'boolean';
}

/** SmartNameDropdown wants a required displayName — derive one. */
const toDropdownOptions = (opts: AvailableOption[]) =>
  opts.map(o => ({
    name: o.name,
    displayName: o.displayName ?? (o.description ? `${o.name} (${o.description})` : o.name),
    characterName: o.characterName,
  }));

interface ChoiceConditionsEditorProps {
  value: Condition[] | undefined;
  onChange: (value: Condition[] | undefined) => void;
  allBeats: Beat[];
  availableCounters: AvailableOption[];
  availableVariables: AvailableOption[];
  availableInventoryItems: AvailableOption[];
  /** Story characters, for the feeling gate's holder / target pickers. Optional — without it those fields are free text. */
  characters?: Array<{ id: string; name?: string; displayName?: string; role?: string }>;
}

type GateType = 'inventory' | 'variable' | 'counter' | 'visitedBeat' | 'sentiment' | 'roleHolder';

const GATE_TYPES: Array<{ value: GateType; label: string }> = [
  { value: 'inventory', label: 'item' },
  { value: 'variable', label: 'variable' },
  { value: 'counter', label: 'counter' },
  { value: 'visitedBeat', label: 'visited beat' },
  { value: 'sentiment', label: 'feeling' },
  { value: 'roleHolder', label: 'role' },
];

/** Common sentiment labels, offered as suggestions — any emotion name in the story's palette works. */
const SENTIMENT_SUGGESTIONS = ['trust', 'affection', 'respect', 'fear', 'anger', 'suspicion', 'interest', 'gratitude'];

function defaultConditionFor(type: GateType): Condition {
  switch (type) {
    case 'inventory':
      return { type: 'inventory', operator: 'contains', item: '' } as Condition;
    case 'variable':
      return { type: 'variable', operator: '==', variableName: '', value: '' } as Condition;
    case 'counter':
      return { type: 'counter', operator: '>=', variableName: '', value: 1 } as Condition;
    case 'visitedBeat':
      return { type: 'visitedBeat', operator: '==', beatId: '' } as Condition;
    case 'sentiment':
      // Sentiments run -1..1; 0.3 is "mild". `character` holds the feeling,
      // `sentimentTarget` receives it. baseline 'literal' = current value;
      // 'initial' = change since the story started.
      return { type: 'sentiment', character: '', sentimentTarget: 'player', sentimentEmotion: 'trust', operator: '>=', value: 0.3, baseline: 'literal' } as Condition;
    case 'roleHolder':
      return { type: 'roleHolder', role: '', character: '', operator: '==' } as Condition;
  }
}

export const ChoiceConditionsEditor: React.FC<ChoiceConditionsEditorProps> = ({
  value,
  onChange,
  allBeats,
  availableCounters,
  availableVariables,
  availableInventoryItems,
  characters,
}) => {
  const conditions = value ?? [];
  const roles = useProjectRoles();
  const charLabel = (c: { id: string; name?: string; displayName?: string }) => c.displayName || c.name || c.id;

  const update = (index: number, patch: Partial<Condition>) => {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  };

  const replace = (index: number, cond: Condition) => {
    onChange(conditions.map((c, i) => (i === index ? cond : c)));
  };

  const remove = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    onChange(next.length ? next : undefined);
  };

  const add = () => {
    onChange([...conditions, defaultConditionFor('inventory')]);
  };

  const summary = summarizeConditions(conditions, id => allBeats.find(b => b.id === id)?.name);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-violet-700 flex items-center gap-1">
          <span aria-hidden>◇</span> Show only if…
          {conditions.length > 1 && <span className="text-[10px] text-gray-500">(all must hold)</span>}
        </div>
        <button
          onClick={add}
          className="text-[11px] text-violet-700 hover:text-violet-900 flex items-center gap-0.5"
          title="Add a condition — the choice is shown only when every condition holds. The guard appears on this choice's edge in the flowchart."
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {conditions.map((cond, i) => {
        const gate: GateType = (['inventory', 'variable', 'counter', 'visitedBeat', 'sentiment', 'roleHolder'] as const)
          .includes(cond.type as GateType) ? (cond.type as GateType) : 'variable';
        return (
          <div key={i} className="flex items-start gap-1 flex-wrap p-1.5 bg-violet-50 border border-violet-200 rounded">
            <select
              value={gate}
              onChange={e => replace(i, defaultConditionFor(e.target.value as GateType))}
              className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
            >
              {GATE_TYPES.filter(t => t.value !== 'roleHolder' || roles.length > 0 || gate === 'roleHolder').map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {gate === 'inventory' && (
              <>
                <div className="flex-1 min-w-0">
                  <SmartNameDropdown
                    value={(cond as any).item ?? ''}
                    onChange={v => update(i, { item: v ?? '' } as Partial<Condition>)}
                    options={toDropdownOptions(availableInventoryItems)}
                    placeholder="item…"
                    newItemLabel="+ New item…"
                  />
                </div>
                <select
                  value={cond.operator === 'not' ? 'not' : 'has'}
                  onChange={e => update(i, { operator: e.target.value === 'not' ? 'not' : 'contains' })}
                  className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
                >
                  <option value="has">has</option>
                  <option value="not">lacks</option>
                </select>
              </>
            )}

            {(gate === 'variable' || gate === 'counter') && (
              <>
                <div className="flex-1 min-w-0">
                  <SmartNameDropdown
                    value={cond.variableName ?? ''}
                    onChange={v => {
                      const picked = gate === 'variable' ? availableVariables.find(o => o.name === v)?.type : undefined;
                      // The True/False control shows "false" for an empty
                      // value; store it, so what is shown is what is checked.
                      update(i, picked === 'boolean' && typeof cond.value !== 'boolean'
                        ? { variableName: v ?? '', value: String(cond.value) === 'true' }
                        : { variableName: v ?? '' });
                    }}
                    options={toDropdownOptions(gate === 'variable' ? availableVariables : availableCounters)}
                    placeholder={gate === 'variable' ? 'variable…' : 'counter…'}
                    newItemLabel={gate === 'variable' ? '+ New variable…' : '+ New counter…'}
                  />
                </div>
                <select
                  value={cond.operator}
                  onChange={e => update(i, { operator: e.target.value as Condition['operator'] })}
                  className="px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                >
                  {['==', '!=', '>', '<', '>=', '<='].map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                {(() => {
                  // A variable declared boolean gets True/False and stores a
                  // real boolean; typed text "false" never equalled the
                  // variable's boolean default.
                  const varType = gate === 'variable'
                    ? availableVariables.find(v => v.name === cond.variableName)?.type
                    : undefined;
                  if (varType === 'boolean') {
                    return (
                      <select
                        value={String(cond.value) === 'true' ? 'true' : 'false'}
                        onChange={e => update(i, { value: e.target.value === 'true' })}
                        className="px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    );
                  }
                  const numeric = gate === 'counter' || varType === 'number';
                  return (
                    <input
                      type={numeric ? 'number' : 'text'}
                      value={String(cond.value ?? '')}
                      onChange={e => update(i, {
                        value: numeric ? Number(e.target.value) : e.target.value,
                      })}
                      placeholder="value"
                      className="w-16 px-1.5 py-1 border border-gray-300 rounded text-xs"
                    />
                  );
                })()}
              </>
            )}

            {gate === 'sentiment' && (
              <>
                {characters && characters.length > 0 ? (
                  <select
                    aria-label="Who feels it"
                    value={(cond as any).character ?? ''}
                    onChange={e => update(i, { character: e.target.value } as Partial<Condition>)}
                    className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="">who feels…</option>
                    {characters.map(c => <option key={c.id} value={c.id}>{charLabel(c)}</option>)}
                  </select>
                ) : (
                  <input
                    aria-label="Who feels it"
                    type="text"
                    value={(cond as any).character ?? ''}
                    onChange={e => update(i, { character: e.target.value } as Partial<Condition>)}
                    placeholder="character id"
                    className="w-24 px-1.5 py-1 border border-gray-300 rounded text-xs font-mono"
                  />
                )}
                <input
                  aria-label="Feeling"
                  type="text"
                  list="choice-sentiment-suggestions"
                  value={(cond as any).sentimentEmotion ?? ''}
                  onChange={e => update(i, { sentimentEmotion: e.target.value } as Partial<Condition>)}
                  placeholder="trust…"
                  title="Emotion label from the story's palette. Empty = all feelings toward the target summed."
                  className="w-20 px-1.5 py-1 border border-gray-300 rounded text-xs"
                />
                <datalist id="choice-sentiment-suggestions">
                  {SENTIMENT_SUGGESTIONS.map(e => <option key={e} value={e} />)}
                </datalist>
                <span className="text-[11px] text-gray-500 self-center">toward</span>
                {characters && characters.length > 0 ? (
                  <select
                    aria-label="Toward whom"
                    value={(cond as any).sentimentTarget ?? 'player'}
                    onChange={e => update(i, { sentimentTarget: e.target.value } as Partial<Condition>)}
                    className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="player">Player</option>
                    {characters.filter(c => c.role !== 'player').map(c => <option key={c.id} value={c.id}>{charLabel(c)}</option>)}
                  </select>
                ) : (
                  <input
                    aria-label="Toward whom"
                    type="text"
                    value={(cond as any).sentimentTarget ?? 'player'}
                    onChange={e => update(i, { sentimentTarget: e.target.value } as Partial<Condition>)}
                    placeholder="player"
                    className="w-20 px-1.5 py-1 border border-gray-300 rounded text-xs font-mono"
                  />
                )}
                <select
                  aria-label="Operator"
                  value={cond.operator}
                  onChange={e => update(i, { operator: e.target.value as Condition['operator'] })}
                  className="px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                >
                  {['>=', '>', '<=', '<'].map(op => <option key={op} value={op}>{op}</option>)}
                </select>
                <input
                  aria-label="Strength"
                  type="number"
                  step={0.1}
                  min={-1}
                  max={1}
                  value={String(cond.value ?? 0.3)}
                  onChange={e => update(i, { value: Number(e.target.value) })}
                  title="Sentiments run from -1 to 1; 0.3 is mild, 0.6 strong"
                  className="w-14 px-1.5 py-1 border border-gray-300 rounded text-xs"
                />
                <label className="text-[11px] text-gray-600 self-center flex items-center gap-1" title="Compare the CHANGE since the story started instead of the current value">
                  <input
                    type="checkbox"
                    checked={(cond as any).baseline === 'initial'}
                    onChange={e => update(i, { baseline: e.target.checked ? 'initial' : 'literal' } as Partial<Condition>)}
                  />
                  since start
                </label>
              </>
            )}

            {gate === 'visitedBeat' && (
              <>
                <select
                  value={cond.beatId ?? ''}
                  onChange={e => update(i, { beatId: e.target.value })}
                  className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
                >
                  <option value="">Select beat…</option>
                  {allBeats.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <select
                  value={cond.operator === 'not' ? 'not' : 'visited'}
                  onChange={e => update(i, { operator: e.target.value === 'not' ? 'not' : '==' })}
                  className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
                >
                  <option value="visited">visited</option>
                  <option value="not">not visited</option>
                </select>
              </>
            )}

            {gate === 'roleHolder' && (
              <RoleHolderConditionFields
                role={(cond as any).role}
                character={cond.character}
                operator={cond.operator}
                characters={characters}
                onChange={patch => update(i, patch as Partial<Condition>)}
              />
            )}

            <button
              onClick={() => remove(i)}
              className="p-1 text-gray-400 hover:text-red-600"
              title="Remove condition"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {summary && (
        <div className="text-[10px] text-violet-600">
          On the flowchart edge: <span className="font-mono">◇ {summary}</span>
        </div>
      )}
    </div>
  );
};
