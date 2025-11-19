/**
 * AI Tools Test
 *
 * Tests the AI-powered MCP tools in simulation mode
 */

import { handleGenerateStory } from './src/tools/generateStory.js';
import { handleWriteDialog } from './src/tools/writeDialog.js';
import { handleSuggestBeats } from './src/tools/suggestBeats.js';
import { handleCreateBeat } from './src/tools/createBeat.js';

async function runTests() {
  console.log('='.repeat(60));
  console.log('MCP AI Tools Test (Simulation Mode)');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Generate Story
  console.log('Test 1: Generate Story');
  try {
    const storyResult = await handleGenerateStory({
      prompt: 'A mystery in a haunted mansion',
      genre: 'mystery',
      length: 'short',
      complexity: 'linear',
    });

    if (storyResult.success) {
      console.log('✅ Story generated successfully');
      console.log('   Title:', storyResult.data.metadata.title);
      console.log('   Beats:', storyResult.data.beats.length);
      console.log('   Connections:', storyResult.data.connections.length);
    } else {
      console.log('❌ Story generation failed:', storyResult.error);
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }
  console.log();

  // Test 2: Write Dialog
  console.log('Test 2: Write Dialog');
  try {
    const dialogResult = await handleWriteDialog({
      scene: 'Detective questioning the butler about the murder',
      character: 'Detective Stone',
      goal: 'Extract information while reading reactions',
      branchingFactor: 3,
    });

    if (dialogResult.success) {
      console.log('✅ Dialog generated successfully');
      console.log('   Beat type:', dialogResult.data.beat.type);
      console.log('   Choices:', dialogResult.data.beat.parameters.choices?.length || 0);
    } else {
      console.log('❌ Dialog generation failed:', dialogResult.error);
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }
  console.log();

  // Test 3: Suggest Beats
  console.log('Test 3: Suggest Beats');
  try {
    const suggestResult = await handleSuggestBeats({
      currentBeatId: 'beat_intro',
      count: 3,
    });

    if (suggestResult.success) {
      console.log('✅ Beat suggestions generated successfully');
      console.log('   Suggestions:', suggestResult.data.beats.length);
      suggestResult.data.beats.forEach((beat: any, i: number) => {
        console.log(`   ${i + 1}. ${beat.type}: ${beat.label}`);
      });
    } else {
      console.log('❌ Beat suggestions failed:', suggestResult.error);
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }
  console.log();

  // Test 4: Create Beat
  console.log('Test 4: Create Beat');
  try {
    const createResult = await handleCreateBeat({
      description: 'Add a choice where the player decides to help the merchant or walk away',
    });

    if (createResult.success) {
      console.log('✅ Beat created successfully');
      console.log('   Beat type:', createResult.data.beat.type);
      console.log('   Label:', createResult.data.beat.label);
      console.log('   Interpretation:', createResult.data.interpretation);
    } else {
      console.log('❌ Beat creation failed:', createResult.error);
    }
  } catch (error) {
    console.log('❌ Exception:', error);
  }
  console.log();

  console.log('='.repeat(60));
  console.log('All tests completed!');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
