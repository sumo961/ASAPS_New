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
import { createContext } from 'react';
import type { PositionedBeatViewProps } from './PositionedBeatView';

export interface CharacterHudLookups {
  meters?: PositionedBeatViewProps['characterMeterFrameResolver'];
  inventory?: PositionedBeatViewProps['characterInventoryResolver'];
  mood?: PositionedBeatViewProps['characterMoodFrameResolver'];
  /** Inventories are shown (the player's Ctrl/Cmd+I toggle). */
  inventoryVisible?: boolean;
  /** Larger lettering on small screens, as on the fixed canvas. */
  fontScale?: number;
}

export const CharacterHudContext = createContext<CharacterHudLookups | null>(null);
