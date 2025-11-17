import JSZip from 'jszip';
import type { Asset } from './components/assets/AssetManager';
import { Story, ASMLGenerator } from '@asaps/core';

export interface ExportOptions {
  includeAssets?: boolean;
  assetExportMode?: 'embed' | 'copy';
}

export class StoryExporter {
  /**
   * Export story with assets as a zip file containing proper directory structure
   */
  static async exportAsZip(
    story: Story,
    assets: Asset[],
    characters: any[],
    storyTitle: string
  ): Promise<Blob> {
    const zip = new JSZip();
    
    // Create the main story folder
    const storyFolder = storyTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    // Create subdirectories
    const assetsFolder = zip.folder(`${storyFolder}/assets`);
    const charactersFolder = assetsFolder?.folder('characters');
    const propsFolder = assetsFolder?.folder('props');
    const nodesFolder = assetsFolder?.folder('nodes');
    const audioFolder = assetsFolder?.folder('audio');
    const fontsFolder = assetsFolder?.folder('fonts');
    
    // Map to store asset URLs to file paths
    const assetPathMap = new Map<string, string>();
    
    // Process and copy assets to appropriate folders
    for (const asset of assets) {
      let targetFolder = null;
      let subPath = '';
      
      // Determine the target folder based on type and subType
      if (asset.type === 'image') {
        switch (asset.subType) {
          case 'background':
            targetFolder = nodesFolder;
            subPath = 'assets/nodes/';
            break;
          case 'character':
          case 'sprite':
            targetFolder = charactersFolder;
            subPath = 'assets/characters/';
            break;
          case 'prop':
          default:
            targetFolder = propsFolder;
            subPath = 'assets/props/';
            break;
        }
      } else if (asset.type === 'audio') {
        targetFolder = audioFolder;
        subPath = 'assets/audio/';
      } else if (asset.type === 'font') {
        targetFolder = fontsFolder;
        subPath = 'assets/fonts/';
      }
      
      if (targetFolder) {
        // Get the file content
        let fileContent: Blob | null = null;
        
        if (asset.file) {
          // Use the File object if available
          fileContent = asset.file;
        } else if (asset.url) {
          // Try to fetch the content from URL
          try {
            const response = await fetch(asset.url);
            fileContent = await response.blob();
          } catch (error) {
            console.warn(`Failed to fetch asset from URL: ${asset.url}`, error);
            continue;
          }
        }
        
        if (fileContent) {
          // Generate a safe filename
          let fileName = asset.name;
          // Ensure the file has an appropriate extension
          if (!fileName.match(/\.\w+$/)) {
            const extension = this.getFileExtension(asset.type, fileContent.type);
            fileName = `${fileName}.${extension}`;
          }
          
          // Add the file to the zip
          targetFolder.file(fileName, fileContent);
          
          // Store the mapping of original URL to new file path
          assetPathMap.set(asset.url, subPath + fileName);
        }
      }
    }
    
    // Update the story to reference assets by their new paths
    const updatedStory = this.updateStoryAssetReferences(story, assetPathMap, assets, characters);
    
    // Generate ASML with updated references
    const generator = new ASMLGenerator();
    const asml = generator.generate(updatedStory);
    
    // Add the story.xml file to the root of the story folder
    zip.file(`${storyFolder}/story.xml`, asml);
    
    // Generate the zip blob
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }
  
  /**
   * Update story asset references to use file paths instead of URLs
   */
  private static updateStoryAssetReferences(
    story: Story,
    assetPathMap: Map<string, string>,
    assets: Asset[],
    characters: any[]
  ): Story {
    // Clone the story to avoid modifying the original
    const updatedStory = new Story({
      title: story.getMetadata()?.title || 'Story',
      author: story.getMetadata()?.author || 'Unknown',
      firstBeatId: story.getAllBeats()[0]?.id || '0',
    });
    
    // Copy settings
    updatedStory.setSettings(story.getSettings());
    
    // Update environment with file paths
    const environment = story.getEnvironment();
    const updatedEnvironment = { ...environment };
    
    // Transform assets to use file paths
    if (assets && assets.length > 0) {
      updatedEnvironment.assets = assets.map(asset => {
        const filePath = assetPathMap.get(asset.url);
        return {
          id: asset.id,
          name: asset.name,
          type: asset.type,
          subType: asset.subType,
          file: filePath || asset.name, // Use file path or fallback to name
          // Don't include URL or base64 data
        };
      });
    }
    
    // Update props and nodes if they exist
    if (updatedEnvironment.props) {
      updatedEnvironment.props = updatedEnvironment.props.map((prop: any) => {
        if (prop.file && assetPathMap.has(prop.file)) {
          return { ...prop, file: assetPathMap.get(prop.file) };
        }
        return prop;
      });
    }
    
    if (updatedEnvironment.nodes) {
      updatedEnvironment.nodes = updatedEnvironment.nodes.map((node: any) => {
        if (node.file && assetPathMap.has(node.file)) {
          return { ...node, file: assetPathMap.get(node.file) };
        }
        return node;
      });
    }
    
    updatedStory.setEnvironment(updatedEnvironment);
    
    // Update character visuals to use file paths
    const updatedCharacters = characters.map(char => {
      const updatedChar = { ...char };
      
      if (updatedChar.visual) {
        // Update default image
        if (updatedChar.visual.defaultImage) {
          const asset = assets.find(a => a.url === updatedChar.visual.defaultImage);
          if (asset) {
            const filePath = assetPathMap.get(asset.url);
            if (filePath) {
              // Extract just the filename from the path
              const fileName = filePath.split('/').pop() || updatedChar.visual.defaultImage;
              updatedChar.visual = {
                ...updatedChar.visual,
                defaultImage: fileName,
              };
            }
          }
        }
        
        // Update sprite sheet
        if (updatedChar.visual.spriteSheet?.url) {
          const asset = assets.find(a => a.url === updatedChar.visual.spriteSheet.url);
          if (asset) {
            const filePath = assetPathMap.get(asset.url);
            if (filePath) {
              const fileName = filePath.split('/').pop() || updatedChar.visual.spriteSheet.url;
              updatedChar.visual.spriteSheet = {
                ...updatedChar.visual.spriteSheet,
                url: fileName,
              };
            }
          }
        }
      }
      
      // Update state visuals
      if (updatedChar.states) {
        updatedChar.states = updatedChar.states.map((state: any) => {
          if (state.visual?.image) {
            const asset = assets.find(a => a.url === state.visual.image);
            if (asset) {
              const filePath = assetPathMap.get(asset.url);
              if (filePath) {
                const fileName = filePath.split('/').pop() || state.visual.image;
                return {
                  ...state,
                  visual: { ...state.visual, image: fileName },
                };
              }
            }
          }
          return state;
        });
      }
      
      return updatedChar;
    });
    
    updatedStory.setCharacters(updatedCharacters);
    
    // Copy clusters
    updatedStory.setClusters(story.getClusters());
    
    // Update beat locations to reference assets by file path
    const beats = story.getAllBeats();
    for (const beat of beats) {
      const updatedBeat = beat;
      
      // Update locations if they reference assets
      if (updatedBeat.locations && updatedBeat.locations.size > 0) {
        const updatedLocations = new Map();
        
        for (const [key, location] of updatedBeat.locations.entries()) {
          let updatedLocation = { ...location };
          
          // If location references an asset by URL, update to file path
          if (location.name) {
            const asset = assets.find(a => a.url === location.name || a.id === location.name);
            if (asset) {
              const filePath = assetPathMap.get(asset.url);
              if (filePath) {
                updatedLocation.name = filePath.split('/').pop() || location.name;
              }
            }
          }
          
          updatedLocations.set(key, updatedLocation);
        }
        
        updatedBeat.locations = updatedLocations;
      }
      
      // Update beat sound references
      if (updatedBeat.sound?.file) {
        const asset = assets.find(a => a.url === updatedBeat.sound!.file || a.name === updatedBeat.sound!.file);
        if (asset) {
          const filePath = assetPathMap.get(asset.url);
          if (filePath) {
            updatedBeat.sound = {
              ...updatedBeat.sound,
              file: filePath.split('/').pop() || updatedBeat.sound.file,
            };
          }
        }
      }
      
      updatedStory.addBeat(updatedBeat);
    }
    
    return updatedStory;
  }
  
  /**
   * Get appropriate file extension for asset type
   */
  private static getFileExtension(assetType: string, mimeType: string): string {
    // Try to get extension from MIME type
    const mimeExtensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/m4a': 'm4a',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'font/ttf': 'ttf',
      'font/otf': 'otf',
      'font/woff': 'woff',
      'font/woff2': 'woff2',
    };
    
    if (mimeExtensions[mimeType]) {
      return mimeExtensions[mimeType];
    }
    
    // Fallback based on asset type
    switch (assetType) {
      case 'image': return 'png';
      case 'audio': return 'mp3';
      case 'video': return 'mp4';
      case 'font': return 'ttf';
      default: return 'bin';
    }
  }
  
  /**
   * Export story as a single XML file (legacy mode)
   */
  static exportAsXML(story: Story, assets: Asset[], characters: any[]): string {
    // For backward compatibility, this method still exports as a single XML
    // with embedded asset URLs (not recommended for production)
    const storyWithAssets = new Story({
      title: story.getMetadata()?.title || 'Story',
      author: story.getMetadata()?.author || 'Unknown',
      firstBeatId: story.getAllBeats()[0]?.id || '0',
    });
    
    storyWithAssets.setSettings(story.getSettings());
    
    const environment = story.getEnvironment();
    if (assets && assets.length > 0) {
      environment.assets = assets;
    }
    storyWithAssets.setEnvironment(environment);
    storyWithAssets.setCharacters(characters || story.getCharacters());
    storyWithAssets.setClusters(story.getClusters());
    
    // Add all beats
    story.getAllBeats().forEach(beat => {
      storyWithAssets.addBeat(beat);
    });
    
    const generator = new ASMLGenerator();
    return generator.generate(storyWithAssets);
  }
}
