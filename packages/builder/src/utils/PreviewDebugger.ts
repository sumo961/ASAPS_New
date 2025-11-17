/**
 * Preview System Debug Helper for ASPS Modern
 * 
 * This module adds comprehensive debugging capabilities to the story preview system
 * to help identify why imported stories fail to preview.
 */

import { Story, StoryEngine, Beat } from '@asaps/core';

export interface DebugOptions {
  logLevel: 'verbose' | 'normal' | 'errors';
  captureErrors: boolean;
  validateBeats: boolean;
  trackExecution: boolean;
}

export class PreviewDebugger {
  private errors: Error[] = [];
  private warnings: string[] = [];
  private executionLog: string[] = [];
  private options: DebugOptions;

  constructor(options: Partial<DebugOptions> = {}) {
    this.options = {
      logLevel: 'normal',
      captureErrors: true,
      validateBeats: true,
      trackExecution: true,
      ...options
    };
  }

  /**
   * Wrap a StoryEngine with debugging capabilities
   */
  wrapStoryEngine(engine: StoryEngine): StoryEngine {
    const self = this;
    const originalStart = engine.start.bind(engine);
    const originalLoadStory = engine.loadStory.bind(engine);

    // Wrap loadStory to validate the story
    engine.loadStory = async function(story: Story) {
      self.log('Loading story...', 'info');
      
      try {
        // Validate story before loading
        const validation = self.validateStory(story);
        if (!validation.valid) {
          self.log(`Story validation failed: ${validation.errors.join(', ')}`, 'error');
          throw new Error(`Invalid story: ${validation.errors[0]}`);
        }
        
        self.log(`Story validated: ${validation.beatCount} beats, ${validation.connectionCount} connections`, 'success');
        
        // Call original loadStory
        await originalLoadStory(story);
        self.log('Story loaded successfully', 'success');
        
      } catch (error) {
        self.handleError(error as Error, 'loadStory');
        throw error;
      }
    };

    // Wrap start to track execution
    engine.start = async function() {
      self.log('Starting story execution...', 'info');
      
      try {
        // Get the story
        const story = (this as any).story;
        if (!story) {
          throw new Error('No story loaded');
        }
        
        // Get first beat
        const firstBeatId = story.getFirstBeatId();
        self.log(`First beat ID: ${firstBeatId}`, 'info');
        
        const firstBeat = story.getBeat(firstBeatId);
        if (!firstBeat) {
          throw new Error(`First beat not found: ${firstBeatId}`);
        }
        
        self.log(`First beat: ${firstBeat.name} (${firstBeat.type})`, 'info');
        
        // Check if beat has required parameters
        const params = firstBeat.getParameters();
        self.log(`Beat parameters: ${JSON.stringify(params)}`, 'verbose');
        
        // Call original start with error tracking
        await originalStart();
        
      } catch (error) {
        self.handleError(error as Error, 'start');
        throw error;
      }
    };

    return engine;
  }

  /**
   * Validate a story structure
   */
  validateStory(story: Story): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    beatCount: number;
    connectionCount: number;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let beatCount = 0;
    let connectionCount = 0;

    try {
      // Check metadata
      const metadata = story.getMetadata();
      if (!metadata?.title) {
        warnings.push('Story missing title');
      }
      if (!metadata?.author) {
        warnings.push('Story missing author');
      }

      // Check first beat
      const firstBeatId = story.getFirstBeatId();
      if (!firstBeatId) {
        errors.push('No first beat ID specified');
      } else {
        const firstBeat = story.getBeat(firstBeatId);
        if (!firstBeat) {
          errors.push(`First beat not found: ${firstBeatId}`);
        }
      }

      // Validate all beats
      const beats = story.getAllBeats();
      beatCount = beats.length;
      
      if (beatCount === 0) {
        errors.push('Story has no beats');
      }

      for (const beat of beats) {
        // Validate beat structure
        const beatValidation = this.validateBeat(beat);
        errors.push(...beatValidation.errors);
        warnings.push(...beatValidation.warnings);
        connectionCount += beatValidation.connectionCount;
      }

      // Check for orphaned beats (no incoming connections)
      const targetedBeats = new Set<string>();
      for (const beat of beats) {
        const connections = beat.getConnections();
        for (const conn of connections) {
          targetedBeats.add(conn.targetId);
        }
      }

      for (const beat of beats) {
        if (beat.id !== firstBeatId && !targetedBeats.has(beat.id)) {
          warnings.push(`Beat "${beat.name}" (${beat.id}) has no incoming connections`);
        }
      }

      // Check for dead ends (visible beats with no outgoing connections)
      const visibleTypes = ['titleScreen', 'introText', 'movementChoice', 'pickProp', 'dialogTree', 'videoBeat', 'durScreen'];
      for (const beat of beats) {
        if (visibleTypes.includes(beat.type) && beat.type !== 'endScreen') {
          const connections = beat.getConnections();
          if (connections.length === 0) {
            warnings.push(`Beat "${beat.name}" (${beat.id}) has no outgoing connections`);
          }
        }
      }

    } catch (error) {
      errors.push(`Validation error: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      beatCount,
      connectionCount
    };
  }

  /**
   * Validate a single beat
   */
  validateBeat(beat: Beat): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    connectionCount: number;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let connectionCount = 0;

    try {
      // Check basic properties
      if (!beat.id) {
        errors.push(`Beat missing ID`);
      }
      if (!beat.name) {
        warnings.push(`Beat ${beat.id} missing name`);
      }
      if (!beat.type) {
        errors.push(`Beat ${beat.id} missing type`);
      }

      // Check parameters
      const params = beat.getParameters();
      if (!params || Object.keys(params).length === 0) {
        if (beat.type !== 'setVariable' && beat.type !== 'conditionBeat') {
          warnings.push(`Beat "${beat.name}" has no parameters`);
        }
      }

      // Validate type-specific requirements
      switch (beat.type) {
        case 'titleScreen':
          if (!params.title) errors.push(`Title screen missing title`);
          if (!params.author) warnings.push(`Title screen missing author`);
          break;
          
        case 'introText':
          if (!params.text) errors.push(`Intro text beat missing text content`);
          break;
          
        case 'movementChoice':
          if (!params.question) warnings.push(`Movement choice missing question`);
          if (!params.choices || params.choices.length === 0) {
            errors.push(`Movement choice has no choices`);
          } else {
            for (const choice of params.choices) {
              if (!choice.target) {
                errors.push(`Movement choice missing target for choice: ${choice.text}`);
              }
            }
          }
          break;
          
        case 'pickProp':
          if (!params.props || params.props.length === 0) {
            errors.push(`Pick prop has no props`);
          } else {
            for (const prop of params.props) {
              if (!prop.target) {
                errors.push(`Pick prop missing target for prop: ${prop.name}`);
              }
            }
          }
          break;
          
        case 'conditionBeat':
          if (!params.condition) {
            errors.push(`Condition beat missing condition`);
          }
          break;
      }

      // Check connections
      const connections = beat.getConnections();
      connectionCount = connections.length;

      // Validate connections based on beat type
      const beatDef = this.getBeatDefinition(beat.type);
      if (beatDef) {
        const connectionType = beatDef.connectionType;
        
        switch (connectionType) {
          case 'single':
            if (connections.length > 1) {
              warnings.push(`Single-connection beat "${beat.name}" has ${connections.length} connections`);
            }
            break;
            
          case 'conditional':
            if (connections.length !== 2) {
              errors.push(`Conditional beat "${beat.name}" should have exactly 2 connections (has ${connections.length})`);
            }
            break;
            
          case 'none':
            if (connections.length > 0 && beat.type !== 'endScreen') {
              warnings.push(`No-connection beat "${beat.name}" has ${connections.length} connections`);
            }
            break;
        }
      }

      // Validate connection targets exist (would need story context for full validation)
      for (const conn of connections) {
        if (!conn.targetId) {
          errors.push(`Beat "${beat.name}" has connection with no target`);
        }
      }

    } catch (error) {
      errors.push(`Beat validation error: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      connectionCount
    };
  }

  /**
   * Get beat definition from schema
   */
  private getBeatDefinition(beatType: string): any {
    // This would normally load from beat-definitions/core-beats.json
    const definitions: Record<string, any> = {
      titleScreen: { connectionType: 'single' },
      introText: { connectionType: 'single' },
      movementChoice: { connectionType: 'multiple' },
      pickProp: { connectionType: 'multiple' },
      dialogTree: { connectionType: 'multiple' },
      conditionBeat: { connectionType: 'conditional' },
      setVariable: { connectionType: 'single' },
      endScreen: { connectionType: 'single' },
      durScreen: { connectionType: 'single' },
      videoBeat: { connectionType: 'single' },
    };
    
    return definitions[beatType];
  }

  /**
   * Wrap a beat for execution tracking
   */
  wrapBeat(beat: Beat): Beat {
    const self = this;
    const originalExecute = beat.execute.bind(beat);
    
    beat.execute = async function(context: any, renderer: any) {
      const startTime = Date.now();
      self.log(`Executing beat: ${beat.name} (${beat.type})`, 'verbose');
      
      try {
        // Log beat parameters
        const params = beat.getParameters();
        if (self.options.logLevel === 'verbose') {
          self.log(`Parameters: ${JSON.stringify(params)}`, 'verbose');
        }
        
        // Execute beat
        const result = await originalExecute(context, renderer);
        
        const duration = Date.now() - startTime;
        self.log(`Beat executed in ${duration}ms, next: ${result || 'none'}`, 'verbose');
        
        return result;
        
      } catch (error) {
        self.handleError(error as Error, `beat:${beat.id}`);
        throw error;
      }
    };
    
    return beat;
  }

  /**
   * Handle and log errors
   */
  private handleError(error: Error, context: string): void {
    this.errors.push(error);
    this.log(`Error in ${context}: ${error.message}`, 'error');
    if (error.stack && this.options.logLevel === 'verbose') {
      console.error(error.stack);
    }
  }

  /**
   * Log a message
   */
  private log(message: string, level: 'verbose' | 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.executionLog.push(logEntry);
    
    // Console output with colors
    const colors = {
      verbose: '\x1b[90m', // gray
      info: '\x1b[36m',    // cyan
      success: '\x1b[32m', // green
      warning: '\x1b[33m', // yellow
      error: '\x1b[31m'    // red
    };
    
    const shouldLog = 
      level === 'error' ||
      (level === 'warning' && this.options.logLevel !== 'errors') ||
      (level !== 'verbose' || this.options.logLevel === 'verbose');
      
    if (shouldLog) {
      console.log(`${colors[level]}${message}\x1b[0m`);
    }
    
    // Track warnings and errors
    if (level === 'warning') {
      this.warnings.push(message);
    }
  }

  /**
   * Get debug report
   */
  getReport(): {
    errors: Error[];
    warnings: string[];
    executionLog: string[];
    summary: string;
  } {
    const summary = `
Debug Report Summary:
- Errors: ${this.errors.length}
- Warnings: ${this.warnings.length}
- Log entries: ${this.executionLog.length}

${this.errors.length > 0 ? 'Errors:\n' + this.errors.map(e => `  - ${e.message}`).join('\n') : ''}
${this.warnings.length > 0 ? 'Warnings:\n' + this.warnings.slice(0, 10).map(w => `  - ${w}`).join('\n') : ''}
    `.trim();
    
    return {
      errors: this.errors,
      warnings: this.warnings,
      executionLog: this.executionLog,
      summary
    };
  }

  /**
   * Clear debug data
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
    this.executionLog = [];
  }
}

// Export helper function to use in StoryPreview component
export function createDebuggedEngine(renderer: any, options?: Partial<DebugOptions>): {
  engine: StoryEngine;
  previewDebugger: PreviewDebugger;
} {
  //const debugger = new PreviewDebugger(options);
  const previewDebugger = new PreviewDebugger(options);
  const engine = new StoryEngine(renderer);
 // const debuggedEngine = debugger.wrapStoryEngine(engine);
  const debuggedEngine = previewDebugger.wrapStoryEngine(engine);
  
  return {
    engine: debuggedEngine,
    //debugger
    previewDebugger
  };
}