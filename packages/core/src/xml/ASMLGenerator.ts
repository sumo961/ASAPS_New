import { Story } from '..//engine/Story';
import { Beat } from '..//beats/Beat';
import type { Transition, Sound, Location, Connection } from '..//types';

// Load beat definitions to understand connection types
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

/**
 * FIXED ASMLGenerator - Properly handles nested dialog trees
 * 
 * Key fixes:
 * 1. Properly exports nested dialog objects (not [object Object])
 * 2. Handles unlimited dialog tree depth
 * 3. Preserves all beat parameters
 * 4. Maintains correct structure for re-import
 */
export class ASMLGenerator {
  private indent: string = '  ';
  private beatDefs: any;
  
  constructor() {
    this.beatDefs = beatDefinitions.beatTypes;
  }
  
  /**
   * Generate ASML XML from a Story object
   */
  generate(story: Story): string {
    const lines: string[] = [];
    
    // XML declaration
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    
    // Story root element
    const metadata = story.getMetadata();
    const storyAttrs: string[] = [];
    if (metadata?.title) storyAttrs.push(`title="${this.escapeXml(metadata.title)}"`);
    if (metadata?.author) storyAttrs.push(`author="${this.escapeXml(metadata.author)}"`);
    if (metadata?.version) storyAttrs.push(`version="${metadata.version}"`);
    
    lines.push(`<story${storyAttrs.length > 0 ? ' ' + storyAttrs.join(' ') : ''}>`);
    
    // Settings
    this.generateSettings(story.getSettings(), lines);
    
    // Environment
    this.generateEnvironment(story.getEnvironment(), lines);
    
    // Characters
    this.generateCharacters(story.getCharacters(), lines);
    
    // Plot
    this.generatePlot(story, lines);
    
    // Close story
    lines.push('</story>');
    
    return lines.join('\n');
  }
  
  /**
   * Generate settings section with ALL global settings
   */
  private generateSettings(settings: any, lines: string[]): void {
    lines.push(`${this.indent}<settings>`);
    
    // Project settings - always include with defaults
    const project = settings?.project || {};
    const projectAttrs: string[] = [];
    projectAttrs.push(`width="${project.width || 1024}"`);
    projectAttrs.push(`height="${project.height || 768}"`);
    projectAttrs.push(`aspectRatio="${project.aspectRatio || '4:3'}"`);
    projectAttrs.push(`scalingMode="${project.scalingMode || 'fit'}"`);
    lines.push(`${this.indent}${this.indent}<project ${projectAttrs.join(' ')} />`);
    
    // Debug settings - always include with defaults
    const debug = settings?.debug || {};
    lines.push(`${this.indent}${this.indent}<debug firstbeat="${debug.firstbeat || '0'}" showvals="${debug.showvals === true || debug.showvals === 'on' ? 'on' : 'off'}" />`);
    
    // Colors - always include with defaults
    const colors = settings?.colors || {};
    const colorAttrs: string[] = [];
    colorAttrs.push(`pcolor="${colors.pcolor || '#7D8DA3'}"`);
    colorAttrs.push(`palpha="${colors.palpha ?? 90}"`);
    if (colors.nonpcolor) colorAttrs.push(`nonpcolor="${colors.nonpcolor}"`);
    if (colors.nonpalpha !== undefined) colorAttrs.push(`nonpalpha="${colors.nonpalpha}"`);
    if (colors.bgColor) colorAttrs.push(`bgColor="${colors.bgColor}"`);
    if (colors.textBoxBg) colorAttrs.push(`textBoxBg="${colors.textBoxBg}"`);
    if (colors.textBoxBorder) colorAttrs.push(`textBoxBorder="${colors.textBoxBorder}"`);
    lines.push(`${this.indent}${this.indent}<colors ${colorAttrs.join(' ')} />`);
    
    // Fonts - always include with defaults
    const fonts = settings?.fonts || {};
    const fontAttrs: string[] = [];
    fontAttrs.push(`titleFont="${fonts.titleFont || 'Gothic'}"`);
    fontAttrs.push(`textFont="${fonts.textFont || 'Handwriting2'}"`);
    if (fonts.btnFont) fontAttrs.push(`btnFont="${fonts.btnFont}"`);
    if (fonts.fontSize?.title !== undefined) fontAttrs.push(`titleSize="${fonts.fontSize.title}"`);
    if (fonts.fontSize?.text !== undefined) fontAttrs.push(`textSize="${fonts.fontSize.text}"`);
    if (fonts.fontSize?.button !== undefined) fontAttrs.push(`buttonSize="${fonts.fontSize.button}"`);
    lines.push(`${this.indent}${this.indent}<fonts ${fontAttrs.join(' ')} />`);
    
    // Textbox - always include with defaults
    const textbox = settings?.textbox || {};
    const textboxAttrs: string[] = [];
    textboxAttrs.push(`radius="${textbox.radius ?? 20}"`);
    if (textbox.padding !== undefined) textboxAttrs.push(`padding="${textbox.padding}"`);
    if (textbox.borderWidth !== undefined) textboxAttrs.push(`borderWidth="${textbox.borderWidth}"`);
    if (textbox.opacity !== undefined) textboxAttrs.push(`opacity="${textbox.opacity}"`);
    if (textbox.position) textboxAttrs.push(`position="${textbox.position}"`);
    lines.push(`${this.indent}${this.indent}<textbox ${textboxAttrs.join(' ')} />`);
    
    // Text Effects - always include with defaults
    const textEffects = settings?.textEffects || {};
    const textEffectsAttrs: string[] = [];
    textEffectsAttrs.push(`animation="${textEffects.animation || 'none'}"`);
    if (textEffects.typewriterSpeed !== undefined) textEffectsAttrs.push(`typewriterSpeed="${textEffects.typewriterSpeed}"`);
    if (textEffects.fadeInDuration !== undefined) textEffectsAttrs.push(`fadeInDuration="${textEffects.fadeInDuration}"`);
    lines.push(`${this.indent}${this.indent}<texteffects ${textEffectsAttrs.join(' ')} />`);
    
    // Hotspots - always include with defaults
    const hotspots = settings?.hotspots || {};
    const hotspotsAttrs: string[] = [];
    hotspotsAttrs.push(`visible="${hotspots.visible !== false}"`);
    hotspotsAttrs.push(`labels="${hotspots.labels !== false}"`);
    if (hotspots.highlightColor) hotspotsAttrs.push(`highlightColor="${hotspots.highlightColor}"`);
    lines.push(`${this.indent}${this.indent}<hotspots ${hotspotsAttrs.join(' ')} />`);
    
    // Background Sound - always include even if empty for round-trip compatibility
    const sound = settings?.sound || {};
    const soundAttrs: string[] = [];
    soundAttrs.push(`name="${sound.backgroundMusic || ''}"`);
    soundAttrs.push(`volume="${sound.backgroundVolume ?? 70}"`);
    soundAttrs.push(`mute="${sound.mute === true}"`);
    lines.push(`${this.indent}${this.indent}<backgroundsound ${soundAttrs.join(' ')} />`);
    
    // Copyright - always include with defaults
    const copyright = settings?.copyright || {};
    if (copyright.notice) {
      lines.push(`${this.indent}${this.indent}<copyright notice="${this.escapeXml(copyright.notice)}" />`);
    } else if (copyright.year && copyright.owner) {
      // Generate default notice if components are available
      const defaultNotice = `Copyright © ${copyright.year} ${copyright.owner} All Rights Reserved`;
      lines.push(`${this.indent}${this.indent}<copyright notice="${this.escapeXml(defaultNotice)}" />`);
    }

    lines.push(`${this.indent}</settings>`);

  }
  
  /**
   * Generate environment section with assets
   */
  private generateEnvironment(environment: any, lines: string[]): void {
    lines.push(`${this.indent}<environment>`);
    
    // Assets (if provided)
    if (environment?.assets && environment.assets.length > 0) {
      lines.push(`${this.indent}${this.indent}<assets>`);
      for (const asset of environment.assets) {
        const assetAttrs: string[] = [];
        if (asset.id) assetAttrs.push(`id="${asset.id}"`);
        if (asset.name) assetAttrs.push(`name="${this.escapeXml(asset.name)}"`);
        if (asset.type) assetAttrs.push(`type="${asset.type}"`);
        if (asset.subType) assetAttrs.push(`subType="${asset.subType}"`);
        if (asset.url) assetAttrs.push(`url="${asset.url}"`);
        if (asset.file) assetAttrs.push(`file="${asset.file}"`);
        if (asset.size) assetAttrs.push(`size="${asset.size}"`);
        
        lines.push(`${this.indent}${this.indent}${this.indent}<asset ${assetAttrs.join(' ')} />`);
      }
      lines.push(`${this.indent}${this.indent}</assets>`);
    }
    
    // Props
    if (environment?.props && environment.props.length > 0) {
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
    if (environment?.nodes && environment.nodes.length > 0) {
      for (const node of environment.nodes) {
        const nodeAttrs: string[] = [];
        if (node.id) nodeAttrs.push(`id="${node.id}"`);
        if (node.name) nodeAttrs.push(`name="${this.escapeXml(node.name)}"`);
        if (node.file) nodeAttrs.push(`file="${node.file}"`);
        lines.push(`${this.indent}${this.indent}<node ${nodeAttrs.join(' ')} />`);
      }
    }
    
    lines.push(`${this.indent}</environment>`);
  }
  
  /**
   * Generate characters section - ENHANCED to export all character properties
   */
  private generateCharacters(characters: any[], lines: string[]): void {
    lines.push(`${this.indent}<characters>`);
    
    if (characters && characters.length > 0) {
      for (const char of characters) {
        const charAttrs: string[] = [];
        if (char.id) charAttrs.push(`id="${char.id}"`);
        if (char.name) charAttrs.push(`name="${this.escapeXml(char.name)}"`);
        if (char.displayName) charAttrs.push(`displayName="${this.escapeXml(char.displayName)}"`);
        if (char.role) charAttrs.push(`role="${char.role}"`);
        if (char.color) charAttrs.push(`color="${char.color}"`);
        if (char.defaultState) charAttrs.push(`defaultState="${char.defaultState}"`);
        if (char.createdAt) charAttrs.push(`createdAt="${char.createdAt}"`);
        if (char.updatedAt) charAttrs.push(`updatedAt="${char.updatedAt}"`);
        
        // Check if character has complex content
        const hasComplexContent = 
          (char.description) ||
          (char.tags && char.tags.length > 0) ||
          (char.visual) ||
          (char.states && char.states.length > 0) ||
          (char.counters && char.counters.length > 0) ||
          (char.inventory && char.inventory.length > 0);
        
        if (hasComplexContent) {
          lines.push(`${this.indent}${this.indent}<character ${charAttrs.join(' ')}>`);
          
          // Description
          if (char.description) {
            lines.push(`${this.indent}${this.indent}${this.indent}<description>${this.escapeXml(char.description)}</description>`);
          }
          
          // Tags
          if (char.tags && char.tags.length > 0) {
            lines.push(`${this.indent}${this.indent}${this.indent}<tags>${char.tags.map((t: string) => this.escapeXml(t)).join(',')}</tags>`);
          }
          
          // Visual configuration
          if (char.visual) {
            const visualAttrs: string[] = [];
            if (char.visual.type) visualAttrs.push(`type="${char.visual.type}"`);
            if (char.visual.defaultImage) visualAttrs.push(`defaultImage="${char.visual.defaultImage}"`);
            
            if (char.visual.spriteSheet) {
              lines.push(`${this.indent}${this.indent}${this.indent}<visual ${visualAttrs.join(' ')}>`);
              const spriteAttrs: string[] = [];
              if (char.visual.spriteSheet.url) spriteAttrs.push(`url="${char.visual.spriteSheet.url}"`);
              if (char.visual.spriteSheet.frameWidth) spriteAttrs.push(`frameWidth="${char.visual.spriteSheet.frameWidth}"`);
              if (char.visual.spriteSheet.frameHeight) spriteAttrs.push(`frameHeight="${char.visual.spriteSheet.frameHeight}"`);
              lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<spriteSheet ${spriteAttrs.join(' ')} />`);
              lines.push(`${this.indent}${this.indent}${this.indent}</visual>`);
            } else {
              lines.push(`${this.indent}${this.indent}${this.indent}<visual ${visualAttrs.join(' ')} />`);
            }
          }
          
          // States
          if (char.states && char.states.length > 0) {
            lines.push(`${this.indent}${this.indent}${this.indent}<states>`);
            for (const state of char.states) {
              const stateAttrs: string[] = [];
              if (state.id) stateAttrs.push(`id="${state.id}"`);
              if (state.name) stateAttrs.push(`name="${this.escapeXml(state.name)}"`);
              if (state.displayName) stateAttrs.push(`displayName="${this.escapeXml(state.displayName)}"`);
              
              if (state.visual && state.visual.image) {
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<state ${stateAttrs.join(' ')}>`);
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}${this.indent}<visual image="${state.visual.image}" />`);
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}</state>`);
              } else {
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<state ${stateAttrs.join(' ')} />`);
              }
            }
            lines.push(`${this.indent}${this.indent}${this.indent}</states>`);
          }
          
          // Counters
          if (char.counters && char.counters.length > 0) {
            lines.push(`${this.indent}${this.indent}${this.indent}<counters>`);
            for (const counter of char.counters) {
              const counterAttrs: string[] = [];
              if (counter.name) counterAttrs.push(`name="${this.escapeXml(counter.name)}"`);
              if (counter.displayName) counterAttrs.push(`displayName="${this.escapeXml(counter.displayName)}"`);
              if (counter.value !== undefined) counterAttrs.push(`value="${counter.value}"`);
              if (counter.min !== undefined) counterAttrs.push(`min="${counter.min}"`);
              if (counter.max !== undefined) counterAttrs.push(`max="${counter.max}"`);
              if (counter.visible !== undefined) counterAttrs.push(`visible="${counter.visible}"`);
              if (counter.icon) counterAttrs.push(`icon="${counter.icon}"`);
              if (counter.color) counterAttrs.push(`color="${counter.color}"`);
              lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<counter ${counterAttrs.join(' ')} />`);
            }
            lines.push(`${this.indent}${this.indent}${this.indent}</counters>`);
          }
          
          // Inventory
          if (char.inventory && char.inventory.length > 0) {
            lines.push(`${this.indent}${this.indent}${this.indent}<inventory>`);
            for (const item of char.inventory) {
              const itemAttrs: string[] = [];
              if (item.id) itemAttrs.push(`id="${item.id}"`);
              if (item.name) itemAttrs.push(`name="${this.escapeXml(item.name)}"`);
              if (item.displayName) itemAttrs.push(`displayName="${this.escapeXml(item.displayName)}"`);
              if (item.icon) itemAttrs.push(`icon="${item.icon}"`);
              if (item.quantity !== undefined) itemAttrs.push(`quantity="${item.quantity}"`);
              if (item.stackable !== undefined) itemAttrs.push(`stackable="${item.stackable}"`);
              if (item.category) itemAttrs.push(`category="${item.category}"`);
              if (item.maxStack !== undefined) itemAttrs.push(`maxStack="${item.maxStack}"`);
              
              if (item.description) {
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<item ${itemAttrs.join(' ')}>`);
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}${this.indent}<description>${this.escapeXml(item.description)}</description>`);
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}</item>`);
              } else {
                lines.push(`${this.indent}${this.indent}${this.indent}${this.indent}<item ${itemAttrs.join(' ')} />`);
              }
            }
            lines.push(`${this.indent}${this.indent}${this.indent}</inventory>`);
          }
          
          lines.push(`${this.indent}${this.indent}</character>`);
        } else {
          // Simple character with no complex content
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
    const beatData = beat.toJSON();
    const params = beatData.parameters || {};
    
    // Start beat element with position attributes
    const beatAttrs: string[] = [];
    
    // Add position attributes for flowchart (rounded to integers)
    if (beat.x !== undefined) beatAttrs.push(`x="${Math.round(beat.x)}"`);
    if (beat.y !== undefined) beatAttrs.push(`y="${Math.round(beat.y)}"`);
    
    // Add cluster if present
    if (beat.cluster) beatAttrs.push(`cluster="${beat.cluster}"`);
    
    lines.push(`${beatIndent}<beat${beatAttrs.length > 0 ? ' ' + beatAttrs.join(' ') : ''}>`)
    
    // ID element
    lines.push(`${beatIndent}${this.indent}<id id="${beat.id}" name="${this.escapeXml(beat.name)}" />`);
    
    // Transition
    if (beat.transition) {
      this.generateTransition(beat.transition, lines, beatIndent + this.indent);
    }
    
    // Sound - including background sound from parameters
    if (beat.sound || params.backgroundSound) {
      const soundData = beat.sound || { file: params.backgroundSound };
      this.generateSound(soundData, lines, beatIndent + this.indent);
    }
    
    // Node (background asset)
    console.log(`[ASMLGenerator.generateBeat] ${beat.type} (id: ${beat.id}) - params.node:`, params.node);
    console.log(`[ASMLGenerator.generateBeat] ${beat.type} (id: ${beat.id}) - beat.node:`, (beat as any).node);
    console.log(`[ASMLGenerator.generateBeat] ${beat.type} (id: ${beat.id}) - beatData.node:`, beatData.node);
    if (params.node) {
      console.log(`[ASMLGenerator.generateBeat] Writing <node> element: ${params.node}`);
      lines.push(`${beatIndent}${this.indent}<node>${this.escapeXml(params.node)}</node>`);
    } else {
      console.log(`[ASMLGenerator.generateBeat] Skipping <node> element (params.node is falsy)`);
    }
    
    // Locations - from both old beat.locations and new params.locs
    const hasOldLocations = beat.locations && beat.locations.size > 0;
    const hasNewLocations = params.locs && params.locs.length > 0;
    
    if (hasOldLocations || hasNewLocations) {
      lines.push(`${beatIndent}${this.indent}<locs>`);
      
      // Add old-style locations if present
      if (hasOldLocations) {
        for (const location of beat.locations.values()) {
          this.generateLocation(location, lines, beatIndent + this.indent + this.indent);
        }
      }
      
      // Add new-style visual elements as locations
      if (hasNewLocations) {
        for (const loc of params.locs) {
          this.generateVisualLocation(loc, lines, beatIndent + this.indent + this.indent);
        }
      }
      
      lines.push(`${beatIndent}${this.indent}</locs>`);
    }
    
    // Default target
    if (beat.defaultTarget) {
      const delay = beat.defaultTargetDelay || 0;
      const attrs = [`targetBeat="${beat.defaultTarget}"`, `val="${delay}"`];

      // Add showTimer attribute if configured
      if (beat.showTimer) {
        attrs.push(`showTimer="true"`);
      }

      lines.push(`${beatIndent}${this.indent}<defaulttarget ${attrs.join(' ')} />`);
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
        // Parameters handled in nested variable element
        break;
        
      case 'setTimer':
        // Parameters handled in nested timer element
        break;
        
      case 'durScreen':
        if (params.text) attrs.push(`text="${this.escapeXml(params.text)}"`);
        if (params.duration !== undefined) attrs.push(`duration="${params.duration}"`);
        break;
        
      case 'addRemoveInventory':
        // Parameters handled in nested itemAction element
        break;
        
      case 'inputText':
        if (params.prompt) attrs.push(`prompt="${this.escapeXml(params.prompt)}"`);
        if (params.saveToType) attrs.push(`saveToType="${params.saveToType}"`);
        if (params.variable) attrs.push(`variable="${this.escapeXml(params.variable)}"`);
        if (params.characterId) attrs.push(`characterId="${this.escapeXml(params.characterId)}"`);
        if (params.placeholder) attrs.push(`placeholder="${this.escapeXml(params.placeholder)}"`);
        if (params.validation) attrs.push(`validation="${params.validation}"`);
        if (params.minLength !== undefined) attrs.push(`minLength="${params.minLength}"`);
        if (params.maxLength !== undefined) attrs.push(`maxLength="${params.maxLength}"`);
        if (params.required !== undefined) attrs.push(`required="${params.required}"`);
        if (params.buttonText) attrs.push(`buttonText="${this.escapeXml(params.buttonText)}"`);
        break;
        
      case 'hyperText':
        if (params.text) attrs.push(`text="${this.escapeXml(params.text)}"`);
        if (params.allowMultipleClicks !== undefined) attrs.push(`allowMultipleClicks="${params.allowMultipleClicks}"`);
        if (params.highlightColor) attrs.push(`highlightColor="${params.highlightColor}"`);
        if (params.hoverColor) attrs.push(`hoverColor="${params.hoverColor}"`);
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
        // Generate nested timer element with target attribute
        if (params.timerName && params.value !== undefined) {
          const timerAttrs: string[] = [];
          timerAttrs.push(`name="${this.escapeXml(params.timerName)}"`);
          timerAttrs.push(`val="${params.value}"`);
          if (params.timerTarget) {
            timerAttrs.push(`target="${params.timerTarget}"`);
          }
          lines.push(`${indent}${this.indent}<timer ${timerAttrs.join(' ')} />`);
        }
        // Export only the continue connection (should be the only connection)
        // setTimer is an invisible beat, so no label on connection
        if (connections.length > 0) {
          // There should only be one connection - the continue connection
          //const continueConn = connections[0];
          // if (continueConn && continueConn.targetId) {
          //   this.generateConnection({ targetId: continueConn.targetId, label: undefined }, lines, indent + this.indent);
          // }
          const continueConn = connections.find(c => !c.label || c.label === '');
          if (continueConn?.targetId) {
            this.generateConnection(
              { targetId: continueConn.targetId, label: undefined },
              lines,
              indent + this.indent
            );
          }
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
            // Enrich choice with sound from its location
            const enrichedChoice = { ...choice };
            if (choice.location && beat.locations) {
              const location = Array.from(beat.locations.values()).find(loc => loc.name === choice.location);
              if (location?.sound) {
                enrichedChoice.sound = location.sound;
              }
            }
            this.generateChoice(enrichedChoice, lines, indent + this.indent);
          }
        } else if (beat.type === 'pickProp' && params.props) {
          for (const prop of params.props) {
            // Enrich prop with sound from its location
            const enrichedProp = { ...prop };
            if (prop.name && beat.locations) {
              // Props use 'name' field to match location name
              const location = Array.from(beat.locations.values()).find(loc => loc.name === prop.name);
              if (location?.sound) {
                enrichedProp.sound = location.sound;
              }
            }
            this.generateProp(enrichedProp, lines, indent + this.indent);
          }
        } else if (beat.type === 'dialogTree' && params.dialogTree) {
          // Generate nested dialog choices
          if (params.dialogTree.choices) {
            for (const choice of params.dialogTree.choices) {
              // Enrich choice with sound from its location (matched by text)
              const enrichedChoice = { ...choice };
              if (choice.text && beat.locations) {
                const location = Array.from(beat.locations.values()).find(loc => loc.name === choice.text);
                if (location?.sound) {
                  enrichedChoice.sound = location.sound;
                }
              }
              this.generateDialogChoice(enrichedChoice, lines, indent + this.indent);
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
            if (choice) {
              // choices array contains strings (beat IDs) directly
              lines.push(`${indent}${this.indent}<choice targetBeat="${choice}" />`);
            }
          }
        } else if (beat.type === 'hyperText' && params.hyperlinks) {
          // Generate hyperlinks for hyperText beat
          for (const link of params.hyperlinks) {
            const linkAttrs: string[] = [];
            if (link.start !== undefined) linkAttrs.push(`start="${link.start}"`);
            if (link.end !== undefined) linkAttrs.push(`end="${link.end}"`);
            if (link.targetBeatId) linkAttrs.push(`targetBeat="${link.targetBeatId}"`);
            if (link.style?.color) linkAttrs.push(`color="${link.style.color}"`);
            if (link.style?.underline !== undefined) linkAttrs.push(`underline="${link.style.underline}"`);
            lines.push(`${indent}${this.indent}<hyperlink ${linkAttrs.join(' ')} />`);
          }
        }
        break;
        
      case 'conditional':
        if (beat.type === 'conditionBeat') {
          // Generate condition element with proper parameters
          const condAttrs: string[] = [];
          condAttrs.push(`type="${params.conditionType || 'variable'}"`);
          
          if (params.conditionType === 'inventory') {
            // For inventory conditions, use checkType instead of operator
            condAttrs.push(`checkType="${params.checkType || 'has'}"`);
            if (params.item) condAttrs.push(`item="${this.escapeXml(params.item)}"`);
            if (params.character) condAttrs.push(`character="${this.escapeXml(params.character)}"`);
          } else {
            // For other conditions, use operator
            condAttrs.push(`operator="${params.operator || '=='}"`);
            
            if (params.conditionType === 'counterCompare') {
              if (params.counter1) condAttrs.push(`counter1="${this.escapeXml(params.counter1)}"`);
              if (params.counter2) condAttrs.push(`counter2="${this.escapeXml(params.counter2)}"`);
            } else if (params.conditionType === 'timer') {
              if (params.timer) condAttrs.push(`timer="${this.escapeXml(params.timer)}"`);
              if (params.val !== undefined) condAttrs.push(`val="${params.val}"`);
            } else if (params.conditionType === 'counter') {
              if (params.left) condAttrs.push(`counter="${this.escapeXml(params.left)}"`);
              if (params.val !== undefined) condAttrs.push(`val="${params.val}"`);
            } else if (params.conditionType === 'variable') {
              if (params.variable) condAttrs.push(`variable="${this.escapeXml(params.variable)}"`);
              if (params.value !== undefined) condAttrs.push(`value="${this.escapeXml(String(params.value))}"`);
            } else {
              if (params.left || params.variable) condAttrs.push(`left="${this.escapeXml(params.left || params.variable || '')}"`);
              if (params.val !== undefined) condAttrs.push(`val="${this.escapeXml(String(params.val))}"`);
            }
          }
          
          lines.push(`${indent}${this.indent}<condition ${condAttrs.join(' ')} />`);
          
          const trueConn = connections.find(c => c.label === 'true');
          const falseConn = connections.find(c => c.label === 'false');
          
          if (trueConn) {
            lines.push(`${indent}${this.indent}<trueTarget targetBeat="${trueConn.targetId}" />`);
          }
          if (falseConn) {
            lines.push(`${indent}${this.indent}<falseTarget targetBeat="${falseConn.targetId}" />`);
          }
        }
        break;
        
      case 'single':
      default:
        // beats that already printed their connections above – skip completely
        const alreadyHandled = ['setTimer'];
        if (alreadyHandled.includes(beat.type)) break;

        //remaining beats
        if (connections.length > 0) {
          const conn = connections[0];

          // Enrich connection with sound from button location
          const enrichedConn: any = { ...conn };
          if (beat.locations) {
            const buttonLocation = Array.from(beat.locations.values()).find(loc => loc.kind === 'button');
            if (buttonLocation?.sound) {
              enrichedConn.sound = buttonLocation.sound;
            }
          }

          // Invisible beats and simple progression beats should not have labels on connections
          const noLabelBeats = ['setVariable', 'setTimer', 'addRemoveInventory', 'randomTarget', 'introText', 'durScreen', 'endScreen', 'inputText', 'hyperText'];
          if (noLabelBeats.includes(beat.type)) {
            // Don't include label - button text is shown in visual editor instead
            this.generateConnection({ ...enrichedConn, label: undefined }, lines, indent + this.indent);
          } else {
            const label = enrichedConn.label || params.buttonText || 'Continue';
            this.generateConnection({ ...enrichedConn, label }, lines, indent + this.indent);
          }
        }
        break;
    }
    
    // Close function tag
    lines.push(`${indent}</function>`);
  }
  
  /**
   * Generate dialog choice element - FIXED to handle nested dialogs properly
   */
  private generateDialogChoice(choice: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (choice.id) attrs.push(`id="${choice.id}"`);
    if (choice.text) attrs.push(`text="${this.escapeXml(choice.text)}"`);

    // Check if target is a string (beat ID) or object (nested dialog)
    const hasNestedDialog = typeof choice.target === 'object' && choice.target;
    const hasStringTarget = typeof choice.target === 'string' && choice.target;

    // Only add target attribute if it's a string (beat ID)
    if (hasStringTarget) {
      attrs.push(`target="${choice.target}"`);
    }

    // Add sound effect (from location)
    if (choice.sound) attrs.push(`buttonsound="${this.escapeXml(choice.sound)}"`);

    // Add counter effect as attributes with proper operation and val
    if (choice.counter) {
      attrs.push(`counter="${this.escapeXml(choice.counter)}"`);
      if (choice.counterOperation) {
        attrs.push(`operation="${choice.counterOperation}"`);
      } else {
        // Default to 'change' if operation not specified
        attrs.push(`operation="change"`);
      }
      if (choice.counterValue !== undefined) {
        attrs.push(`val="${choice.counterValue}"`);
      }
    }
    
    const hasChildren = hasNestedDialog || choice.conditions || choice.effects;
    
    if (hasChildren) {
      lines.push(`${indent}<choice ${attrs.join(' ')}>`);
      
      // Conditions
      if (choice.conditions) {
        for (const condition of choice.conditions) {
          this.generateCondition(condition, lines, indent + this.indent);
        }
      }
      
      // Nested dialog as target element
      if (hasNestedDialog) {
        lines.push(`${indent}${this.indent}<target>`);
        this.generateNestedDialogTree(choice.target, lines, indent + this.indent + this.indent);
        lines.push(`${indent}${this.indent}</target>`);
      }
      
      // Effects
      if (choice.effects) {
        for (const effect of choice.effects) {
          this.generateEffect(effect, lines, indent + this.indent);
        }
      }
      
      lines.push(`${indent}</choice>`);
    } else {
      lines.push(`${indent}<choice ${attrs.join(' ')} />`);
    }
  }
  
  /**
   * Generate nested dialog tree structure
   */
  private generateNestedDialogTree(node: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (node.id) attrs.push(`id="${node.id}"`);
    if (node.speaker) attrs.push(`speaker="${this.escapeXml(node.speaker)}"`);
    if (node.text) attrs.push(`text="${this.escapeXml(node.text)}"`);
    
    const hasChildren = node.choices || node.next || node.conditions || node.effects;
    
    if (hasChildren) {
      lines.push(`${indent}<dialogTree ${attrs.join(' ')}>`);
      
      // Conditions
      if (node.conditions) {
        for (const condition of node.conditions) {
          this.generateCondition(condition, lines, indent + this.indent);
        }
      }
      
      // Choices - recursive handling
      if (node.choices) {
        for (const choice of node.choices) {
          this.generateDialogChoice(choice, lines, indent + this.indent);
        }
      }
      
      // Next node
      if (node.next) {
        if (typeof node.next === 'string') {
          lines.push(`${indent}${this.indent}<next target="${node.next}" />`);
        } else {
          lines.push(`${indent}${this.indent}<next>`);
          this.generateNestedDialogTree(node.next, lines, indent + this.indent + this.indent);
          lines.push(`${indent}${this.indent}</next>`);
        }
      }
      
      // Effects
      if (node.effects) {
        for (const effect of node.effects) {
          this.generateEffect(effect, lines, indent + this.indent);
        }
      }
      
      lines.push(`${indent}</dialogTree>`);
    } else {
      lines.push(`${indent}<dialogTree ${attrs.join(' ')} />`);
    }
  }
  
  /**
   * Generate choice element for movement
   */
  private generateChoice(choice: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (choice.id) attrs.push(`id="${choice.id}"`);
    if (choice.text) attrs.push(`text="${this.escapeXml(choice.text)}"`);
    if (choice.target) attrs.push(`target="${choice.target}"`);
    if (choice.location) attrs.push(`location="${this.escapeXml(choice.location)}"`);

    // Add sound effect (from location)
    if (choice.sound) attrs.push(`buttonsound="${this.escapeXml(choice.sound)}"`);

    // Add counter effect as attributes (for movementChoice)
    if (choice.counter) {
      attrs.push(`counter="${this.escapeXml(choice.counter)}"`);
      // Always include operation, default to 'change' if not specified
      if (choice.counterOperation) {
        attrs.push(`operation="${choice.counterOperation}"`);
      } else {
        attrs.push(`operation="change"`);
      }
      if (choice.counterValue !== undefined) {
        attrs.push(`val="${choice.counterValue}"`);
      }
    }
    
    const hasChildren = choice.conditions || choice.effects;
    
    if (hasChildren) {
      lines.push(`${indent}<choice ${attrs.join(' ')}>`);
      
      if (choice.conditions) {
        for (const condition of choice.conditions) {
          this.generateCondition(condition, lines, indent + this.indent);
        }
      }
      
      if (choice.effects) {
        for (const effect of choice.effects) {
          this.generateEffect(effect, lines, indent + this.indent);
        }
      }
      
      lines.push(`${indent}</choice>`);
    } else {
      lines.push(`${indent}<choice ${attrs.join(' ')} />`);
    }
  }
  
  /**
   * Generate prop element for pickProp beats
   */
  private generateProp(prop: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (prop.id) attrs.push(`id="${prop.id}"`);
    if (prop.name) attrs.push(`name="${this.escapeXml(prop.name)}"`);
    if (prop.description) attrs.push(`description="${this.escapeXml(prop.description)}"`);
    if (prop.target) attrs.push(`target="${prop.target}"`);

    // Add sound effect (from location)
    if (prop.sound) attrs.push(`buttonsound="${this.escapeXml(prop.sound)}"`);

    // Add counter effect as attributes (for pickProp)
    if (prop.counter) {
      attrs.push(`counter="${this.escapeXml(prop.counter)}"`);
      // Always include operation, default to 'change' if not specified
      if (prop.counterOperation) {
        attrs.push(`operation="${prop.counterOperation}"`);
      } else {
        attrs.push(`operation="change"`);
      }
      if (prop.counterValue !== undefined) {
        attrs.push(`val="${prop.counterValue}"`);
      }
    }
    
    const hasChildren = prop.conditions || prop.effects;
    
    if (hasChildren) {
      lines.push(`${indent}<prop ${attrs.join(' ')}>`);
      
      if (prop.conditions) {
        for (const condition of prop.conditions) {
          this.generateCondition(condition, lines, indent + this.indent);
        }
      }
      
      if (prop.effects) {
        for (const effect of prop.effects) {
          this.generateEffect(effect, lines, indent + this.indent);
        }
      }
      
      lines.push(`${indent}</prop>`);
    } else {
      lines.push(`${indent}<prop ${attrs.join(' ')} />`);
    }
  }
  
  /**
   * Generate transition element
   */
  private generateTransition(transition: Transition, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (transition.type) attrs.push(`type="${transition.type}"`);
    if (transition.duration !== undefined) attrs.push(`duration="${transition.duration}"`);
    if (transition.direction && transition.direction !== 'in') {
      attrs.push(`direction="${transition.direction}"`);
    }
    if (transition.easing && transition.easing !== 'ease-in-out') {
      attrs.push(`easing="${transition.easing}"`);
    }
    
    lines.push(`${indent}<transition ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate sound element
   */
  private generateSound(sound: Sound, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (sound.file) attrs.push(`name="${sound.file}"`);
    if (sound.volume !== undefined) attrs.push(`volume="${sound.volume}"`);
    if (sound.loop !== undefined) attrs.push(`loop="${sound.loop}"`);
    if (sound.fadeIn && sound.fadeIn !== 0) {
      attrs.push(`fadeIn="${sound.fadeIn}"`);
    }
    if (sound.fadeOut && sound.fadeOut !== 0) {
      attrs.push(`fadeOut="${sound.fadeOut}"`);
    }
    
    lines.push(`${indent}<sound ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate location element
   */
  private generateLocation(location: Location, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (location.kind) attrs.push(`kind="${location.kind}"`);
    if (location.name) attrs.push(`name="${this.escapeXml(location.name)}"`);
    if (location.x !== undefined) attrs.push(`x="${location.x}"`);
    if (location.y !== undefined) attrs.push(`y="${location.y}"`);
    if (location.width !== undefined) attrs.push(`width="${location.width}"`);
    if (location.height !== undefined) attrs.push(`height="${location.height}"`);
    if (location.zIndex !== undefined && location.zIndex !== 0) {
      attrs.push(`zIndex="${location.zIndex}"`);
    }

    // Optional properties
    if (location.assetId) attrs.push(`assetId="${location.assetId}"`);
    if (location.sound) attrs.push(`sound="${location.sound}"`);

    // Font properties
    if (location.font) attrs.push(`font="${this.escapeXml(location.font)}"`);
    if (location.fontSize !== undefined) attrs.push(`fontSize="${location.fontSize}"`);
    if (location.textAlign) attrs.push(`textAlign="${location.textAlign}"`);
    if (location.autosize !== undefined) attrs.push(`autosize="${location.autosize}"`);

    lines.push(`${indent}<loc ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate visual location element from new visual editor format
   */
  private generateVisualLocation(loc: any, lines: string[], indent: string): void {
    const attrs: string[] = [];

    // Required attributes
    if (loc.kind) attrs.push(`kind="${loc.kind}"`);
    if (loc.name) attrs.push(`name="${this.escapeXml(loc.name)}"`);
    if (loc.x !== undefined) attrs.push(`x="${Math.round(loc.x)}"`);
    if (loc.y !== undefined) attrs.push(`y="${Math.round(loc.y)}"`);
    if (loc.z !== undefined) attrs.push(`z="${loc.z}"`);

    // Optional attributes
    if (loc.width !== undefined) attrs.push(`width="${Math.round(loc.width)}"`);
    if (loc.height !== undefined) attrs.push(`height="${Math.round(loc.height)}"`);
    if (loc.assetId) attrs.push(`assetId="${loc.assetId}"`);
    if (loc.text) attrs.push(`text="${this.escapeXml(loc.text)}"`);
    if (loc.rotation && loc.rotation !== 0) attrs.push(`rotation="${loc.rotation}"`);
    if (loc.scale && loc.scale !== 1) attrs.push(`scale="${loc.scale}"`);
    if (loc.visible === false) attrs.push(`visible="false"`);
    if (loc.locked) attrs.push(`locked="true"`);
    if (loc.sound) attrs.push(`sound="${loc.sound}"`);

    // Font properties
    if (loc.font) attrs.push(`font="${this.escapeXml(loc.font)}"`);
    if (loc.fontSize !== undefined) attrs.push(`fontSize="${loc.fontSize}"`);
    if (loc.textAlign) attrs.push(`textAlign="${loc.textAlign}"`);
    if (loc.autosize !== undefined) attrs.push(`autosize="${loc.autosize}"`);

    lines.push(`${indent}<loc ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate connection element
   */
  private generateConnection(connection: Connection | any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    const targetId = connection.targetId || connection.target;
    if (targetId) attrs.push(`target="${targetId}"`);
    if (connection.label) attrs.push(`label="${this.escapeXml(connection.label)}"`);

    // Add sound effect (from button location)
    if (connection.sound) attrs.push(`buttonsound="${this.escapeXml(connection.sound)}"`);

    if (connection.condition) {
      lines.push(`${indent}<connection ${attrs.join(' ')}>`);
      this.generateCondition(connection.condition, lines, indent + this.indent);
      lines.push(`${indent}</connection>`);
    } else {
      lines.push(`${indent}<connection ${attrs.join(' ')} />`);
    }
  }
  
  /**
   * Generate condition element
   */
  private generateCondition(condition: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (condition.type) attrs.push(`type="${condition.type}"`);
    if (condition.operator) attrs.push(`operator="${condition.operator}"`);
    
    switch (condition.type) {
      case 'counter':
        if (condition.left || condition.counter) {
          attrs.push(`counter="${this.escapeXml(String(condition.left || condition.counter))}"`);
        }
        if (condition.right !== undefined || condition.val !== undefined) {
          attrs.push(`val="${this.escapeXml(String(condition.right ?? condition.val))}"`);
        }
        break;
        
      case 'counterCompare':
        // Use counter1 and counter2 for counterCompare conditions
        if (condition.counter1 || condition.left) {
          attrs.push(`counter1="${this.escapeXml(String(condition.counter1 || condition.left))}"`);
        }
        if (condition.counter2 || condition.right) {
          attrs.push(`counter2="${this.escapeXml(String(condition.counter2 || condition.right))}"`);
        }
        break;
        
      case 'timer':
        // Use timer and val for timer conditions
        if (condition.timer || condition.left) {
          attrs.push(`timer="${this.escapeXml(String(condition.timer || condition.left))}"`);
        }
        if (condition.val !== undefined || condition.right !== undefined) {
          attrs.push(`val="${this.escapeXml(String(condition.val ?? condition.right))}"`);
        }
        break;
        
      case 'variable':
        if (condition.variable || condition.left || condition.name) {
          attrs.push(`variable="${this.escapeXml(String(condition.variable || condition.left || condition.name))}"`);
        }
        if (condition.value !== undefined || condition.right !== undefined || condition.val !== undefined) {
          attrs.push(`value="${this.escapeXml(String(condition.value ?? condition.right ?? condition.val))}"`);
        }
        break;
        
      case 'inventory':
        // For inventory conditions, use checkType, item, and character
        if (condition.checkType) {
          // Remove operator if present and add checkType
          const operatorIndex = attrs.findIndex(a => a.startsWith('operator='));
          if (operatorIndex >= 0) attrs.splice(operatorIndex, 1);
          attrs.push(`checkType="${condition.checkType}"`);
        }
        if (condition.item) {
          attrs.push(`item="${this.escapeXml(String(condition.item))}"`);
        }
        if (condition.character) {
          attrs.push(`character="${this.escapeXml(String(condition.character))}"`);
        }
        break;
        
      default:
        if (condition.left) attrs.push(`left="${this.escapeXml(String(condition.left))}"`);
        if (condition.right !== undefined) attrs.push(`val="${this.escapeXml(String(condition.right))}"`);
        break;
    }
    
    lines.push(`${indent}<condition ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate effect element
   */
  private generateEffect(effect: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (effect.type) attrs.push(`type="${effect.type}"`);
    if (effect.target) attrs.push(`target="${this.escapeXml(effect.target)}"`);
    if (effect.value !== undefined) attrs.push(`value="${this.escapeXml(String(effect.value))}"`);
    if (effect.operation) attrs.push(`operation="${effect.operation}"`);
    
    lines.push(`${indent}<effect ${attrs.join(' ')} />`);
  }
  
  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
