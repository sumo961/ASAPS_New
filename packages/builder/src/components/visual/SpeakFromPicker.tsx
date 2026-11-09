/**
 * "Speech bubble points at": where a placed character speaks from, chosen by
 * clicking (or dragging) on their picture. Stored on the placed character as
 * fractions of its box (Location.speakFrom); the renderer mirrors it when the
 * character is flipped. Unset, a bubble points at the middle of the picture
 * near its top.
 */
import React from 'react';
import { RotateCw } from 'lucide-react';

const DEFAULT_POINT = { x: 0.5, y: 0.15 };

export const SpeakFromPicker: React.FC<{
  /** The character's picture (a sprite sheet shows as a plain frame instead). */
  imageUrl?: string;
  /** For a sprite character: the frame's proportions. */
  frameAspect?: number;
  value?: { x: number; y: number };
  onChange: (next: { x: number; y: number } | undefined) => void;
}> = ({ imageUrl, frameAspect, value, onChange }) => {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const point = value ?? DEFAULT_POINT;

  const pick = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    onChange({ x: round((clientX - box.left) / box.width), y: round((clientY - box.top) / box.height) });
  };

  return (
    <div data-testid="speak-from-picker">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-700">Speech bubble points at</label>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          disabled={!value}
          title="Back to the top of the picture"
          className="text-gray-400 hover:text-blue-600 disabled:opacity-0"
        >
          <RotateCw className="w-3 h-3" />
        </button>
      </div>
      <div
        ref={boxRef}
        role="slider"
        aria-label="Where the speech bubble points on this character"
        aria-valuetext={`${Math.round(point.x * 100)}% across, ${Math.round(point.y * 100)}% down`}
        tabIndex={0}
        className="relative mx-auto cursor-crosshair select-none border border-gray-300 rounded bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] bg-[length:12px_12px]"
        style={{ width: 120, ...(imageUrl ? {} : { aspectRatio: String(frameAspect || 0.5) }) }}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); pick(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (dragging.current) pick(e.clientX, e.clientY); }}
        onPointerUp={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const d = move[e.key];
          if (!d) return;
          e.preventDefault();
          const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
          onChange({ x: clamp(point.x + d[0]), y: clamp(point.y + d[1]) });
        }}
      >
        {imageUrl && <img src={imageUrl} alt="" draggable={false} className="block w-full h-auto pointer-events-none" />}
        <span
          aria-hidden
          className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white bg-red-500 shadow pointer-events-none"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        Click the mouth or head. Used when Project Settings ▸ Speaker Display shows lines as speech bubbles; a flipped character points at the mirrored spot.
      </p>
    </div>
  );
};
