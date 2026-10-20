/**
 * One image asset as a small field: thumbnail, name, choose/change, clear.
 * Stores the asset id. Used for inventory item pictures on the Inventory
 * Management beat and on add/remove inventory effects, and for any schema
 * parameter whose ui.control is 'asset-picker' with an image accept.
 */
import React, { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { AssetSelectionModal } from './AssetSelectionModal';
import { useProjectAssets } from '../../contexts/ProjectAssetsContext';

interface ImageAssetFieldProps {
  value?: string;
  onChange: (assetId: string | undefined) => void;
  /** Button text when nothing is chosen. */
  chooseLabel?: string;
  modalTitle?: string;
  title?: string;
  compact?: boolean;
  testId?: string;
  /** Which pictures the chooser lists ('prop' by default; null = every image). */
  assetSubType?: string | null;
}

export const ImageAssetField: React.FC<ImageAssetFieldProps> = ({
  value,
  onChange,
  chooseLabel = 'Choose picture…',
  modalTitle = 'Choose a picture',
  title,
  compact = false,
  testId,
  assetSubType = 'prop',
}) => {
  const { assets, onAssetAdd } = useProjectAssets();
  const [open, setOpen] = useState(false);
  const asset = value ? assets.find((a) => a.id === value) : undefined;
  const url = asset?.url || (value && /[/:]/.test(value) ? value : undefined);
  const size = compact ? 'w-6 h-6' : 'w-9 h-9';

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" data-testid={testId} title={title}>
      {value && (
        <span className={`${size} rounded border bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0`}>
          {url ? <img src={url} alt="" className="w-full h-full object-contain" /> : <ImageIcon className="w-3 h-3 text-gray-400" />}
        </span>
      )}
      {value && !compact && (
        <span className="text-xs text-gray-600 truncate max-w-[10rem]">{asset?.name || 'Missing picture'}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-1.5 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 flex-shrink-0"
      >
        {!value && <ImageIcon className="w-3 h-3" />}
        {value ? 'Change' : chooseLabel}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="px-0.5 text-gray-400 hover:text-red-600 flex-shrink-0"
          title="Remove the picture"
          aria-label="Remove the picture"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {open && (
        <AssetSelectionModal
          isOpen
          onClose={() => setOpen(false)}
          onSelect={(picked) => {
            onChange(picked.id);
            setOpen(false);
          }}
          assets={assets}
          onAssetAdd={onAssetAdd ?? (async () => false)}
          assetType="image"
          assetSubType={assetSubType ?? undefined}
          title={modalTitle}
        />
      )}
    </span>
  );
};
