import React from 'react';
import { Image, Music, Film, Type, Folder } from 'lucide-react';
import type { Asset } from './AssetManager';

interface AssetSelectorProps {
  assets: Asset[];
  selectedAssetId?: string;
  onAssetSelect: (assetId: string | undefined) => void;
  assetType?: 'image' | 'audio' | 'video' | 'font';
  assetSubType?: 'background' | 'character' | 'prop' | 'sprite' | 'music' | 'sfx' | 'voiceover';
  placeholder?: string;
  className?: string;
}

const getAssetIcon = (type: string) => {
  switch (type) {
    case 'image': return Image;
    case 'audio': return Music;
    case 'video': return Film;
    case 'font': return Type;
    default: return Folder;
  }
};

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  selectedAssetId,
  onAssetSelect,
  assetType,
  assetSubType,
  placeholder = 'Select asset...',
  className = 'w-full px-2 py-1 border border-gray-300 rounded text-sm'
}) => {
  // Filter assets based on type and subtype
  const filteredAssets = assets.filter(asset => {
    if (assetType && asset.type !== assetType) return false;
    if (assetSubType && asset.subType !== assetSubType) return false;
    return true;
  });

  return (
    <select
      value={selectedAssetId || ''}
      onChange={(e) => onAssetSelect(e.target.value || undefined)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {filteredAssets.map(asset => {
        const Icon = getAssetIcon(asset.type);
        return (
          <option key={asset.id} value={asset.id}>
            {asset.name} ({asset.type}{asset.subType ? ` - ${asset.subType}` : ''})
          </option>
        );
      })}
    </select>
  );
};