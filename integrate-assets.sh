#!/bin/bash

echo "🎨 Integrating Asset Management into ASPS Modern..."
echo ""

# Create the asset integration hook
cat > packages/builder/src/hooks/useAssetManager.ts << 'EOF'
import { useState, useCallback } from 'react';
import type { Asset } from '../components/assets/AssetManager';

export function useAssetManager() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showAssetManager, setShowAssetManager] = useState(false);

  const addAsset = useCallback((asset: Asset) => {
    setAssets(prev => [...prev, asset]);
  }, []);

  const removeAsset = useCallback((assetId: string) => {
    setAssets(prev => prev.filter(a => a.id !== assetId));
  }, []);

  const updateAsset = useCallback((assetId: string, updates: Partial<Asset>) => {
    setAssets(prev => prev.map(a => 
      a.id === assetId ? { ...a, ...updates } : a
    ));
  }, []);

  const getAssetsByType = useCallback((type: Asset['type']) => {
    return assets.filter(a => a.type === type);
  }, [assets]);

  const getAssetsBySubType = useCallback((subType: Asset['subType']) => {
    return assets.filter(a => a.subType === subType);
  }, [assets]);

  const getAssetById = useCallback((assetId: string) => {
    return assets.find(a => a.id === assetId);
  }, [assets]);

  const toggleAssetManager = useCallback(() => {
    setShowAssetManager(prev => !prev);
  }, []);

  const openAssetManager = useCallback(() => {
    setShowAssetManager(true);
  }, []);

  const closeAssetManager = useCallback(() => {
    setShowAssetManager(false);
  }, []);

  // Export/Import assets
  const exportAssets = useCallback(() => {
    return assets.map(asset => ({
      ...asset,
      file: undefined // Don't export File objects
    }));
  }, [assets]);

  const importAssets = useCallback((importedAssets: Asset[]) => {
    setAssets(importedAssets);
  }, []);

  return {
    assets,
    showAssetManager,
    addAsset,
    removeAsset,
    updateAsset,
    getAssetsByType,
    getAssetsBySubType,
    getAssetById,
    toggleAssetManager,
    openAssetManager,
    closeAssetManager,
    exportAssets,
    importAssets,
  };
}
EOF

echo "✅ Created useAssetManager hook"

# Create an Asset Selector component for beat editors
cat > packages/builder/src/components/assets/AssetSelector.tsx << 'EOF'
import React, { useState } from 'react';
import { Image, Music, Film, Folder, X, Check } from 'lucide-react';
import type { Asset } from './AssetManager';

interface AssetSelectorProps {
  assets: Asset[];
  selectedAssetId?: string;
  assetType?: Asset['type'];
  assetSubType?: Asset['subType'];
  onSelect: (assetId: string | null) => void;
  onOpenManager?: () => void;
  label?: string;
  placeholder?: string;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  selectedAssetId,
  assetType,
  assetSubType,
  onSelect,
  onOpenManager,
  label = 'Select Asset',
  placeholder = 'Choose an asset...'
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  // Filter assets by type and subtype
  const filteredAssets = assets.filter(asset => {
    if (assetType && asset.type !== assetType) return false;
    if (assetSubType && asset.subType !== assetSubType) return false;
    return true;
  });

  const selectedAsset = assets.find(a => a.id === selectedAssetId);

  const getAssetIcon = (type: Asset['type']) => {
    switch (type) {
      case 'image': return Image;
      case 'audio': return Music;
      case 'video': return Film;
      default: return Folder;
    }
  };

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left hover:bg-gray-50 flex items-center justify-between"
        >
          {selectedAsset ? (
            <div className="flex items-center gap-2">
              {selectedAsset.type === 'image' && selectedAsset.url && (
                <img src={selectedAsset.url} alt={selectedAsset.name} className="w-6 h-6 object-cover rounded" />
              )}
              {selectedAsset.type !== 'image' && (
                React.createElement(getAssetIcon(selectedAsset.type), { className: 'w-4 h-4 text-gray-500' })
              )}
              <span className="truncate">{selectedAsset.name}</span>
            </div>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          
          {selectedAssetId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </button>

        {showDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filteredAssets.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p className="text-sm mb-2">No assets available</p>
                {onOpenManager && (
                  <button
                    onClick={() => {
                      onOpenManager();
                      setShowDropdown(false);
                    }}
                    className="text-blue-500 hover:text-blue-600 text-sm"
                  >
                    Open Asset Manager
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredAssets.map(asset => {
                  const Icon = getAssetIcon(asset.type);
                  return (
                    <button
                      key={asset.id}
                      onClick={() => {
                        onSelect(asset.id);
                        setShowDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 ${
                        asset.id === selectedAssetId ? 'bg-blue-50' : ''
                      }`}
                    >
                      {asset.type === 'image' && asset.url && (
                        <img src={asset.url} alt={asset.name} className="w-8 h-8 object-cover rounded" />
                      )}
                      {asset.type !== 'image' && (
                        <Icon className="w-4 h-4 text-gray-500" />
                      )}
                      <span className="flex-1 truncate text-sm">{asset.name}</span>
                      {asset.id === selectedAssetId && (
                        <Check className="w-4 h-4 text-blue-500" />
                      )}
                    </button>
                  );
                })}
                
                {onOpenManager && (
                  <button
                    onClick={() => {
                      onOpenManager();
                      setShowDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 border-t text-blue-500 text-sm"
                  >
                    Manage Assets...
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
EOF

echo "✅ Created AssetSelector component"

# Update issues.md to mark progress
cat >> issues.md << 'EOF'

## Asset Management Integration Progress

### ✅ Completed
1. **AssetManager Component** - Already created with full functionality
2. **useAssetManager Hook** - State management for assets
3. **AssetSelector Component** - Dropdown selector for beat editors

### 🚧 In Progress
4. **App Integration** - Adding asset panel to main app
5. **Beat Editor Integration** - Adding asset selection to relevant beats
6. **Export/Import** - Including assets in story export

### 📝 Next Steps
- Add asset panel toggle to Header
- Integrate AssetSelector into IntroText, SWF, Video beats
- Add background selection for visual beats
- Store asset references in story metadata
EOF

echo ""
echo "✨ Asset Management Integration Phase 1 Complete!"
echo ""
echo "Created:"
echo "1. ✅ useAssetManager hook for state management"
echo "2. ✅ AssetSelector component for beat editors"
echo ""
echo "Next steps:"
echo "1. Update App.tsx to include asset management"
echo "2. Add asset panel toggle to Header"
echo "3. Integrate AssetSelector into beat editors"
echo "4. Add asset export/import to story files"
