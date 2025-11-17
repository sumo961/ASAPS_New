#!/usr/bin/env node

/**
 * Test script to verify which settings are being saved in ASML export
 * 
 * This script:
 * 1. Creates a test story with all possible settings
 * 2. Exports to ASML
 * 3. Analyzes which settings are included
 * 4. Reports missing or incorrect settings
 */

const fs = require('fs');
const path = require('path');

// Import the necessary modules
const { Story } = require('./packages/core/dist/index.js');
const { ASMLGenerator } = require('./packages/core/dist/index.js');

// Complete test settings matching GlobalSettingsInspector
const TEST_SETTINGS = {
  project: {
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    scalingMode: 'fill'
  },
  colors: {
    pcolor: '#FF0000',
    palpha: 85,
    nonpcolor: '#00FF00',
    nonpalpha: 75,
    bgColor: '#0000FF',
    textBoxBg: '#FFFF00',
    textBoxBorder: '#FF00FF'
  },
  fonts: {
    titleFont: 'Arial',
    textFont: 'Courier New',
    btnFont: 'Georgia',
    fontSize: {
      title: 60,
      text: 24,
      button: 20
    }
  },
  textbox: {
    radius: 30,
    padding: 25,
    borderWidth: 3,
    opacity: 70,
    position: 'top'
  },
  textEffects: {
    animation: 'fade',
    typewriterSpeed: 45,
    fadeInDuration: 1000
  },
  hotspots: {
    visible: false,
    labels: false,
    highlightColor: '#00FFFF'
  },
  sound: {
    backgroundMusic: 'test-music.mp3',
    backgroundVolume: 50,
    mute: true
  },
  copyright: {
    notice: 'Test Copyright Notice © 2025',
    year: '2025',
    owner: 'Test Owner'
  },
  debug: {
    firstbeat: 'test_beat_1',
    showvals: true
  }
};

console.log('🔍 Testing Settings Save Functionality\n');
console.log('=====================================\n');

try {
  // Create a test story
  const story = new Story({
    title: 'Settings Test Story',
    author: 'Test Author',
    firstBeatId: 'beat_0'
  });

  // Apply all test settings
  story.setSettings(TEST_SETTINGS);

  // Generate ASML
  const generator = new ASMLGenerator();
  const asml = generator.generate(story);

  // Parse the generated ASML to check what was included
  console.log('📝 Generated ASML Settings Section:\n');
  
  // Extract settings section
  const settingsMatch = asml.match(/<settings>([\s\S]*?)<\/settings>/);
  if (settingsMatch) {
    console.log(settingsMatch[0]);
  } else {
    console.log('❌ No settings section found!');
  }

  console.log('\n🔍 Analyzing Settings Fields:\n');

  // Check each settings category
  const checks = {
    'Project': {
      pattern: /<project\s+(.*?)\/>/,
      fields: ['width', 'height', 'aspectRatio', 'scalingMode']
    },
    'Debug': {
      pattern: /<debug\s+(.*?)\/>/,
      fields: ['firstbeat', 'showvals']
    },
    'Colors': {
      pattern: /<colors\s+(.*?)\/>/,
      fields: ['pcolor', 'palpha', 'nonpcolor', 'nonpalpha', 'bgColor', 'textBoxBg', 'textBoxBorder']
    },
    'Fonts': {
      pattern: /<fonts\s+(.*?)\/>/,
      fields: ['titleFont', 'textFont', 'btnFont', 'titleSize', 'textSize', 'buttonSize']
    },
    'TextBox': {
      pattern: /<textbox\s+(.*?)\/>/,
      fields: ['radius', 'padding', 'borderWidth', 'opacity', 'position']
    },
    'TextEffects': {
      pattern: /<texteffects\s+(.*?)\/>/,
      fields: ['animation', 'typewriterSpeed', 'fadeInDuration']
    },
    'Hotspots': {
      pattern: /<hotspots\s+(.*?)\/>/,
      fields: ['visible', 'labels', 'highlightColor']
    },
    'Sound': {
      pattern: /<backgroundsound\s+(.*?)\/>/,
      fields: ['name', 'volume', 'mute']
    },
    'Copyright': {
      pattern: /<copyright\s+(.*?)\/>/,
      fields: ['notice']
    }
  };

  let allFieldsPresent = true;
  let missingCategories = [];
  let missingFields = [];

  for (const [category, config] of Object.entries(checks)) {
    const match = asml.match(config.pattern);
    
    if (match) {
      console.log(`✅ ${category} section found`);
      const attrs = match[1];
      
      // Check individual fields
      const missingInCategory = [];
      for (const field of config.fields) {
        // Special handling for sound fields
        const fieldName = category === 'Sound' && field === 'name' ? 'name' : 
                         category === 'Sound' && field === 'volume' ? 'volume' :
                         category === 'Sound' && field === 'mute' ? 'mute' :
                         field;
        
        const fieldPattern = new RegExp(`${fieldName}="[^"]*"`);
        if (!fieldPattern.test(attrs)) {
          missingInCategory.push(field);
          missingFields.push(`${category}.${field}`);
          allFieldsPresent = false;
        }
      }
      
      if (missingInCategory.length > 0) {
        console.log(`   ⚠️  Missing fields: ${missingInCategory.join(', ')}`);
      } else {
        console.log(`   ✅ All fields present`);
      }
    } else {
      console.log(`❌ ${category} section NOT found`);
      missingCategories.push(category);
      allFieldsPresent = false;
    }
  }

  // Summary
  console.log('\n=====================================');
  console.log('📊 SUMMARY:\n');
  
  if (allFieldsPresent && missingCategories.length === 0) {
    console.log('✅ ALL SETTINGS ARE BEING SAVED CORRECTLY!');
  } else {
    console.log('❌ SETTINGS SAVE ISSUES DETECTED:\n');
    
    if (missingCategories.length > 0) {
      console.log(`Missing entire categories: ${missingCategories.join(', ')}`);
    }
    
    if (missingFields.length > 0) {
      console.log(`Missing individual fields: ${missingFields.join(', ')}`);
    }
    
    console.log('\n🔧 FIXES NEEDED:');
    console.log('1. Check ASMLGenerator.ts generateSettings() method');
    console.log('2. Verify all settings categories are exported');
    console.log('3. Ensure field names match between GlobalSettingsInspector and ASMLGenerator');
  }

  // Save test output for inspection
  const outputFile = path.join(__dirname, 'test-settings-output.xml');
  fs.writeFileSync(outputFile, asml);
  console.log(`\n📁 Full ASML saved to: ${outputFile}`);

} catch (error) {
  console.error('❌ Error during test:', error);
  console.error('\nStack trace:', error.stack);
}
