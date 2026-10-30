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
 *   3. a picture the author chose on an Inventory Management beat
 *      (itemImage) or on an add/remove inventory effect (effect.itemImage)
 *      — icon only, and only where 1 and 2 give none;
 *   4. the raw key, as the last resort.
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
  // Item pictures chosen on inventory beats and effects fill only the gaps
  // the pickProp walk left, so an existing prop graphic keeps winning.
  const fromInventory = new Map<string, string>();
  for (const beat of beats) {
    for (const [name, assetId] of inventoryImagesOf(beat)) {
      if (fromInventory.has(name)) continue;
      const url = resolveAssetUrl(assetId);
      if (url) fromInventory.set(name, url);
    }
  }
  for (const [name, url] of fromInventory) {
    if (!assets.has(name)) put(assets, name, url);
  }
  return { assets, labels, descriptions };
}

/**
 * [item name, image asset id] pairs a beat declares: its own itemImage when
 * it is an Inventory Management beat, plus every add/remove inventory effect
 * with an itemImage anywhere in its parameters or links (choices, dialog
 * nodes, random branches …). Not cached: the Preview Window edits beats in
 * place, and the walk is cheap next to a render.
 */
function inventoryImagesOf(beat: any): Array<[string, string]> {
  if (!beat || typeof beat !== 'object') return [];

  const found: Array<[string, string]> = [];
  const params = typeof beat.getParameters === 'function' ? beat.getParameters() : beat.parameters;
  if (beat.type === 'addRemoveInventory' && params?.item && params?.itemImage) {
    found.push([String(params.item), String(params.itemImage)]);
  }
  const seen = new Set<object>();
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 12 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    if ((node.type === 'addInventory' || node.type === 'removeInventory') && node.target && node.itemImage) {
      found.push([String(node.target), String(node.itemImage)]);
    }
    for (const key of Object.keys(node)) walk(node[key], depth + 1);
  };
  walk(params, 0);
  walk(beat.connections, 0);
  return found;
}

/**
 * The item records to show a character's items with: their own list first,
 * then the project's items (Characters ▸ Items), then every other
 * character's (stories often kept a "storage" character as a catalogue of
 * items that others pick up). The first record per name wins.
 */
export function itemCatalogFor(owner: any, characters: any[], projectItems: any[] = []): any[] {
  const own = Array.isArray(owner?.inventory) ? owner.inventory : [];
  const others = (characters || [])
    .filter((c: any) => c && c !== owner && c.id !== owner?.id)
    .flatMap((c: any) => (Array.isArray(c.inventory) ? c.inventory : []));
  return [...own, ...(Array.isArray(projectItems) ? projectItems : []), ...others];
}

/**
 * A character's item list with each picture as a URL this player can show:
 * the item's asset (assetId) first, else its stored icon. Builder blob URLs
 * are only valid in the builder's own windows, so exported players drop them.
 */
export function resolveItemDefinitionIcons(
  definitions: any[],
  resolveAssetUrl: (assetId: string) => string | undefined,
  options: { dropBlobUrls?: boolean } = {},
): any[] {
  return (definitions || []).map((def: any) => {
    const ref = def?.assetId || def?.iconAssetId;
    const fromAsset = ref ? resolveAssetUrl(ref) : undefined;
    const stored = typeof def?.icon === 'string' && def.icon && !(options.dropBlobUrls && def.icon.startsWith('blob:'))
      ? (resolveAssetUrl(def.icon) || def.icon)
      : '';
    return { ...def, icon: fromAsset || stored };
  });
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
