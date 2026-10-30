/**
 * The project's items (Characters ▸ Items; class feedback: "a way to create
 * and store items … so you can be sure that one type of item [is used]
 * instead of having to guess whether a PC got a correct sword"). Each item
 * once, with its picture and description, whoever ends up holding it; the
 * item pickers offer these first. Stories that kept a "storage" character as
 * their catalogue bring its items in with one click.
 *
 * Typing stays here until the field is left, so a word is one undo step,
 * not one per letter; adding, deleting, a picture or a setting go in at once.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import type { Character, ItemDefinition } from '../../types/character';
import { ItemFields } from './ItemFields';
import { AssetSelectionModal } from '../assets/AssetSelectionModal';

interface ProjectItemsPanelProps {
  items: ItemDefinition[];
  onItemsChange: (items: ItemDefinition[]) => void;
  characters: Character[];
  assets: Array<{ id: string; url: string; name: string; type: string }>;
  onAssetAdd?: (asset: any) => Promise<boolean>;
}

/** Item records on characters that the project list doesn't have yet (by name). */
export function itemsFromCharacters(characters: Character[], items: ItemDefinition[]): ItemDefinition[] {
  const have = new Set(items.map(i => i.name));
  const out: ItemDefinition[] = [];
  for (const c of characters) {
    for (const it of c.inventory || []) {
      if (!it?.name || have.has(it.name)) continue;
      have.add(it.name);
      const { quantity: _q, ...definition } = it;
      out.push({ ...definition, id: `item_${it.name.replace(/\W+/g, '_')}_${out.length}` });
    }
  }
  return out;
}

export const ProjectItemsPanel: React.FC<ProjectItemsPanelProps> = ({ items, onItemsChange, characters, assets, onAssetAdd }) => {
  const [draft, setDraft] = useState(items);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const committedRef = useRef(items);
  useEffect(() => { committedRef.current = items; setDraft(items); }, [items]);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const commit = (next: ItemDefinition[]) => {
    setDraft(next);
    if (next !== committedRef.current) {
      committedRef.current = next;
      onItemsChange(next);
    }
  };
  // Closing the dialog while typing keeps the words.
  useEffect(() => () => {
    if (draftRef.current !== committedRef.current) onItemsChange(draftRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromCharacters = itemsFromCharacters(characters, draft);
  const TEXT_FIELDS = ['name', 'displayName', 'description'];

  return (
    <div className="flex-1 overflow-y-auto p-4" onBlurCapture={() => commit(draftRef.current)}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-sm text-gray-600 max-w-2xl">
          Every item in your story, once: the name beats and conditions match it by, the name and picture players
          see, and a description. Add / Remove Inventory and the item conditions offer these first. A character's
          own item (Characters ▸ a character ▸ Inventory) still wins for that character.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {fromCharacters.length > 0 && (
            <button
              onClick={() => commit([...draft, ...fromCharacters])}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              title={`Copy ${fromCharacters.map(i => i.name).join(', ')} from the characters' inventories`}
            >
              Bring in {fromCharacters.length === 1 ? '1 item' : `${fromCharacters.length} items`} from characters
            </button>
          )}
          <button
            onClick={() => commit([...draft, {
              id: `item_${Date.now()}`,
              name: `item_${draft.length + 1}`,
              displayName: `Item ${draft.length + 1}`,
              description: '',
              icon: '',
              stackable: false,
              category: 'misc',
            }])}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Item
          </button>
        </div>
      </div>

      {draft.length === 0 && (
        <div className="text-center text-gray-500 py-12">
          <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No items yet. Add one, or bring in the items your characters already carry.</p>
        </div>
      )}

      <div className="space-y-2">
        {draft.map((item, index) => (
          <ItemFields
            key={item.id}
            item={item}
            assets={assets}
            onChange={(patch) => {
              const next = [...draft];
              next[index] = { ...item, ...patch };
              if (Object.keys(patch).every(k => TEXT_FIELDS.includes(k))) setDraft(next);
              else commit(next);
            }}
            onRemove={() => commit(draft.filter((_, i) => i !== index))}
            onPickImage={() => setPickingFor(item.id)}
          />
        ))}
      </div>

      {pickingFor && (
        <AssetSelectionModal
          isOpen
          onClose={() => setPickingFor(null)}
          onSelect={(asset: any) => {
            commit(draft.map(i => (i.id === pickingFor ? { ...i, icon: asset.url, assetId: asset.id } : i)));
            setPickingFor(null);
          }}
          assets={assets as any}
          onAssetAdd={onAssetAdd ?? (async () => false)}
          assetType="image"
          title="Select item picture"
        />
      )}
    </div>
  );
};
