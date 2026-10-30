/**
 * Colours of the two character pads (MoodPad, StancePad). They draw with
 * SVG attributes and inline styles, which dark mode's stylesheet can't reach,
 * so each pad picks its set with useIsDark().
 */
export interface PadColors {
  background: string;
  frame: string;
  frameStroke: string;
  circle: string;
  circleStroke: string;
  axis: string;
  /** Opacity of the pale quadrant tints. */
  tintOpacity: number;
  /** Axis and marker labels. */
  label: string;
  /** Stronger labels (StancePad's axes) and readouts. */
  labelStrong: string;
  /** The dot and the ring around it. */
  dot: string;
  dotRing: string;
  /** Emotion markers (MoodPad). */
  marker: string;
  markerText: string;
  /** StancePad's quadrant names: hostile, leading, withdrawn, cooperative. */
  quadrants: [string, string, string, string];
}

const LIGHT: PadColors = {
  background: '#fafafa',
  frame: '#ffffff',
  frameStroke: '#e5e7eb',
  circle: '#fafafa',
  circleStroke: '#d1d5db',
  axis: '#9ca3af',
  tintOpacity: 0.25,
  label: '#6b7280',
  labelStrong: '#4b5563',
  dot: '#111827',
  dotRing: '#ffffff',
  marker: '#a78bfa',
  markerText: '#6d28d9',
  quadrants: ['#b91c1c', '#b45309', '#1d4ed8', '#15803d'],
};

const DARK: PadColors = {
  background: '#111827',
  frame: '#1f2937',
  frameStroke: '#374151',
  circle: '#111827',
  circleStroke: '#4b5563',
  axis: '#6b7280',
  tintOpacity: 0.07,
  label: '#9ca3af',
  labelStrong: '#d1d5db',
  dot: '#f9fafb',
  dotRing: '#111827',
  marker: '#a78bfa',
  markerText: '#c4b5fd',
  quadrants: ['#f87171', '#fbbf24', '#60a5fa', '#4ade80'],
};

export function padColors(dark: boolean): PadColors {
  return dark ? DARK : LIGHT;
}
