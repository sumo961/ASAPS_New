/**
 * Direct Asset Upload Component
 * Allows inline asset upload with drag-and-drop support
 */

import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileImage, Link, Check, AlertCircle } from 'lucide-react';

interface DirectAssetUploadProps {
  currentAssetUrl?: string;
  onAssetSelect: (url: string, metadata?: any) => void;
  onAssetAdd?: (asset: any) => Promise<boolean>; // Optional: add to global asset pool
  acceptTypes?: string[];
  maxSize?: number; // in MB
  label?: string;
  className?: string;
}

export const DirectAssetUpload: React.FC<DirectAssetUploadProps> = ({
  currentAssetUrl,
  onAssetSelect,
  onAssetAdd,
  acceptTypes = ['image/*'],
  maxSize = 5,
  label = 'Upload or drop file',
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      return `File size exceeds ${maxSize}MB limit`;
    }

    // Check file type
    const acceptedTypes = acceptTypes.join(',');
    if (acceptedTypes !== '*' && acceptedTypes !== '') {
      const fileType = file.type;
      const accepted = acceptTypes.some(type => {
        if (type.endsWith('/*')) {
          const category = type.split('/')[0];
          return fileType.startsWith(category + '/');
        }
        return fileType === type;
      });
      
      if (!accepted) {
        return `File type ${fileType} not accepted. Please use: ${acceptTypes.join(', ')}`;
      }
    }

    return null;
  };

  const handleFile = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Convert to base64 for local preview
      // In production, you'd upload to a server/CDN here
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };
        reader.readAsDataURL(file);
      });

      // Create asset metadata
      const asset = {
        id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        url: url,
        file: file, // Include File object for proper storage
        type: file.type.startsWith('image/') ? 'image' : file.type,
        size: file.size,
        uploadedAt: new Date().toISOString()
      };

      // Add to global asset pool if handler provided
      if (onAssetAdd) {
        const success = await onAssetAdd(asset);
        if (!success) {
          setUploadError('Failed to add asset to library');
          setIsUploading(false);
          return;
        }
      }

      // Select for immediate use
      onAssetSelect(url, asset);
      setIsUploading(false);
    } catch (err) {
      setUploadError('Upload failed: ' + (err as Error).message);
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;

    // Basic URL validation
    try {
      new URL(urlInput);
    } catch {
      setUploadError('Please enter a valid URL');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Create asset from URL
      const asset = {
        id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: urlInput.split('/').pop() || 'remote-image',
        url: urlInput,
        type: 'image',
        uploadedAt: new Date().toISOString()
      };

      // Add to global pool if handler provided
      if (onAssetAdd) {
        const success = await onAssetAdd(asset);
        if (!success) {
          setUploadError('Failed to add asset to library');
          setIsUploading(false);
          return;
        }
      }

      // Select for use
      onAssetSelect(urlInput, asset);
      setUrlInput('');
      setShowUrlInput(false);
    } catch (err) {
      setUploadError('Failed to add asset: ' + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    onAssetSelect('', null);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Current Asset Preview */}
      {currentAssetUrl && (
        <div className="relative group">
          <div 
            className="border-2 border-gray-300 rounded-lg overflow-hidden"
            style={{ 
              backgroundImage: 'repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%)', 
              backgroundSize: '20px 20px' 
            }}
          >
            <img 
              src={currentAssetUrl} 
              alt="Current asset"
              className="w-full h-32 object-contain"
            />
          </div>
          <button
            onClick={handleRemove}
            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Area */}
      {!currentAssetUrl && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
              ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
              ${isUploading ? 'opacity-50 pointer-events-none' : ''}
            `}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              accept={acceptTypes.join(',')}
              className="hidden"
            />

            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 text-gray-400">
                {isUploading ? (
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                ) : (
                  <Upload className="w-12 h-12" />
                )}
              </div>

              <div className="text-sm">
                <span className="font-medium text-gray-700">{label}</span>
                <p className="text-xs text-gray-500 mt-1">
                  {acceptTypes.join(', ')} • Max {maxSize}MB
                </p>
              </div>

              {uploadError && (
                <div className="flex items-center justify-center gap-1 text-red-500 text-xs">
                  <AlertCircle className="w-3 h-3" />
                  {uploadError}
                </div>
              )}
            </div>
          </div>

          {/* URL Input Option */}
          <div className="relative">
            {showUrlInput ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  placeholder="https://example.com/image.png"
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleUrlSubmit}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setShowUrlInput(false);
                    setUrlInput('');
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowUrlInput(true)}
                className="w-full px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <Link className="w-4 h-4" />
                Or paste image URL
              </button>
            )}
          </div>
        </>
      )}

      {/* Replace Button (when asset exists) */}
      {currentAssetUrl && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Replace Image
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            accept={acceptTypes.join(',')}
            className="hidden"
          />
        </button>
      )}
    </div>
  );
};
