import React, { useState, useRef } from 'react';
import {
  Upload,
  Image,
  Music,
  Film,
  Type,
  Folder,
  X,
  Download,
  ExternalLink,
  Search,
  Filter,
  Grid,
  List,
  Trash2,
  User,
  Package,
  Mountain,
} from 'lucide-react';

/**
 * Phase 3.3 — iOS-style multi-resource asset variant. Points to
 * another asset in the same project, optionally constrained to an
 * orientation and/or device class. Stored on the BASE asset's
 * `variants[]` array. The runtime calls `resolveAssetVariant` to
 * pick the best match for the current viewport; if no variant
 * matches, the base asset renders unchanged.
 */
export interface AssetVariant {
  assetId: string;
  orientation?: 'portrait' | 'landscape';
  deviceClass?: 'phone' | 'tablet' | 'desktop';
}

export interface Asset {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'video' | 'font';
  subType?: 'background' | 'character' | 'prop' | 'sprite' | 'music' | 'sfx' | 'voiceover';
  url: string;
  file?: File;
  size: number;
  dimensions?: { width: number; height: number };
  duration?: number;
  metadata?: Record<string, any>;
  uploadedAt: Date;
  /**
   * Phase 3.3 — optional orientation / device-class variants. Each
   * entry points to ANOTHER asset in the project that should be used
   * in place of THIS one when the runtime context matches. See
   * `resolveAssetVariant` in @asaps/core/utils for the lookup rules.
   * Absent → only this asset is used (unchanged behavior).
   */
  variants?: AssetVariant[];
}

interface AssetManagerProps {
  assets: Asset[];
  onAssetAdd: (asset: Asset) => void;
  onAssetRemove: (assetId: string) => void;
  onAssetUpdate: (assetId: string, updates: Partial<Asset>) => void;
  projectPath?: string;
}

export const AssetManager: React.FC<AssetManagerProps> = ({
  assets,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  projectPath = ''
}) => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterInputRef = useRef<HTMLInputElement>(null);
  const propInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const assetTypes = [
    { type: 'all', label: 'All Assets', icon: Folder, color: 'gray' },
    { type: 'image', label: 'Images', icon: Image, color: 'green', accept: '.jpg,.jpeg,.png,.gif,.svg,.webp' },
    { type: 'audio', label: 'Audio', icon: Music, color: 'blue', accept: '.mp3,.ogg,.wav,.m4a' },
    { type: 'video', label: 'Videos', icon: Film, color: 'purple', accept: '.mp4,.webm,.mov' },
    { type: 'font', label: 'Fonts', icon: Type, color: 'orange', accept: '.ttf,.otf,.woff,.woff2' },
  ];

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'image': return Image;
      case 'audio': return Music;
      case 'video': return Film;
      case 'font': return Type;
      default: return Folder;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, forcedSubType?: Asset['subType']) => {
    console.log('[AssetManager] handleFileUpload called');
    const files = event.target.files;
    if (!files) {
      console.log('[AssetManager] No files selected');
      return;
    }
    console.log('[AssetManager] Files to upload:', files.length);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log('[AssetManager] Processing file:', file.name, 'type:', file.type, 'size:', file.size);
      const fileType = getFileType(file);

      if (!fileType) {
        console.warn(`[AssetManager] Unsupported file type: ${file.type}`);
        continue;
      }

      const asset: Asset = {
        id: `asset_${Date.now()}_${i}`,
        name: file.name,
        type: fileType,
        url: URL.createObjectURL(file),
        file: file,
        size: file.size,
        uploadedAt: new Date(),
      };
      console.log('[AssetManager] Created asset object:', asset.id, asset.name);

      // Get dimensions for images and videos
      if (fileType === 'image') {
        const dimensions = await getImageDimensions(file);
        asset.dimensions = dimensions;
        // Use forced subType if provided, otherwise guess
        asset.subType = forcedSubType || guessImageSubType(file.name);
        console.log('[AssetManager] Image dimensions:', dimensions);
      } else if (fileType === 'video') {
        const { dimensions, duration } = await getVideoDimensions(file);
        asset.dimensions = dimensions;
        asset.duration = duration;
      } else if (fileType === 'audio') {
        asset.duration = await getAudioDuration(file);
        asset.subType = forcedSubType || guessAudioSubType(file.name);
      }

      console.log('[AssetManager] Calling onAssetAdd for:', asset.name);
      onAssetAdd(asset);
      console.log('[AssetManager] onAssetAdd returned for:', asset.name);
    }

    // Reset all input refs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (characterInputRef.current) characterInputRef.current.value = '';
    if (propInputRef.current) propInputRef.current.value = '';
    if (backgroundInputRef.current) backgroundInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (audioInputRef.current) audioInputRef.current.value = '';
    if (fontInputRef.current) fontInputRef.current.value = '';
  };

  const handleUrlAdd = async () => {
    if (!urlInput.trim()) return;

    try {
      const response = await fetch(urlInput);
      const blob = await response.blob();
      const fileType = getFileTypeFromMime(blob.type);

      if (!fileType) {
        alert('Unsupported file type from URL');
        return;
      }

      const fileName = urlInput.split('/').pop() || 'remote-asset';
      const asset: Asset = {
        id: `asset_${Date.now()}`,
        name: fileName,
        type: fileType,
        url: urlInput,
        size: blob.size,
        uploadedAt: new Date(),
      };

      // Set subType based on file type - fix for URL imports not having subType
      if (fileType === 'image') {
        asset.subType = guessImageSubType(fileName);
        // Get dimensions for images from URL
        try {
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              asset.dimensions = { width: img.width, height: img.height };
              resolve();
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = urlInput;
          });
        } catch (dimError) {
          console.warn('Could not get image dimensions:', dimError);
        }
      } else if (fileType === 'audio') {
        asset.subType = guessAudioSubType(fileName);
      }

      onAssetAdd(asset);
      setUrlInput('');
      setShowUrlDialog(false);
    } catch (error) {
      console.error('Failed to load asset from URL:', error);
      alert('Failed to load asset from URL. Please check the URL and try again.');
    }
  };

  const getFileType = (file: File): Asset['type'] | null => {
    return getFileTypeFromMime(file.type);
  };

  const getFileTypeFromMime = (mimeType: string): Asset['type'] | null => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('font') || mimeType.includes('ttf') || mimeType.includes('otf')) return 'font';
    return null;
  };

  const guessImageSubType = (filename: string): Asset['subType'] => {
    const lower = filename.toLowerCase();
    // Check for background indicators
    if (lower.includes('bg') || lower.includes('background') || lower.includes('scene') || lower.includes('location')) {
      return 'background';
    }
    // Check for character indicators
    if (lower.includes('char') || lower.includes('character') || lower.includes('person') || lower.includes('npc') || lower.includes('avatar')) {
      return 'character';
    }
    // Check for prop indicators
    if (lower.includes('prop') || lower.includes('item') || lower.includes('object') || lower.includes('thing')) {
      return 'prop';
    }
    // Check for sprite indicators
    if (lower.includes('sprite')) {
      return 'sprite';
    }
    // Default based on file extension - JPG/JPEG usually backgrounds, PNG usually characters/props
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      return 'background';
    }
    if (filename.endsWith('.png')) {
      return 'prop'; // Default PNG to prop
    }
    return 'background';
  };

  const guessAudioSubType = (filename: string): Asset['subType'] => {
    const lower = filename.toLowerCase();
    if (lower.includes('music') || lower.includes('bgm') || lower.includes('theme')) return 'music';
    if (lower.includes('voice') || lower.includes('dialog')) return 'voiceover';
    return 'sfx';
  };

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const getVideoDimensions = (file: File): Promise<{ dimensions: { width: number; height: number }; duration: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        resolve({
          dimensions: { width: video.videoWidth, height: video.videoHeight },
          duration: video.duration
        });
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        resolve(audio.duration);
      };
      audio.src = URL.createObjectURL(file);
    });
  };

  const filteredAssets = assets.filter(asset => {
    const matchesType = selectedType === 'all' || asset.type === selectedType;
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Asset Manager</h2>
        
        {/* Search and View Controls */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
          </button>
        </div>

        {/* Type Filters */}
        <div className="flex gap-2 flex-wrap">
          {assetTypes.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                selectedType === type
                  ? `bg-${color}-100 text-${color}-700 border border-${color}-300`
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              <span className="text-xs opacity-70">
                ({assets.filter(a => type === 'all' || a.type === type).length})
              </span>
            </button>
          ))}
        </div>

        {/* Upload Controls */}
        <div className="space-y-2 mt-3">
          {/* Main upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Files
          </button>

          {/* Type-specific import buttons - Row 1 */}
          <div className="flex gap-2">
            <button
              onClick={() => characterInputRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Import Characters (PNG only)"
            >
              <User className="w-4 h-4 mb-1 text-purple-600" />
              <span className="text-xs text-gray-600">Characters</span>
            </button>
            <button
              onClick={() => propInputRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Import Props (PNG only)"
            >
              <Package className="w-4 h-4 mb-1 text-orange-600" />
              <span className="text-xs text-gray-600">Props</span>
            </button>
            <button
              onClick={() => backgroundInputRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Import Backgrounds (JPG/JPEG only)"
            >
              <Mountain className="w-4 h-4 mb-1 text-green-600" />
              <span className="text-xs text-gray-600">Backgrounds</span>
            </button>
          </div>

          {/* Type-specific import buttons - Row 2 */}
          <div className="flex gap-2">
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Import Videos"
            >
              <Film className="w-4 h-4 mb-1 text-purple-600" />
              <span className="text-xs text-gray-600">Videos</span>
            </button>
            <button
              onClick={() => audioInputRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Import Audio"
            >
              <Music className="w-4 h-4 mb-1 text-blue-600" />
              <span className="text-xs text-gray-600">Audio</span>
            </button>
            <button
              onClick={() => fontInputRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Import Fonts"
            >
              <Type className="w-4 h-4 mb-1 text-orange-600" />
              <span className="text-xs text-gray-600">Fonts</span>
            </button>
          </div>

          {/* URL import button */}
          <button
            onClick={() => setShowUrlDialog(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4" />
            From URL
          </button>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.svg,.webp,.mp3,.ogg,.wav,.m4a,.mp4,.webm,.mov,.ttf,.otf,.woff,.woff2"
        />

        {/* Type-specific hidden file inputs */}
        <input
          ref={characterInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileUpload(e, 'character')}
          className="hidden"
          accept=".png"
        />
        <input
          ref={propInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileUpload(e, 'prop')}
          className="hidden"
          accept=".png"
        />
        <input
          ref={backgroundInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileUpload(e, 'background')}
          className="hidden"
          accept=".jpg,.jpeg"
        />
        <input
          ref={videoInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          accept=".mp4,.webm,.mov"
        />
        <input
          ref={audioInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileUpload(e, 'music')}
          className="hidden"
          accept=".mp3,.ogg,.wav,.m4a"
        />
        <input
          ref={fontInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          accept=".ttf,.otf,.woff,.woff2"
        />
      </div>

      {/* Asset Grid/List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredAssets.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No assets found</p>
            <p className="text-sm mt-1">Upload files or add from URL to get started</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredAssets.map(asset => {
              const Icon = getAssetIcon(asset.type);
              return (
                <div
                  key={asset.id}
                  className={`border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer ${
                    selectedAsset?.id === asset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => setSelectedAsset(asset)}
                >
                  {/* Preview */}
                  <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                    {asset.type === 'image' ? (
                      <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="w-12 h-12 text-gray-400" />
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="text-xs">
                    <p className="font-medium truncate" title={asset.name}>{asset.name}</p>
                    <p className="text-gray-500">{formatFileSize(asset.size)}</p>
                    {asset.dimensions && (
                      <p className="text-gray-500">{asset.dimensions.width}×{asset.dimensions.height}</p>
                    )}
                    {asset.duration && (
                      <p className="text-gray-500">{Math.round(asset.duration)}s</p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssetRemove(asset.id);
                    }}
                    className="mt-2 p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAssets.map(asset => {
              const Icon = getAssetIcon(asset.type);
              return (
                <div
                  key={asset.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    selectedAsset?.id === asset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedAsset(asset)}
                >
                  <Icon className="w-8 h-8 text-gray-400" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{asset.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(asset.size)}
                      {asset.dimensions && ` • ${asset.dimensions.width}×${asset.dimensions.height}`}
                      {asset.duration && ` • ${Math.round(asset.duration)}s`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssetRemove(asset.id);
                    }}
                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* URL Dialog */}
      {showUrlDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Add Asset from URL</h3>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowUrlDialog(false);
                  setUrlInput('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUrlAdd}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Add Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Details Panel */}
      {selectedAsset && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-sm">{selectedAsset.name}</h3>
            <button
              onClick={() => setSelectedAsset(null)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex items-center gap-2">
              <span>Type: {selectedAsset.type}</span>
              {selectedAsset.type === 'image' && (
                <select
                  value={selectedAsset.subType || 'background'}
                  onChange={(e) => {
                    onAssetUpdate(selectedAsset.id, { subType: e.target.value as Asset['subType'] });
                    setSelectedAsset({ ...selectedAsset, subType: e.target.value as Asset['subType'] });
                  }}
                  className="px-2 py-0.5 border border-gray-300 rounded text-xs"
                >
                  <option value="background">Background</option>
                  <option value="character">Character</option>
                  <option value="prop">Prop</option>
                  <option value="sprite">Sprite</option>
                </select>
              )}
              {selectedAsset.type === 'audio' && (
                <select
                  value={selectedAsset.subType || 'sfx'}
                  onChange={(e) => {
                    onAssetUpdate(selectedAsset.id, { subType: e.target.value as Asset['subType'] });
                    setSelectedAsset({ ...selectedAsset, subType: e.target.value as Asset['subType'] });
                  }}
                  className="px-2 py-0.5 border border-gray-300 rounded text-xs"
                >
                  <option value="music">Music</option>
                  <option value="sfx">Sound Effect</option>
                  <option value="voiceover">Voiceover</option>
                </select>
              )}
            </div>
            <p>Size: {formatFileSize(selectedAsset.size)}</p>
            {selectedAsset.dimensions && (
              <p>Dimensions: {selectedAsset.dimensions.width}×{selectedAsset.dimensions.height}px</p>
            )}
            {selectedAsset.duration && (
              <p>Duration: {Math.round(selectedAsset.duration)} seconds</p>
            )}
            <p>Uploaded: {selectedAsset.uploadedAt.toLocaleString()}</p>
          </div>
          <div className="flex gap-2 mt-3">
            <a
              href={selectedAsset.url}
              download={selectedAsset.name}
              className="flex items-center gap-1 px-3 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300"
            >
              <Download className="w-3 h-3" />
              Download
            </a>
          </div>

          {/* Phase 3.3 — variants UI. Only meaningful for image
              assets. Authors pair another image in the project with
              an orientation and/or device-class constraint; the
              runtime picks the most-specific match for the current
              container. A variant cannot point at itself. */}
          {selectedAsset.type === 'image' && (() => {
            const otherImages = assets.filter(
              a => a.type === 'image' && a.id !== selectedAsset.id
            );
            const variants = selectedAsset.variants ?? [];
            const setVariants = (next: AssetVariant[]) => {
              onAssetUpdate(selectedAsset.id, { variants: next });
              setSelectedAsset({ ...selectedAsset, variants: next });
            };
            return (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-700">
                    Variants
                    <span className="ml-2 text-[10px] font-normal text-gray-500">
                      ({variants.length})
                    </span>
                  </h4>
                  {otherImages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setVariants([...variants, { assetId: otherImages[0].id }])}
                      className="text-[11px] px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600"
                    >
                      + Add
                    </button>
                  )}
                </div>
                {otherImages.length === 0 && (
                  <p className="text-[11px] text-gray-500 italic">
                    Upload another image first to use as a variant.
                  </p>
                )}
                {variants.map((v, i) => {
                  const update = (patch: Partial<AssetVariant>) => {
                    const next = variants.slice();
                    next[i] = { ...v, ...patch };
                    // Drop explicitly-cleared keys (undefined) so the
                    // serialized shape stays tidy.
                    if (next[i].orientation === undefined) delete (next[i] as any).orientation;
                    if (next[i].deviceClass === undefined) delete (next[i] as any).deviceClass;
                    setVariants(next);
                  };
                  return (
                    <div
                      key={`${v.assetId}-${i}`}
                      className="flex items-center gap-1.5 mb-1.5 p-1.5 rounded bg-white border border-gray-200 text-[11px]"
                    >
                      <select
                        value={v.assetId}
                        onChange={(e) => update({ assetId: e.target.value })}
                        className="flex-1 px-1.5 py-0.5 border border-gray-300 rounded"
                      >
                        {otherImages.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <select
                        value={v.orientation ?? ''}
                        onChange={(e) =>
                          update({ orientation: (e.target.value || undefined) as any })
                        }
                        title="Orientation constraint"
                        className="px-1.5 py-0.5 border border-gray-300 rounded"
                      >
                        <option value="">Any orient.</option>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                      <select
                        value={v.deviceClass ?? ''}
                        onChange={(e) =>
                          update({ deviceClass: (e.target.value || undefined) as any })
                        }
                        title="Device-class constraint"
                        className="px-1.5 py-0.5 border border-gray-300 rounded"
                      >
                        <option value="">Any device</option>
                        <option value="phone">Phone</option>
                        <option value="tablet">Tablet</option>
                        <option value="desktop">Desktop</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Remove variant"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {variants.length > 0 && (
                  <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                    The runtime picks the most-specific variant whose
                    constraints all match the current viewport. No
                    matching variant → falls back to this base image.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
