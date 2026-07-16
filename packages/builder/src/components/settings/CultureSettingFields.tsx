/**
 * CultureSettingFields — the culture profile dropdown + label/region/language
 * inputs, shared between Settings → Translation and the New Project dialog
 * so the two surfaces can't drift.
 *
 * Controlled: caller owns the culture object ({ profileId, label, region,
 * language }) and receives the whole next value on every edit.
 */

import React from 'react';
import { REFERENCE_CULTURE_PROFILES } from '@asaps/core';

export interface CultureValue {
  profileId?: string;
  label?: string;
  region?: string;
  language?: string;
}

/** True when the author actually declared something (drives KG auto-enable). */
export function cultureIsSet(value: CultureValue | undefined): boolean {
  if (!value) return false;
  return Boolean(
    value.label?.trim() ||
    value.region?.trim() ||
    value.language?.trim() ||
    (value.profileId && value.profileId !== 'custom')
  );
}

export interface CultureSettingFieldsProps {
  value: CultureValue | undefined;
  onChange: (next: CultureValue) => void;
  disabled?: boolean;
}

export const CultureSettingFields: React.FC<CultureSettingFieldsProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const set = (patch: Partial<CultureValue>) => onChange({ ...(value ?? {}), ...patch });

  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">Reference profile</label>
      <select
        value={value?.profileId ?? 'custom'}
        disabled={disabled}
        onChange={(e) => {
          const ref = REFERENCE_CULTURE_PROFILES.find((p) => p.id === e.target.value);
          onChange(
            ref
              ? { profileId: ref.id, label: ref.label, region: ref.region, language: value?.language }
              : { ...(value ?? {}), profileId: undefined }
          );
        }}
        className="w-full px-3 py-2 border rounded mb-2 text-sm"
      >
        <option value="custom">Custom…</option>
        {REFERENCE_CULTURE_PROFILES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <div className="space-y-2">
        <input
          placeholder="Culture / country (e.g. Sweden, Sri Lanka, New Zealand)"
          value={value?.label ?? ''}
          disabled={disabled}
          onChange={(e) => set({ label: e.target.value })}
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <input
          placeholder="Region or community (e.g. Tamil, Karnataka, Bavaria)"
          value={value?.region ?? ''}
          disabled={disabled}
          onChange={(e) => set({ region: e.target.value })}
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <input
          placeholder="Associated language (informational, e.g. Tamil, Kannada)"
          value={value?.language ?? ''}
          disabled={disabled}
          onChange={(e) => set({ language: e.target.value })}
          className="w-full px-3 py-2 border rounded text-sm"
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Region or community refines the culture <em>within</em> it — a sub-national
        region or an ethnic group (e.g. Tamil within Sri Lanka), not a country.
      </p>
    </div>
  );
};
