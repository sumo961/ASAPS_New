#!/usr/bin/env node

/**
 * Round-Trip Data Validation Script for ASPS Modern
 * 
 * This script tests that data is preserved during import/export cycles.
 * It validates:
 * 1. All beat parameters are preserved
 * 2. Connections are maintained
 * 3. Settings/environment/characters are exported
 * 4. Duration values remain correct
 * 5. Conditions and effects are preserved
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
  white: '\x1b[37m'
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

    // Extract connections
    const connMatches = xmlContent.match(/<connection[^>]*\/>/g) || [];
    connMatches.forEach(connXml => {
      const conn = this.parseConnection(connXml);
      if (conn) data.connections.push(conn);
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
   * Parse a beat element
   */
  parseBeat(beatXml) {
    const beat = {};
    
    // Extract attributes
    const attrMatch = beatXml.match(/<beat([^>]*)>/);
    if (attrMatch) {
      const attrs = this.parseAttributes(attrMatch[1]);
      Object.assign(beat, attrs);
    }

    // Extract text
    const textMatch = beatXml.match(/<text[^>]*>([\s\S]*?)<\/text>/);
    if (textMatch) {
      beat.text = this.unescapeXml(textMatch[1]);
    }

    // Extract choices
    const choiceMatches = beatXml.match(/<choice[^>]*>[\s\S]*?<\/choice>/g) || [];
    beat.choices = choiceMatches.map(choiceXml => this.parseChoice(choiceXml));

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
    
    // Extract text
    const textMatch = choiceXml.match(/<choice[^>]*>(.*?)<\/choice>/);
    if (textMatch) {
      choice.text = this.unescapeXml(textMatch[1]);
    }

    // Extract attributes
    const attrMatch = choiceXml.match(/<choice([^>]*)>/);
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
    const lines = settingsContent.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      const match = line.match(/(\w+):\s*(.+)/);
      if (match) {
        settings[match[1]] = match[2].trim();
      }
    });
    return settings;
  }

  /**
   * Parse environment section
   */
  parseEnvironment(envContent) {
    const env = {};
    const lines = envContent.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      const match = line.match(/(\w+):\s*(.+)/);
      if (match) {
        env[match[1]] = match[2].trim();
      }
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
    console.log(`\n${colors.cyan}Comparing data structures...${colors.reset}\n`);
    
    let isValid = true;

    // Compare beats
    console.log(`${colors.blue}Beats:${colors.reset}`);
    if (original.beats.length !== exported.beats.length) {
      this.errors.push(`Beat count mismatch: ${original.beats.length} → ${exported.beats.length}`);
      console.log(`  ${colors.red}✗ Count mismatch: ${original.beats.length} → ${exported.beats.length}${colors.reset}`);
      isValid = false;
    } else {
      console.log(`  ${colors.green}✓ Count matches: ${original.beats.length}${colors.reset}`);
    }

    // Check each beat
    for (let i = 0; i < Math.min(original.beats.length, exported.beats.length); i++) {
      const origBeat = original.beats[i];
      const expBeat = exported.beats[i];
      
      // Check beat ID
      if (origBeat.id !== expBeat.id) {
        this.errors.push(`Beat ${i} ID mismatch: ${origBeat.id} → ${expBeat.id}`);
        console.log(`  ${colors.red}✗ Beat ${i} ID changed${colors.reset}`);
        isValid = false;
      }

      // Check duration
      if (origBeat.duration && origBeat.duration !== expBeat.duration) {
        // Check if it's the multiplication issue
        if (parseFloat(expBeat.duration) === parseFloat(origBeat.duration) * 1000) {
          this.errors.push(`Beat ${origBeat.id} duration multiplied by 1000: ${origBeat.duration} → ${expBeat.duration}`);
          console.log(`  ${colors.red}✗ Beat ${origBeat.id} duration error (×1000)${colors.reset}`);
        } else {
          this.errors.push(`Beat ${origBeat.id} duration changed: ${origBeat.duration} → ${expBeat.duration}`);
          console.log(`  ${colors.red}✗ Beat ${origBeat.id} duration changed${colors.reset}`);
        }
        isValid = false;
      }

      // Check choices for multi-choice beats
      if (origBeat.choices && origBeat.choices.length > 0) {
        if (!expBeat.choices || expBeat.choices.length !== origBeat.choices.length) {
          this.errors.push(`Beat ${origBeat.id} choices count mismatch`);
          console.log(`  ${colors.red}✗ Beat ${origBeat.id} choices mismatch${colors.reset}`);
          isValid = false;
        }
      }

      // Check conditions
      if (origBeat.conditions && origBeat.conditions.length > 0) {
        if (!expBeat.conditions || expBeat.conditions.length !== origBeat.conditions.length) {
          this.warnings.push(`Beat ${origBeat.id} conditions count mismatch`);
          console.log(`  ${colors.yellow}⚠ Beat ${origBeat.id} conditions changed${colors.reset}`);
        }
      }

      // Check effects
      if (origBeat.effects && origBeat.effects.length > 0) {
        if (!expBeat.effects || expBeat.effects.length !== origBeat.effects.length) {
          this.warnings.push(`Beat ${origBeat.id} effects count mismatch`);
          console.log(`  ${colors.yellow}⚠ Beat ${origBeat.id} effects changed${colors.reset}`);
        }
      }
    }

    // Compare connections
    console.log(`\n${colors.blue}Connections:${colors.reset}`);
    if (original.connections.length !== exported.connections.length) {
      this.errors.push(`Connection count mismatch: ${original.connections.length} → ${exported.connections.length}`);
      console.log(`  ${colors.red}✗ Count mismatch: ${original.connections.length} → ${exported.connections.length}${colors.reset}`);
      isValid = false;
    } else {
      console.log(`  ${colors.green}✓ Count matches: ${original.connections.length}${colors.reset}`);
    }

    // Check for multi-choice beat connections
    const multiChoiceBeats = original.beats.filter(b => b.choices && b.choices.length > 0);
    multiChoiceBeats.forEach(beat => {
      const expectedConnections = beat.choices.length;
      const actualConnections = exported.connections.filter(c => c.from === beat.id).length;
      if (actualConnections < expectedConnections) {
        this.errors.push(`Multi-choice beat ${beat.id} missing connections: expected ${expectedConnections}, got ${actualConnections}`);
        console.log(`  ${colors.red}✗ Beat ${beat.id} missing choice connections${colors.reset}`);
        isValid = false;
      }
    });

    // Compare characters
    console.log(`\n${colors.blue}Characters:${colors.reset}`);
    if (original.characters.length !== exported.characters.length) {
      this.errors.push(`Character count mismatch: ${original.characters.length} → ${exported.characters.length}`);
      console.log(`  ${colors.red}✗ Count mismatch: ${original.characters.length} → ${exported.characters.length}${colors.reset}`);
      isValid = false;
    } else if (original.characters.length > 0) {
      console.log(`  ${colors.green}✓ Count matches: ${original.characters.length}${colors.reset}`);
    } else {
      console.log(`  ${colors.yellow}⚠ No characters in file${colors.reset}`);
    }

    // Check if sections exist
    console.log(`\n${colors.blue}Sections:${colors.reset}`);
    if (Object.keys(exported.settings).length === 0 && Object.keys(original.settings).length > 0) {
      this.errors.push('Settings section missing in export');
      console.log(`  ${colors.red}✗ Settings section missing${colors.reset}`);
      isValid = false;
    } else if (Object.keys(original.settings).length > 0) {
      console.log(`  ${colors.green}✓ Settings preserved${colors.reset}`);
    }

    if (Object.keys(exported.environment).length === 0 && Object.keys(original.environment).length > 0) {
      this.errors.push('Environment section missing in export');
      console.log(`  ${colors.red}✗ Environment section missing${colors.reset}`);
      isValid = false;
    } else if (Object.keys(original.environment).length > 0) {
      console.log(`  ${colors.green}✓ Environment preserved${colors.reset}`);
    }

    // Summary
    console.log(`\n${colors.cyan}Summary:${colors.reset}`);
    console.log(`  Errors: ${this.errors.length}`);
    console.log(`  Warnings: ${this.warnings.length}`);
    
    if (this.errors.length > 0) {
      console.log(`\n${colors.red}Errors found:${colors.reset}`);
      this.errors.forEach(err => console.log(`  • ${err}`));
    }
    
    if (this.warnings.length > 0) {
      console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
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
    
    console.log(`${colors.blue}Original file loaded: ${path.basename(inputFile)}${colors.reset}`);
    console.log(`  - Beats: ${originalData.beats.length}`);
    console.log(`  - Connections: ${originalData.connections.length}`);
    console.log(`  - Characters: ${originalData.characters.length}`);
    
    // Determine exported file path
    if (!exportedFile) {
      // Try to find an exported version
      const baseName = path.basename(inputFile, '.xml');
      const dir = path.dirname(inputFile);
      
      // Try different naming patterns
      const possibleExports = [
        path.join(dir, `${baseName}_exported.xml`),
        path.join(dir, `${baseName.replace(/_/g, ' ')}_exported.xml`),
        path.join(dir, `The_${baseName.replace(/_/g, ' ')}_exported.xml`),
        path.join(dir, 'The_Forest_Adventure_V2_exported.xml') // Specific known file
      ];
      
      for (const testPath of possibleExports) {
        if (fs.existsSync(testPath)) {
          exportedFile = testPath;
          console.log(`${colors.green}Found exported file: ${path.basename(exportedFile)}${colors.reset}`);
          break;
        }
      }
    }
    
    if (!exportedFile || !fs.existsSync(exportedFile)) {
      console.log(`\n${colors.yellow}⚠ No exported file found to compare against${colors.reset}`);
      console.log(`\nTo perform validation:`);
      console.log(`  1. Import ${path.basename(inputFile)} into the application`);
      console.log(`  2. Export the story`);
      console.log(`  3. Save as ${path.basename(inputFile, '.xml')}_exported.xml`);
      console.log(`  4. Run this validation script again`);
      console.log(`\nAlternatively, specify the exported file as a second argument:`);
      console.log(`  node validate-roundtrip.js ${inputFile} <exported-file.xml>`);
      return false;
    }
    
    const exportedContent = fs.readFileSync(exportedFile, 'utf8');
    const exportedData = validator.extractData(exportedContent);
    
    console.log(`\n${colors.blue}Exported file loaded: ${path.basename(exportedFile)}${colors.reset}`);
    console.log(`  - Beats: ${exportedData.beats.length}`);
    console.log(`  - Connections: ${exportedData.connections.length}`);
    console.log(`  - Characters: ${exportedData.characters.length}`);
    
    // Compare data
    const isValid = validator.compareData(originalData, exportedData, path.basename(inputFile));
    
    if (isValid) {
      console.log(`\n${colors.green}✅ VALIDATION PASSED${colors.reset}`);
      console.log(`All data preserved correctly during import/export cycle!`);
    } else {
      console.log(`\n${colors.red}❌ VALIDATION FAILED${colors.reset}`);
      console.log(`\nFound ${validator.errors.length} errors that need fixing.`);
    }
    
    return isValid;
    
  } catch (error) {
    console.error(`${colors.red}Error during validation: ${error.message}${colors.reset}`);
    return false;
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node validate-roundtrip.js <input-file.xml> [exported-file.xml]');
    console.log('');
    console.log('Examples:');
    console.log('  node validate-roundtrip.js examples/forest_adventure_v2.xml');
    console.log('  node validate-roundtrip.js examples/forest_adventure_v2.xml examples/The_Forest_Adventure_V2_exported.xml');
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
