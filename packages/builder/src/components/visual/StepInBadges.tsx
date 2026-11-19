/**
 * "Step in →" badges on a Dialog Tree's replies in the Visual Editor.
 *
 * A reply that has a next line gets a badge at its top right corner; a click
 * on the badge shows that line on the canvas. A click on the reply itself
 * never steps in: on the fixed canvas it selects the reply's button, and a
 * reply can't be both selected and followed by the same click. One rule for
 * buttons and for replies listed in a bubble, on both canvases; hotspots
 * have had the same badge all along (HotspotEditOverlay).
 *
 * The replies are drawn by the story's own renderer, so the badges are found
 * on the stage rather than laid out: `findTargets` names the elements, this
 * layer follows them as the stage changes. Mount it inside a positioned
 * element that contains the stage; it covers that element.
 */

import React, { useEffect, useRef, useState } from 'react';

export interface StepInTarget {
  key: string;
  /** The reply as drawn: a button, or a line in the reply bubble. */
  node: Element;
  onStep: () => void;
}

interface Props {
  /** The replies that have a next line, among the elements under `host`. */
  findTargets: (host: HTMLElement) => StepInTarget[];
  zIndex?: number;
}

interface Badge { key: string; x: number; y: number }

const hidden = (node: Element): boolean => {
  for (let n: Element | null = node; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return true;
    if (n.hasAttribute('data-stage')) break;
  }
  return false;
};

export const StepInBadges: React.FC<Props> = ({ findTargets, zIndex = 10001 }) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const findRef = useRef(findTargets);
  findRef.current = findTargets;
  const stepsRef = useRef(new Map<string, () => void>());
  const [badges, setBadges] = useState<Badge[]>([]);
  const [scale, setScale] = useState(1);
  const measureRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;

    const measure = () => {
      const box = layer.getBoundingClientRect();
      // The host may be drawn scaled (a device preview fitted to the window).
      const s = layer.offsetWidth > 0 ? box.width / layer.offsetWidth || 1 : 1;
      const steps = new Map<string, () => void>();
      const next: Badge[] = [];
      for (const target of findRef.current(host)) {
        const r = target.node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || hidden(target.node)) continue;
        steps.set(target.key, target.onStep);
        next.push({ key: target.key, x: (r.right - box.left) / s, y: (r.top - box.top) / s });
      }
      stepsRef.current = steps;
      setScale((prev) => (Math.abs(prev - s) < 0.001 ? prev : s));
      setBadges((prev) => (
        prev.length === next.length && prev.every((b, i) => b.key === next[i].key && Math.abs(b.x - next[i].x) < 0.5 && Math.abs(b.y - next[i].y) < 0.5)
          ? prev
          : next
      ));
    };

    measureRef.current = measure;
    measure();
    const mutations = new MutationObserver((records) => {
      // The badges themselves change with every measure: only the stage counts.
      if (records.some((record) => !layer.contains(record.target))) measure();
    });
    mutations.observe(host, { childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: ['style', 'class', 'hidden', 'data-speech-bubble'] });
    const resizes = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resizes?.observe(host);
    window.addEventListener('resize', measure);
    // A reply that fades or slides in changes nothing in the DOM while it
    // moves: measure again where it comes to rest.
    const settled = ['animationend', 'transitionend'] as const;
    settled.forEach((type) => host.addEventListener(type, measure));
    return () => {
      settled.forEach((type) => host.removeEventListener(type, measure));
      measureRef.current = null;
      mutations.disconnect();
      resizes?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Which replies exist changed (another line stepped into) before the stage did.
  const host = layerRef.current?.parentElement;
  const signature = host ? findTargets(host).map((t) => t.key).join('\u0000') : '';
  useEffect(() => { measureRef.current?.(); }, [signature]);

  return (
    <div ref={layerRef} data-step-in-layer="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex }}>
      {badges.map((badge) => (
        <button
          key={badge.key}
          type="button"
          data-step-in={badge.key}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            stepsRef.current.get(badge.key)?.();
          }}
          title="Show the line that follows this reply"
          style={{
            position: 'absolute',
            left: badge.x,
            top: badge.y,
            // Sits on the reply's top right corner, the same size at any zoom.
            transform: `translate(-100%, -60%) scale(${1 / scale})`,
            transformOrigin: '100% 60%',
            fontSize: 10,
            lineHeight: '14px',
            whiteSpace: 'nowrap',
            background: 'rgba(59, 130, 246, 0.95)',
            color: '#fff',
            padding: '1px 6px',
            borderRadius: 3,
            border: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
        >
          Step in →
        </button>
      ))}
    </div>
  );
};
