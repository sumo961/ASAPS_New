/**
 * BulkRelinkDialog — confirmation modal that fires after a Character is
 * defined via the "Define '<name>' as a Character" link in CharacterRefField.
 * Lists every beat field currently using that name as free text and offers
 * to link them all to the new Character with one click.
 *
 * Stays presentational: caller (App.tsx) has already computed the matches
 * and passes them in. Yes/No callbacks decide whether to apply or skip.
 */

import React from 'react';
import type { ReferenceMatch } from './relinkReferences';

interface Character {
  id: string;
  name?: string;
  displayName?: string;
  color?: string;
}

interface Props {
  character: Character;
  matches: ReadonlyArray<ReferenceMatch>;
  onConfirm: () => void;
  onSkip: () => void;
}

export const BulkRelinkDialog: React.FC<Props> = ({ character, matches, onConfirm, onSkip }) => {
  const displayName = character.displayName || character.name || character.id;
  const count = matches.length;

  return (
    <div style={overlayStyle} onClick={onSkip}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e8f0' }}>
            Link existing references?
          </h2>
        </div>
        <div style={bodyStyle}>
          <p style={paragraphStyle}>
            <strong>{displayName}</strong> is now a defined Character.{' '}
            {count === 1
              ? 'There is 1 other reference to this name in the project that could be linked too.'
              : `There are ${count} other references to this name in the project that could be linked too.`}
            {' '}
            Linked references will follow renames and feed character-aware features (TTS routing, dossier
            building, per-character inventory). You can always unlink individual references afterward.
          </p>
          <div style={listStyle}>
            {matches.map((m, i) => (
              <div key={`${m.beatId}-${i}`} style={listItemStyle}>
                <span style={listLocationStyle}>{m.where}</span>
                <span style={listValueStyle}>"{m.currentValue}"</span>
              </div>
            ))}
          </div>
        </div>
        <div style={footerStyle}>
          <button onClick={onSkip} style={secondaryBtnStyle}>
            Keep as free text
          </button>
          <button onClick={onConfirm} style={primaryBtnStyle}>
            Link {count === 1 ? '1 reference' : `${count} references`}
          </button>
        </div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
};
const dialogStyle: React.CSSProperties = {
  background: '#1e293b', borderRadius: 8, width: 560, maxWidth: '90vw', maxHeight: '80vh',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
const headerStyle: React.CSSProperties = {
  padding: '14px 20px', borderBottom: '1px solid #334155',
};
const bodyStyle: React.CSSProperties = {
  padding: 20, overflowY: 'auto', color: '#cbd5e1',
};
const paragraphStyle: React.CSSProperties = {
  margin: '0 0 16px', fontSize: 13, lineHeight: 1.55, color: '#94a3b8',
};
const listStyle: React.CSSProperties = {
  background: '#0f172a', borderRadius: 6, padding: 10, maxHeight: 280, overflowY: 'auto',
};
const listItemStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0',
  fontSize: 12, borderBottom: '1px solid #1e293b',
};
const listLocationStyle: React.CSSProperties = { color: '#cbd5e1' };
const listValueStyle: React.CSSProperties = {
  color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const footerStyle: React.CSSProperties = {
  padding: '12px 20px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', gap: 8,
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 13, background: '#15803d', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer',
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: 13, background: '#334155', color: '#e2e8f0',
  border: 'none', borderRadius: 6, cursor: 'pointer',
};
