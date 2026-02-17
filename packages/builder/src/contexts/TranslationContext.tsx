/**
 * TranslationContext - Manages translation state for the builder
 *
 * Holds:
 * - Active translation language (null = source)
 * - Loaded translation resources
 * - Translated story clone (for preview/inspector)
 * - Translation generation status
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { TranslationResource, TranslationManifest } from '@asaps/core';
import { buildManifestEntry, createEmptyTranslationManifest, syncTranslation, applySyncResult } from '@asaps/core';
import {
  generateTranslationResource,
  createManualTranslationResource,
  applyTranslationResource,
  buildTranslationManifest,
  extractTranslatableStrings,
  positionalToIdBased,
  extractBeatSourceStrings,
} from '../export/StoryTranslator';
import type { TranslationAIConfig } from '../export/StoryTranslator';
import { loadNotoFonts } from '../utils/fontRegistry';

export interface TranslationState {
  /** Currently active language code, or null for source */
  activeLanguage: string | null;
  /** All loaded translation resources */
  translations: TranslationResource[];
  /** Translation manifest */
  manifest: TranslationManifest;
  /** Whether an AI translation is being generated */
  isGenerating: boolean;
  /** Generation progress message */
  generationProgress: string;
  /** Number of strings translated so far */
  stringsTranslated: number;
  /** Total strings to translate */
  totalStrings: number;
}

export interface TranslationActions {
  /** Switch active language */
  setActiveLanguage: (languageCode: string | null) => void;
  /** Generate an AI translation for a language */
  generateTranslation: (
    projectData: any,
    languageCode: string,
    languageName: string,
    aiConfig: TranslationAIConfig
  ) => Promise<void>;
  /** Create a manual translation template */
  createManualTranslation: (
    projectData: any,
    languageCode: string,
    languageName: string
  ) => void;
  /** Get the translated project data for the active language */
  getTranslatedProjectData: (projectData: any) => any;
  /** Load translations from project data (e.g., after opening a project) */
  loadTranslations: (translations: TranslationResource[], manifest?: TranslationManifest) => void;
  /** Update a single translation entry (for inline editing in inspector) */
  updateTranslation: (languageCode: string, key: string, value: string) => void;
  /** Clear all translation state */
  clearTranslations: () => void;
  /** Sync all translations against current source strings (full project) */
  syncAllTranslations: (projectData: any) => void;
  /** Sync translations for a single beat after source-text edits */
  syncBeatTranslations: (beatId: string, beatData: any) => void;
}

const TranslationStateContext = createContext<TranslationState>({
  activeLanguage: null,
  translations: [],
  manifest: createEmptyTranslationManifest('en'),
  isGenerating: false,
  generationProgress: '',
  stringsTranslated: 0,
  totalStrings: 0,
});

const TranslationActionsContext = createContext<TranslationActions>({
  setActiveLanguage: () => {},
  generateTranslation: async () => {},
  createManualTranslation: () => {},
  getTranslatedProjectData: (data) => data,
  loadTranslations: () => {},
  updateTranslation: () => {},
  clearTranslations: () => {},
  syncAllTranslations: () => {},
  syncBeatTranslations: () => {},
});

export function useTranslationState(): TranslationState {
  return useContext(TranslationStateContext);
}

export function useTranslationActions(): TranslationActions {
  return useContext(TranslationActionsContext);
}

interface TranslationProviderProps {
  sourceLanguage?: string;
  children: React.ReactNode;
}

export const TranslationProvider: React.FC<TranslationProviderProps> = ({
  sourceLanguage = 'en',
  children,
}) => {
  const [activeLanguage, setActiveLanguageRaw] = useState<string | null>(null);
  const [translations, setTranslations] = useState<TranslationResource[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [stringsTranslated, setStringsTranslated] = useState(0);
  const [totalStrings, setTotalStrings] = useState(0);

  // Wrap setActiveLanguage to trigger font loading when switching to a translation
  const setActiveLanguage = useCallback((languageCode: string | null) => {
    setActiveLanguageRaw(languageCode);
    if (languageCode) {
      const resource = translations.find(t => t.languageCode === languageCode);
      if (resource && resource.requiredFonts.length > 0) {
        loadNotoFonts(resource.requiredFonts);
      }
    }
  }, [translations]);

  const manifest = useMemo(
    () => buildTranslationManifest(translations, sourceLanguage),
    [translations, sourceLanguage]
  );

  const generateTranslation = useCallback(async (
    projectData: any,
    languageCode: string,
    languageName: string,
    aiConfig: TranslationAIConfig
  ) => {
    setIsGenerating(true);
    setGenerationProgress(`Translating to ${languageName}...`);
    setStringsTranslated(0);
    setTotalStrings(0);

    try {
      const resource = await generateTranslationResource(
        projectData,
        languageCode,
        languageName,
        aiConfig,
        (progress) => {
          setStringsTranslated(progress.stringsTranslated);
          setTotalStrings(progress.totalStrings);
          setGenerationProgress(
            `Translating to ${languageName}: ${progress.stringsTranslated}/${progress.totalStrings} strings`
          );
        }
      );

      // Load required Noto fonts before switching
      if (resource.requiredFonts.length > 0) {
        loadNotoFonts(resource.requiredFonts);
      }

      setTranslations(prev => {
        // Replace existing or add new
        const existing = prev.findIndex(t => t.languageCode === languageCode);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = resource;
          return updated;
        }
        return [...prev, resource];
      });

      // Auto-switch to the newly generated language
      setActiveLanguageRaw(languageCode);

      setGenerationProgress('');
      setStringsTranslated(0);
      setTotalStrings(0);
    } catch (error) {
      console.error('[TranslationContext] Generation failed:', error);
      setGenerationProgress(
        error instanceof Error ? `Error: ${error.message}` : 'Translation failed'
      );
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleCreateManualTranslation = useCallback((
    projectData: any,
    languageCode: string,
    languageName: string
  ) => {
    const resource = createManualTranslationResource(projectData, languageCode, languageName);
    setTranslations(prev => {
      const existing = prev.findIndex(t => t.languageCode === languageCode);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = resource;
        return updated;
      }
      return [...prev, resource];
    });
    // Auto-switch to the newly created language
    setActiveLanguage(languageCode);
  }, []);

  const getTranslatedProjectData = useCallback((projectData: any) => {
    if (!activeLanguage) return projectData;

    const resource = translations.find(t => t.languageCode === activeLanguage);
    if (!resource) return projectData;

    return applyTranslationResource(projectData, resource);
  }, [activeLanguage, translations]);

  const loadTranslations = useCallback((
    newTranslations: TranslationResource[],
    newManifest?: TranslationManifest
  ) => {
    // Pre-load Noto fonts for all translations so they're ready when switching
    for (const t of newTranslations) {
      if (t.requiredFonts.length > 0) {
        loadNotoFonts(t.requiredFonts);
      }
    }
    setTranslations(newTranslations);
    // Reset active language when loading new translations
    setActiveLanguageRaw(null);
  }, []);

  const updateTranslation = useCallback((
    languageCode: string,
    key: string,
    value: string
  ) => {
    setTranslations(prev =>
      prev.map(t => {
        if (t.languageCode !== languageCode) return t;
        return {
          ...t,
          strings: {
            ...t.strings,
            [key]: { value, status: 'translated' },
          },
          modifiedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const syncAllTranslations = useCallback((projectData: any) => {
    setTranslations(prev => {
      if (prev.length === 0) return prev;

      const positionalStrings = extractTranslatableStrings(projectData);
      const currentSource = positionalToIdBased(positionalStrings, projectData);

      let anyChanged = false;
      const updated = prev.map(resource => {
        const result = syncTranslation(resource, currentSource);
        if (!result.hasChanges) return resource;

        anyChanged = true;
        const cloned: TranslationResource = {
          ...resource,
          strings: { ...resource.strings },
          _sourceSnapshot: { ...resource._sourceSnapshot },
        };
        applySyncResult(cloned, result, currentSource);
        console.log(
          `[TranslationContext] syncAll ${resource.languageName}: ${result.staleStrings.length} stale, ${result.newStrings.length} new, ${result.orphanedStrings.length} orphaned`
        );
        return cloned;
      });

      return anyChanged ? updated : prev;
    });
  }, []);

  const syncBeatTranslations = useCallback((beatId: string, beatData: any) => {
    setTranslations(prev => {
      if (prev.length === 0) return prev;

      const currentBeatStrings = extractBeatSourceStrings(beatData, beatId);
      const beatKeyPrefix = `beat:${beatId}.`;

      let anyChanged = false;
      const updated = prev.map(resource => {
        let resourceChanged = false;
        const newStrings = { ...resource.strings };
        const newSnapshot = { ...resource._sourceSnapshot };

        for (const [key, currentValue] of Object.entries(currentBeatStrings)) {
          const snapshotValue = resource._sourceSnapshot[key];

          if (snapshotValue === undefined) {
            // New string — add as untranslated
            newStrings[key] = { value: currentValue, status: 'untranslated' };
            newSnapshot[key] = currentValue;
            resourceChanged = true;
          } else if (currentValue !== snapshotValue) {
            // Source text changed — mark as stale
            if (newStrings[key]) {
              newStrings[key] = { ...newStrings[key], status: 'stale' };
            }
            newSnapshot[key] = currentValue;
            resourceChanged = true;
          }
        }

        // Check for orphaned beat strings (removed from beat)
        for (const key of Object.keys(resource._sourceSnapshot)) {
          if (key.startsWith(beatKeyPrefix) && !(key in currentBeatStrings)) {
            // String was removed from this beat — update snapshot
            // Keep the translation entry (don't delete) but update snapshot
            delete newSnapshot[key];
            resourceChanged = true;
          }
        }

        if (!resourceChanged) return resource;

        anyChanged = true;
        return {
          ...resource,
          strings: newStrings,
          _sourceSnapshot: newSnapshot,
          modifiedAt: new Date().toISOString(),
        };
      });

      return anyChanged ? updated : prev;
    });
  }, []);

  const clearTranslations = useCallback(() => {
    setTranslations([]);
    setActiveLanguageRaw(null);
    setGenerationProgress('');
  }, []);

  const state: TranslationState = {
    activeLanguage,
    translations,
    manifest,
    isGenerating,
    generationProgress,
    stringsTranslated,
    totalStrings,
  };

  const actions: TranslationActions = useMemo(() => ({
    setActiveLanguage,
    generateTranslation,
    createManualTranslation: handleCreateManualTranslation,
    getTranslatedProjectData,
    loadTranslations,
    updateTranslation,
    clearTranslations,
    syncAllTranslations,
    syncBeatTranslations,
  }), [
    setActiveLanguage,
    generateTranslation,
    handleCreateManualTranslation,
    getTranslatedProjectData,
    loadTranslations,
    updateTranslation,
    clearTranslations,
    syncAllTranslations,
    syncBeatTranslations,
  ]);

  return (
    <TranslationStateContext.Provider value={state}>
      <TranslationActionsContext.Provider value={actions}>
        {children}
      </TranslationActionsContext.Provider>
    </TranslationStateContext.Provider>
  );
};
