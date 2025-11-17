#!/usr/bin/env node

/**
 * Direct GitHub Upload Script for ASAPS_New
 * This script transfers all files from your local project directly to GitHub
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SOURCE_DIR = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern';
const GITHUB_REPO = 'sumo961/ASAPS_New';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// Files to exclude
const EXCLUDE_PATTERNS = [
  /\.sh$/,
  /\.bat$/,
  /^fix-/,
  /^apply-/,
  /^test-/,
  /^build-.*-fixes/,
  /^validate-/,
  /^debug-/,
  /\.backup\./,
  /node_modules/,
  /dist/,
  /\.DS_Store/,
  /package-lock.*\.json/,
  /pnpm-lock\.yaml/
];

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

async function uploadToGitHub(filePath, content, message) {
  if (!GITHUB_TOKEN) {
    console.error('Please set GITHUB_TOKEN environment variable');
    console.log('You can create a token at: https://github.com/settings/tokens');
    console.log('Then run: export GITHUB_TOKEN=your_token_here');
    process.exit(1);
  }
  
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  
  try {
    // Check if file exists
    const checkResponse = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    let sha;
    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      sha = existing.sha;
    }
    
    // Upload file
    const uploadResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message || `Add ${filePath}`,
        content: Buffer.from(content).toString('base64'),
        sha: sha // Include SHA if updating
      })
    });
    
    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(error);
    }
    
    console.log(`✓ Uploaded: ${filePath}`);
  } catch (error) {
    console.error(`✗ Failed to upload ${filePath}:`, error.message);
  }
}

async function transferFiles() {
  console.log('====================================');
  console.log('ASAPS_New - Direct GitHub Transfer');
  console.log('====================================');
  console.log('');
  
  const filesToUpload = [];
  
  // Scan for files to upload
  function scanDirectory(dir, baseDir = SOURCE_DIR) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (shouldExclude(item) || shouldExclude(relativePath)) {
        continue;
      }
      
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDirectory(fullPath, baseDir);
      } else if (stat.isFile()) {
        // Only include source files and configs
        if (relativePath.startsWith('packages/') || 
            item === 'tsconfig.json' ||
            item === 'eslint.config.js' ||
            item === '.prettierrc' ||
            item === 'vite.config.ts' ||
            item === 'tailwind.config.js' ||
            item === 'postcss.config.js' ||
            item === 'index.html') {
          filesToUpload.push({
            source: fullPath,
            target: relativePath,
            content: fs.readFileSync(fullPath, 'utf8')
          });
        }
      }
    }
  }
  
  console.log('Scanning files...');
  scanDirectory(SOURCE_DIR);
  
  console.log(`Found ${filesToUpload.length} files to upload`);
  console.log('');
  
  // Upload files in batches
  const batchSize = 5;
  for (let i = 0; i < filesToUpload.length; i += batchSize) {
    const batch = filesToUpload.slice(i, i + batchSize);
    await Promise.all(batch.map(file => 
      uploadToGitHub(file.target, file.content, `Add ${file.target}`)
    ));
    
    // Progress indicator
    const progress = Math.min(i + batchSize, filesToUpload.length);
    console.log(`Progress: ${progress}/${filesToUpload.length} files uploaded`);
  }
  
  console.log('');
  console.log('====================================');
  console.log('✓ Transfer Complete!');
  console.log('====================================');
  console.log('');
  console.log('Your repository is ready at:');
  console.log('https://github.com/' + GITHUB_REPO);
  console.log('');
  console.log('Next steps:');
  console.log('1. Clone the repository locally');
  console.log('2. Run: npm install');
  console.log('3. Run: npm run build');
  console.log('4. Run: npm run dev');
}

// Run the transfer
transferFiles().catch(console.error);
