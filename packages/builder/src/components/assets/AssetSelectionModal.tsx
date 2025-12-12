import React, { useState } from 'react';
import { X, Grid, List, Upload, ExternalLink, Search } from 'lucide-react';
import type { Asset } from './AssetManager';

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  assets: Asset[];
  onAssetAdd: (asset: Asset) => Promise<boolean>;
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  console.log('[AssetSelectionModal] Rendering with:', {
    isOpen,
    assetType,
    assetSubType,
    totalAssets: assets.length,
    title
  });

  // FIXED: Enhanced filtering based on type, subtype, and search
  const filteredAssets = assets.filter(asset => {
    // Filter by main type first
    if (assetType && asset.type !== assetType) return false;
    
    // FIXED: More permissive subtype filtering with fallbacks
    // Note: Use asset.name for extension checks since blob URLs don't have extensions
    if (assetSubType) {
      if (assetSubType === 'background') {
        // Backgrounds: JPG/JPEG images OR explicitly marked as background
        const isBackground = asset.type === 'image' &&
          (asset.name.toLowerCase().match(/\.(jpg|jpeg)$/i) ||
           asset.subType === 'background' ||
           asset.name.toLowerCase().includes('bg') ||
           asset.name.toLowerCase().includes('background'));
        if (!isBackground) return false;
      } else if (assetSubType === 'character') {
        // Characters: PNG images OR explicitly marked as character
        const isCharacter = asset.type === 'image' &&
          (asset.name.toLowerCase().endsWith('.png') ||
           asset.subType === 'character' ||
           asset.name.toLowerCase().includes('char') ||
           asset.name.toLowerCase().includes('character'));
        if (!isCharacter) return false;
      } else if (assetSubType === 'prop') {
        // Props: PNG images OR explicitly marked as prop
        const isProp = asset.type === 'image' &&
          (asset.name.toLowerCase().endsWith('.png') ||
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

  console.log('[AssetSelectionModal] Filtered assets:', {
    filteredCount: filteredAssets.length,
    assetIds: filteredAssets.map(a => a.id)
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

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[AssetSelectionModal] handleFileUpload called');
    const files = e.target.files;
    if (!files || files.length === 0) {
      console.log('[AssetSelectionModal] No files selected');
      return;
    }

    console.log('[AssetSelectionModal] Processing', files.length, 'file(s)');

    // Clear previous messages
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);

    try {
      let successCount = 0;
      let failCount = 0;

      for (const file of Array.from(files)) {
        console.log('[AssetSelectionModal] Processing file:', file.name, 'type:', file.type);
        const url = URL.createObjectURL(file);

        // Determine asset type from file
        let fileType: 'image' | 'audio' | 'video' | 'font' = 'image';
        if (file.type.startsWith('audio/')) fileType = 'audio';
        else if (file.type.startsWith('video/')) fileType = 'video';
        else if (file.name.match(/\.(ttf|otf|woff|woff2)$/i)) fileType = 'font';

        const newAsset: Asset = {
          id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: fileType,
          subType: assetSubType as Asset['subType'],
          url,
          file, // Include the File object for proper storage
          size: file.size,
          uploadedAt: new Date(),
        };

        console.log('[AssetSelectionModal] Created asset:', newAsset);

        // Add dimensions for images
        if (fileType === 'image') {
          console.log('[AssetSelectionModal] Loading image to get dimensions...');
          try {
            const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve({ width: img.width, height: img.height });
              img.onerror = reject;
              img.src = url;
            });

            const assetWithDimensions = {
              ...newAsset,
              dimensions
            };

            console.log('[AssetSelectionModal] Image loaded, calling onAssetAdd with:', assetWithDimensions);
            const success = await onAssetAdd(assetWithDimensions);

            if (success) {
              successCount++;
            } else {
              failCount++;
              console.error('[AssetSelectionModal] Failed to add asset:', file.name);
            }
          } catch (err) {
            console.error('[AssetSelectionModal] Image load error:', err);
            failCount++;
          }
        } else {
          console.log('[AssetSelectionModal] Calling onAssetAdd with:', newAsset);
          const success = await onAssetAdd(newAsset);

          if (success) {
            successCount++;
          } else {
            failCount++;
            console.error('[AssetSelectionModal] Failed to add asset:', file.name);
          }
        }
      }

      // Show feedback
      if (failCount === 0) {
        setUploadSuccess(`Successfully uploaded ${successCount} file${successCount !== 1 ? 's' : ''}`);
        // Clear success message after 3 seconds
        setTimeout(() => setUploadSuccess(null), 3000);
      } else {
        setUploadError(`Uploaded ${successCount}, failed ${failCount} file${failCount !== 1 ? 's' : ''}`);
      }

    } catch (err) {
      console.error('[AssetSelectionModal] Upload error:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Get file accept string based on subType
  const getFileAccept = () => {
    if (assetSubType === 'background') return '.jpg,.jpeg';
    if (assetSubType === 'character' || assetSubType === 'prop') return '.png';
    if (assetSubType === 'sfx' || assetSubType === 'sound') return 'audio/*';
    if (assetType === 'video') return 'video/*';
    if (assetType === 'audio') return 'audio/*';
    if (assetType === 'font') return '.ttf,.otf,.woff,.woff2';
    return 'image/*';
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[900px] h-[700px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1"
              title="Upload Assets"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
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

        {/* Upload Status */}
        {(isUploading || uploadSuccess || uploadError) && (
          <div className="px-4 py-2 border-b">
            {isUploading && (
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Uploading...</span>
              </div>
            )}
            {uploadSuccess && (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>{uploadSuccess}</span>
              </div>
            )}
            {uploadError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}

        {/* Asset List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredAssets.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No {getsubTypeLabel()} available</p>
              <p className="text-sm mt-1 mb-4">Upload {getsubTypeLabel()} to get started</p>
              {assetSubType === 'background' && (
                <p className="text-xs mb-4 text-gray-400">Tip: Upload JPG/JPEG images for backgrounds</p>
              )}
              {(assetSubType === 'character' || assetSubType === 'prop') && (
                <p className="text-xs mb-4 text-gray-400">Tip: Upload PNG images for characters and props</p>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload {getsubTypeLabel()}
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {filteredAssets.map(asset => (
                <div
                  key={asset.id}
                  className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all cursor-pointer hover:border-blue-500 hover:bg-blue-50"
                  onClick={() => {
                    console.log('[AssetSelectionModal] Asset clicked (grid view):', asset);
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
                    console.log('[AssetSelectionModal] Asset clicked (list view):', asset);
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept={getFileAccept()}
      />
    </div>
  );
};