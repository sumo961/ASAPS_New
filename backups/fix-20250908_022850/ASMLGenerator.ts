import { Story } from '..//engine/Story';
import { Beat } from '..//beats/Beat';
import type { Transition, Sound, Location, Connection } from '..//types';

// Load beat definitions to understand connection types
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

/**
 * FIXED ASMLGenerator - Preserves all data during export
 * 
 * Key fixes:
 * 1. Preserves all beat parameters (text, title, author, etc.)
 * 2. Maintains correct duration values (no multiplication)
 * 3. Exports settings, environment, and characters sections
 * 4. Properly handles connections for all beat types
 * 5. Uses correct XML attribute names for conditions
 */
//export class ASMLGeneratorFixed {
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
    
    // Settings - FIXED: Always export settings if they exist
    this.generateSettings(story.getSettings(), lines);
    
    // Environment - FIXED: Always export environment if it exists
    this.generateEnvironment(story.getEnvironment(), lines);
    
    // Characters - FIXED: Always export characters if they exist
    this.generateCharacters(story.getCharacters(), lines);
    
    // Plot
    this.generatePlot(story, lines);
    
    // Close story
    lines.push('</story>');
    
    return lines.join('\n');
  }
  
  /**
   * Generate settings section - FIXED to preserve all settings
   */
  private generateSettings(settings: any, lines: string[]): void {
    // Always create settings section if we have metadata to preserve structure
    lines.push(`${this.indent}<settings>`);
    
    // Debug settings
    if (settings?.debug || settings === undefined) {
      const debugAttrs: string[] = [];
      debugAttrs.push(`firstbeat="${settings?.debug?.firstbeat ?? '0'}"`);
      debugAttrs.push(`showvals="${settings?.debug?.showvals === true ? 'on' : 'off'}"`);
      lines.push(`${this.indent}${this.indent}<debug ${debugAttrs.join(' ')} />`);
    }
    
    // Colors
    if (settings?.colors) {
      const colorAttrs: string[] = [];
      if (settings.colors.pcolor) colorAttrs.push(`pcolor="${settings.colors.pcolor}"`);
      if (settings.colors.palpha !== undefined) colorAttrs.push(`palpha="${settings.colors.palpha}"`);
      if (colorAttrs.length > 0) {
        lines.push(`${this.indent}${this.indent}<colors ${colorAttrs.join(' ')} />`);
      }
    }
    
    // Fonts
    if (settings?.fonts) {
      const fontAttrs: string[] = [];
      if (settings.fonts.titleFont) fontAttrs.push(`titleFont="${settings.fonts.titleFont}"`);
      if (settings.fonts.textFont) fontAttrs.push(`textFont="${settings.fonts.textFont}"`);
      if (fontAttrs.length > 0) {
        lines.push(`${this.indent}${this.indent}<fonts ${fontAttrs.join(' ')} />`);
      }
    }
    
    // Textbox
    if (settings?.textbox) {
      const textboxAttrs: string[] = [];
      if (settings.textbox.radius !== undefined) textboxAttrs.push(`radius="${settings.textbox.radius}"`);
      if (textboxAttrs.length > 0) {
        lines.push(`${this.indent}${this.indent}<textbox ${textboxAttrs.join(' ')} />`);
      }
    }
    
    lines.push(`${this.indent}</settings>`);
  }
  
  /**
   * Generate environment section - FIXED to always include if present
   */
  private generateEnvironment(environment: any, lines: string[]): void {
    // Always create environment section to preserve structure
    lines.push(`${this.indent}<environment>`);
    
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
   * Generate characters section - FIXED to always include if present
   */
  private generateCharacters(characters: any[], lines: string[]): void {
    // Always create characters section to preserve structure
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
    
    // Transition - FIXED: Don't add extra attributes
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
    
    // Default target (only for backward compatibility if needed)
    if (beat.defaultTarget) {
      lines.push(`${beatIndent}${this.indent}<defaulttarget targetBeat="${beat.defaultTarget}" val="0" />`);
    }
    
    // Function element with nested connections based on beat type
    this.generateBeatFunction(beat, lines, beatIndent + this.indent);
    
    // Close beat
    lines.push(`${beatIndent}</beat>`);
  }
  
  /**
   * Generate beat function element - FIXED to preserve all parameters
   */
  private generateBeatFunction(beat: Beat, lines: string[], indent: string): void {
    const beatData = beat.toJSON();
    const params = beatData.parameters || {};
    const beatDef = this.beatDefs[beat.type];
    const connectionType = beatDef?.connectionType || 'single';
    
    // Build function attributes - FIXED: Include all necessary parameters
    const attrs: string[] = [`kind="${beat.type}"`];
    
    // Add beat-specific parameters based on beat type
    switch (beat.type) {
      case 'titleScreen':
        if (params.title) attrs.push(`title="${this.escapeXml(params.title)}"`);
        if (params.author) attrs.push(`author="${this.escapeXml(params.author)}"`);
        // Note: buttonText is not part of titleScreen XML attributes
        break;
        
      case 'introText':
        if (params.text) attrs.push(`text="${this.escapeXml(params.text)}"`);
        // Note: buttonText is not part of introText XML attributes
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
        break;
        
      case 'setVariable':
        if (params.variable) attrs.push(`variable="${this.escapeXml(params.variable)}"`);
        if (params.value !== undefined) attrs.push(`value="${this.escapeXml(String(params.value))}"`);
        if (params.operation) attrs.push(`operation="${params.operation}"`);
        break;
        
      case 'durScreen':
        if (params.text) attrs.push(`text="${this.escapeXml(params.text)}"`);
        if (params.duration !== undefined) attrs.push(`duration="${params.duration}"`);
        break;
        
      case 'videoBeat':
        if (params.videoFile) attrs.push(`videoFile="${params.videoFile}"`);
        if (params.autoplay !== undefined) attrs.push(`autoplay="${params.autoplay}"`);
        if (params.controls !== undefined) attrs.push(`controls="${params.controls}"`);
        if (params.skipButton !== undefined) attrs.push(`skipButton="${params.skipButton}"`);
        break;
    }
    
    // Determine if we need to close the tag based on content
    const connections = beat.getConnections();
    const hasConnections = connections.length > 0;
    const hasComplexContent = params.dialogTree || params.choices || params.props || params.condition;
    const needsClosingTag = hasConnections || hasComplexContent;
    
    if (!needsClosingTag) {
      // Self-closing tag for beats with no connections or complex content
      lines.push(`${indent}<function ${attrs.join(' ')} />`);
      return;
    }
    
    // Open function tag
    lines.push(`${indent}<function ${attrs.join(' ')}>`);
    
    // Handle beat-specific content based on connection type
    switch (connectionType) {
      case 'multiple':
        // For movementChoice, pickProp, dialogTree - connections are embedded in choices/props
        if (beat.type === 'movementChoice' && params.choices) {
          for (const choice of params.choices) {
            this.generateChoice(choice, lines, indent + this.indent);
          }
        } else if (beat.type === 'pickProp' && params.props) {
          for (const prop of params.props) {
            this.generateProp(prop, lines, indent + this.indent);
          }
        } else if (beat.type === 'dialogTree' && params.dialogTree) {
          this.generateDialogTree(params.dialogTree, lines, indent + this.indent);
          // Add default connection if exists
          if (params.defaultConnection || connections.length > 0) {
            const defaultConn = params.defaultConnection || connections[0];
            if (defaultConn) {
              this.generateConnection(defaultConn, lines, indent + this.indent);
            }
          }
        }
        break;
        
      case 'conditional':
        // For conditionBeat - handle condition and true/false connections
        if (beat.type === 'conditionBeat') {
          // Generate condition element
          if (params.condition) {
            this.generateCondition(params.condition, lines, indent + this.indent);
          }
          
          // Find true and false connections
          const trueConn = params.trueConnection || connections.find(c => c.label === 'true' || !c.label);
          const falseConn = params.falseConnection || connections.find(c => c.label === 'false');
          
          if (trueConn) {
            lines.push(`${indent}${this.indent}<trueTarget targetBeat="${trueConn.targetId || trueConn.target || trueConn}" />`);
          }
          if (falseConn) {
            lines.push(`${indent}${this.indent}<falseTarget targetBeat="${falseConn.targetId || falseConn.target || falseConn}" />`);
          }
        }
        break;
        
      case 'single':
      default:
        // For single connection beats - add connection as nested element
        if (connections.length > 0) {
          const conn = connections[0];
          // Use button text as label if available and no label set
          const label = conn.label || params.buttonText || 'Continue';
          this.generateConnection({ ...conn, label }, lines, indent + this.indent);
        } else if (beat.type === 'endScreen' && params.restartConnection) {
          // Special case for endScreen restart connection
          this.generateConnection({
            targetId: params.restartConnection.targetId || '0',
            label: 'Restart'
          }, lines, indent + this.indent);
        }
        break;
    }
    
    // Close function tag
    lines.push(`${indent}</function>`);
  }
  
  /**
   * Generate dialog tree structure
   */
  private generateDialogTree(node: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (node.id) attrs.push(`id="${node.id}"`);
    if (node.speaker) attrs.push(`speaker="${this.escapeXml(node.speaker)}"`);
    if (node.text) attrs.push(`text="${this.escapeXml(node.text)}"`);
    if (node.emotion) attrs.push(`emotion="${node.emotion}"`);
    
    const hasChildren = node.choices || node.next || node.conditions || node.effects;
    
    if (hasChildren) {
      lines.push(`${indent}<dialogTree ${attrs.join(' ')}>`);
      
      // Conditions
      if (node.conditions) {
        for (const condition of node.conditions) {
          this.generateCondition(condition, lines, indent + this.indent);
        }
      }
      
      // Choices
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
          this.generateDialogTree(node.next, lines, indent + this.indent + this.indent);
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
   * Generate dialog choice element
   */
  private generateDialogChoice(choice: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (choice.id) attrs.push(`id="${choice.id}"`);
    if (choice.text) attrs.push(`text="${this.escapeXml(choice.text)}"`);
    if (choice.target) attrs.push(`target="${choice.target}"`);
    
    const hasChildren = choice.conditions || choice.effects || choice.next;
    
    if (hasChildren) {
      lines.push(`${indent}<choice ${attrs.join(' ')}>`);
      
      if (choice.conditions) {
        for (const condition of choice.conditions) {
          this.generateCondition(condition, lines, indent + this.indent);
        }
      }
      
      if (choice.next) {
        if (typeof choice.next === 'string') {
          lines.push(`${indent}${this.indent}<next target="${choice.next}" />`);
        } else {
          lines.push(`${indent}${this.indent}<next>`);
          this.generateDialogTree(choice.next, lines, indent + this.indent + this.indent);
          lines.push(`${indent}${this.indent}</next>`);
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
   * Generate choice element for movement
   */
  private generateChoice(choice: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (choice.id) attrs.push(`id="${choice.id}"`);
    if (choice.text) attrs.push(`text="${this.escapeXml(choice.text)}"`);
    if (choice.target) attrs.push(`target="${choice.target}"`);
    if (choice.location) attrs.push(`location="${this.escapeXml(choice.location)}"`);
    
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
   * Generate transition element - FIXED: Don't add unnecessary attributes
   */
  private generateTransition(transition: Transition, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (transition.type) attrs.push(`type="${transition.type}"`);
    // FIXED: Don't multiply duration value
    if (transition.duration !== undefined) attrs.push(`duration="${transition.duration}"`);
    // Only add direction if it's actually in the source data and not 'in'
    if (transition.direction && transition.direction !== 'in') {
      attrs.push(`direction="${transition.direction}"`);
    }
    // Only add easing if it's actually in the source data
    if (transition.easing && transition.easing !== 'ease-in-out') {
      attrs.push(`easing="${transition.easing}"`);
    }
    
    lines.push(`${indent}<transition ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate sound element - FIXED: Don't add unnecessary attributes
   */
  private generateSound(sound: Sound, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (sound.file) attrs.push(`name="${sound.file}"`); // Note: using 'name' for backward compatibility
    if (sound.volume !== undefined) attrs.push(`volume="${sound.volume}"`);
    if (sound.loop !== undefined) attrs.push(`loop="${sound.loop}"`);
    // Only add fadeIn/fadeOut if they are actually defined and not 0
    if (sound.fadeIn && sound.fadeIn !== 0) {
      attrs.push(`fadeIn="${sound.fadeIn}"`);
    }
    if (sound.fadeOut && sound.fadeOut !== 0) {
      attrs.push(`fadeOut="${sound.fadeOut}"`);
    }
    
    lines.push(`${indent}<sound ${attrs.join(' ')} />`);
  }
  
  /**
   * Generate location element - FIXED: Only add defined attributes
   */
  private generateLocation(location: Location, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (location.kind) attrs.push(`kind="${location.kind}"`);
    if (location.name) attrs.push(`name="${this.escapeXml(location.name)}"`);
    if (location.x !== undefined) attrs.push(`x="${location.x}"`);
    if (location.y !== undefined) attrs.push(`y="${location.y}"`);
    if (location.width !== undefined) attrs.push(`width="${location.width}"`);
    if (location.height !== undefined) attrs.push(`height="${location.height}"`);
    // Only add zIndex if it's not 0
    if (location.zIndex !== undefined && location.zIndex !== 0) {
      attrs.push(`zIndex="${location.zIndex}"`);
    }
    
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
    
    if (connection.condition) {
      lines.push(`${indent}<connection ${attrs.join(' ')}>`);
      this.generateCondition(connection.condition, lines, indent + this.indent);
      lines.push(`${indent}</connection>`);
    } else {
      lines.push(`${indent}<connection ${attrs.join(' ')} />`);
    }
  }
  
  /**
   * Generate condition element - FIXED: Use proper attribute names
   */
  private generateCondition(condition: any, lines: string[], indent: string): void {
    const attrs: string[] = [];
    if (condition.type) attrs.push(`type="${condition.type}"`);
    if (condition.operator) attrs.push(`operator="${condition.operator}"`);
    
    // FIXED: Use correct attribute names for counter conditions
    switch (condition.type) {
      case 'counter':
        // Use 'left' as counter name and 'val' for the value
        if (condition.left || condition.counter) {
          attrs.push(`left="${this.escapeXml(String(condition.left || condition.counter))}"`);
        }
        if (condition.right !== undefined || condition.val !== undefined) {
          attrs.push(`val="${this.escapeXml(String(condition.right ?? condition.val))}"`);
        }
        break;
        
      case 'variable':
        if (condition.left || condition.name) {
          attrs.push(`left="${this.escapeXml(String(condition.left || condition.name))}"`);
        }
        if (condition.right !== undefined || condition.val !== undefined) {
          attrs.push(`val="${this.escapeXml(String(condition.right ?? condition.val))}"`);
        }
        break;
        
      case 'inventory':
        if (condition.left || condition.character) {
          attrs.push(`character="${this.escapeXml(String(condition.left || condition.character))}"`);
        }
        if (condition.right !== undefined || condition.val !== undefined) {
          attrs.push(`val="${this.escapeXml(String(condition.right ?? condition.val))}"`);
        }
        break;
        
      default:
        // Fallback for unknown types
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
