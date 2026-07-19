/**
 * Template gallery — worked example projects you adapt.
 *
 * Templates are bundled `.asapst` files (same zip as `.asaps`, but
 * project.json carries `projectType: 'template'`) listed in
 * `public/templates/index.json`. "Using" one fetches the file and hands it
 * to the ordinary zip-import pipeline, whose template branch instantiates
 * a fresh COPY into the library — the bundled master is never edited.
 * User-distributed `.asapst` files go through the exact same path, so the
 * gallery and the teacher-shares-a-file ecosystem are one mechanism.
 *
 * Three surfaces, one registry:
 *   - TemplateGalleryModal: opened from the "Start from a template" card
 *     in the NewProjectPicker.
 *   - TemplateShelf: adaptive row in the Project Browser under the create
 *     row — full cards while the library is small (the first-run students
 *     who need the showcase), a slim one-liner once it's established.
 */

import React, { useEffect, useState } from 'react';
import { LayoutTemplate, Loader2, X, Sparkles } from 'lucide-react';

export interface TemplateMeta {
  id: string;
  file: string;
  title: string;
  description: string;
  whatItShows: string;
  tags: string[];
  beats?: number;
  characters?: number;
  requiresAI?: boolean;
}

/** Resolve against document.baseURI so the fetch works both on the Vite
 *  dev server and under file:// in the packaged Electron app (the same
 *  lesson the beat-schema fetch learned in v0.9.69). */
const templateUrl = (path: string) => new URL(`templates/${path}`, document.baseURI).href;

export function useTemplateRegistry(): { templates: TemplateMeta[]; error: string | null } {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(templateUrl('index.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`registry fetch failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setTemplates(Array.isArray(data?.templates) ? data.templates : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { templates, error };
}

/** Fetch the bundled .asapst and wrap it as a File for the import pipeline. */
async function fetchTemplateFile(meta: TemplateMeta): Promise<File> {
  const response = await fetch(templateUrl(meta.file));
  if (!response.ok) throw new Error(`Template download failed (${response.status})`);
  const blob = await response.blob();
  return new File([blob], meta.file, { type: 'application/zip' });
}

export interface TemplateCardHandlers {
  /** Receives the fetched .asapst as a File — wire to the zip-import flow. */
  onUseTemplate: (file: File, meta: TemplateMeta) => void | Promise<void>;
}

const TemplateCard: React.FC<{ meta: TemplateMeta; compact?: boolean } & TemplateCardHandlers> = ({
  meta, compact = false, onUseTemplate,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await fetchTemplateFile(meta);
      await onUseTemplate(file, meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load template');
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-gray-200 rounded-xl text-left">
      <div className="flex items-center gap-2 w-full">
        <LayoutTemplate className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <div className="text-sm font-semibold text-gray-900 flex-1">{meta.title}</div>
        {meta.requiresAI && (
          <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded" title="Uses AI beats — configure an AI provider to play it">
            AI
          </span>
        )}
      </div>
      <div className="text-xs text-gray-600 leading-snug">{meta.description}</div>
      {!compact && (
        <div className="text-[11px] text-gray-500 leading-snug bg-amber-50/60 border border-amber-100 rounded px-2 py-1.5">
          <span className="font-medium text-amber-700">What this shows: </span>
          {meta.whatItShows}
        </div>
      )}
      <div className="flex items-center gap-2 w-full mt-auto pt-1">
        <div className="flex flex-wrap gap-1 flex-1">
          {meta.tags.map((t) => (
            <span key={t} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>
          ))}
        </div>
        <button
          type="button"
          onClick={use}
          disabled={busy}
          className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
          title="Creates your own copy of this template as a new project — the template itself is never changed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Use template
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
};

/** Modal gallery — opened from the "Start from a template" create card. */
export const TemplateGalleryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
} & TemplateCardHandlers> = ({ isOpen, onClose, onUseTemplate }) => {
  const { templates, error } = useTemplateRegistry();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Start from a template</h2>
            <p className="text-sm text-gray-500">
              Worked example projects you adapt — using one always creates your own copy.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {error && <div className="text-sm text-red-600 col-span-full">Couldn't load the template registry: {error}</div>}
          {!error && templates.length === 0 && (
            <div className="text-sm text-gray-500 col-span-full">Loading templates…</div>
          )}
          {templates.map((t) => (
            <TemplateCard key={t.id} meta={t} onUseTemplate={onUseTemplate} />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Adaptive template row for the Project Browser: full cards while the
 * library is small (≤ threshold projects), a slim single line afterwards.
 */
export const TemplateShelf: React.FC<{
  projectCount: number;
  /** Libraries at or below this size get the full showcase. Default 3. */
  threshold?: number;
} & TemplateCardHandlers> = ({ projectCount, threshold = 3, onUseTemplate }) => {
  const { templates } = useTemplateRegistry();
  const [expanded, setExpanded] = useState(false);
  if (templates.length === 0) return null;

  const showFull = expanded || projectCount <= threshold;

  if (!showFull) {
    return (
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
        <LayoutTemplate className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="font-medium text-gray-500 text-xs uppercase tracking-wide">Templates</span>
        <span className="text-xs text-gray-500 truncate">{templates.map((t) => t.title).join(' · ')}</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-amber-600 hover:text-amber-700 font-medium whitespace-nowrap"
        >
          browse →
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Start from a template</div>
        {projectCount > threshold && (
          <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600">
            hide
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((t) => (
          <TemplateCard key={t.id} meta={t} onUseTemplate={onUseTemplate} />
        ))}
      </div>
    </div>
  );
};
