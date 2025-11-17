#!/bin/bash

# Create the StoryExporter utility
cat > packages/builder/src/utils/StoryExporter.ts << 'EOF'
/**
 * Story Exporter
 * Creates a structured export directory with story.xml and asset files
 */

import JSZip from 'jszip';
import { Story } from '@asaps/core';
import { ASMLGenerator } from '@asaps/core';

export interface ExportAsset {
  id: string;
  url: string;
  name: string;
  type: string;
  subType?: string;
}

export interface ExportOptions {
  storyName?: string;
  includeAssets?: boolean;
  compressAssets?: boolean;
}

export class StoryExporter {
  private zip: JSZip;
  private assetMap: Map<string, string>; // Maps original URLs to new relative paths
  
  constructor() {
    this.zip = new JSZip();
    this.assetMap = new Map();
  }

  /**
   * Export story with proper directory structure
   */
  async exportStory(
    story: Story, 
    assets: ExportAsset[] = [],
    options: ExportOptions = {}
  ): Promise<Blob> {
    const storyName = options.storyName || story.getMetadata()?.title || 'story';
    const folderName = this.sanitizeFileName(storyName);
    
    // Create main folder
    const storyFolder = this.zip.folder(folderName);
    if (!storyFolder) throw new Error('Failed to create story folder');
    
    // Create asset directories
    const assetsFolder = storyFolder.folder('assets');
    if (!assetsFolder) throw new Error('Failed to create assets folder');
    
    const charactersFolder = assetsFolder.folder('characters');
    const propsFolder = assetsFolder.folder('props');
    const nodesFolder = assetsFolder.folder('nodes');
    
    // Process and copy assets
    if (options.includeAssets !== false) {
      await this.processAssets(assets, {
        characters: charactersFolder!,
        props: propsFolder!,
        nodes: nodesFolder!
      });
    }
    
    // Generate ASML with relative asset paths
    const asmlContent = this.generateASMLWithRelativePaths(story);
    
    // Add story.xml to the root of the story folder
    storyFolder.file('story.xml', asmlContent);
    
    // Add a readme file for user guidance
    storyFolder.file('README.txt', this.generateReadme(storyName));
    
    // Generate the zip file
    return await this.zip.generateAsync({ 
      type: 'blob',
      compression: options.compressAssets ? 'DEFLATE' : 'STORE',
      compressionOptions: {
        level: options.compressAssets ? 6 : 1
      }
    });
  }

  private async processAssets(
    assets: ExportAsset[],
    folders: {
      characters: JSZip | null;
      props: JSZip | null;
      nodes: JSZip | null;
    }
  ): Promise<void> {
    for (const asset of assets) {
      try {
        const targetFolder = this.getTargetFolder(asset, folders);
        if (!targetFolder) continue;
        
        const filename = this.generateAssetFilename(asset);
        const assetData = await this.fetchAssetData(asset);
        if (!assetData) continue;
        
        targetFolder.file(filename, assetData);
        
        const relativePath = \`assets/\${this.getFolderName(asset)}/\${filename}\`;
        this.assetMap.set(asset.url, relativePath);
        
      } catch (error) {
        console.warn(\`Failed to process asset \${asset.name}:\`, error);
      }
    }
  }

  private async fetchAssetData(asset: ExportAsset): Promise<Blob | null> {
    try {
      if (asset.url.startsWith('data:')) {
        const [header, base64] = asset.url.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
      }
      
      if (asset.url.startsWith('http://') || asset.url.startsWith('https://')) {
        try {
          const response = await fetch(asset.url);
          if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
          return await response.blob();
        } catch (error) {
          console.warn(\`Failed to fetch \${asset.url}, will use reference only\`);
          return null;
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('Error processing asset data:', error);
      return null;
    }
  }

  private getTargetFolder(
    asset: ExportAsset,
    folders: {
      characters: JSZip | null;
      props: JSZip | null;
      nodes: JSZip | null;
    }
  ): JSZip | null {
    if (asset.subType) {
      switch (asset.subType.toLowerCase()) {
        case 'character':
        case 'npc':
        case 'player':
        case 'sprite':
          return folders.characters;
        case 'prop':
        case 'item':
        case 'object':
          return folders.props;
        case 'background':
        case 'node':
        case 'scene':
          return folders.nodes;
      }
    }
    
    const name = asset.name.toLowerCase();
    if (name.includes('char') || name.includes('npc') || name.includes('player') || name.includes('sprite')) {
      return folders.characters;
    }
    if (name.includes('prop') || name.includes('item') || name.includes('object')) {
      return folders.props;
    }
    if (name.includes('bg') || name.includes('background') || name.includes('scene') || name.includes('node')) {
      return folders.nodes;
    }
    
    if (asset.type?.includes('image')) {
      if (asset.type.includes('png')) {
        return folders.props;
      }
      if (asset.type.includes('jpeg') || asset.type.includes('jpg')) {
        return folders.nodes;
      }
    }
    
    return folders.props;
  }

  private getFolderName(asset: ExportAsset): string {
    if (asset.subType?.includes('char') || asset.name.toLowerCase().includes('char')) {
      return 'characters';
    }
    if (asset.subType?.includes('node') || asset.subType?.includes('background')) {
      return 'nodes';
    }
    return 'props';
  }

  private generateAssetFilename(asset: ExportAsset): string {
    let filename = asset.name;
    let extension = '';
    
    if (asset.url && !asset.url.startsWith('data:')) {
      const urlParts = asset.url.split('.');
      if (urlParts.length > 1) {
        extension = urlParts[urlParts.length - 1].split('?')[0];
      }
    }
    
    if (!extension && asset.type) {
      const mimeToExt: { [key: string]: string } = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
      };
      extension = mimeToExt[asset.type] || 'bin';
    }
    
    filename = this.sanitizeFileName(filename);
    
    if (!filename.includes('.')) {
      filename += '.' + extension;
    }
    
    return filename;
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private generateASMLWithRelativePaths(story: Story): string {
    const generator = new ASMLGenerator();
    let asml = generator.generate(story);
    
    this.assetMap.forEach((relativePath, originalUrl) => {
      const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedUrl, 'g');
      asml = asml.replace(regex, relativePath);
    });
    
    return asml;
  }

  private generateReadme(storyName: string): string {
    return \`\${storyName} - ASPS Story Export
=====================================

This archive contains an exported ASPS story with the following structure:

/
├── story.xml          - Main story file with all beats and logic
└── assets/           - Media assets used in the story
    ├── characters/   - Character images and sprites
    ├── props/       - Props and items
    └── nodes/       - Background images and scenes

HOW TO USE:
-----------
1. Extract this entire folder to your ASPS project directory
2. Open story.xml in the ASPS Builder to edit
3. Assets are referenced by relative paths from story.xml

ASSET REFERENCES:
----------------
All assets in the story.xml file use relative paths.
For example: <visual defaultImage="assets/characters/player.png" />

NOTES:
------
- Keep the folder structure intact for proper asset loading
- You can replace asset files with same-named files to update graphics
- The story.xml file is human-readable and can be edited with any text editor

Generated by ASPS Modern
\${new Date().toISOString()}
\`;
  }
}

export async function downloadStoryExport(
  story: Story,
  assets: ExportAsset[] = [],
  options: ExportOptions = {}
): Promise<void> {
  const exporter = new StoryExporter();
  
  try {
    const blob = await exporter.exportStory(story, assets, options);
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = \`\${options.storyName || story.getMetadata()?.title || 'story'}.zip\`;
    
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    
    console.log('Story exported successfully as', filename);
  } catch (error) {
    console.error('Failed to export story:', error);
    throw error;
  }
}
EOF

echo "StoryExporter created successfully!"

# Add JSZip to package.json
echo "Adding JSZip dependency..."
npm install jszip
npm install --save-dev @types/jszip

echo "Done! The StoryExporter is ready to use."
