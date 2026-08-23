/**
 * Runtime inventory → HUD item data, defined ONCE for every player surface
 * (Preview Window and the exported web player).
 *
 * A picked-up item lives in the runtime store as a bare MATCHING KEY
 * ('knife'). What the player should SEE comes from, in order:
 *   1. the character's authored item record (displayName/description/icon) —
 *      translated through the character translation path;
 *   2. the granting pickProp beat's prop displayName/description — which the
 *      translation flow extracts and applies per language
 *      (beat:N.parameters.props.M.displayName), plus its asset for the icon;
 *   3. the raw key, as the last resort.
 * The item NAME always stays the untranslated matching key — conditions and
 * add/remove effects target it.
 */
import type { InventoryItemData } from '../components/CharacterInventoryFrame';

export interface RuntimeInventoryEntry {
  name: string;
  quantity: number;
}

interface PropHarvest {
  assets: Map<string, string>;
  labels: Map<string, string>;
  descriptions: Map<string, string>;
}

/** Walk pickProp beats once, harvesting icons + display labels by prop name. */
export function harvestPickPropData(
  beats: Iterable<any>,
  resolveAssetUrl: (assetId: string) => string | undefined,
): PropHarvest {
  const assets = new Map<string, string>();
  const labels = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const put = (map: Map<string, string>, name: string, value: string) => {
    map.set(name, value);
    map.set(name.toLowerCase(), value);
  };

  for (const beat of beats) {
    if (beat?.type !== 'pickProp') continue;
    for (const prop of ((beat as any).props || [])) {
      if (!prop?.name) continue;
      const label = prop.displayName || prop.displayText;
      if (label) put(labels, prop.name, label);
      if (prop.description) put(descriptions, prop.name, prop.description);
      if (prop.assetId) {
        const url = resolveAssetUrl(prop.assetId);
        if (url) put(assets, prop.name, url);
      }
    }
    // Prop graphics may live on the beat's locations instead
    const locations = Array.from((beat as any).locations?.values?.() || []);
    for (const loc of locations as any[]) {
      if (loc?.kind === 'prop' && loc.name && loc.assetId) {
        const url = resolveAssetUrl(loc.assetId);
        if (url) put(assets, loc.name, url);
      }
    }
  }
  return { assets, labels, descriptions };
}

/** Resolve runtime inventory entries into renderable HUD items. */
export function buildRuntimeInventoryItems(
  runtimeInventory: RuntimeInventoryEntry[],
  itemDefinitions: any[],
  harvest: PropHarvest,
): InventoryItemData[] {
  const lookup = (map: Map<string, string>, name: string) =>
    map.get(name) ?? map.get(name.toLowerCase()) ?? '';

  return runtimeInventory.map((entry) => {
    const definition = itemDefinitions.find((def: any) => def?.name === entry.name);
    if (definition) {
      return {
        id: definition.id,
        name: definition.name,
        displayName: definition.displayName,
        description: definition.description || '',
        icon: definition.icon || lookup(harvest.assets, entry.name),
        quantity: entry.quantity,
        category: definition.category || '',
      };
    }
    return {
      id: entry.name,
      name: entry.name,
      displayName: lookup(harvest.labels, entry.name) || entry.name,
      description: lookup(harvest.descriptions, entry.name),
      icon: lookup(harvest.assets, entry.name),
      quantity: entry.quantity,
      category: '',
    };
  });
}
