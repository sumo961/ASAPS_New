export interface VisualElement {
  id: string;
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog' | 'button';
  assetId?: string;
  text?: string;
  speaker?: string; // For dialog elements
  choices?: string[]; // For dialog choices
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  visible: boolean;
  locked: boolean;
  name: string;
  sound?: string; // Sound effect for clickable elements
}
