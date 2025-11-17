/**
 * Character Selector Component
 * Dropdown selector for choosing characters in beat editors
 */

import React from 'react';
import { Character } from '../../types/character';
import { User, Users, Heart } from 'lucide-react';

interface CharacterSelectorProps {
  value: string;
  onChange: (characterName: string) => void;
  characters: Character[];
  placeholder?: string;
  includePlayer?: boolean;
  roleFilter?: 'all' | 'player' | 'npc' | 'companion';
  className?: string;
  showRole?: boolean;
  showImage?: boolean;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  value,
  onChange,
  characters,
  placeholder = "Select character...",
  includePlayer = true,
  roleFilter = 'all',
  className = '',
  showRole = true,
  showImage = false
}) => {
  const getRoleIcon = (role: Character['role']) => {
    switch (role) {
      case 'player': return '👤';
      case 'npc': return '🧙';
      case 'companion': return '🐕';
      default: return '👥';
    }
  };

  const getRoleLabel = (role: Character['role']) => {
    switch (role) {
      case 'player': return 'Player';
      case 'npc': return 'NPC';
      case 'companion': return 'Companion';
      default: return 'Character';
    }
  };

  // Filter characters based on role filter
  const filteredCharacters = characters.filter(char => {
    if (!includePlayer && char.role === 'player') return false;
    if (roleFilter === 'all') return true;
    return char.role === roleFilter;
  });

  // Sort characters by role and then by display name
  const sortedCharacters = [...filteredCharacters].sort((a, b) => {
    if (a.role !== b.role) {
      const roleOrder = { player: 0, companion: 1, npc: 2 };
      return roleOrder[a.role] - roleOrder[b.role];
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
      >
        <option value="">{placeholder}</option>
        
        {/* Group by role for better organization */}
        {['player', 'companion', 'npc'].map(role => {
          const roleChars = sortedCharacters.filter(c => c.role === role);
          if (roleChars.length === 0) return null;
          
          return (
            <optgroup 
              key={role} 
              label={`${getRoleIcon(role as Character['role'])} ${getRoleLabel(role as Character['role'])}s`}
            >
              {roleChars.map(char => (
                <option 
                  key={char.id} 
                  value={char.name}
                  title={char.description || ''}
                >
                  {char.displayName}
                  {showRole && ` (${char.role})`}
                  {char.name !== char.displayName && ` [${char.name}]`}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      
      {/* Custom dropdown arrow */}
      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      {/* Optional: Show selected character image */}
      {showImage && value && (
        <div className="mt-2">
          {(() => {
            const selectedChar = characters.find(c => c.name === value);
            if (!selectedChar) return null;
            
            return (
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                {selectedChar.visual.defaultImage ? (
                  <img 
                    src={selectedChar.visual.defaultImage} 
                    alt={selectedChar.displayName}
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-lg">
                    {getRoleIcon(selectedChar.role)}
                  </div>
                )}
                <div>
                  <div className="font-medium text-sm">{selectedChar.displayName}</div>
                  <div className="text-xs text-gray-500">{getRoleLabel(selectedChar.role)}</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

// Additional component for multi-character selection
interface MultiCharacterSelectorProps {
  value: string[];
  onChange: (characterNames: string[]) => void;
  characters: Character[];
  placeholder?: string;
  roleFilter?: 'all' | 'player' | 'npc' | 'companion';
  className?: string;
}

export const MultiCharacterSelector: React.FC<MultiCharacterSelectorProps> = ({
  value = [],
  onChange,
  characters,
  placeholder = "Select characters...",
  roleFilter = 'all',
  className = ''
}) => {
  const handleToggle = (charName: string) => {
    if (value.includes(charName)) {
      onChange(value.filter(n => n !== charName));
    } else {
      onChange([...value, charName]);
    }
  };

  // Filter characters based on role filter
  const filteredCharacters = characters.filter(char => {
    if (roleFilter === 'all') return true;
    return char.role === roleFilter;
  });

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-sm text-gray-600">{placeholder}</div>
      <div className="border border-gray-300 rounded-lg max-h-40 overflow-y-auto p-2">
        {filteredCharacters.map(char => (
          <label 
            key={char.id} 
            className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer"
          >
            <input
              type="checkbox"
              checked={value.includes(char.name)}
              onChange={() => handleToggle(char.name)}
              className="rounded text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm">
              {char.displayName}
              <span className="text-gray-500 ml-1">({char.role})</span>
            </span>
          </label>
        ))}
        {filteredCharacters.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-2">
            No characters available
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="text-xs text-gray-600">
          Selected: {value.join(', ')}
        </div>
      )}
    </div>
  );
};
