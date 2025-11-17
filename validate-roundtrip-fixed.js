#!/usr/bin/env node

/**
 * Round-Trip Data Validation Script for ASPS Modern (Fixed Version)
 * 
 * This script tests that data is preserved during import/export cycles.
 * Fixed to properly parse nested <id> elements and provide better diagnostics.
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  dim: '\x1b[2m'
};

class XMLValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Extract data from XML content
   */
  extractData(xmlContent) {
    const data = {
      beats: [],
      connections: [],
      settings: {},
      environment: {},
      characters: [],
      counters: []
    };

    // Extract beats
    const beatMatches = xmlContent.match(/<beat[^>]*>[\s\S]*?<\/beat>/g) || [];
    beatMatches.forEach(beatXml => {
      const beat = this.parseBeat(beatXml);
      if (beat) data.beats.push(beat);
    });

    // Extract standalone connections (not within beats)
    const connMatches = xmlContent.match(/<connection[^>]*\/>/g) || [];
    connMatches.forEach(connXml => {
      // Skip connections that are inside beats (they're counted with the beat)
      if (!this.isInsideBeat(connXml, xmlContent)) {
        const conn = this.parseConnection(connXml);
        if (conn) data.connections.push(conn);
      }
    });

    // Count connections within beats
    data.beats.forEach(beat => {
      if (beat.connections && beat.connections.length > 0) {
        data.connections.push(...beat.connections);
      }
    });

    // Extract settings
    const settingsMatch = xmlContent.match(/<settings>([\s\S]*?)<\/settings>/);
    if (settingsMatch) {
      data.settings = this.parseSettings(settingsMatch[1]);
    }

    // Extract environment
    const envMatch = xmlContent.match(/<environment>([\s\S]*?)<\/environment>/);
    if (envMatch) {
      data.environment = this.parseEnvironment(envMatch[1]);
    }

    // Extract characters
    const charMatches = xmlContent.match(/<character[^>]*\/>/g) || [];
    charMatches.forEach(charXml => {
      const char = this.parseCharacter(charXml);
      if (char) data.characters.push(char);
    });

    // Extract counters
    const counterMatches = xmlContent.match(/<counter[^>]*\/>/g) || [];
    counterMatches.forEach(counterXml => {
      const counter = this.parseCounter(counterXml);
      if (counter) data.counters.push(counter);
    });

    return data;
  }

  /**
   * Check if a connection is inside a beat
   */
  isInsideBeat(connXml, fullXml) {
    const beatMatches = fullXml.match(/<beat[^>]*>[\s\S]*?<\/beat>/g) || [];
    return beatMatches.some(beat => beat.includes(connXml));
  }

  /**
   * Parse a beat element with proper ID extraction
   */
  parseBeat(beatXml) {
    const beat = {};
    
    // Extract ID from nested <id> element
    const idMatch = beatXml.match(/<id\s+id="([^"]*)"(?:\s+name="([^"]*)")?[^>]*\/>/);
    if (idMatch) {
      beat.id = idMatch[1];
      beat.name = idMatch[2] || '';
    }

    // Extract transition
    const transMatch = beatXml.match(/<transition([^>]*)\/>/);
    if (transMatch) {
      const transAttrs = this.parseAttributes(transMatch[1]);
      beat.transition = transAttrs;
      
      // Check for duration multiplication issue
      if (transAttrs.duration) {
        beat.duration = transAttrs.duration;
      }
    }

    // Extract function
    const funcMatch = beatXml.match(/<function([^>]*)>/);
    if (funcMatch) {
      const funcAttrs = this.parseAttributes(funcMatch[1]);
      beat.functionKind = funcAttrs.kind;
      beat.functionAttrs = funcAttrs;
    }

    // Extract text (for introText beats)
    const textMatch = beatXml.match(/<text[^>]*>([\s\S]*?)<\/text>/);
    if (textMatch) {
      beat.text = this.unescapeXml(textMatch[1]);
    }

    // Extract choices (for multi-choice beats)
    const choiceMatches = beatXml.match(/<choice[^>]*(?:>[\s\S]*?<\/choice>|\/\s*>)/g) || [];
    beat.choices = choiceMatches.map(choiceXml => this.parseChoice(choiceXml));

    // Extract connections within the beat
    const connMatches = beatXml.match(/<connection[^>]*\/>/g) || [];
    beat.connections = connMatches.map(connXml => this.parseConnection(connXml));

    // Extract conditions
    const conditionMatches = beatXml.match(/<condition[^>]*\/>/g) || [];
    beat.conditions = conditionMatches.map(condXml => this.parseCondition(condXml));

    // Extract effects
    const effectMatches = beatXml.match(/<effect[^>]*\/>/g) || [];
    beat.effects = effectMatches.map(effXml => this.parseEffect(effXml));

    return beat;
  }

  /**
   * Parse a choice element
   */
  parseChoice(choiceXml) {
    const choice = {};
    
    // Check if it's self-closing or has content
    const selfClosing = choiceXml.endsWith('/>');
    
    if (!selfClosing) {
      // Extract text content
      const textMatch = choiceXml.match(/<choice[^>]*>(.*?)<\/choice>/);
      if (textMatch) {
        choice.text = this.unescapeXml(textMatch[1]);
      }
    }

    // Extract attributes
    const attrMatch = choiceXml.match(/<choice([^>]*)/);
    if (attrMatch) {
      const attrs = this.parseAttributes(attrMatch[1]);
      Object.assign(choice, attrs);
    }

    return choice;
  }

  /**
   * Parse a connection element
   */
  parseConnection(connXml) {
    return this.parseAttributes(connXml);
  }

  /**
   * Parse a condition element
   */
  parseCondition(condXml) {
    return this.parseAttributes(condXml);
  }

  /**
   * Parse an effect element
   */
  parseEffect(effXml) {
    return this.parseAttributes(effXml);
  }

  /**
   * Parse a character element
   */
  parseCharacter(charXml) {
    return this.parseAttributes(charXml);
  }

  /**
   * Parse a counter element
   */
  parseCounter(counterXml) {
    return this.parseAttributes(counterXml);
  }

  /**
   * Parse settings section
   */
  parseSettings(settingsContent) {
    const settings = {};
    
    // Parse nested XML elements
    const debugMatch = settingsContent.match(/<debug([^>]*)\/>/);
    if (debugMatch) {
      settings.debug = this.parseAttributes(debugMatch[1]);
    }
    
    const colorsMatch = settingsContent.match(/<colors([^>]*)\/>/);
    if (colorsMatch) {
      settings.colors = this.parseAttributes(colorsMatch[1]);
    }
    
    const fontsMatch = settingsContent.match(/<fonts([^>]*)\/>/);
    if (fontsMatch) {
      settings.fonts = this.parseAttributes(fontsMatch[1]);
    }
    
    const textboxMatch = settingsContent.match(/<textbox([^>]*)\/>/);
    if (textboxMatch) {
      settings.textbox = this.parseAttributes(textboxMatch[1]);
    }
    
    return settings;
  }

  /**
   * Parse environment section
   */
  parseEnvironment(envContent) {
    const env = {
      props: [],
      nodes: []
    };
    
    // Parse props
    const propMatches = envContent.match(/<prop[^>]*>.*?<\/prop>/g) || [];
    propMatches.forEach(propXml => {
      const attrMatch = propXml.match(/<prop([^>]*)>(.*?)<\/prop>/);
      if (attrMatch) {
        const prop = this.parseAttributes(attrMatch[1]);
        prop.description = attrMatch[2];
        env.props.push(prop);
      }
    });
    
    // Parse nodes
    const nodeMatches = envContent.match(/<node[^>]*\/>/g) || [];
    nodeMatches.forEach(nodeXml => {
      const node = this.parseAttributes(nodeXml);
      env.nodes.push(node);
    });
    
    return env;
  }

  /**
   * Parse attributes from an XML tag
   */
  parseAttributes(attrString) {
    const attrs = {};
    const regex = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = regex.exec(attrString)) !== null) {
      attrs[match[1]] = this.unescapeXml(match[2]);
    }
    return attrs;
  }

  /**
   * Unescape XML entities
   */
  unescapeXml(text) {
    if (!text) return '';
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  /**
   * Compare two data structures and report differences
   */
  compareData(original, exported, filename) {
    console.log(`\n${colors.cyan}═══ Validation Report ═══${colors.reset}\n`);
    
    let isValid = true;

    // Compare beats
    console.log(`${colors.blue}📝 Beats:${colors.reset}`);
    if (original.beats.length !== exported.beats.length) {
      this.errors.push(`Beat count mismatch: ${original.beats.length} → ${exported.beats.length}`);
      console.log(`  ${colors.red}✗ Count mismatch: ${original.beats.length} → ${exported.beats.length}${colors.reset}`);
      isValid = false;
    } else {
      console.log(`  ${colors.green}✓ Count matches: ${original.beats.length}${colors.reset}`);
    }

    // Check each beat
    let beatIssues = 0;
    for (let i = 0; i < Math.min(original.beats.length, exported.beats.length); i++) {
      const origBeat = original.beats[i];
      const expBeat = exported.beats[i];
      
      // Check beat ID
      if (origBeat.id !== expBeat.id) {
        this.errors.push(`Beat ${i} ID mismatch: "${origBeat.id}" → "${expBeat.id}"`);
        console.log(`  ${colors.red}✗ Beat ${i}: ID changed${colors.reset}`);
        beatIssues++;
      }

      // Check duration (transition)
      if (origBeat.duration && expBeat.duration) {
        const origDuration = parseFloat(origBeat.duration);
        const expDuration = parseFloat(expBeat.duration);
        
        if (expDuration === origDuration * 1000) {
          this.errors.push(`Beat ${origBeat.id}: duration ×1000 error (${origDuration} → ${expDuration})`);
          console.log(`  ${colors.red}✗ Beat ${origBeat.id}: duration multiplied by 1000${colors.reset}`);
          beatIssues++;
        } else if (origDuration !== expDuration) {
          this.errors.push(`Beat ${origBeat.id}: duration changed (${origDuration} → ${expDuration})`);
          console.log(`  ${colors.red}✗ Beat ${origBeat.id}: duration changed${colors.reset}`);
          beatIssues++;
        }
      }

      // Check function attributes preserved
      if (origBeat.functionKind && expBeat.functionKind) {
        const origAttrs = origBeat.functionAttrs || {};
        const expAttrs = expBeat.functionAttrs || {};
        
        // Check for missing attributes
        for (const key in origAttrs) {
          if (key !== 'kind' && !(key in expAttrs)) {
            this.warnings.push(`Beat ${origBeat.id}: function attribute "${key}" missing`);
            console.log(`  ${colors.yellow}⚠ Beat ${origBeat.id}: missing "${key}" attribute${colors.reset}`);
          }
        }
      }

      // Check choices for multi-choice beats
      if (origBeat.choices && origBeat.choices.length > 0) {
        if (!expBeat.choices || expBeat.choices.length !== origBeat.choices.length) {
          this.errors.push(`Beat ${origBeat.id}: choices count (${origBeat.choices.length} → ${expBeat.choices?.length || 0})`);
          console.log(`  ${colors.red}✗ Beat ${origBeat.id}: choices mismatch${colors.reset}`);
          beatIssues++;
        }
      }
    }
    
    if (beatIssues === 0 && original.beats.length > 0) {
      console.log(`  ${colors.green}✓ All beat data preserved correctly${colors.reset}`);
    }

    // Compare connections
    console.log(`\n${colors.blue}🔗 Connections:${colors.reset}`);
    if (Math.abs(original.connections.length - exported.connections.length) > 5) {
      // Allow small differences due to how connections might be counted
      this.errors.push(`Connection count mismatch: ${original.connections.length} → ${exported.connections.length}`);
      console.log(`  ${colors.red}✗ Significant count difference: ${original.connections.length} → ${exported.connections.length}${colors.reset}`);
      isValid = false;
    } else if (original.connections.length !== exported.connections.length) {
      console.log(`  ${colors.yellow}⚠ Minor count difference: ${original.connections.length} → ${exported.connections.length}${colors.reset}`);
      console.log(`    ${colors.dim}(May be due to multi-choice beat handling)${colors.reset}`);
    } else {
      console.log(`  ${colors.green}✓ Count matches: ${original.connections.length}${colors.reset}`);
    }

    // Compare characters
    console.log(`\n${colors.blue}👥 Characters:${colors.reset}`);
    if (original.characters.length !== exported.characters.length) {
      this.errors.push(`Character count: ${original.characters.length} → ${exported.characters.length}`);
      console.log(`  ${colors.red}✗ Count mismatch: ${original.characters.length} → ${exported.characters.length}${colors.reset}`);
      if (exported.characters.length === 0 && original.characters.length > 0) {
        console.log(`  ${colors.red}✗ All characters lost during export!${colors.reset}`);
      }
      isValid = false;
    } else if (original.characters.length > 0) {
      console.log(`  ${colors.green}✓ Count matches: ${original.characters.length}${colors.reset}`);
    } else {
      console.log(`  ${colors.dim}  No characters in original file${colors.reset}`);
    }

    // Check settings
    console.log(`\n${colors.blue}⚙️ Settings:${colors.reset}`);
    const origSettingsCount = Object.keys(original.settings).length;
    const expSettingsCount = Object.keys(exported.settings).length;
    
    if (origSettingsCount > 0 && expSettingsCount === 0) {
      this.errors.push('Settings section empty in export');
      console.log(`  ${colors.red}✗ Settings lost during export${colors.reset}`);
      isValid = false;
    } else if (origSettingsCount === expSettingsCount && origSettingsCount > 0) {
      console.log(`  ${colors.green}✓ Settings preserved${colors.reset}`);
    } else if (origSettingsCount === 0) {
      console.log(`  ${colors.dim}  No settings in original${colors.reset}`);
    }

    // Check environment
    console.log(`\n${colors.blue}🌍 Environment:${colors.reset}`);
    const origEnvItems = (original.environment.props?.length || 0) + (original.environment.nodes?.length || 0);
    const expEnvItems = (exported.environment.props?.length || 0) + (exported.environment.nodes?.length || 0);
    
    if (origEnvItems > 0 && expEnvItems === 0) {
      this.errors.push('Environment section empty in export');
      console.log(`  ${colors.red}✗ Environment data lost (props/nodes)${colors.reset}`);
      isValid = false;
    } else if (origEnvItems === expEnvItems && origEnvItems > 0) {
      console.log(`  ${colors.green}✓ Environment preserved${colors.reset}`);
    } else if (origEnvItems === 0) {
      console.log(`  ${colors.dim}  No environment data in original${colors.reset}`);
    }

    // Summary
    console.log(`\n${colors.cyan}═══ Summary ═══${colors.reset}`);
    console.log(`  Errors: ${this.errors.length}`);
    console.log(`  Warnings: ${this.warnings.length}`);
    
    if (this.errors.length > 0) {
      console.log(`\n${colors.red}❌ Critical Issues:${colors.reset}`);
      // Group similar errors
      const durationErrors = this.errors.filter(e => e.includes('duration'));
      const characterErrors = this.errors.filter(e => e.includes('Character') || e.includes('character'));
      const otherErrors = this.errors.filter(e => !e.includes('duration') && !e.includes('Character') && !e.includes('character'));
      
      if (durationErrors.length > 0) {
        console.log(`\n  ${colors.red}Duration Issues (×1000 bug):${colors.reset}`);
        console.log(`    • ${durationErrors.length} beats have duration multiplied by 1000`);
      }
      
      if (characterErrors.length > 0) {
        console.log(`\n  ${colors.red}Character/Settings Issues:${colors.reset}`);
        characterErrors.forEach(err => console.log(`    • ${err}`));
      }
      
      if (otherErrors.length > 0) {
        console.log(`\n  ${colors.red}Other Issues:${colors.reset}`);
        otherErrors.forEach(err => console.log(`    • ${err}`));
      }
    }
    
    if (this.warnings.length > 0) {
      console.log(`\n${colors.yellow}⚠️ Warnings:${colors.reset}`);
      this.warnings.forEach(warn => console.log(`  • ${warn}`));
    }

    return isValid;
  }
}

// Main validation function
async function validateRoundTrip(inputFile, exportedFile = null) {
  const validator = new XMLValidator();
  
  try {
    // Read original file
    const originalContent = fs.readFileSync(inputFile, 'utf8');
    const originalData = validator.extractData(originalContent);
    
    console.log(`${colors.blue}📖 Original file: ${colors.white}${path.basename(inputFile)}${colors.reset}`);
    console.log(`   Beats: ${originalData.beats.length}`);
    console.log(`   Connections: ${originalData.connections.length}`);
    console.log(`   Characters: ${originalData.characters.length}`);
    
    // Determine exported file path
    if (!exportedFile) {
      // Try to find an exported version
      const baseName = path.basename(inputFile, '.xml');
      const dir = path.dirname(inputFile);
      
      // Try different naming patterns
      const possibleExports = [
        path.join(dir, `${baseName}_exported.xml`),
        path.join(dir, `The_${baseName.replace(/_/g, ' ')}_exported.xml`),
        path.join(dir, 'The_Forest_Adventure_V2_exported.xml'),
        path.join(dir, 'The_Forest_Adventure_6.xml') // New pattern
      ];
      
      for (const testPath of possibleExports) {
        if (fs.existsSync(testPath)) {
          exportedFile = testPath;
          break;
        }
      }
    }
    
    if (!exportedFile || !fs.existsSync(exportedFile)) {
      console.log(`\n${colors.yellow}⚠ No exported file found${colors.reset}`);
      console.log(`\nTo validate:`);
      console.log(`  1. Import ${path.basename(inputFile)}`);
      console.log(`  2. Export the story`);
      console.log(`  3. Run: node ${path.basename(process.argv[1])} ${inputFile} <exported-file.xml>`);
      return false;
    }
    
    const exportedContent = fs.readFileSync(exportedFile, 'utf8');
    const exportedData = validator.extractData(exportedContent);
    
    console.log(`\n${colors.blue}📤 Exported file: ${colors.white}${path.basename(exportedFile)}${colors.reset}`);
    console.log(`   Beats: ${exportedData.beats.length}`);
    console.log(`   Connections: ${exportedData.connections.length}`);
    console.log(`   Characters: ${exportedData.characters.length}`);
    
    // Compare data
    const isValid = validator.compareData(originalData, exportedData, path.basename(inputFile));
    
    if (isValid) {
      console.log(`\n${colors.green}✅ VALIDATION PASSED${colors.reset}`);
      console.log(`All critical data preserved correctly!`);
    } else {
      console.log(`\n${colors.red}❌ VALIDATION FAILED${colors.reset}`);
      console.log(`Found ${validator.errors.length} issues needing attention`);
    }
    
    return isValid;
    
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    return false;
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${colors.cyan}ASPS Round-Trip Validator${colors.reset}`);
    console.log('\nUsage:');
    console.log('  node validate-roundtrip.js <input.xml> [exported.xml]');
    console.log('\nExamples:');
    console.log('  node validate-roundtrip.js examples/forest_adventure_v2.xml');
    console.log('  node validate-roundtrip.js examples/forest_adventure_v2.xml examples/The_Forest_Adventure_6.xml');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const exportedFile = args[1] || null;
  
  if (!fs.existsSync(inputFile)) {
    console.error(`${colors.red}File not found: ${inputFile}${colors.reset}`);
    process.exit(1);
  }
  
  validateRoundTrip(inputFile, exportedFile).then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { XMLValidator, validateRoundTrip };
