/**
 * Text Transformer Service
 *
 * Handles AI-powered text transformations for helper commands.
 * Supports pronoun adjustment, gender changes, and smart text replacements.
 */

import type { TextTransformationRequest, TextTransformationResponse } from '../types/ai';
import { getAIService } from './AIService';

// ============================================================================
// Types
// ============================================================================

export interface TransformContext {
  /** Type of text being transformed */
  textType: 'dialog' | 'narration' | 'button' | 'title' | 'general';
  /** Speaker name if applicable */
  speaker?: string;
  /** Character whose pronouns might change */
  character?: string;
}

export interface TransformResult {
  /** Transformed text */
  text: string;
  /** Whether changes were made */
  changed: boolean;
  /** Description of changes */
  changes: string[];
}

// ============================================================================
// Pronoun Maps
// ============================================================================

// English pronoun mappings for gender changes
const PRONOUN_MAPS = {
  // Male to Female
  maleToFemale: {
    'he': 'she',
    'him': 'her',
    'his': 'her',
    'himself': 'herself',
    "he's": "she's",
    "he'd": "she'd",
    "he'll": "she'll",
  },
  // Female to Male
  femaleToMale: {
    'she': 'he',
    'her': 'him',
    'hers': 'his',
    'herself': 'himself',
    "she's": "he's",
    "she'd": "he'd",
    "she'll": "he'll",
  },
};

// Common gendered terms
const GENDERED_TERMS = {
  maleToFemale: {
    'king': 'queen',
    'prince': 'princess',
    'lord': 'lady',
    'sir': 'madam',
    'mr.': 'ms.',
    'mr': 'ms',
    'boy': 'girl',
    'man': 'woman',
    'men': 'women',
    'son': 'daughter',
    'father': 'mother',
    'brother': 'sister',
    'uncle': 'aunt',
    'nephew': 'niece',
    'husband': 'wife',
    'gentleman': 'lady',
    'hero': 'heroine',
    'actor': 'actress',
    'waiter': 'waitress',
  },
  femaleToMale: {
    'queen': 'king',
    'princess': 'prince',
    'lady': 'lord',
    'madam': 'sir',
    'ms.': 'mr.',
    'ms': 'mr',
    'mrs.': 'mr.',
    'mrs': 'mr',
    'girl': 'boy',
    'woman': 'man',
    'women': 'men',
    'daughter': 'son',
    'mother': 'father',
    'sister': 'brother',
    'aunt': 'uncle',
    'niece': 'nephew',
    'wife': 'husband',
    'heroine': 'hero',
    'actress': 'actor',
    'waitress': 'waiter',
  },
};

// ============================================================================
// Text Transformer Service
// ============================================================================

/**
 * Text transformer service for AI-powered text changes
 */
export class TextTransformer {
  /**
   * Transform text with simple find/replace
   */
  simpleTransform(
    text: string,
    find: string,
    replace: string,
    caseInsensitive: boolean = true
  ): TransformResult {
    const flags = caseInsensitive ? 'gi' : 'g';
    const regex = new RegExp(this.escapeRegex(find), flags);
    const transformed = text.replace(regex, replace);

    return {
      text: transformed,
      changed: transformed !== text,
      changes: transformed !== text ? [`Replaced "${find}" with "${replace}"`] : [],
    };
  }

  /**
   * Transform text with pronoun adjustment
   * Used for character gender changes
   */
  transformWithPronouns(
    text: string,
    oldName: string,
    newName: string,
    genderChange: 'maleToFemale' | 'femaleToMale' | 'none' = 'none'
  ): TransformResult {
    const changes: string[] = [];
    let transformed = text;

    // First, replace the name
    const nameResult = this.simpleTransform(transformed, oldName, newName);
    if (nameResult.changed) {
      transformed = nameResult.text;
      changes.push(`Changed name "${oldName}" to "${newName}"`);
    }

    // Then adjust pronouns if gender change specified
    if (genderChange !== 'none') {
      const pronounMap = PRONOUN_MAPS[genderChange];
      const termMap = GENDERED_TERMS[genderChange];

      // Replace pronouns
      for (const [oldPronoun, newPronoun] of Object.entries(pronounMap)) {
        const result = this.replaceWord(transformed, oldPronoun, newPronoun);
        if (result.changed) {
          transformed = result.text;
          changes.push(`Adjusted pronoun "${oldPronoun}" to "${newPronoun}"`);
        }
      }

      // Replace gendered terms
      for (const [oldTerm, newTerm] of Object.entries(termMap)) {
        const result = this.replaceWord(transformed, oldTerm, newTerm);
        if (result.changed) {
          transformed = result.text;
          changes.push(`Changed "${oldTerm}" to "${newTerm}"`);
        }
      }
    }

    return {
      text: transformed,
      changed: changes.length > 0,
      changes,
    };
  }

  /**
   * Replace a word while preserving case
   */
  private replaceWord(text: string, find: string, replace: string): { text: string; changed: boolean } {
    // Word boundary regex to match whole words only
    const regex = new RegExp(`\\b${this.escapeRegex(find)}\\b`, 'gi');
    let changed = false;

    const result = text.replace(regex, (match) => {
      changed = true;
      // Preserve case
      if (match === match.toUpperCase()) {
        return replace.toUpperCase();
      }
      if (match[0] === match[0].toUpperCase()) {
        return replace.charAt(0).toUpperCase() + replace.slice(1);
      }
      return replace;
    });

    return { text: result, changed };
  }

  /**
   * Use AI for complex text transformations
   */
  async aiTransform(
    text: string,
    instruction: string,
    context?: TransformContext
  ): Promise<TransformResult> {
    const aiService = getAIService();

    if (!aiService.isReady()) {
      // Fall back to simple transformation
      console.warn('[TextTransformer] AI not available, using simple transform');
      return {
        text,
        changed: false,
        changes: ['AI transformation unavailable'],
      };
    }

    try {
      // Call AI service for transformation
      const request: TextTransformationRequest = {
        originalText: text,
        transform: {
          find: instruction.split(' to ')[0] || instruction,
          replace: instruction.split(' to ')[1] || '',
          adjustPronouns: instruction.toLowerCase().includes('pronoun'),
        },
        context: context ? {
          textType: context.textType,
          speaker: context.speaker,
        } : undefined,
      };

      const response = await aiService.transformText(request);

      return {
        text: response.transformedText,
        changed: response.transformedText !== text,
        changes: response.changes.map(c => c.reason),
      };
    } catch (error) {
      console.error('[TextTransformer] AI transformation failed:', error);
      return {
        text,
        changed: false,
        changes: ['AI transformation failed'],
      };
    }
  }

  /**
   * Detect the likely gender direction based on names/terms
   */
  detectGenderDirection(oldName: string, newName: string): 'maleToFemale' | 'femaleToMale' | 'none' {
    const maleTerms = Object.keys(GENDERED_TERMS.maleToFemale);
    const femaleTerms = Object.keys(GENDERED_TERMS.femaleToMale);

    const oldLower = oldName.toLowerCase();
    const newLower = newName.toLowerCase();

    // Check if old name is male and new is female
    for (const [male, female] of Object.entries(GENDERED_TERMS.maleToFemale)) {
      if (oldLower.includes(male) && newLower.includes(female)) {
        return 'maleToFemale';
      }
    }

    // Check if old name is female and new is male
    for (const [female, male] of Object.entries(GENDERED_TERMS.femaleToMale)) {
      if (oldLower.includes(female) && newLower.includes(male)) {
        return 'femaleToMale';
      }
    }

    // Common name patterns
    const maleEndings = ['o', 'er', 'on', 'us'];
    const femaleEndings = ['a', 'ia', 'ina', 'elle', 'ette', 'ess'];

    const oldEnding = oldLower.slice(-2);
    const newEnding = newLower.slice(-2);

    // Check if transitioning from male to female name pattern
    if (maleEndings.some(e => oldLower.endsWith(e)) &&
        femaleEndings.some(e => newLower.endsWith(e))) {
      return 'maleToFemale';
    }

    // Check if transitioning from female to male name pattern
    if (femaleEndings.some(e => oldLower.endsWith(e)) &&
        maleEndings.some(e => newLower.endsWith(e))) {
      return 'femaleToMale';
    }

    return 'none';
  }

  /**
   * Create a preview of what changes will be made
   */
  previewChanges(
    text: string,
    find: string,
    replace: string,
    adjustPronouns: boolean = false
  ): { segments: Array<{ text: string; type: 'unchanged' | 'removed' | 'added' }> } {
    const segments: Array<{ text: string; type: 'unchanged' | 'removed' | 'added' }> = [];
    const regex = new RegExp(`(${this.escapeRegex(find)})`, 'gi');

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add unchanged text before match
      if (match.index > lastIndex) {
        segments.push({
          text: text.slice(lastIndex, match.index),
          type: 'unchanged',
        });
      }

      // Add removed text (the match)
      segments.push({
        text: match[0],
        type: 'removed',
      });

      // Add added text (the replacement)
      segments.push({
        text: replace,
        type: 'added',
      });

      lastIndex = regex.lastIndex;
    }

    // Add remaining unchanged text
    if (lastIndex < text.length) {
      segments.push({
        text: text.slice(lastIndex),
        type: 'unchanged',
      });
    }

    return { segments };
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Singleton instance
let transformerInstance: TextTransformer | null = null;

/**
 * Get the singleton transformer instance
 */
export function getTextTransformer(): TextTransformer {
  if (!transformerInstance) {
    transformerInstance = new TextTransformer();
  }
  return transformerInstance;
}
