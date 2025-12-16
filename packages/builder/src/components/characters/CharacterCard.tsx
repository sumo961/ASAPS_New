/**
 * Character Card Component
 * Display card for individual character in grid/list view
 */

import React from 'react';
import { X, User, Users, Heart, Pencil } from 'lucide-react';
import { Character } from '../../types/character';

interface CharacterCardProps {
  character: Character;
  onClick: () => void;
  onRemove: () => void;
  onEdit?: () => void; // Optional edit callback for selection mode
  selectionMode?: boolean; // Whether we're in selection mode
}

export const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  onClick,
  onRemove,
  onEdit,
  selectionMode = false
}) => {
  const getRoleIcon = (role: Character['role']) => {
    switch (role) {
      case 'player': return <User className="w-6 h-6" />;
      case 'npc': return <Users className="w-6 h-6" />;
      case 'companion': return <Heart className="w-6 h-6" />;
      default: return <Users className="w-6 h-6" />;
    }
  };

  const getRoleColor = (role: Character['role']) => {
    switch (role) {
      case 'player': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'npc': return 'bg-green-100 text-green-700 border-green-200';
      case 'companion': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit();
  };

  return (
    <div
      className="relative group bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer"
      onClick={onClick}
    >
      {/* Action Buttons */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Edit Button - shown in selection mode */}
        {selectionMode && onEdit && (
          <button
            onClick={handleEdit}
            className="p-1.5 bg-white rounded-full hover:bg-blue-100"
            title="Edit Character"
          >
            <Pencil className="w-4 h-4 text-blue-500" />
          </button>
        )}
        {/* Remove Button - hidden in selection mode */}
        {!selectionMode && (
          <button
            onClick={handleRemove}
            className="p-1.5 bg-white rounded-full hover:bg-red-100"
            title="Remove Character"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>

      {/* Character Image/Icon */}
      <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
        {character.visual.defaultImage ? (
          <img 
            src={character.visual.defaultImage} 
            alt={character.displayName}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to icon if image fails
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className={`p-6 rounded-full ${getRoleColor(character.role).split(' ')[0]}`}>
            {getRoleIcon(character.role)}
          </div>
        )}
      </div>

      {/* Character Info */}
      <div className="p-3">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-medium text-sm truncate flex-1">{character.displayName}</h3>
        </div>
        <p className="text-xs text-gray-500 truncate mb-2">{character.name}</p>
        
        {/* Role Badge */}
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(character.role)}`}>
          {character.role}
        </div>

        {/* Stats */}
        <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-500">
          <span>{character.states.length} states</span>
          <span>{character.counters.length} counters</span>
        </div>

        {/* Color indicator if set */}
        {character.color && (
          <div 
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{ backgroundColor: character.color }}
          />
        )}
      </div>
    </div>
  );
};
