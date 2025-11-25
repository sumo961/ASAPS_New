#!/usr/bin/env npx tsx

/**
 * Create example story ZIP file for RED: A Modern Tale
 */

import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

async function createExampleZip() {
  console.log('Creating RED: A Modern Tale example ZIP...');

  // Read the story JSON
  const storyJsonPath = path.join(
    __dirname,
    'packages/builder/public/examples/red-riding-hood-modern.json'
  );

  const storyData = JSON.parse(fs.readFileSync(storyJsonPath, 'utf8'));

  // Create ZIP
  const zip = new JSZip();

  // Create project.json in the format expected by importProjectFromZip
  const projectData = {
    metadata: {
      exportVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: 'ASAPS Builder',
      projectId: 'example-red-riding-hood',
      projectName: 'RED: A Modern Tale'
    },
    project: {
      id: 'example-red-riding-hood',
      name: 'RED: A Modern Tale',
      description: 'A modern retelling of Little Red Riding Hood about a teenage girl finding her authentic self',
      createdAt: storyData.metadata.created || new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      version: '1.0.0',
      settings: storyData.settings || {},
      story: {
        metadata: storyData.metadata,
        beats: storyData.beats,
        settings: storyData.settings || {},
        environment: storyData.environment || { props: [], nodes: [] },
        characters: storyData.characters || [],
        clusters: storyData.clusters || []
      }
    }
  };

  // Add project.json to ZIP
  zip.file('project.json', JSON.stringify(projectData, null, 2));

  // Create empty asset folders
  zip.folder('backgrounds');
  zip.folder('characters');
  zip.folder('props');
  zip.folder('sounds');
  zip.folder('fonts');
  zip.folder('other');

  // Generate ZIP blob
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  // Write to file
  const outputPath = path.join(
    __dirname,
    'packages/builder/public/examples/red-riding-hood-modern.asaps.zip'
  );

  fs.writeFileSync(outputPath, zipBuffer);

  console.log('✓ ZIP created successfully!');
  console.log(`  File: ${outputPath}`);
  console.log(`  Size: ${(zipBuffer.length / 1024).toFixed(2)} KB`);
  console.log('\nYou can now import this ZIP file in the builder:');
  console.log('  1. Open ASAPS Builder');
  console.log('  2. Go to File → Import ZIP');
  console.log('  3. Select red-riding-hood-modern.asaps.zip');
}

createExampleZip().catch(console.error);
