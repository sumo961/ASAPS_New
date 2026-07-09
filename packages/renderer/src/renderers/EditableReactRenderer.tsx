import React from 'react';
import { ReactRenderer } from './ReactRenderer';
import type { Location } from '@asaps/core';
import type { RenderContext, RenderOptions } from '../types';

/**
 * EditableReactRenderer extends ReactRenderer for use in visual editor
 * 
 * Main difference: In edit mode, render methods don't wait for user input
 * This allows the visual editor to display beats without blocking
 * 
 * Note: With the unified PositionedBeatView system, this class is now
 * primarily used to prevent waiting for user actions in edit mode.
 */

export interface EditCallbacks {
  onElementSelect?: (elementId: string) => void;
  onElementDeselect?: () => void;
  onElementDrag?: (elementId: string, position: { x: number; y: number }) => void;
  onElementResize?: (elementId: string, size: { width: number; height: number }) => void;
  onElementEdit?: (elementId: string, newContent: any) => void;
  onBackgroundClick?: () => void;
}

export class EditableReactRenderer extends ReactRenderer {
  private editMode: boolean = true;
  private callbacks: EditCallbacks = {};

  constructor(
    context: RenderContext,
    options?: RenderOptions,
    editMode: boolean = true,
    callbacks?: EditCallbacks
  ) {
    super(context, options);
    this.editMode = editMode;
    this.callbacks = callbacks || {};
  }

  /**
   * Enable or disable edit mode
   */
  setEditMode(enabled: boolean): void {
    this.editMode = enabled;
  }

  /**
   * Update callbacks for editing interactions
   */
  setCallbacks(callbacks: EditCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // ============= OVERRIDE RENDER METHODS TO NOT WAIT IN EDITOR MODE =============
  
  /**
   * In editor mode, render but resolve immediately without waiting for user action
   */
  async renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void> {
    if (this.editMode) {
      // Get background
      this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
      
      if (locations && locations.length > 0) {
        // Use parent's positioned rendering but don't wait
        await this.renderPositionedBeat('titleScreen', { title, author, buttonText }, locations, false);
        return; // Resolve immediately
      }
      
      // For centered layouts in edit mode, render but don't wait
      this.resolveAction = null; // Clear any pending actions
      super.renderTitleScreen(title, author, buttonText, locations);
      return; // Resolve immediately
    }
    
    // Preview mode: wait for user action
    return super.renderTitleScreen(title, author, buttonText, locations);
  }

  async renderText(text: string, buttonText: string, locations?: Location[]): Promise<void> {
    if (this.editMode) {
      this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
      
      if (locations && locations.length > 0) {
        await this.renderPositionedBeat('infoText', { text, buttonText }, locations, false);
        return;
      }
      
      this.resolveAction = null;
      super.renderText(text, buttonText, locations);
      return;
    }
    return super.renderText(text, buttonText, locations);
  }

  async renderEndScreen(message: string, showRestart: boolean, showCredits: boolean, locations?: Location[]): Promise<string> {
    if (this.editMode) {
      this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
      const buttonText = this.getState('buttonText') || (showRestart ? 'Play Again' : 'Close');

      if (locations && locations.length > 0) {
        // In edit mode, wait for positioned beat but return empty action
        const action = await this.renderPositionedBeat('endScreen', { message, buttonText, showRestart, showCredits }, locations, false);
        return action;
      }

      this.resolveAction = null;
      return super.renderEndScreen(message, showRestart, showCredits, locations);
    }
    return super.renderEndScreen(message, showRestart, showCredits, locations);
  }

  async renderDurScreen(text: string, duration: number, locations?: Location[]): Promise<void> {
    if (this.editMode) {
      this.backgroundImageUrl = this.getState('backgroundAssetUrl') || null;
      
      if (locations && locations.length > 0) {
        await this.renderPositionedBeat('durScreen', { text }, locations, false);
        return; // Don't wait for duration in editor
      }
      
      // Render but don't wait for duration
      this.resolveAction = null;
      super.renderDurScreen(text, duration, locations);
      return;
    }
    return super.renderDurScreen(text, duration, locations);
  }

  async renderInputText(
    prompt: string,
    placeholder?: string,
    buttonText?: string,
    options?: any
  ): Promise<string> {
    if (this.editMode) {
      // Editor mode: render but return empty string immediately
      this.resolveAction = null;
      super.renderInputText(prompt, placeholder, buttonText, options);
      return '';
    }
    return super.renderInputText(prompt, placeholder, buttonText, options);
  }

  async renderHyperText(data: any): Promise<string> {
    if (this.editMode) {
      // Editor mode: render but return empty string immediately
      this.resolveAction = null;
      super.renderHyperText(data);
      return '';
    }
    return super.renderHyperText(data);
  }

  async renderInputImage(
    prompt: string,
    options: {
      imageSource?: 'upload' | 'camera' | 'both';
      buttonText?: string;
      cancelButtonText?: string;
    },
    locations?: Location[]
  ): Promise<string> {
    if (this.editMode) {
      // Editor mode: render but return the skip sentinel immediately
      this.resolveAction = null;
      super.renderInputImage(prompt, options, locations);
      return 'cancelled';
    }
    return super.renderInputImage(prompt, options, locations);
  }
}
