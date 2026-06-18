/**
 * AsapsQRGenerator — small inspector panel that renders a QR code for
 * an `asaps://` URI. Authors compose the URI by picking an action kind
 * + target; the panel re-renders the QR live and exposes copy/download
 * actions so the author can print stickers without leaving the editor.
 *
 * Lives in the qrScan beat inspector (and is reusable from any context
 * that needs a "share this beat as a QR" affordance — e.g. a beat node
 * context menu later).
 */
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { formatAsapsUri, type AsapsAction } from '@asaps/core';

interface BeatOption {
  id: string;
  name?: string;
  type?: string;
}

interface Props {
  /** Story beats — the author picks a target from this list when the
   *  action kind is 'beat'. The shape is intentionally minimal so any
   *  caller can pass whatever the surrounding inspector already has. */
  beats?: BeatOption[];
  /** Initial action (e.g. pre-filled to the surrounding beat's id). */
  initial?: AsapsAction;
  /** Beat IDs the surrounding qrScan beat has declared as QR-jump targets
   *  (`parameters.qrJumpTargets`). When provided alongside onJumpTargetsChange,
   *  the panel shows a "track in flowchart" affordance so these otherwise-
   *  invisible jumps render as dashed edges. */
  jumpTargets?: string[];
  onJumpTargetsChange?: (targets: string[]) => void;
}

type ActionKind = AsapsAction['kind'];

export const AsapsQRGenerator: React.FC<Props> = ({ beats = [], initial, jumpTargets, onJumpTargetsChange }) => {
  const beatLabel = (id: string) => {
    const b = beats.find((x) => x.id === id);
    return b ? `${b.name || b.id}${b.type ? ` (${b.type})` : ''}` : id;
  };
  const tracked = jumpTargets ?? [];
  const canTrack = !!onJumpTargetsChange;
  const [kind, setKind] = useState<ActionKind>(initial?.kind ?? 'beat');
  const [beatTarget, setBeatTarget] = useState(initial?.kind === 'beat' ? initial.target : '');
  const [variableName, setVariableName] = useState(initial?.kind === 'variable' ? initial.name : '');
  const [variableValue, setVariableValue] = useState(initial?.kind === 'variable' ? initial.value : '');
  const [inventoryOp, setInventoryOp] = useState<'add' | 'remove'>(initial?.kind === 'inventory' ? initial.op : 'add');
  const [inventoryItem, setInventoryItem] = useState(initial?.kind === 'inventory' ? initial.item : '');
  const [eventName, setEventName] = useState(initial?.kind === 'event' ? initial.name : '');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  // Compose the current action and URI string. Returns null when the
  // user hasn't filled in enough to make a valid URI (e.g. no beat
  // selected) — render path then shows a hint instead of a QR.
  const action = React.useMemo<AsapsAction | null>(() => {
    switch (kind) {
      case 'beat':
        return beatTarget ? { kind: 'beat', target: beatTarget } : null;
      case 'variable':
        return variableName ? { kind: 'variable', name: variableName, value: variableValue } : null;
      case 'inventory':
        return inventoryItem ? { kind: 'inventory', op: inventoryOp, item: inventoryItem } : null;
      case 'event':
        return eventName ? { kind: 'event', name: eventName } : null;
    }
  }, [kind, beatTarget, variableName, variableValue, inventoryOp, inventoryItem, eventName]);

  const uri = action ? formatAsapsUri(action) : null;

  // Render QR whenever the URI changes. We render at a generous size
  // (300px) — the canvas downscales for the inspector but a clicked
  // download gives the author a sharp printable PNG.
  useEffect(() => {
    if (!uri || !canvasRef.current) {
      setDataUrl(null);
      return;
    }
    const canvas = canvasRef.current;
    QRCode.toCanvas(canvas, uri, { width: 300, margin: 2, errorCorrectionLevel: 'M' }, err => {
      if (err) {
        console.warn('[AsapsQRGenerator] render failed', err);
        setDataUrl(null);
        return;
      }
      try { setDataUrl(canvas.toDataURL('image/png')); }
      catch { setDataUrl(null); }
    });
  }, [uri]);

  const copyUri = async () => {
    if (!uri) return;
    try { await navigator.clipboard.writeText(uri); }
    catch (err) { console.warn('[AsapsQRGenerator] clipboard write failed', err); }
  };
  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    const safe = uri?.replace(/[^a-z0-9]/gi, '_').slice(0, 40) || 'asaps-qr';
    a.download = `${safe}.png`;
    a.click();
  };

  return (
    <div className="border border-gray-200 rounded p-3 bg-gray-50 text-sm">
      <div className="font-semibold text-gray-800 mb-2">📷 Generate QR for asaps:// link</div>
      <div className="text-xs text-gray-600 mb-3">
        Pick an action; the QR encodes <code>asaps://...</code> so any qrScan
        beat with <em>Interpret asaps:// URIs</em> on will apply it directly.
      </div>

      <label className="block mb-2">
        <span className="text-xs text-gray-700">Action</span>
        <select
          value={kind}
          onChange={e => setKind(e.target.value as ActionKind)}
          className="block w-full mt-1 border border-gray-300 rounded p-1"
        >
          <option value="beat">Jump to beat</option>
          <option value="variable">Set variable</option>
          <option value="inventory">Inventory add / remove</option>
          <option value="event">Fire event</option>
        </select>
      </label>

      {kind === 'beat' && (
        <label className="block mb-2">
          <span className="text-xs text-gray-700">Target beat</span>
          <select
            value={beatTarget}
            onChange={e => setBeatTarget(e.target.value)}
            className="block w-full mt-1 border border-gray-300 rounded p-1"
          >
            <option value="">Select beat…</option>
            {beats.map(b => (
              <option key={b.id} value={b.id}>
                {b.name || b.id} {b.type ? `(${b.type})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Flowchart-tracking for "Jump to beat" QRs. A printed asaps://beat/<id>
          code overrides this beat's Target Beat at runtime but is invisible to
          the flowchart — tracking it here draws a dashed "QR" edge so the jump
          is visible to authors. Tracking is optional and editor-only. */}
      {kind === 'beat' && canTrack && (
        <div className="mb-2 rounded border border-purple-200 bg-purple-50 p-2">
          <div className="text-xs text-purple-900 mb-1">
            Show this jump in the flowchart (dashed <span className="font-mono">QR</span> edge)
          </div>
          <button
            type="button"
            disabled={!beatTarget || tracked.includes(beatTarget)}
            onClick={() => onJumpTargetsChange!([...tracked, beatTarget])}
            className="px-2 py-1 text-xs border border-purple-300 rounded bg-white hover:bg-purple-100 disabled:opacity-50"
          >
            {beatTarget && tracked.includes(beatTarget) ? '✓ Tracked' : '➕ Track this jump'}
          </button>
          {tracked.length > 0 && (
            <ul className="mt-2 space-y-1">
              {tracked.map(t => (
                <li key={t} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-gray-700">↪ {beatLabel(t)}</span>
                  <button
                    type="button"
                    onClick={() => onJumpTargetsChange!(tracked.filter(x => x !== t))}
                    className="px-1 text-purple-700 hover:text-purple-900"
                    title="Stop tracking this jump"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {kind === 'variable' && (
        <>
          <label className="block mb-2">
            <span className="text-xs text-gray-700">Variable name</span>
            <input
              type="text"
              value={variableName}
              onChange={e => setVariableName(e.target.value)}
              className="block w-full mt-1 border border-gray-300 rounded p-1"
              placeholder="e.g. userName"
            />
          </label>
          <label className="block mb-2">
            <span className="text-xs text-gray-700">Value</span>
            <input
              type="text"
              value={variableValue}
              onChange={e => setVariableValue(e.target.value)}
              className="block w-full mt-1 border border-gray-300 rounded p-1"
              placeholder="e.g. Alice"
            />
          </label>
        </>
      )}

      {kind === 'inventory' && (
        <>
          <label className="block mb-2">
            <span className="text-xs text-gray-700">Operation</span>
            <select
              value={inventoryOp}
              onChange={e => setInventoryOp(e.target.value as 'add' | 'remove')}
              className="block w-full mt-1 border border-gray-300 rounded p-1"
            >
              <option value="add">Add</option>
              <option value="remove">Remove</option>
            </select>
          </label>
          <label className="block mb-2">
            <span className="text-xs text-gray-700">Item</span>
            <input
              type="text"
              value={inventoryItem}
              onChange={e => setInventoryItem(e.target.value)}
              className="block w-full mt-1 border border-gray-300 rounded p-1"
              placeholder="e.g. key"
            />
          </label>
        </>
      )}

      {kind === 'event' && (
        <label className="block mb-2">
          <span className="text-xs text-gray-700">Event name</span>
          <input
            type="text"
            value={eventName}
            onChange={e => setEventName(e.target.value)}
            className="block w-full mt-1 border border-gray-300 rounded p-1"
            placeholder="e.g. cluePickedUp"
          />
        </label>
      )}

      <div className="mt-3 flex flex-col items-center">
        {uri ? (
          <>
            <canvas ref={canvasRef} className="border border-gray-300 rounded" />
            <code className="mt-2 text-xs break-all text-center bg-white border border-gray-200 rounded px-2 py-1 w-full">
              {uri}
            </code>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={copyUri}
                className="px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-100"
              >
                📋 Copy URI
              </button>
              <button
                type="button"
                onClick={downloadPng}
                disabled={!dataUrl}
                className="px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-50"
              >
                ⬇ Download PNG
              </button>
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500 italic py-3">
            Fill in the fields above to render a QR code.
          </div>
        )}
      </div>
    </div>
  );
};

export default AsapsQRGenerator;
