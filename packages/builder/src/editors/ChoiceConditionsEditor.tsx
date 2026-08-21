/**
 * ChoiceConditionsEditor — "Show only if…" guards on a single choice.
 *
 * Edits a plain Condition[] (the shape DialogTreeBeat / MultiChoiceBeat
 * already evaluate at runtime with .every(), i.e. AND semantics). This is
 * the AUTHORING surface; the same guard renders on the choice's edge in
 * the flowchart (dashed + ◇ + summary) so the logic stays visible where
 * it acts. Covers the gating set — inventory / variable / counter /
 * visited-beat; affect and sensor gating stay the ConditionCheck beat's
 * territory for now.
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Beat, Condition } from '@asaps/core';
import { SmartNameDropdown } from './SmartNameDropdown';
import { summarizeConditions } from '../utils/conditionSummary';

interface AvailableOption {
  name: string;
  displayName?: string;
  description?: string;
  characterName?: string;
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
}

type GateType = 'inventory' | 'variable' | 'counter' | 'visitedBeat';

const GATE_TYPES: Array<{ value: GateType; label: string }> = [
  { value: 'inventory', label: 'item' },
  { value: 'variable', label: 'variable' },
  { value: 'counter', label: 'counter' },
  { value: 'visitedBeat', label: 'visited beat' },
];

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
  }
}

export const ChoiceConditionsEditor: React.FC<ChoiceConditionsEditorProps> = ({
  value,
  onChange,
  allBeats,
  availableCounters,
  availableVariables,
  availableInventoryItems,
}) => {
  const conditions = value ?? [];

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
        const gate: GateType = (['inventory', 'variable', 'counter', 'visitedBeat'] as const)
          .includes(cond.type as GateType) ? (cond.type as GateType) : 'variable';
        return (
          <div key={i} className="flex items-start gap-1 p-1.5 bg-violet-50 border border-violet-200 rounded">
            <select
              value={gate}
              onChange={e => replace(i, defaultConditionFor(e.target.value as GateType))}
              className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white"
            >
              {GATE_TYPES.map(t => (
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
                    onChange={v => update(i, { variableName: v ?? '' })}
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
                <input
                  type={gate === 'counter' ? 'number' : 'text'}
                  value={String(cond.value ?? '')}
                  onChange={e => update(i, {
                    value: gate === 'counter' ? Number(e.target.value) : e.target.value,
                  })}
                  placeholder="value"
                  className="w-16 px-1.5 py-1 border border-gray-300 rounded text-xs"
                />
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
