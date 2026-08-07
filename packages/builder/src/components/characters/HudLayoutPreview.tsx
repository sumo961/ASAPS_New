/**
 * HudLayoutPreview — a schematic map of where this character's screen-docked
 * HUDs land, packed by the SAME layout authority the runtime uses
 * (layoutScreenHuds). It also draws the global timer / countdown HUDs from
 * General Settings as reserved obstacles, so an author configuring a mood /
 * meter / inventory frame can see it flow clear of the global chrome before
 * ever opening the preview.
 *
 * This is a diagram, not a full render: each HUD is a labelled rectangle at
 * its packed position. Global HUDs are drawn dashed/muted ("from General
 * Settings"); this character's frames are solid and accented.
 */
import React from 'react';
import { layoutScreenHuds, placementMap, type HudBox, type HudCorner } from '@asaps/renderer';
import type { Character } from '../../types/character';

/** Minimal shape of the global-settings HUD overlay config we read. */
export interface HudOverlaySettings {
  timerHud?: { enabled?: boolean; position?: string; label?: string };
  countdownMeter?: { enabled?: boolean; position?: string; meterWidth?: number };
}

interface HudLayoutPreviewProps {
  character: Character;
  hudOverlays?: HudOverlaySettings;
  /** Reference stage the runtime packs against (defaults to 960×600). */
  stage?: { width: number; height: number };
}

const toCorner = (s?: string): HudCorner =>
  ((s || 'top-left').replace('screen-', '') as HudCorner);

// Preview canvas size; the reference stage is scaled to fit inside it.
const CANVAS_W = 280;
const CANVAS_H = 175;

const KIND_COLORS: Record<string, { fill: string; text: string }> = {
  timer: { fill: '#64748b', text: '#f8fafc' },
  countdown: { fill: '#64748b', text: '#f8fafc' },
  meter: { fill: '#3b82f6', text: '#ffffff' },
  inventory: { fill: '#a855f7', text: '#ffffff' },
  mood: { fill: '#f59e0b', text: '#201607' },
};

const KIND_LABEL: Record<string, string> = {
  timer: 'Timer', countdown: 'Countdown', meter: 'Meters',
  inventory: 'Inventory', mood: 'Mood',
};

export const HudLayoutPreview: React.FC<HudLayoutPreviewProps> = ({
  character, hudOverlays, stage = { width: 960, height: 600 },
}) => {
  const boxes: HudBox[] = [];
  const globalIds = new Set<string>();

  // Global obstacles from General Settings.
  if (hudOverlays?.timerHud?.enabled) {
    boxes.push({ id: '__timer', corner: toCorner(hudOverlays.timerHud.position), width: 150, height: 40, kind: 'timer' });
    globalIds.add('__timer');
  }
  if (hudOverlays?.countdownMeter?.enabled) {
    boxes.push({
      id: '__countdown', corner: toCorner(hudOverlays.countdownMeter.position),
      width: Math.round(stage.width * ((hudOverlays.countdownMeter.meterWidth ?? 60) / 100)),
      height: 34, kind: 'countdown',
    });
    globalIds.add('__countdown');
  }

  // This character's screen-docked frames.
  const mf: any = (character as any).moodFrame;
  if (mf?.enabled && mf.dockMode === 'screen') {
    boxes.push({ id: 'mood', corner: toCorner(mf.screenPosition), width: 150, height: 48, kind: 'mood' });
  }
  const meter: any = (character as any).meterFrame;
  if (meter?.dockMode === 'screen') {
    const n = ((character as any).counters || []).filter((k: any) => k.visible).length;
    if (n > 0) {
      boxes.push({ id: 'meter', corner: toCorner(meter.screenPosition), width: meter.width ?? 150, height: 20 + n * 20, kind: 'meter' });
    }
  }
  const inv: any = (character as any).inventoryFrame;
  if (inv?.dockMode === 'screen') {
    const n = ((character as any).inventory || []).length;
    if (n > 0) {
      const cols = Math.max(1, inv.columns ?? 4);
      const rows = Math.ceil(n / cols);
      boxes.push({ id: 'inventory', corner: toCorner(inv.screenPosition), width: (inv.itemSize ?? 36) * cols + 24, height: 30 + rows * 40, kind: 'inventory' });
    }
  }

  const scale = Math.min(CANVAS_W / stage.width, CANVAS_H / stage.height);
  const stageW = stage.width * scale;
  const stageH = stage.height * scale;
  const place = placementMap(layoutScreenHuds(boxes, stage));
  const characterBoxes = boxes.filter((b) => !globalIds.has(b.id));

  return (
    <div>
      <div
        style={{
          position: 'relative',
          width: stageW,
          height: stageH,
          margin: '0 auto',
          background: 'repeating-linear-gradient(45deg, #1b1f2b, #1b1f2b 8px, #191d28 8px, #191d28 16px)',
          border: '1px solid #3d4356',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {boxes.map((b) => {
          const p = place.get(b.id);
          if (!p) return null;
          const isGlobal = globalIds.has(b.id);
          const c = KIND_COLORS[b.kind];
          return (
            <div
              key={b.id}
              title={isGlobal ? `${KIND_LABEL[b.kind]} (from General Settings)` : KIND_LABEL[b.kind]}
              style={{
                position: 'absolute',
                left: p.left * scale,
                top: p.top * scale,
                width: Math.max(18, b.width * scale),
                height: Math.max(10, b.height * scale),
                background: isGlobal ? 'transparent' : c.fill,
                border: isGlobal ? `1px dashed ${c.fill}` : `1px solid ${c.fill}`,
                borderRadius: 3,
                color: isGlobal ? c.fill : c.text,
                fontSize: 8,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {KIND_LABEL[b.kind]}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
        {characterBoxes.length === 0 ? (
          <span>No screen-docked HUDs for this character yet.</span>
        ) : globalIds.size > 0 ? (
          <span>Solid = this character · dashed = General Settings HUDs (reserved)</span>
        ) : (
          <span>Screen-docked HUDs, packed to avoid overlap</span>
        )}
      </div>
    </div>
  );
};
