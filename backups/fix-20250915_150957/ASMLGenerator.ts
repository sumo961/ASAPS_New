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

  }
  
  /**
   * Generate environment section
   */
  private generateEnvironment(environment: any, lines: string[]): void {
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
   * Generate characters section
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
        if ((params.timerName || params.name) && params.value !== undefined) {
          const timerAttrs: string[] = [];
          timerAttrs.push(`name="${this.escapeXml(params.timerName || params.name)}"`);
          timerAttrs.push(`val="${params.value}"`);
          if (params.target || params.timerTarget) {
            timerAttrs.push(`target="${params.target || params.timerTarget}"`);
          }
          lines.push(`${indent}${this.indent}<timer ${timerAttrs.join(' ')} />`);
        }
        // Export only the normal connection (not timer target) without label
        const normalConn = connections.find(c => c.label !== 'Timer Target');
        if (normalConn) {
          // setTimer is an invisible beat, so no label on connection
          this.generateConnection({ ...normalConn, label: undefined }, lines, indent + this.indent);
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
            if (choice) {
              // choices array contains strings (beat IDs) directly
              lines.push(`${indent}${this.indent}<choice targetBeat="${choice}" />`);
            }
          }
        }
        break;
        
      case 'conditional':
        if (beat.type === 'conditionBeat') {
          // Generate condition element with proper parameters
          const condAttrs: string[] = [];
          condAttrs.push(`type="${params.conditionType || 'variable'}"`);
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
          } else {
            if (params.left || params.variable) condAttrs.push(`left="${this.escapeXml(params.left || params.variable || '')}"`);
            if (params.val !== undefined) condAttrs.push(`val="${this.escapeXml(String(params.val))}"`);
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
        if (connections.length > 0) {
          const conn = connections[0];
          // Invisible beats should not have labels on connections
          const isInvisible = ['setVariable', 'setTimer', 'addRemoveInventory', 'randomTarget'].includes(beat.type);
          if (isInvisible) {
            // Don't include label for invisible beats
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
