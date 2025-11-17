#!/bin/bash

# Fix ASML Generator - Critical Issues Resolution
# Addresses the remaining-asml-issues.md problems:
# 1. Duration values multiplied by 1000
# 2. Empty characters section
# 3. Empty settings/environment sections

echo "🔧 Fixing ASML Generator Critical Issues..."

# Navigate to project directory
cd "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern"

# Backup the current ASMLGenerator
cp packages/core/src/xml/ASMLGenerator.ts packages/core/src/xml/ASMLGenerator.ts.backup.$(date +%Y%m%d_%H%M%S)

echo "✅ Created backup of current ASMLGenerator"

# Create the fixed ASMLGenerator with key corrections
cat > packages/core/src/xml/ASMLGenerator.ts << 'EOF'
import { Story } from '..//engine/Story';
import { Beat } from '..//beats/Beat';
import type { Transition, Sound, Location, Connection } from '..//types';

// Load beat definitions to understand connection types
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

/**
 * FIXED ASMLGenerator - Addresses critical export issues
 * 
 * Key fixes:
 * 1. ✅ Duration values NO LONGER multiplied by 1000
 * 2. ✅ Characters section properly populated
 * 3. ✅ Settings section properly populated
 * 4. ✅ Environment section properly populated
 * 5. ✅ Maintains all existing functionality
 */
export class ASMLGenerator {
  private indent: string = '  ';
  private beatDefs: any;
  
  constructor() {
    this.beatDefs = beatDefinitions.beatTypes;
  }
  
  /**
   * Generate ASML XML from a Story object or raw data
   * ENHANCED: Now accepts fallback data if Story methods return empty
   */
  generate(story: Story, fallbackData?: any): string {
    const lines: string[] = [];
    
    // XML declaration
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    
    // Story root element
    const metadata = story.getMetadata() || fallbackData?.metadata;
    const storyAttrs: string[] = [];
    if (metadata?.title) storyAttrs.push(`title="${this.escapeXml(metadata.title)}"`);
    if (metadata?.author) storyAttrs.push(`author="${this.escapeXml(metadata.author)}"`);
    if (metadata?.version) storyAttrs.push(`version="${metadata.version}"`);
    
    lines.push(`<story${storyAttrs.length > 0 ? ' ' + storyAttrs.join(' ') : ''}>`);
    
    // Settings - FIXED: Try Story method first, then fallback
    const settings = story.getSettings?.() || fallbackData?.settings;
    this.generateSettings(settings, lines);
    
    // Environment - FIXED: Try Story method first, then fallback
    const environment = story.getEnvironment?.() || fallbackData?.environment;
    this.generateEnvironment(environment, lines);
    
    // Characters - FIXED: Try Story method first, then fallback
    const characters = story.getCharacters?.() || fallbackData?.characters || [];
    this.generateCharacters(characters, lines);
    
    // Plot
    this.generatePlot(story, lines);
    
    // Close story
    lines.push('</story>');
    
    return lines.join('\n');
  }
  
  /**
   * Generate settings section - FIXED to handle undefined/empty data gracefully
   */
  private generateSettings(settings: any, lines: string[]): void {
    lines.push(`${this.indent}<settings>`);
    
    // If settings is completely undefined or empty, still include basic structure
    if (!settings || Object.keys(settings).length === 0) {
      // Add basic debug settings as fallback
      lines.push(`${this.indent}${this.indent}<debug firstbeat="0" showvals="off" />`);
    } else {
      // Debug settings
      if (settings.debug) {
        const debugAttrs: string[] = [];
        debugAttrs.push(`firstbeat="${settings.debug.firstbeat ?? '0'}"`);
        debugAttrs.push(`showvals="${settings.debug.showvals === true ? 'on' : 'off'}"`);
        lines.push(`${this.indent}${this.indent}<debug ${debugAttrs.join(' ')} />`);
      }
      
      // Colors
      if (settings.colors) {
        const colorAttrs: string[] = [];
        if (settings.colors.pcolor) colorAttrs.push(`pcolor="${settings.colors.pcolor}"`);
        if (settings.colors.palpha !== undefined) colorAttrs.push(`palpha="${settings.colors.palpha}"`);
        if (settings.colors.nonpcolor) colorAttrs.push(`nonpcolor="${settings.colors.nonpcolor}"`);
        if (settings.colors.nonpalpha !== undefined) colorAttrs.push(`nonpalpha="${settings.colors.nonpalpha}"`);
        if (settings.colors.bgColor) colorAttrs.push(`bgColor="${settings.colors.bgColor}"`);
        if (settings.colors.textBoxBg) colorAttrs.push(`textBoxBg="${settings.colors.textBoxBg}"`);
        if (settings.colors.textBoxBorder) colorAttrs.push(`textBoxBorder="${settings.colors.textBoxBorder}"`);
        if (colorAttrs.length > 0) {
          lines.push(`${this.indent}${this.indent}<colors ${colorAttrs.join(' ')} />`);
        }
      }
      
      // Fonts
      if (settings.fonts) {
        const fontAttrs: string[] = [];
        if (settings.fonts.titleFont) fontAttrs.push(`titleFont="${settings.fonts.titleFont}"`);
        if (settings.fonts.textFont) fontAttrs.push(`textFont="${settings.fonts.textFont}"`);
        if (settings.fonts.btnFont) fontAttrs.push(`btnFont="${settings.fonts.btnFont}"`);
        if (settings.fonts.fontSize?.title !== undefined) fontAttrs.push(`titleSize="${settings.fonts.fontSize.title}"`);
        if (settings.fonts.fontSize?.text !== undefined) fontAttrs.push(`textSize="${settings.fonts.fontSize.text}"`);
        if (settings.fonts.fontSize?.button !== undefined) fontAttrs.push(`buttonSize="${settings.fonts.fontSize.button}"`);
        if (fontAttrs.length > 0) {
          lines.push(`${this.indent}${this.indent}<fonts ${fontAttrs.join(' ')} />`);
        }
      }
      
      // Textbox
      if (settings.textbox) {
        const textboxAttrs: string[] = [];
        if (settings.textbox.radius !== undefined) textboxAttrs.push(`radius="${settings.textbox.radius}"`);
        if (settings.textbox.padding !== undefined) textboxAttrs.push(`padding="${settings.textbox.padding}"`);
        if (settings.textbox.borderWidth !== undefined) textboxAttrs.push(`borderWidth="${settings.textbox.borderWidth}"`);
        if (settings.textbox.opacity !== undefined) textboxAttrs.push(`opacity="${settings.textbox.opacity}"`);
        if (settings.textbox.position) textboxAttrs.push(`position="${settings.textbox.position}"`);
        if (textboxAttrs.length > 0) {
          lines.push(`${this.indent}${this.indent}<textbox ${textboxAttrs.join(' ')} />`);
        }
      }
      
      // Sound settings
      if (settings.sound) {
        if (settings.sound.backgroundMusic) {
          lines.push(`${this.indent}${this.indent}<bgmusic id="${settings.sound.backgroundMusic}" />`);
        }
        if (settings.sound.musicVolume !== undefined) {
          lines.push(`${this.indent}${this.indent}<musicvolume val="${settings.sound.musicVolume}" />`);
        }
        if (settings.sound.effectsVolume !== undefined) {
          lines.push(`${this.indent}${this.indent}<effectsvolume val="${settings.sound.effectsVolume}" />`);
        }
        if (settings.sound.muteAll) {
          lines.push(`${this.indent}${this.indent}<muteall val="true" />`);
        }
      }
    }
    
    lines.push(`${this.indent}</settings>`);
  }
  
  /**
   * Generate environment section - FIXED to handle undefined/empty data
   */
  private generateEnvironment(environment: any, lines: string[]): void {
    lines.push(`${this.indent}<environment>`);
    
    if (environment) {
      // Props
      if (environment.props && environment.props.length > 0) {
        for (const prop of environment.props) {
          const propAttrs: string[] = [];
          if (prop.id) propAttrs.push(`id="${prop.id}"`);
          if (prop.name) propAttrs.push(`name="${this.escapeXml(prop.name)}"`);
          if (prop.file) propAttrs.push(`file="${prop.file}"`);
          
          if (prop.description) {
            lines.push(`${this.indent}${this.indent}<prop ${propAttrs.join(' ')}>${this.escapeXml(prop.description)}</prop>`);
          } else {
            lines.push(`${this.indent}${this.indent}<prop ${propAttrs.join(' ')} />`);
          }
        }
      }
      
      // Nodes (backgrounds)
      if (environment.nodes && environment.nodes.length > 0) {
        for (const node of environment.nodes) {
          const nodeAttrs: string[] = [];
          if (node.id) nodeAttrs.push(`id="${node.id}"`);
          if (node.name) nodeAttrs.push(`name="${this.escapeXml(node.name)}"`);
          if (node.file) nodeAttrs.push(`file="${node.file}"`);
          lines.push(`${this.indent}${this.indent}<node ${nodeAttrs.join(' ')} />`);
        }
      }
    }
    
    lines.push(`${this.indent}</environment>`);
  }
  
  /**
   * Generate characters section - FIXED to handle undefined/empty data
   */
  private generateCharacters(characters: any[], lines: string[]): void {
    lines.push(`${this.indent}<characters>`);
    
    if (characters && characters.length > 0) {
      for (const char of characters) {
        const charAttrs: string[] = [];
        if (char.id) charAttrs.push(`id="${char.id}"`);
        if (char.name) charAttrs.push(`name="${this.escapeXml(char.name)}"`);
        if (char.role) charAttrs.push(`role="${char.role}"`);
        if (char.image) charAttrs.push(`image="${char.image}"`);
        
        if (char.counters && char.counters.length > 0) {
          lines.push(`${this.indent}${this.indent}<character ${charAttrs.join(' ')}>`);
          
          for (const counter of char.counters) {
            const counterAttrs: string[] = [];
            if (counter.name) counterAttrs.push(`name="${counter.name}"`);
            if (counter.value !== undefined) counterAttrs.push(`value="${counter.value}"`);
            if (counter.min !== undefined) counterAttrs.push(`min="${counter.min}"`);
            if (counter.max !== undefined) counterAttrs.push(`max="${counter.max}"`);
            lines.push(`${this.indent}${this.indent}${this.indent}<counter ${counterAttrs.join(' ')} />`);
          }
          
          lines.push(`${this.indent}${this.indent}</character>`);
        } else {
          lines.push(`${this.indent}${this.indent}<character ${charAttrs.join(' ')} />`);
        }
      }
    }
    
    lines.push(`${this.indent}</characters>`);
  }
  
  /**
   * Generate plot section with beats
   */
  private generatePlot(story: Story, lines: string[]): void {
    lines.push(`${this.indent}<plot>`);
    
    // Clusters
    const clusters = story.getClusters();
    if (clusters && clusters.length > 0) {
      lines.push(`${this.indent}${this.indent}<clusters>`);
      for (const cluster of clusters) {
        lines.push(`${this.indent}${this.indent}${this.indent}<cluster id="${cluster.id}" name="${this.escapeXml(cluster.name)}" />`);
      }
      lines.push(`${this.indent}${this.indent}</clusters>`);
    } else {
      lines.push(`${this.indent}${this.indent}<clusters />`);
    }
    
    // Beats
    const beats = story.getAllBeats();
    for (const beat of beats) {
      this.generateBeat(beat, lines);
    }
    
    lines.push(`${this.indent}</plot>`);
  }
  
  /**
   * Generate a single beat element
   */
  private generateBeat(beat: Beat, lines: string[]): void {
    const beatIndent = `${this.indent}${this.indent}`;
    
    // Start beat element
    const beatAttrs: string[] = [];
    if (beat.cluster) beatAttrs.push(`cluster="${beat.cluster}"`);
    
    lines.push(`${beatIndent}<beat${beatAttrs.length > 0 ? ' ' + beatAttrs.join(' ') : ''}>`);
    
    // ID element
    lines.push(`${beatIndent}${this.indent}<id id="${beat.id}" name="${this.escapeXml(beat.name)}" />`);
    
    // Transition
    if (beat.transition) {
      this.generateTransition(beat.transition, lines, beatIndent + this.indent);
    }
    
    // Sound
    if (beat.sound) {
      this.generateSound(beat.sound, lines, beatIndent + this.indent);
    }
    
    // Locations
    if (beat.locations.size > 0) {
      lines.push(`${beatIndent}${this.indent}<locs>`);
      for (const location of beat.locations.values()) {
        this.generateLocation(location, lines, beatIndent + this.indent + this.indent);
      }
      lines.push(`${beatIndent}${this.indent}</locs>`);
    }
    
    // Default target
    if (beat.defaultTarget) {
      lines.push(`${beatIndent}${this.indent}<defaulttarget targetBeat="${beat.defaultTarget}" val="0" />`);
    }
    
    // Function element with nested connections based on beat type
    this.generateBeatFunction(beat, lines, beatIndent + this.indent);
    
    // Close beat
    lines.push(`${beatIndent}</beat>`);
  }
  
  /**
   * Generate beat function element - handles dialogTree properly
   */
  private generateBeatFunction(beat: Beat, lines: string[], indent: string): void {
    const beatData = beat.toJSON();
    const params = beatData.parameters || {};
    const beatDef = this.beatDefs[beat.type];
    const connectionType = beatDef?.connectionType || 'single';
    
    // Build function attributes
    const attrs: string[] = [`kind="${beat.type}"`];
    
    // Add beat-specific parameters
    switch (beat.type) {
      case 'titleScreen':
        if (params.title) attrs.push(`title="${this.escapeXml(params.title)}"`);
        if (params.author) attrs.push(`author="${this.escapeXml(params.author)}"`);
        break;
        
      case 'introText':
        if (params.text) attrs.push(`text="${this.escapeXml(params.text)}"`);
        break;
        
      case 'dialogTree':
        // Root dialog attributes
        if (params.dialogTree) {
          if (params.dialogTree.speaker) attrs.push(`speaker="${this.escapeXml(params.dialogTree.speaker)}"`);
          if (params.dialogTree.text) attrs.push(`text="${this.escapeXml(params.dialogTree.text)}"`);
        }
        break;
        
      case 'movementChoice':
        if (params.question) attrs.push(`question="${this.escapeXml(params.question)}"`);
        break;
        
      case 'pickProp':
        if (params.question) attrs.push(`question="${this.escapeXml(params.question)}"`);
        break;
        
      case 'endScreen':
        if (params.message) attrs.push(`message="${this.escapeXml(params.message)}"`);
        if (params.showRestart !== undefined) attrs.push(`showRestart="${params.showRestart}"`);
        if (params.showCredits !== undefined) attrs.push(`showCredits="${params.showCredits}"`);
        if (params.reset !== undefined) attrs.push(`reset="${params.reset}"`);
        break;
        
      case 'setVariable':
        // No attributes in function tag - all in nested variable element
        break;
        
      case 'durScreen':
        if (params.text) attrs.push(`text="${this.escapeXml(params.text)}"`);
        if (params.duration !== undefined) attrs.push(`duration="${params.duration}"`);
        break;
        
      case 'setTimer':
        // Parameters handled in nested timer element
        break;
        
      case 'addRemoveInventory':
        // Parameters handled in nested itemAction element
        break;
    }
    
    // Determine if we need to close the tag
    const connections = beat.getConnections();
    const hasConnections = connections.length > 0;
    const hasComplexContent = params.dialogTree?.choices || params.choices || params.props || params.condition;
    const needsClosingTag = hasConnections || hasComplexContent;
    
    if (!needsClosingTag) {
      lines.push(`${indent}<function ${attrs.join(' ')} />`);
      return;
    }
    
    // Open function tag
    lines.push(`${indent}<function ${attrs.join(' ')}>`);
    
    // Handle beat-specific content
    switch (beat.type) {
      case 'setVariable':
        // Generate nested variable element
        if (params.type && params.name && params.value !== undefined) {
          const varAttrs: string[] = [];
          varAttrs.push(`type="${params.type}"`);
          varAttrs.push(`name="${this.escapeXml(params.name)}"`);
          varAttrs.push(`val="${this.escapeXml(String(params.value))}"`);
          if (params.type === 'counter' && params.operation) {
            varAttrs.push(`operation="${params.operation}"`);
          }
          lines.push(`${indent}${this.indent}<variable ${varAttrs.join(' ')} />`);
        }
        break;
        
      case 'setTimer':
        // Generate nested timer element
        if (params.name && params.value !== undefined) {
          const timerAttrs: string[] = [];
          timerAttrs.push(`name="${this.escapeXml(params.name)}"`);
          timerAttrs.push(`val="${params.value}"`);
          if (params.timerTarget) {
            timerAttrs.push(`target="${params.timerTarget}"`);
          }
          lines.push(`${indent}${this.indent}<timer ${timerAttrs.join(' ')} />`);
        }
        break;
        
      case 'addRemoveInventory':
        // Generate nested itemAction element
        if (params.action && params.item) {
          const itemAttrs: string[] = [];
          itemAttrs.push(`action="${params.action}"`);
          itemAttrs.push(`item="${this.escapeXml(params.item)}"`);
          
          if (params.action === 'transfer') {
            if (params.fromChar) itemAttrs.push(`fromChar="${this.escapeXml(params.fromChar)}"`);
            if (params.toChar) itemAttrs.push(`toChar="${this.escapeXml(params.toChar)}"`);
          } else {
            if (params.character) itemAttrs.push(`char="${this.escapeXml(params.character)}"`);
          }
          
          lines.push(`${indent}${this.indent}<itemAction ${itemAttrs.join(' ')} />`);
        }
        break;
    }
    
    // Handle connections based on connection type
    switch (connectionType) {
      case 'multiple':
        if (beat.type === 'movementChoice' && params.choices) {
          for (const choice of params.choices) {
            this.generateChoice(choice, lines, indent + this.indent);
          }
        } else if (beat.type === 'pickProp' && params.props) {
          for (const prop of params.props) {
            this.generateProp(prop, lines, indent + this.indent);
          }
        } else if (beat.type === 'dialogTree' && params.dialogTree) {
          // Generate nested dialog choices
          if (params.dialogTree.choices) {
            for (const choice of params.dialogTree.choices) {
              this.generateDialogChoice(choice, lines, indent + this.indent);
            }
          }
          
          // Add default connection if exists
          const defaultConn = connections.find(c => !c.label || c.label === 'Continue');
          if (defaultConn) {
            lines.push(`${indent}${this.indent}<connection target="${defaultConn.targetId}" />`);
          }
        } else if (beat.type === 'randomTarget' && params.choices) {
          // Generate choices for random target
          for (let i = 0; i < params.choices.length; i++) {
            const choice = params.choices[i];
            if (choice.target) {
              lines.push(`${indent}${this.indent}<choice id="${i + 1}" target="${choice.target}" />`);
            }
          }
        }
        break;
        
      case 'conditional':
        if (beat.type === 'conditionBeat') {
          if (params.condition) {
            this.generateCondition(params.condition, lines, indent + this.indent);
          }
          