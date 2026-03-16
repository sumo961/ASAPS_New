import { describe, it, expect } from 'vitest';
import {
  extractSpeakers,
  shouldShowSpeaker,
  resolvePortraitUrl,
  resolveTranslatedSpeakerName,
} from '../speakerUtils';

// ---------------------------------------------------------------------------
// Helpers – minimal beat-like stubs
// ---------------------------------------------------------------------------

function makeBeat(overrides: Record<string, any> = {}) {
  return {
    type: overrides.type ?? 'durScreen',
    speaker: overrides.speaker ?? undefined,
    getParameters: overrides.getParameters ?? (() => ({})),
    ...overrides,
  };
}

function makeDialogTreeBeat(dialogTree: any) {
  return makeBeat({
    type: 'dialogTree',
    getParameters: () => ({ dialogTree }),
  });
}

// ---------------------------------------------------------------------------
// extractSpeakers
// ---------------------------------------------------------------------------

describe('extractSpeakers', () => {
  it('returns empty array for empty beats', () => {
    expect(extractSpeakers([])).toEqual([]);
  });

  it('collects unique speakers from beats', () => {
    const beats = [
      makeBeat({ speaker: 'Alice' }),
      makeBeat({ speaker: 'Bob' }),
      makeBeat({ speaker: 'Alice' }),
    ];
    expect(extractSpeakers(beats as any)).toEqual(['Alice', 'Bob']);
  });

  it('filters out Narrator', () => {
    const beats = [
      makeBeat({ speaker: 'Narrator' }),
      makeBeat({ speaker: 'Alice' }),
    ];
    expect(extractSpeakers(beats as any)).toEqual(['Alice']);
  });

  it('filters out Interactor', () => {
    const beats = [
      makeBeat({ speaker: 'Interactor' }),
      makeBeat({ speaker: 'Bob' }),
    ];
    expect(extractSpeakers(beats as any)).toEqual(['Bob']);
  });

  it('filters out the player character name when provided', () => {
    const beats = [
      makeBeat({ speaker: 'Hero' }),
      makeBeat({ speaker: 'Villain' }),
    ];
    expect(extractSpeakers(beats as any, 'Hero')).toEqual(['Villain']);
  });

  it('walks dialogTree nodes to find nested speakers', () => {
    const tree = {
      speaker: 'TreeSpeaker',
      choices: [
        {
          dialogNode: {
            speaker: 'Nested',
            choices: [
              { dialogNode: { speaker: 'DeepNested' } },
            ],
          },
        },
      ],
    };
    const beats = [makeDialogTreeBeat(tree)];
    expect(extractSpeakers(beats as any)).toEqual(['DeepNested', 'Nested', 'TreeSpeaker']);
  });

  it('handles dialogTree with no choices gracefully', () => {
    const tree = { speaker: 'Solo' };
    const beats = [makeDialogTreeBeat(tree)];
    expect(extractSpeakers(beats as any)).toEqual(['Solo']);
  });

  it('returns sorted results', () => {
    const beats = [
      makeBeat({ speaker: 'Zara' }),
      makeBeat({ speaker: 'Anna' }),
      makeBeat({ speaker: 'Mike' }),
    ];
    expect(extractSpeakers(beats as any)).toEqual(['Anna', 'Mike', 'Zara']);
  });

  it('skips beats without a speaker', () => {
    const beats = [
      makeBeat({}),
      makeBeat({ speaker: 'Alice' }),
      makeBeat({ speaker: undefined }),
    ];
    expect(extractSpeakers(beats as any)).toEqual(['Alice']);
  });
});

// ---------------------------------------------------------------------------
// shouldShowSpeaker
// ---------------------------------------------------------------------------

describe('shouldShowSpeaker', () => {
  it('returns true when beatOverride is true', () => {
    expect(shouldShowSpeaker(true, false)).toBe(true);
  });

  it('returns false when beatOverride is false', () => {
    expect(shouldShowSpeaker(false, true)).toBe(false);
  });

  it('returns global value when beatOverride is undefined and global is true', () => {
    expect(shouldShowSpeaker(undefined, true)).toBe(true);
  });

  it('returns global value when beatOverride is undefined and global is false', () => {
    expect(shouldShowSpeaker(undefined, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolvePortraitUrl
// ---------------------------------------------------------------------------

describe('resolvePortraitUrl', () => {
  const assets = [
    { id: 'asset-1', url: 'blob:asset-1-url' },
    { id: 'asset-2', url: 'blob:asset-2-url' },
  ];

  it('returns undefined when speakerName is undefined', () => {
    expect(resolvePortraitUrl(undefined, [], [])).toBeUndefined();
  });

  it('returns undefined when characters array is empty', () => {
    expect(resolvePortraitUrl('Alice', [], assets)).toBeUndefined();
  });

  it('matches character by displayName (case-insensitive)', () => {
    const characters = [
      { displayName: 'Alice', name: 'alice_char', portrait: { image: 'img.png' } },
    ];
    expect(resolvePortraitUrl('alice', characters, [])).toBe('img.png');
  });

  it('matches character by name (case-insensitive)', () => {
    const characters = [
      { displayName: 'Something Else', name: 'Bob', portrait: { image: 'bob.png' } },
    ];
    expect(resolvePortraitUrl('bob', characters, [])).toBe('bob.png');
  });

  it('prefers assetId over image when asset is found', () => {
    const characters = [
      {
        displayName: 'Alice',
        name: 'alice',
        portrait: { assetId: 'asset-1', image: 'fallback.png' },
      },
    ];
    expect(resolvePortraitUrl('Alice', characters, assets)).toBe('blob:asset-1-url');
  });

  it('falls back to image when assetId does not resolve', () => {
    const characters = [
      {
        displayName: 'Alice',
        name: 'alice',
        portrait: { assetId: 'missing-asset', image: 'fallback.png' },
      },
    ];
    expect(resolvePortraitUrl('Alice', characters, assets)).toBe('fallback.png');
  });

  it('returns undefined when character has no portrait', () => {
    const characters = [{ displayName: 'Alice', name: 'alice' }];
    expect(resolvePortraitUrl('Alice', characters as any, assets)).toBeUndefined();
  });

  it('returns undefined when no character matches', () => {
    const characters = [
      { displayName: 'Bob', name: 'bob', portrait: { image: 'bob.png' } },
    ];
    expect(resolvePortraitUrl('Charlie', characters, assets)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveTranslatedSpeakerName
// ---------------------------------------------------------------------------

describe('resolveTranslatedSpeakerName', () => {
  const characters = [
    {
      displayName: 'Alice',
      name: 'alice',
      translations: {
        de: { displayName: 'Alicia' },
        fr: { displayName: 'Alix' },
      },
    },
    {
      displayName: 'Bob',
      name: 'bob',
    },
  ];

  it('returns translated name when translation exists', () => {
    expect(resolveTranslatedSpeakerName('Alice', characters, 'de')).toBe('Alicia');
  });

  it('returns translated name for a different language', () => {
    expect(resolveTranslatedSpeakerName('Alice', characters, 'fr')).toBe('Alix');
  });

  it('returns original name when no translation exists for language', () => {
    expect(resolveTranslatedSpeakerName('Alice', characters, 'es')).toBe('Alice');
  });

  it('returns original name when character has no translations', () => {
    expect(resolveTranslatedSpeakerName('Bob', characters, 'de')).toBe('Bob');
  });

  it('returns original name when activeLanguage is null', () => {
    expect(resolveTranslatedSpeakerName('Alice', characters, null)).toBe('Alice');
  });

  it('returns undefined when speakerName is undefined', () => {
    expect(resolveTranslatedSpeakerName(undefined, characters, 'de')).toBeUndefined();
  });

  it('matches character by name (case-insensitive)', () => {
    expect(resolveTranslatedSpeakerName('alice', characters, 'de')).toBe('Alicia');
  });
});
