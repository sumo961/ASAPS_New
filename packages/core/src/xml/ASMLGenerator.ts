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
        this.generateCluster(cluster, lines);
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
   * Generate a single cluster element with all properties
   */
  private generateCluster(cluster: any, lines: string[]): void {
    const clusterIndent = `${this.indent}${this.indent}${this.indent}`;
    const propIndent = `${clusterIndent}${this.indent}`;

    // Build cluster attributes
    const attrs: string[] = [
      `id="${cluster.id}"`,
      `name="${this.escapeXml(cluster.name)}"`,
      `type="${cluster.type || 'organizational'}"`
    ];

    // Add optional attributes
    if (cluster.isExpanded !== undefined) {
      attrs.push(`expanded="${cluster.isExpanded}"`);
    }
    if (cluster.mapAssetId) {
      attrs.push(`mapAssetId="${cluster.mapAssetId}"`);
    }
    if (cluster.mapScale !== undefined) {
      attrs.push(`mapScale="${cluster.mapScale}"`);
    }
    if (cluster.mapOpacity !== undefined) {
      attrs.push(`mapOpacity="${cluster.mapOpacity}"`);
    }
    if (cluster.color) {
      attrs.push(`color="${cluster.color}"`);
    }

    lines.push(`${clusterIndent}<cluster ${attrs.join(' ')}>`);

    // Container position
    if (cluster.containerPosition) {
      lines.push(`${propIndent}<containerPosition x="${Math.round(cluster.containerPosition.x)}" y="${Math.round(cluster.containerPosition.y)}" />`);
    }

    // Container bounds
    if (cluster.containerBounds) {
      lines.push(`${propIndent}<containerBounds width="${Math.round(cluster.containerBounds.width)}" height="${Math.round(cluster.containerBounds.height)}" />`);
    }

    // Cluster ambient sound
    if (cluster.sound?.file) {
      const soundAttrs: string[] = [`file="${this.escapeXml(cluster.sound.file)}"`];
      if (cluster.sound.volume !== undefined) {
        soundAttrs.push(`volume="${cluster.sound.volume}"`);
      }
      lines.push(`${propIndent}<sound ${soundAttrs.join(' ')} />`);
    }

    lines.push(`${clusterIndent}</cluster>`);
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

    // Notes - author notes not shown to player
    if (beat.notes) {
      lines.push(`${beatIndent}${this.indent}<notes>${this.escapeXml(beat.notes)}</notes>`);
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
    
    // Default target - don't export "undefined" string
    if (beat.defaultTarget && beat.defaultTarget !== 'undefined') {
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
        
      case 'infoText':
        if (params.text) attrs.push(`text="${this.escapeXml(params.text)}"`);
        break;
        
      case 'dialogTree':
        // Root dialog attributes (no emotion per ASML spec)
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

      case 'movementChoice':
      case 'pickProp':
      case 'dialogTree':
        // Add delay element for choice-based beats if configured
        if (params.choiceDelay && params.choiceDelay > 0) {
          lines.push(`${indent}${this.indent}<delay val="${params.choiceDelay}" />`);
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
            // Sound is stored on locations, not on choices - no enrichment needed
            this.generateChoice(choice, lines, indent + this.indent);
          }
        } else if (beat.type === 'pickProp' && params.props) {
          for (const prop of params.props) {
            // Sound is stored on locations, not on props - no enrichment needed
            this.generateProp(prop, lines, indent + this.indent);
          }
        } else if (beat.type === 'dialogTree' && params.dialogTree) {
          // Generate nested dialog choices
          if (params.dialogTree.choices) {
            for (const choice of params.dialogTree.choices) {
              // Sound is stored on locations, not on choices - no enrichment needed
              this.generateDialogChoice(choice, lines, indent + this.indent);
            }
          }
          // NOTE: No separate <connection> tag needed - dialog exits via choice targets
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
              // Support both new (variableName) and legacy (left) field names
              const counterName = params.variableName || params.left;
              const counterVal = params.value ?? params.val;
              if (counterName) condAttrs.push(`counter="${this.escapeXml(counterName)}"`);
              if (counterVal !== undefined) condAttrs.push(`val="${counterVal}"`);
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

          // Don't export "undefined" string as target
          if (trueConn && trueConn.targetId && trueConn.targetId !== 'undefined') {
            lines.push(`${indent}${this.indent}<trueTarget targetBeat="${trueConn.targetId}" />`);
          }
          if (falseConn && falseConn.targetId && falseConn.targetId !== 'undefined') {
            lines.push(`${indent}${this.indent}<falseTarget targetBeat="${falseConn.targetId}" />`);
          }
        }
        break;
        
      case 'single':
      default:
        // beats that already printed their connections above – skip completely
        const alreadyHandled = ['setTimer'];
        if (alreadyHandled.includes(beat.type)) break;

        // Remaining beats with single connection
        if (connections.length > 0) {
          const conn = connections[0];

          // Sound is stored on locations, not on connections - no enrichment needed

          // Invisible beats and simple progression beats should not have labels on connections
          const noLabelBeats = ['setVariable', 'setTimer', 'addRemoveInventory', 'randomTarget', 'infoText', 'durScreen', 'endScreen', 'inputText', 'hyperText'];
          if (noLabelBeats.includes(beat.type)) {
            // Don't include label - button text is shown in visual editor instead
            this.generateConnection({ ...conn, label: undefined }, lines, indent + this.indent);
          } else {
            const label = conn.label || params.buttonText || 'Continue';
            this.generateConnection({ ...conn, label }, lines, indent + this.indent);
          }
        }
        break;
    }
    
    // Close function tag
    lines.push(`${indent}</function>`);
  }
  
  /**
   * Generate dialog choice element
   * New simplified format:
   * - target attribute is beat ID string (to exit dialog)
   * - dialogNode is nested inside choice (to continue conversation)
   * - No <target> wrapper needed
   */
  private generateDialogChoice(choice: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (choice.id) attrs.push(`id="${choice.id}"`);
    if (choice.text) attrs.push(`text="${this.escapeXml(choice.text)}"`);

    // New format: target is always a string (beat ID) to exit
    const hasStringTarget = typeof choice.target === 'string' && choice.target;
    if (hasStringTarget) {
      attrs.push(`target="${choice.target}"`);
    }

    // New format: dialogNode contains nested dialog
    // Also support old format where target was an object
    const hasNestedDialog = choice.dialogNode || (typeof choice.target === 'object' && choice.target);
    const nestedDialogNode = choice.dialogNode || (typeof choice.target === 'object' ? choice.target : null);

    // NOTE: Sound is stored on locations, not on choices - no buttonsound attribute needed

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

      // Nested dialog - directly inside choice (no <target> wrapper)
      if (nestedDialogNode) {
        this.generateNestedDialogTree(nestedDialogNode, lines, indent + this.indent);
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
   * Optimizes output by collapsing linear [Continue] sequences:
   * - If a dialogTree has a single [Continue] choice leading to another dialogTree
   *   that exits to a beat, collapse it into a single choice with the final text
   */
  private generateNestedDialogTree(node: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (node.id) attrs.push(`id="${node.id}"`);
    if (node.speaker) attrs.push(`speaker="${this.escapeXml(node.speaker)}"`);
    if (node.text) attrs.push(`text="${this.escapeXml(node.text)}"`);
    // Note: emotion is intentionally NOT exported per user requirement

    // Optimize: collapse linear [Continue] chains
    const optimizedChoices = this.optimizeDialogChoices(node.choices);

    const hasChoices = optimizedChoices && optimizedChoices.length > 0;
    const hasChildren = hasChoices || node.conditions || node.effects;

    if (hasChildren) {
      lines.push(`${indent}<dialogTree ${attrs.join(' ')}>`);

      // Conditions
      if (node.conditions) {
        for (const condition of node.conditions) {
          this.generateCondition(condition, lines, indent + this.indent);
        }
      }

      // Choices - recursive handling with optimized choices
      if (optimizedChoices) {
        for (const choice of optimizedChoices) {
          this.generateDialogChoice(choice, lines, indent + this.indent);
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
   * Optimize dialog choices by collapsing linear [Continue] sequences
   * Pattern: dialogNode has single [Continue] choice that leads to another dialogNode
   * Result: Replace [Continue] with the final choice (text from inner node, target preserved)
   */
  private optimizeDialogChoices(choices: any[] | undefined): any[] | undefined {
    if (!choices || choices.length === 0) return choices;

    return choices.map(choice => {
      // First, recursively optimize any nested dialogNode's choices
      if (choice.dialogNode) {
        choice = {
          ...choice,
          dialogNode: {
            ...choice.dialogNode,
            choices: this.optimizeDialogChoices(choice.dialogNode.choices)
          }
        };
      }

      // Now check if THIS choice is a [Continue] that can be collapsed
      const isContinueChoice = choice.id === 'auto_continue' ||
                               choice.text === '[Continue]' ||
                               (choice.text && choice.text.startsWith('['));

      if (!isContinueChoice) {
        return choice;
      }

      // This IS a [Continue] choice - try to collapse it
      if (choice.dialogNode) {
        // [Continue] leads to a dialogNode - use the dialogNode's info
        const innerNode = choice.dialogNode;

        // Check if inner node has exactly one choice that exits
        if (innerNode.choices && innerNode.choices.length === 1) {
          const innerChoice = innerNode.choices[0];

          if (innerChoice.target && typeof innerChoice.target === 'string' && !innerChoice.dialogNode) {
            // Inner choice exits to a beat - fully collapse!
            // Replace [Continue] -> dialogNode -> choice pattern with just the final choice
            return {
              id: innerNode.id || innerChoice.id || choice.id,
              text: innerNode.text || innerChoice.text,
              target: innerChoice.target,
              // Preserve any counter effects
              counter: innerChoice.counter || choice.counter,
              counterOperation: innerChoice.counterOperation || choice.counterOperation,
              counterValue: innerChoice.counterValue !== undefined ? innerChoice.counterValue : choice.counterValue,
              conditions: innerChoice.conditions || choice.conditions,
              effects: innerChoice.effects || choice.effects
            };
          }
        }
      }

      // Can't collapse further - return as-is
      return choice;
    });
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

    // NOTE: Sound is stored on locations, not on choices - no buttonsound attribute needed

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

    // NOTE: Sound is stored on locations, not on props - no buttonsound attribute needed

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
    // Don't export "undefined" sound files
    if (!sound.file || sound.file === 'undefined') {
      return;
    }
    const attrs: string[] = [];
    attrs.push(`name="${sound.file}"`);
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

    // Character-specific properties (for kind='character')
    if (location.kind === 'character') {
      if (location.characterId) attrs.push(`characterId="${location.characterId}"`);
      // characterName is used for ASML compatibility - exports as 'name' attribute
      // but we also add it explicitly for clarity
      if (location.characterName) attrs.push(`characterName="${this.escapeXml(location.characterName)}"`);
      if (location.stateId) attrs.push(`state="${location.stateId}"`);
      if (location.size !== undefined) attrs.push(`size="${location.size}"`);
    }

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

    // Character-specific properties (for kind='character')
    if (loc.kind === 'character') {
      if (loc.characterId) attrs.push(`characterId="${loc.characterId}"`);
      if (loc.characterName) attrs.push(`characterName="${this.escapeXml(loc.characterName)}"`);
      if (loc.stateId) attrs.push(`state="${loc.stateId}"`);
      if (loc.size !== undefined) attrs.push(`size="${loc.size}"`);
    }

    lines.push(`${indent}<loc ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate connection element
   */
  private generateConnection(connection: Connection | any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    const targetId = connection.targetId || connection.target;
    // Don't export "undefined" string as target
    if (targetId && targetId !== 'undefined') attrs.push(`target="${targetId}"`);
    if (connection.label) attrs.push(`label="${this.escapeXml(connection.label)}"`);

    // NOTE: Sound is stored on locations, not on connections - no buttonsound attribute needed

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
        if (condition.variableName || condition.left || condition.counter) {
          attrs.push(`counter="${this.escapeXml(String(condition.variableName || condition.left || condition.counter))}"`);
        }
        if (condition.value !== undefined || condition.right !== undefined || condition.val !== undefined) {
          attrs.push(`val="${this.escapeXml(String(condition.value ?? condition.right ?? condition.val))}"`);
        }
        break;

      case 'counterCompare':
        // Use counter1 and counter2 for counterCompare conditions
        if (condition.counter1 || condition.variableName || condition.left) {
          attrs.push(`counter1="${this.escapeXml(String(condition.counter1 || condition.variableName || condition.left))}"`);
        }
        if (condition.counter2 || condition.right) {
          attrs.push(`counter2="${this.escapeXml(String(condition.counter2 || condition.right))}"`);
        }
        break;

      case 'timer':
        // Use timer and val for timer conditions
        if (condition.timer || condition.variableName || condition.left) {
          attrs.push(`timer="${this.escapeXml(String(condition.timer || condition.variableName || condition.left))}"`);
        }
        if (condition.value !== undefined || condition.val !== undefined || condition.right !== undefined) {
          attrs.push(`val="${this.escapeXml(String(condition.value ?? condition.val ?? condition.right))}"`);
        }
        break;

      case 'variable':
        if (condition.variableName || condition.variable || condition.left || condition.name) {
          attrs.push(`variable="${this.escapeXml(String(condition.variableName || condition.variable || condition.left || condition.name))}"`);
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
        if (condition.variableName || condition.left) attrs.push(`left="${this.escapeXml(String(condition.variableName || condition.left))}"`);
        if (condition.value !== undefined || condition.right !== undefined) attrs.push(`val="${this.escapeXml(String(condition.value ?? condition.right))}"`);
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
