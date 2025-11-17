import React, { useState } from 'react';
import { X, Grid, List, Upload, ExternalLink, Search } from 'lucide-react';
import type { Asset } from './AssetManager';

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  assets: Asset[];
  onAssetAdd: (asset: Asset) => void;
  onAssetRemove: (assetId: string) => void;
  onAssetUpdate: (assetId: string, updates: Partial<Asset>) => void;
  assetType?: 'image' | 'audio' | 'video' | 'font';
  assetSubType?: string;
  title?: string;
}

export const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  assets,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  assetType,
  assetSubType,
  title = 'Select Asset'
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  
  if (!isOpen) return null;

  // FIXED: Enhanced filtering based on type, subtype, and search
  const filteredAssets = assets.filter(asset => {
    // Filter by main type first
    if (assetType && asset.type !== assetType) return false;
    
    // FIXED: More permissive subtype filtering with fallbacks
    if (assetSubType) {
      if (assetSubType === 'background') {
        // Backgrounds: JPG/JPEG images OR explicitly marked as background
        const isBackground = asset.type === 'image' && 
          (asset.url.toLowerCase().match(/\.(jpg|jpeg)$/i) || 
           asset.subType === 'background' ||
           asset.name.toLowerCase().includes('bg') ||
           asset.name.toLowerCase().includes('background'));
        if (!isBackground) return false;
      } else if (assetSubType === 'character') {
        // Characters: PNG images OR explicitly marked as character  
        const isCharacter = asset.type === 'image' && 
          (asset.url.toLowerCase().endsWith('.png') ||
           asset.subType === 'character' ||
           asset.name.toLowerCase().includes('char') ||
           asset.name.toLowerCase().includes('character'));
        if (!isCharacter) return false;
      } else if (assetSubType === 'prop') {
        // Props: PNG images OR explicitly marked as prop
        const isProp = asset.type === 'image' && 
          (asset.url.toLowerCase().endsWith('.png') ||
           asset.subType === 'prop' ||
           asset.name.toLowerCase().includes('prop') ||
           asset.name.toLowerCase().includes('item'));
        if (!isProp) return false;
      } else if (assetSubType === 'sfx' || assetSubType === 'sound') {
        // Sound effects: any audio file
        const isSound = asset.type === 'audio';
        if (!isSound) return false;
      } else {
        // For other subtypes, check exact match or fallback to type match
        if (asset.subType !== assetSubType && asset.type !== assetType) {
          return false;
        }
      }
    }
    
    // Search filter
    if (searchTerm && !asset.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    
    return true;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getAssetPreview = (asset: Asset) => {
    if (asset.type === 'image') {
      return <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />;
    } else if (asset.type === 'audio') {
      return (
        <div className="text-center">
          <div className="text-4xl mb-2">🎵</div>
          <div className="text-xs text-gray-500">Audio</div>
        </div>
      );
    } else if (asset.type === 'video') {
      return (
        <div className="text-center">
          <div className="text-4xl mb-2">🎬</div>
          <div className="text-xs text-gray-500">Video</div>
        </div>
      );
    } else {
      return (
        <div className="text-center">
          <div className="text-4xl mb-2">📁</div>
          <div className="text-xs text-gray-500">{asset.type}</div>
        </div>
      );
    }
  };

  // Determine subType label for display
  const getsubTypeLabel = () => {
    if (assetSubType === 'background') return 'backgrounds';
    if (assetSubType === 'character') return 'characters';
    if (assetSubType === 'prop') return 'props';
    if (assetSubType === 'sfx' || assetSubType === 'sound') return 'sounds';
    return assetSubType || assetType || 'assets';
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[900px] h-[700px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-2 hover:bg-gray-100 rounded"
              title={viewMode === 'grid' ? 'List View' : 'Grid View'}
            >
              {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={`Search ${getsubTypeLabel()}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
        
        {/* Asset List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredAssets.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No {getsubTypeLabel()} available</p>
              <p className="text-sm mt-1">Upload assets using the Asset Manager first</p>
              {assetSubType === 'background' && (
                <p className="text-xs mt-2 text-gray-400">Tip: Upload JPG/JPEG images for backgrounds</p>
              )}
              {(assetSubType === 'character' || assetSubType === 'prop') && (
                <p className="text-xs mt-2 text-gray-400">Tip: Upload PNG images for characters and props</p>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {filteredAssets.map(asset => (
                <div
                  key={asset.id}
                  className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all cursor-pointer hover:border-blue-500 hover:bg-blue-50"
                  onClick={() => {
                    onSelect(asset);
                    onClose();
                  }}
                >
                  <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                    {getAssetPreview(asset)}
                  </div>
                  <div className="text-xs">
                    <p className="font-medium truncate" title={asset.name}>{asset.name}</p>
                    <p className="text-gray-500">{formatFileSize(asset.size)}</p>
                    {asset.dimensions && (
                      <p className="text-gray-500">{asset.dimensions.width}×{asset.dimensions.height}</p>
                    )}
                    {asset.duration && (
                      <p className="text-gray-500">{Math.round(asset.duration)}s</p>
                    )}
                    {asset.subType && (
                      <p className="text-gray-400 text-[10px] mt-1">{asset.subType}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAssets.map(asset => (
                <div
                  key={asset.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-500 cursor-pointer transition-all"
                  onClick={() => {
                    onSelect(asset);
                    onClose();
                  }}
                >
                  <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                    {asset.type === 'image' ? (
                      <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-2xl">
                        {asset.type === 'audio' ? '🎵' : asset.type === 'video' ? '🎬' : '📁'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{asset.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(asset.size)}
                      {asset.dimensions && ` • ${asset.dimensions.width}×${asset.dimensions.height}`}
                      {asset.duration && ` • ${Math.round(asset.duration)}s`}
                      {asset.subType && ` • ${asset.subType}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t bg-gray-50 text-xs text-gray-600">
          Showing {filteredAssets.length} of {assets.length} assets
          {assetType && ` • Type: ${assetType}`}
          {assetSubType && ` • subType: ${assetSubType}`}
        </div>
      </div>
    </div>
  );
};