import type { StoryWarning } from '@asaps/core';

/** Short names for the analyzer's warning codes; the warning's message explains the rest. */
const LABELS: Record<StoryWarning['code'], string> = {
  'keypad-softlock-loop': 'Keypad can trap the player',
  'keypad-softlock-unlimited': 'Keypad can trap the player',
  'keypad-ungated': 'Keypad has no clue before it',
  'requires-unfulfillable': 'Requirement can never be met',
  'requires-violated-on-path': 'Requirement not met on some paths',
};

export function storyWarningLabel(code: string): string {
  return (LABELS as Record<string, string>)[code] ?? 'Warning';
}
