import React from 'react';
import { uiString } from '@asaps/core';

/**
 * ImageInputElement — the interactive surface of the inputImage beat.
 *
 * Lets the player pick a photo (file picker, or the OS camera via the
 * `capture` attribute on mobile), shows a preview, and submits the image
 * as a downscaled JPEG data URL. Downscaling happens here so the beat
 * never sees a 12 MB phone photo — vision APIs cap request size and
 * charge by resolution; ~1568px is plenty for analysis.
 *
 * onSubmit receives the data URL; onCancel fires when the player skips.
 */

/** Longest-edge target for the downscaled image. */
const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 0.85;

async function downscaleImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read image'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    // Re-encode as JPEG regardless of source format — normalizes HEIC-ish
    // browser decodes, strips EXIF, and keeps the payload small.
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface ImageInputElementProps {
  imageSource?: 'upload' | 'camera' | 'both';
  buttonText?: string;
  cancelButtonText?: string;
  onSubmit: (dataUrl: string) => void;
  onCancel: () => void;
  theme?: {
    buttonBg?: string;
    buttonText?: string;
    buttonBorder?: string;
  };
}

export const ImageInputElement: React.FC<ImageInputElementProps> = ({
  imageSource = 'both',
  buttonText = 'Analyze',
  cancelButtonText = 'Skip',
  onSubmit,
  onCancel,
  theme,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await downscaleImage(file);
      setPreview(dataUrl);
    } catch (e) {
      console.warn('[ImageInputElement] failed to process image:', e);
      setError(uiString('imageReadError'));
    } finally {
      setBusy(false);
    }
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 24px',
    borderRadius: 8,
    border: `1px solid ${theme?.buttonBorder ?? 'rgba(255,255,255,0.35)'}`,
    background: theme?.buttonBg ?? '#0a66c2',
    color: theme?.buttonText ?? '#ffffff',
    fontSize: 16,
    cursor: 'pointer',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: 'transparent',
    color: theme?.buttonText ?? '#ffffff',
    opacity: 0.85,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        width: 'min(90%, 480px)',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        // `capture` forces the OS camera on mobile; without it the picker
        // offers both camera and library. Desktop browsers ignore it.
        {...(imageSource === 'camera' ? { capture: 'environment' as const } : {})}
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          // Reset so re-selecting the same file fires onChange again.
          e.target.value = '';
        }}
      />

      {preview ? (
        <img
          src={preview}
          alt="Selected"
          onClick={() => !busy && fileInputRef.current?.click()}
          title={uiString('imageRetakeHint')}
          style={{
            maxWidth: '100%',
            maxHeight: '38vh',
            borderRadius: 12,
            border: '2px solid rgba(255,255,255,0.4)',
            cursor: 'pointer',
            objectFit: 'contain',
          }}
        />
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            maxHeight: '32vh',
            borderRadius: 12,
            border: '2px dashed rgba(255,255,255,0.4)',
            background: 'rgba(0,0,0,0.45)',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 40 }}>📸</span>
          <span>
            {busy
              ? uiString('imageProcessing')
              : imageSource === 'camera'
                ? uiString('imagePickCamera')
                : imageSource === 'upload'
                  ? uiString('imagePickUpload')
                  : uiString('imagePickBoth')}
          </span>
        </button>
      )}

      {error && (
        <div style={{ color: '#fca5a5', fontSize: 14, textAlign: 'center' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button style={secondaryButtonStyle} onClick={onCancel}>
          {cancelButtonText}
        </button>
        <button
          style={{
            ...buttonStyle,
            opacity: preview && !busy ? 1 : 0.5,
            cursor: preview && !busy ? 'pointer' : 'default',
          }}
          disabled={!preview || busy}
          onClick={() => preview && onSubmit(preview)}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};
