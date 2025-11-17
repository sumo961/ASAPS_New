import { useEffect, useRef, useCallback } from 'react';
import { Beat } from '@asaps/core';

interface BeatData {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
  parameters?: Record<string, any>;
}

interface ClipboardState {
  beatData: BeatData | null;
  cutMode: boolean;
}

export function useBeatClipboard(
  selectedBeat: Beat | null,
  onCopyBeat: (beat: Beat) => void,
  onPasteBeat: (beatData: BeatData, position?: { x: number; y: number }) => void,
  onDeleteBeat: (beatId: string) => void
) {
  const clipboardRef = useRef<ClipboardState>({ beatData: null, cutMode: false });

  const copyBeat = useCallback(() => {
    if (selectedBeat) {
      // Serialize the beat data
      const beatData: BeatData = {
        id: selectedBeat.id,
        name: selectedBeat.name,
        type: selectedBeat.type,
        x: selectedBeat.x,
        y: selectedBeat.y,
        parameters: selectedBeat.getParameters()
      };
      clipboardRef.current = { beatData, cutMode: false };
      console.log('Beat copied:', selectedBeat.name);
      
      // Show visual feedback
      const message = document.createElement('div');
      message.textContent = 'Beat copied!';
      message.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50';
      document.body.appendChild(message);
      setTimeout(() => message.remove(), 2000);
    }
  }, [selectedBeat]);

  const cutBeat = useCallback(() => {
    if (selectedBeat) {
      const beatData: BeatData = {
        id: selectedBeat.id,
        name: selectedBeat.name,
        type: selectedBeat.type,
        x: selectedBeat.x,
        y: selectedBeat.y,
        parameters: selectedBeat.getParameters()
      };
      clipboardRef.current = { beatData, cutMode: true };
      console.log('Beat cut:', selectedBeat.name);
      
      // Show visual feedback
      const message = document.createElement('div');
      message.textContent = 'Beat cut!';
      message.className = 'fixed bottom-4 right-4 bg-orange-500 text-white px-4 py-2 rounded shadow-lg z-50';
      document.body.appendChild(message);
      setTimeout(() => message.remove(), 2000);
    }
  }, [selectedBeat]);

  const pasteBeat = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (clipboard.beatData) {
      // Generate new position slightly offset from original
      const newPosition = {
        x: (clipboard.beatData.x || 0) + 50,
        y: (clipboard.beatData.y || 0) + 50,
      };
      
      // Create new beat data with unique ID
      const pastedBeatData: BeatData = {
        ...clipboard.beatData,
        id: `beat_${Date.now()}`,
        name: `${clipboard.beatData.name} (Copy)`,
        x: newPosition.x,
        y: newPosition.y,
      };
      
      onPasteBeat(pastedBeatData, newPosition);
      
      // If it was a cut operation, delete the original
      if (clipboard.cutMode && clipboard.beatData.id !== pastedBeatData.id) {
        onDeleteBeat(clipboard.beatData.id);
        clipboardRef.current = { beatData: null, cutMode: false };
      }
      
      // Show visual feedback
      const message = document.createElement('div');
      message.textContent = 'Beat pasted!';
      message.className = 'fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50';
      document.body.appendChild(message);
      setTimeout(() => message.remove(), 2000);
    }
  }, [onPasteBeat, onDeleteBeat]);

  const duplicateBeat = useCallback(() => {
    if (selectedBeat) {
      const newPosition = {
        x: (selectedBeat.x || 0) + 30,
        y: (selectedBeat.y || 0) + 30,
      };
      
      const duplicatedBeatData: BeatData = {
        id: `beat_${Date.now()}`,
        name: `${selectedBeat.name} (Duplicate)`,
        type: selectedBeat.type,
        x: newPosition.x,
        y: newPosition.y,
        parameters: selectedBeat.getParameters()
      };
      
      onPasteBeat(duplicatedBeatData, newPosition);
      
      // Show visual feedback
      const message = document.createElement('div');
      message.textContent = 'Beat duplicated!';
      message.className = 'fixed bottom-4 right-4 bg-purple-500 text-white px-4 py-2 rounded shadow-lg z-50';
      document.body.appendChild(message);
      setTimeout(() => message.remove(), 2000);
    }
  }, [selectedBeat, onPasteBeat]);

  const deleteBeat = useCallback(() => {
    if (selectedBeat) {
      const confirmDelete = window.confirm(`Delete beat "${selectedBeat.name}"?`);
      if (confirmDelete) {
        onDeleteBeat(selectedBeat.id);
        
        // Show visual feedback
        const message = document.createElement('div');
        message.textContent = 'Beat deleted!';
        message.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50';
        document.body.appendChild(message);
        setTimeout(() => message.remove(), 2000);
      }
    }
  }, [selectedBeat, onDeleteBeat]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            e.preventDefault();
            copyBeat();
            break;
          case 'x':
            e.preventDefault();
            cutBeat();
            break;
          case 'v':
            e.preventDefault();
            pasteBeat();
            break;
          case 'd':
            e.preventDefault();
            duplicateBeat();
            break;
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          deleteBeat();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyBeat, cutBeat, pasteBeat, duplicateBeat, deleteBeat]);

  return {
    copyBeat,
    cutBeat,
    pasteBeat,
    duplicateBeat,
    deleteBeat,
    hasClipboard: clipboardRef.current.beatData !== null,
  };
}
