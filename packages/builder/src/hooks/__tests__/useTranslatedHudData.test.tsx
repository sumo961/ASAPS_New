import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, render } from '@testing-library/react';
import { ScreenHudLayer, buildScreenHudLayout, resolveMeterFrame, toMeterCounterData, TimerHudDisplay } from '@asaps/renderer';
// Not among the renderer's exports; PositionedBeatView draws it from the config the editor passes.
import { CountdownMeterHud } from '../../../../renderer/src/components/CountdownMeterHud';
import { extractTranslatableStrings, positionalToIdBased } from '../../export/StoryTranslator';

const state = vi.hoisted(() => ({ activeLanguage: null as string | null, translations: [] as any[] }));
vi.mock('../../contexts/TranslationContext', () => ({ useTranslationState: () => state }));

import { useTranslatedHudData } from '../useTranslatedHudData';

const characters = [{
  id: 'c1', name: 'Red', displayName: 'Red',
  counters: [{ name: 'trust', displayName: 'Trust', visible: true, showLevelMeter: true, min: 0, max: 10, bands: [{ label: 'Wary' }, { label: 'Friendly' }] }],
  meterFrame: { dockMode: 'screen', screenPosition: 'top-left' },
  inventoryFrame: { dockMode: 'screen', screenPosition: 'top-right', anchor: 'top', offset: { x: 0, y: 0 }, style: 'grid', itemSize: 48, columns: 2, itemSpacing: 4, showLabels: true, showOnDemand: false },
  inventory: [{ id: 'i1', name: 'basket', displayName: 'Basket', quantity: 1 }, { id: 'i2', name: 'Cake' }],
}];
const globalSettings = {
  hudOverlays: {
    timerHud: { enabled: true, showLabel: true, label: 'Time left', staticText: 'Waiting' },
    countdownMeter: { enabled: true, showLabel: true, label: 'Daylight' },
  },
};

/** A German resource for the project above: every string as "DE <source>". */
function germanResource() {
  const projectData = { project: { story: { beats: [], characters }, globalSettings } };
  const source = extractTranslatableStrings(projectData);
  const strings: Record<string, any> = {};
  for (const [key, value] of Object.entries(positionalToIdBased(source, projectData))) {
    strings[key] = { value: `DE ${value}`, source: value, status: 'translated' };
  }
  return { languageCode: 'de', languageName: 'German', strings };
}

describe('useTranslatedHudData', () => {
  beforeEach(() => { state.activeLanguage = null; state.translations = []; });

  it('returns the project as written while the source language is shown', () => {
    state.translations = [germanResource()];
    const { result } = renderHook(() => useTranslatedHudData(characters, globalSettings));
    expect(result.current.hudCharacters).toBe(characters);
    expect(result.current.hudGlobalSettings).toBe(globalSettings);
  });

  it('gives every HUD panel its words in the chosen language', () => {
    state.activeLanguage = 'de';
    state.translations = [germanResource()];
    const { result } = renderHook(() => useTranslatedHudData(characters, globalSettings));
    const [red] = result.current.hudCharacters as any[];
    // Meter panel: the character, the counter, its band labels
    expect(red.displayName).toBe('DE Red');
    expect(red.counters[0].displayName).toBe('DE Trust');
    expect(red.counters[0].bands.map((b: any) => b.label)).toEqual(['DE Wary', 'DE Friendly']);
    // Inventory panel: items, also one that only has a name
    expect(red.inventory.map((i: any) => i.displayName)).toEqual(['DE Basket', 'DE Cake']);
    // Timer and countdown panels
    const overlays = (result.current.hudGlobalSettings as any).hudOverlays;
    expect(overlays.timerHud.label).toBe('DE Time left');
    expect(overlays.timerHud.staticText).toBe('DE Waiting');
    expect(overlays.countdownMeter.label).toBe('DE Daylight');
    // A counter's name is a key and stays; the project itself is not touched
    expect(red.counters[0].name).toBe('trust');
    expect(characters[0].name).toBe('Red');
    expect(characters[0].displayName).toBe('Red');
    expect(globalSettings.hudOverlays.timerHud.label).toBe('Time left');
  });

  it('draws the panels with those words', () => {
    state.activeLanguage = 'de';
    state.translations = [germanResource()];
    const { result } = renderHook(() => useTranslatedHudData(characters, globalSettings));
    const overlays = (result.current.hudGlobalSettings as any).hudOverlays;
    // Assembled as the Visual Editor assembles them
    const hudChars = (result.current.hudCharacters as any[]).map((c) => ({
      id: c.id,
      name: c.displayName || c.name,
      meterFrame: resolveMeterFrame(c),
      counters: c.counters.filter((k: any) => k.visible).map((k: any) => toMeterCounterData(k, c.id, null)),
      inventoryFrame: c.inventoryFrame,
      inventoryItems: c.inventory.map((it: any) => ({ id: it.id, name: it.name, displayName: it.displayName || it.name, description: '', icon: '', quantity: 1, category: '' })),
    }));
    const stage = { width: 1024, height: 768 };
    const layout = buildScreenHudLayout({ characters: hudChars, hudOverlays: overlays, stage });
    const { container } = render(
      <div>
        <ScreenHudLayer layout={layout} stage={stage} />
        <TimerHudDisplay visible config={{ ...overlays.timerHud, position: 'top-right', style: 'digital', fontSize: 16 }} remainingTime={45} totalTime={60} />
        <CountdownMeterHud visible config={{ ...overlays.countdownMeter, position: 'top-center', meterWidth: 40, meterHeight: 10 }} counterValue={65} />
      </div>,
    );
    const text = container.textContent ?? '';
    for (const words of ['DE Red', 'DE Trust', 'DE Basket', 'DE Cake', 'DE Time left', 'DE Daylight']) expect(text).toContain(words);
    // …and nowhere in the original language
    expect(text.replace(/DE (Red|Trust|Wary|Friendly|Basket|Cake|Time left|Waiting|Daylight)/g, '')).not.toMatch(/Red|Trust|Basket|Cake|Time left|Daylight/);
  });
});
