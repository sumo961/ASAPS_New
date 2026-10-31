/**
 * "This beat's look" in the Visual Editor: the project's look (Project
 * Settings ▸ Colors, Text Box, Fonts) changed for this beat only. Every row
 * shows the project's value until it is changed here, and ↺ puts it back.
 * Writes Beat.look and Beat.textBoxBorder (the border's show/hide, which
 * was a field of its own before the rest of the look existed).
 */
import React from 'react';
import { Palette, RotateCw } from 'lucide-react';
import type { BeatLook } from '@asaps/core';
import type { GlobalSettings } from '../../storage/types';
import type { FontDefinition } from '../../utils/fontRegistry';
import { convertGlobalSettingsToTheme } from '../../utils/themeConverter';

export interface BeatLookValue {
  look?: BeatLook;
  textBoxBorder?: 'show' | 'hide';
}

interface Props {
  value: BeatLookValue;
  globalSettings?: GlobalSettings;
  fonts: FontDefinition[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: BeatLookValue) => void;
}

type Group = 'textBox' | 'button' | 'fonts';

/** Drop empty groups and unset values so an untouched look is stored as nothing. */
export function tidyLook(look: BeatLook): BeatLook | undefined {
  const out: any = {};
  for (const [k, v] of Object.entries(look)) {
    if (v && typeof v === 'object') {
      const inner = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== ''));
      if (Object.keys(inner).length > 0) out[k] = inner;
    } else if (v !== undefined && v !== '') {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const hex = (c: string | undefined, fallback = '#000000'): string =>
  c && /^#[0-9a-f]{6}$/i.test(c) ? c : (c && /^#[0-9a-f]{3}$/i.test(c) ? `#${c.slice(1).split('').map(x => x + x).join('')}` : fallback);

/**
 * A colour swatch that commits when the picker is closed (the DOM 'change'
 * event), not on every move inside it, so one pick is one undo step.
 */
const ColorInput: React.FC<{ value: string; onCommit: (c: string) => void }> = ({ value, onCommit }) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const commit = React.useRef(onCommit);
  commit.current = onCommit;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => commit.current(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  return (
    <input
      ref={ref}
      type="color"
      key={value}
      defaultValue={value}
      className="w-8 h-6 p-0 border border-gray-300 rounded cursor-pointer"
    />
  );
};

const Row: React.FC<{ label: string; changed: boolean; onReset: () => void; children: React.ReactNode }> = ({ label, changed, onReset, children }) => (
  <div className="flex items-center gap-2">
    <span className={`text-xs w-24 flex-shrink-0 ${changed ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{label}</span>
    <div className="flex-1 min-w-0 flex items-center gap-1">{children}</div>
    <button
      type="button"
      onClick={onReset}
      disabled={!changed}
      title={changed ? 'Back to the project setting' : 'Project setting'}
      className="text-gray-400 hover:text-blue-600 disabled:opacity-0 flex-shrink-0"
    >
      <RotateCw className="w-3 h-3" />
    </button>
  </div>
);

export const BeatLookSection: React.FC<Props> = ({ value, globalSettings, fonts, expanded, onToggle, onChange }) => {
  const look = value.look ?? {};
  const project = globalSettings ? convertGlobalSettingsToTheme(globalSettings) : undefined;
  const projectFonts = {
    titleFont: globalSettings?.fonts?.titleFont ?? 'Georgia',
    textFont: globalSettings?.fonts?.textFont ?? 'System',
    buttonFont: globalSettings?.fonts?.btnFont ?? 'Arial',
  };
  const changedCount = Object.values(tidyLook(look) ?? {}).reduce<number>(
    (n, v) => n + (v && typeof v === 'object' ? Object.keys(v).length : 1), 0,
  ) + (value.textBoxBorder ? 1 : 0);

  const setTop = (key: 'stageColor' | 'textColor', v: string | undefined) =>
    onChange({ ...value, look: tidyLook({ ...look, [key]: v }) });
  const setIn = (group: Group, key: string, v: string | number | undefined) =>
    onChange({ ...value, look: tidyLook({ ...look, [group]: { ...(look as any)[group], [key]: v } }) });
  const get = (group: Group, key: string): any => (look as any)[group]?.[key];

  const color = (v: string | undefined, projectValue: string | undefined, onSet: (c: string | undefined) => void) => (
    <>
      <ColorInput value={hex(v ?? projectValue)} onCommit={(c) => onSet(c)} />
      <span className="text-[11px] text-gray-500 truncate">{v ?? 'Project'}</span>
    </>
  );
  const number = (v: number | undefined, projectValue: number | undefined, onSet: (n: number | undefined) => void, max = 100) => (
    <input
      type="number"
      min={0}
      max={max}
      value={v ?? ''}
      placeholder={projectValue !== undefined ? String(projectValue) : ''}
      onChange={(e) => onSet(e.target.value === '' ? undefined : Math.max(0, Math.min(max, Number(e.target.value))))}
      className="w-16 px-2 py-0.5 text-xs border border-gray-300 rounded"
    />
  );
  const font = (v: string | undefined, projectValue: string, onSet: (f: string | undefined) => void) => (
    <select
      value={v ?? ''}
      onChange={(e) => onSet(e.target.value || undefined)}
      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded"
    >
      <option value="">Project ({projectValue})</option>
      {fonts.filter(f => f.type === 'builtin').map(f => <option key={f.id} value={f.displayName}>{f.displayName}</option>)}
      {fonts.some(f => f.type === 'custom') && (
        <optgroup label="Custom Fonts">
          {fonts.filter(f => f.type === 'custom').map(f => <option key={f.id} value={f.displayName}>{f.displayName}</option>)}
        </optgroup>
      )}
    </select>
  );

  return (
    <div className="border-b border-gray-200" data-testid="beat-look-section">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4" />
          <span className="font-medium text-sm">This beat's look</span>
        </div>
        {changedCount > 0 && (
          <span className="text-[11px] text-blue-700 bg-blue-50 rounded px-1.5">{changedCount} changed</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500">
            Changes the project's look (Project Settings) for this beat only. Rows in bold are changed here; ↺ goes back to the project setting.
          </p>

          <div className="space-y-1.5">
            <Row label="Stage colour" changed={!!look.stageColor} onReset={() => setTop('stageColor', undefined)}>
              {color(look.stageColor, project?.backgroundColor, (c) => setTop('stageColor', c))}
            </Row>
            <Row label="Text colour" changed={!!look.textColor} onReset={() => setTop('textColor', undefined)}>
              {color(look.textColor, project?.colors.textColor, (c) => setTop('textColor', c))}
            </Row>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-700">Text box</h4>
            <Row label="Boxes" changed={!!get('textBox', 'visibility')} onReset={() => setIn('textBox', 'visibility', undefined)}>
              <select
                value={get('textBox', 'visibility') ?? ''}
                onChange={(e) => setIn('textBox', 'visibility', e.target.value || undefined)}
                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded"
              >
                <option value="">Project setting</option>
                <option value="all">Show all boxes</option>
                <option value="hideText">Hide text/dialog boxes</option>
                <option value="hideAll">Hide all boxes</option>
              </select>
            </Row>
            <Row label="Colour" changed={!!get('textBox', 'backgroundColor')} onReset={() => setIn('textBox', 'backgroundColor', undefined)}>
              {color(get('textBox', 'backgroundColor'), project?.textBox.backgroundColor, (c) => setIn('textBox', 'backgroundColor', c))}
            </Row>
            <Row label="Opacity %" changed={get('textBox', 'opacity') !== undefined} onReset={() => setIn('textBox', 'opacity', undefined)}>
              {number(get('textBox', 'opacity'), project?.textBox.opacity, (n) => setIn('textBox', 'opacity', n))}
            </Row>
            <Row label="Corners px" changed={get('textBox', 'borderRadius') !== undefined} onReset={() => setIn('textBox', 'borderRadius', undefined)}>
              {number(get('textBox', 'borderRadius'), project?.textBox.borderRadius, (n) => setIn('textBox', 'borderRadius', n), 999)}
            </Row>
            <Row label="Padding px" changed={get('textBox', 'padding') !== undefined} onReset={() => setIn('textBox', 'padding', undefined)}>
              {number(get('textBox', 'padding'), project?.textBox.padding, (n) => setIn('textBox', 'padding', n))}
            </Row>
            <Row label="Border" changed={!!value.textBoxBorder} onReset={() => onChange({ ...value, textBoxBorder: undefined })}>
              <select
                data-testid="beat-textbox-border"
                value={value.textBoxBorder ?? ''}
                onChange={(e) => onChange({ ...value, textBoxBorder: (e.target.value || undefined) as BeatLookValue['textBoxBorder'] })}
                className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded"
              >
                <option value="">Project setting</option>
                <option value="show">Show on this beat</option>
                <option value="hide">Hide on this beat</option>
              </select>
            </Row>
            <Row label="Border width" changed={get('textBox', 'borderWidth') !== undefined} onReset={() => setIn('textBox', 'borderWidth', undefined)}>
              {number(get('textBox', 'borderWidth'), project?.textBox.borderWidth, (n) => setIn('textBox', 'borderWidth', n), 20)}
            </Row>
            <Row label="Border colour" changed={!!get('textBox', 'borderColor')} onReset={() => setIn('textBox', 'borderColor', undefined)}>
              {color(get('textBox', 'borderColor'), project?.textBox.borderColor, (c) => setIn('textBox', 'borderColor', c))}
            </Row>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-700">Buttons</h4>
            <Row label="Colour" changed={!!get('button', 'backgroundColor')} onReset={() => setIn('button', 'backgroundColor', undefined)}>
              {color(get('button', 'backgroundColor'), project?.button.backgroundColor, (c) => setIn('button', 'backgroundColor', c))}
            </Row>
            <Row label="Text colour" changed={!!get('button', 'textColor')} onReset={() => setIn('button', 'textColor', undefined)}>
              {color(get('button', 'textColor'), project?.button.textColor, (c) => setIn('button', 'textColor', c))}
            </Row>
            <Row label="Border colour" changed={!!get('button', 'borderColor')} onReset={() => setIn('button', 'borderColor', undefined)}>
              {color(get('button', 'borderColor'), project?.button.borderColor, (c) => setIn('button', 'borderColor', c))}
            </Row>
            <Row label="Corners px" changed={get('button', 'borderRadius') !== undefined} onReset={() => setIn('button', 'borderRadius', undefined)}>
              {number(get('button', 'borderRadius'), project?.button.borderRadius, (n) => setIn('button', 'borderRadius', n), 999)}
            </Row>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-700">Fonts</h4>
            <Row label="Title" changed={!!get('fonts', 'titleFont')} onReset={() => setIn('fonts', 'titleFont', undefined)}>
              {font(get('fonts', 'titleFont'), projectFonts.titleFont, (f) => setIn('fonts', 'titleFont', f))}
            </Row>
            <Row label="Title size" changed={get('fonts', 'titleFontSize') !== undefined} onReset={() => setIn('fonts', 'titleFontSize', undefined)}>
              {number(get('fonts', 'titleFontSize'), project?.fonts.titleFontSize, (n) => setIn('fonts', 'titleFontSize', n), 200)}
            </Row>
            <Row label="Text" changed={!!get('fonts', 'textFont')} onReset={() => setIn('fonts', 'textFont', undefined)}>
              {font(get('fonts', 'textFont'), projectFonts.textFont, (f) => setIn('fonts', 'textFont', f))}
            </Row>
            <Row label="Text size" changed={get('fonts', 'textFontSize') !== undefined} onReset={() => setIn('fonts', 'textFontSize', undefined)}>
              {number(get('fonts', 'textFontSize'), project?.fonts.textFontSize, (n) => setIn('fonts', 'textFontSize', n), 200)}
            </Row>
            <Row label="Buttons" changed={!!get('fonts', 'buttonFont')} onReset={() => setIn('fonts', 'buttonFont', undefined)}>
              {font(get('fonts', 'buttonFont'), projectFonts.buttonFont, (f) => setIn('fonts', 'buttonFont', f))}
            </Row>
            <Row label="Button size" changed={get('fonts', 'buttonFontSize') !== undefined} onReset={() => setIn('fonts', 'buttonFontSize', undefined)}>
              {number(get('fonts', 'buttonFontSize'), project?.fonts.buttonFontSize, (n) => setIn('fonts', 'buttonFontSize', n), 200)}
            </Row>
          </div>

          {changedCount > 0 && (
            <button
              type="button"
              onClick={() => onChange({ look: undefined, textBoxBorder: undefined })}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Use the project's look for everything
            </button>
          )}
        </div>
      )}
    </div>
  );
};
