// Simple test to verify linkAssetsToBeats logic
import { linkAssetsToBeats, type AsmlAssetImportResult } from '../packages/builder/src/utils/asmlAssetImporter';

// Mock beat with locations
const mockBeat: any = {
  id: 'beat_1',
  type: 'dialogTree',
  node: 'forest',  // Background name from ASML
  locations: new Map([
    ['Red', {
      kind: 'character',
      name: 'Red',
      characterName: 'Red',
      stateId: 'default',
      x: 200,
      y: 400
    }]
  ]),
  sound: { file: 'gunshot.mp3' },
  updateParameters: function(params: any) {
    if (params.node !== undefined) this.node = params.node;
  },
  getParameters: function() {
    return { node: this.node };
  }
};

// Mock import result
const mockImportResult: AsmlAssetImportResult = {
  assetMap: new Map([
    ['forest', 'asset-uuid-forest'],
    ['gunshot.mp3', 'asset-uuid-gunshot']
  ]),
  urlMap: new Map([
    ['gunshot.mp3', 'blob:http://localhost/sound-url']
  ]),
  characterMap: new Map([
    ['Red', {
      id: 'char_Red',
      name: 'red',
      displayName: 'Red',
      role: 'player' as const,
      defaultState: 'default',
      states: [{
        id: 'default',
        name: 'default',
        displayName: 'Default',
        visual: { image: 'blob:http://localhost/red-image-url' }
      }],
      counters: [],
      inventory: []
    }]
  ]),
  filePathMap: new Map(),
  errors: [],
  stats: {
    backgroundsImported: 1,
    propsImported: 0,
    soundsImported: 1,
    charactersImported: 1,
    characterStatesImported: 1,
    totalFilesImported: 3,
    errors: 0
  }
};

// Run the test
console.log('=== BEFORE linkAssetsToBeats ===');
console.log('beat.node:', mockBeat.node);
console.log('location Red imageUrl:', mockBeat.locations.get('Red')?.imageUrl);
console.log('beat.sound.file:', mockBeat.sound.file);

linkAssetsToBeats([mockBeat], mockImportResult);

console.log('\n=== AFTER linkAssetsToBeats ===');
console.log('beat.node:', mockBeat.node);
console.log('location Red:', JSON.stringify(mockBeat.locations.get('Red'), null, 2));
console.log('beat.sound:', JSON.stringify(mockBeat.sound, null, 2));
