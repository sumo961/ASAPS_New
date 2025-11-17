#!/usr/bin/env node

/**
 * Test Script for Settings Export
 * This script tests if all settings are being properly exported to ASML
 */

const fs = require('fs');
const path = require('path');

// Test settings object with all fields populated
const testSettings = {
  project: {
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    scalingMode: 'fill'
  },
  colors: {
    pcolor: '#FF0000',
    palpha: 80,
    nonpcolor: '#00FF00',
    nonpalpha: 70,
    bgColor: '#0000FF',
    textBoxBg: '#FFFFFF',
    textBoxBorder: '#000000'
  },
  fonts: {
    titleFont: 'Arial',
    textFont: 'Verdana',
    btnFont: 'Georgia',
    fontSize: {
      title: 36,
      text: 14,
      button: 12
    }
  },
  textbox: {
    radius: 15,
    padding: 10,
    borderWidth: 3,
    opacity: 90,
    position: 'top'
  },
  textEffects: {
    animation: 'fade',
    typewriterSpeed: 50,
    fadeInDuration: 1000
  },
  hotspots: {
    visible: false,
    labels: false,
    highlightColor: '#FF00FF'
  },
  sound: {
    backgroundMusic: 'theme.mp3',
    backgroundVolume: 50,
    mute: true
  },
  copyright: {
    notice: 'Copyright Test Notice',
    year: '2025',
    owner: 'Test Owner'
  },
  debug: {
    firstbeat: '5',
    showvals: true
  }
};

// Expected XML output patterns for each setting
const expectedPatterns = [
  // Project settings
  /<project\s+.*width="1280"/,
  /<project\s+.*height="720"/,
  /<project\s+.*aspectRatio="16:9"/,
  /<project\s+.*scalingMode="fill"/,
  
  // Colors
  /<colors\s+.*pcolor="#FF0000"/,
  /<colors\s+.*palpha="80"/,
  /<colors\s+.*nonpcolor="#00FF00"/,
  /<colors\s+.*nonpalpha="70"/,
  /<colors\s+.*bgColor="#0000FF"/,
  /<colors\s+.*textBoxBg="#FFFFFF"/,
  /<colors\s+.*textBoxBorder="#000000"/,
  
  // Fonts
  /<fonts\s+.*titleFont="Arial"/,
  /<fonts\s+.*textFont="Verdana"/,
  /<fonts\s+.*btnFont="Georgia"/,
  /<fonts\s+.*titleSize="36"/,
  /<fonts\s+.*textSize="14"/,
  /<fonts\s+.*buttonSize="12"/,
  
  // Textbox
  /<textbox\s+.*radius="15"/,
  /<textbox\s+.*padding="10"/,
  /<textbox\s+.*borderWidth="3"/,
  /<textbox\s+.*opacity="90"/,
  /<textbox\s+.*position="top"/,
  
  // Text Effects
  /<texteffects\s+.*animation="fade"/,
  /<texteffects\s+.*typewriterSpeed="50"/,
  /<texteffects\s+.*fadeInDuration="1000"/,
  
  // Hotspots
  /<hotspots\s+.*visible="false"/,
  /<hotspots\s+.*labels="false"/,
  /<hotspots\s+.*highlightColor="#FF00FF"/,
  
  // Sound
  /<backgroundsound\s+.*name="theme.mp3"/,
  /<backgroundsound\s+.*volume="50"/,
  /<backgroundsound\s+.*mute="true"/,
  
  // Copyright
  /<copyright\s+.*notice="Copyright Test Notice"/,
  
  // Debug
  /<debug\s+.*firstbeat="5"/,
  /<debug\s+.*showvals="on"/
];

console.log('========================================');
console.log('Settings Export Test');
console.log('========================================\n');

console.log('Test settings object:');
console.log(JSON.stringify(testSettings, null, 2));
console.log('\n');

// Create a minimal story XML with our test settings
function createTestStoryXML(settings) {
  const { ASMLGenerator } = require('./packages/core/dist/index.js');
  const { Story } = require('./packages/core/dist/index.js');
  
  const story = new Story({
    title: 'Test Story',
    author: 'Test Author',
    firstBeatId: '0'
  });
  
  story.setSettings(settings);
  
  const generator = new ASMLGenerator();
  return generator.generate(story);
}

// Run the test
try {
  console.log('Generating ASML with test settings...\n');
  const xml = createTestStoryXML(testSettings);
  
  // Save to file for inspection
  const outputFile = path.join(__dirname, 'test-settings-output.xml');
  fs.writeFileSync(outputFile, xml, 'utf8');
  console.log(`Full XML saved to: ${outputFile}\n`);
  
  // Extract just the settings section
  const settingsMatch = xml.match(/<settings>[\s\S]*?<\/settings>/);
  if (settingsMatch) {
    console.log('Settings section from generated XML:');
    console.log('----------------------------------------');
    console.log(settingsMatch[0]);
    console.log('----------------------------------------\n');
  }
  
  // Test each expected pattern
  console.log('Testing expected patterns:');
  console.log('----------------------------------------');
  
  let passCount = 0;
  let failCount = 0;
  const failures = [];
  
  expectedPatterns.forEach(pattern => {
    const matches = pattern.test(xml);
    const status = matches ? '✓' : '✗';
    const color = matches ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    
    console.log(`${color}${status}${reset} ${pattern.source}`);
    
    if (matches) {
      passCount++;
    } else {
      failCount++;
      failures.push(pattern.source);
    }
  });
  
  console.log('\n========================================');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log('========================================');
  
  if (failCount > 0) {
    console.log('\n\x1b[31mFailed patterns:\x1b[0m');
    failures.forEach(f => console.log(`  - ${f}`));
    console.log('\n\x1b[33mSome settings are not being exported correctly!\x1b[0m');
  } else {
    console.log('\n\x1b[32mAll settings are being exported correctly!\x1b[0m');
  }
  
} catch (error) {
  console.error('Error running test:', error);
  console.error('\nMake sure to run: npm run build');
}
