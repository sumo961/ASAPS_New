/**
 * What a character on the stage carries with it: its meters, its inventory
 * and its mood token, where those are set to sit at the character rather
 * than in a corner of the screen.
 *
 * The fixed canvas (PositionedBeatView) gets these as props. The responsive
 * stage draws its characters in a layer of its own, mounted from several
 * views, and drew none of them: a token or a meter attached to a character
 * was simply missing there. The renderer hands the lookups down once, here,
 * and that layer (ResponsiveCharacterLayer) reads them.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { PositionedBeatViewProps } from './PositionedBeatView';

export interface CharacterHudLookups {
  meters?: PositionedBeatViewProps['characterMeterFrameResolver'];
  inventory?: PositionedBeatViewProps['characterInventoryResolver'];
  mood?: PositionedBeatViewProps['characterMoodFrameResolver'];
  /** Inventories are shown (the player's Ctrl/Cmd+I toggle). */
  inventoryVisible?: boolean;
  /**
   * Told when the player switches inventories on or off, so the stage
   * follows at once. Without it the switch waited for the next screen.
   * Calls back straight away with the present state.
   */
  onSubscribeInventoryVisible?: (listener: (visible: boolean) => void) => () => void;
  /** Larger lettering on small screens, as on the fixed canvas. */
  fontScale?: number;
}

export const CharacterHudContext = createContext<CharacterHudLookups | null>(null);

/**
 * Whether inventories at a character are shown, kept up to date while a
 * screen stays up. Outside the renderer (the Visual Editor) there is nothing
 * to follow, and the caller's own value stands.
 */
export function useInventoryVisible(fallback: boolean): boolean {
  const huds = useContext(CharacterHudContext);
  const subscribe = huds?.onSubscribeInventoryVisible;
  const [live, setLive] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!subscribe) {
      setLive(undefined);
      return;
    }
    return subscribe(setLive);
  }, [subscribe]);
  return live ?? huds?.inventoryVisible ?? fallback;
}
