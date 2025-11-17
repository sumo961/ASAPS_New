/**
 * Preset Sound Library
 *
 * Collection of built-in UI sounds for buttons, interactions, and feedback.
 * Sounds are referenced by URL (CDN or base64-encoded).
 */

export interface PresetSound {
  id: string;
  name: string;
  description: string;
  url: string;
  duration: number; // in milliseconds
  category: 'click' | 'hover' | 'success' | 'error' | 'notification' | 'transition';
  volume?: number; // 0-1, default 1
}

/**
 * Registry of preset sounds available in the system
 */
export const PRESET_SOUNDS: Record<string, PresetSound> = {
  'click-soft': {
    id: 'click-soft',
    name: 'Soft Click',
    description: 'Gentle button click sound',
    url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    duration: 200,
    category: 'click',
    volume: 0.5,
  },
  'click-sharp': {
    id: 'click-sharp',
    name: 'Sharp Click',
    description: 'Crisp, sharp button click',
    url: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
    duration: 150,
    category: 'click',
    volume: 0.6,
  },
  'click-modern': {
    id: 'click-modern',
    name: 'Modern Click',
    description: 'Modern UI click sound',
    url: 'https://assets.mixkit.co/active_storage/sfx/2997/2997-preview.mp3',
    duration: 180,
    category: 'click',
    volume: 0.5,
  },
  'hover-gentle': {
    id: 'hover-gentle',
    name: 'Gentle Hover',
    description: 'Subtle hover effect sound',
    url: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3',
    duration: 100,
    category: 'hover',
    volume: 0.3,
  },
  'success-bright': {
    id: 'success-bright',
    name: 'Success',
    description: 'Positive success notification',
    url: 'https://assets.mixkit.co/active_storage/sfx/2999/2999-preview.mp3',
    duration: 400,
    category: 'success',
    volume: 0.7,
  },
  'success-chime': {
    id: 'success-chime',
    name: 'Success Chime',
    description: 'Pleasant chime for success',
    url: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3',
    duration: 500,
    category: 'success',
    volume: 0.6,
  },
  'error-alert': {
    id: 'error-alert',
    name: 'Error Alert',
    description: 'Error or warning notification',
    url: 'https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3',
    duration: 300,
    category: 'error',
    volume: 0.6,
  },
  'notification-pop': {
    id: 'notification-pop',
    name: 'Notification Pop',
    description: 'General notification sound',
    url: 'https://assets.mixkit.co/active_storage/sfx/2356/2356-preview.mp3',
    duration: 250,
    category: 'notification',
    volume: 0.5,
  },
  'notification-subtle': {
    id: 'notification-subtle',
    name: 'Subtle Notification',
    description: 'Quiet, unobtrusive notification',
    url: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
    duration: 200,
    category: 'notification',
    volume: 0.4,
  },
  'transition-whoosh': {
    id: 'transition-whoosh',
    name: 'Whoosh',
    description: 'Transition or movement sound',
    url: 'https://assets.mixkit.co/active_storage/sfx/2627/2627-preview.mp3',
    duration: 400,
    category: 'transition',
    volume: 0.5,
  },
};

/**
 * Get all preset sounds
 */
export function getAllPresetSounds(): PresetSound[] {
  return Object.values(PRESET_SOUNDS);
}

/**
 * Get preset sounds by category
 */
export function getPresetSoundsByCategory(category: PresetSound['category']): PresetSound[] {
  return getAllPresetSounds().filter(sound => sound.category === category);
}

/**
 * Get a preset sound by ID
 */
export function getPresetSound(id: string): PresetSound | undefined {
  return PRESET_SOUNDS[id];
}

/**
 * Check if a sound ID is a preset
 */
export function isPresetSound(id: string): boolean {
  return id in PRESET_SOUNDS;
}

/**
 * Get sound categories
 */
export function getSoundCategories(): Array<PresetSound['category']> {
  return ['click', 'hover', 'success', 'error', 'notification', 'transition'];
}
