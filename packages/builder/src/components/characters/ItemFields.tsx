/**
 * One item's fields: its matching name, the name players see, its picture
 * and description, category and stacking — and, on a character's own item,
 * how many the character starts with. Shared by a character's Inventory tab
 * and the project's Items (Characters ▸ Items).
 */
import React from 'react';
import { Package, Trash2, X } from 'lucide-react';
import type { ItemDefinition } from '../../types/character';

type Item = ItemDefinition & { quantity?: number };

interface ItemFieldsProps {
  item: Item;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
  /** Opens the picture picker for this item. */
  onPickImage: () => void;
  assets: Array<{ id: string; url: string }>;
  /** A character's own item: how many it starts with. */
  showQuantity?: boolean;
}

export const ItemFields: React.FC<ItemFieldsProps> = ({ item, onChange, onRemove, onPickImage, assets, showQuantity }) => {
  const picture = (item.assetId && assets.find(a => a.id === item.assetId)?.url) || item.icon;
  return (
    <div className="border rounded-lg p-3">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="px-2 py-1 border rounded text-sm"
          placeholder="Internal name"
          title="The name beats and conditions use to match this item"
        />
        <input
          type="text"
          value={item.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          className="px-2 py-1 border rounded text-sm"
          placeholder="Display name"
          title="The name players see"
        />
      </div>
      {/* Image and Description row */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-2 shrink-0">
          {picture ? (
            <img src={picture} alt={item.displayName} className="w-10 h-10 object-cover rounded border" />
          ) : (
            <div className="w-10 h-10 bg-gray-200 rounded border flex items-center justify-center">
              <Package className="w-5 h-5 text-gray-400" />
            </div>
          )}
          <button onClick={onPickImage} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">
            {item.icon || item.assetId ? 'Change' : 'Add Image'}
          </button>
          {(item.icon || item.assetId) && (
            <button
              onClick={() => onChange({ icon: '', assetId: undefined })}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
              title="Remove image"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <input
          type="text"
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="flex-1 px-2 py-1 border rounded text-sm"
          placeholder="Description"
        />
      </div>
      {/* Quantity, Category, Stackable, Delete row */}
      <div className="flex items-center gap-2">
        {showQuantity && (
          <>
            <label className="text-xs text-gray-500">Qty:</label>
            <input
              type="number"
              value={item.quantity ?? 1}
              min={1}
              onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 px-2 py-1 border rounded text-sm"
            />
          </>
        )}
        <select
          value={item.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="misc">Misc</option>
          <option value="weapon">Weapon</option>
          <option value="armor">Armor</option>
          <option value="consumable">Consumable</option>
          <option value="quest">Quest</option>
          <option value="key">Key</option>
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={item.stackable} onChange={(e) => onChange({ stackable: e.target.checked })} />
          Stackable
        </label>
        {item.stackable && (
          <>
            <label className="text-xs text-gray-500">Max:</label>
            <input
              type="number"
              value={item.maxStack ?? 99}
              min={1}
              onChange={(e) => onChange({ maxStack: Math.max(1, Number(e.target.value) || 99) })}
              className="w-16 px-2 py-1 border rounded text-sm"
              title="Max stack size"
            />
          </>
        )}
        <div className="flex-1" />
        <button onClick={onRemove} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete item">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
