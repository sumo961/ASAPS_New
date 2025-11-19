/**
 * End-to-End Integration Test
 *
 * Tests the complete workflow:
 * 1. API client can connect to HTTP API server
 * 2. Can create a project
 * 3. Can retrieve project (getStoryContext)
 * 4. Can apply changes (applyStoryChanges)
 */

import {
  healthCheck,
  createProject,
  getProject,
  addBeat,
  updateProject,
  listProjects,
} from './src/utils/apiClient.js';
import { handleGetStoryContext } from './src/tools/getStoryContext.js';
import { handleApplyStoryChanges } from './src/tools/applyStoryChanges.js';

async function runTests() {
  console.log('='.repeat(60));
  console.log('MCP Server Integration Test');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Health Check
  console.log('Test 1: Health Check');
  const health = await healthCheck();
  if (health.success) {
    console.log('✅ API server is healthy:', health.data);
  } else {
    console.log('❌ API server health check failed:', health.error);
    return;
  }
  console.log();

  // Test 2: Create a test project
  console.log('Test 2: Create Test Project');
  const testProject = {
    id: 'test-project-' + Date.now(),
    name: 'Integration Test Project',
    description: 'Testing MCP server integration',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    metadata: { author: 'Test Script' },
    rootBeatId: 'start',
    beats: [],
    connections: [],
  };

  const createResponse = await createProject(testProject);
  if (createResponse.success) {
    console.log('✅ Project created successfully');
  } else {
    console.log('❌ Failed to create project:', createResponse.error);
    return;
  }
  console.log();

  // Test 3: Get Story Context (list all projects)
  console.log('Test 3: Get Story Context (list all)');
  const listResult = await handleGetStoryContext({});
  if (listResult.success) {
    console.log('✅ Retrieved projects:', listResult.data.totalProjects);
    console.log('   Projects:', listResult.data.projects.map((p: any) => p.name).join(', '));
  } else {
    console.log('❌ Failed to get story context:', listResult.error);
  }
  console.log();

  // Test 4: Get Story Context (specific project)
  console.log('Test 4: Get Story Context (specific project)');
  const contextResult = await handleGetStoryContext({ projectId: testProject.id });
  if (contextResult.success) {
    console.log('✅ Retrieved project context');
    console.log('   Title:', contextResult.data.metadata.title);
    console.log('   Beat count:', contextResult.data.beatCount);
  } else {
    console.log('❌ Failed to get project context:', contextResult.error);
  }
  console.log();

  // Test 5: Apply Story Changes (add beats)
  console.log('Test 5: Apply Story Changes (add beats)');
  const changes = {
    beats: [
      {
        id: 'beat-1',
        type: 'TitleScreen',
        label: 'Opening Scene',
        parameters: {
          title: 'The Adventure Begins',
          subtitle: 'An interactive story',
        },
      },
      {
        id: 'beat-2',
        type: 'DialogTree',
        label: 'First Choice',
        parameters: {
          dialogue: 'You wake up in a mysterious room. What do you do?',
        },
      },
    ],
    connections: [
      {
        id: 'conn-1',
        sourceId: 'beat-1',
        targetId: 'beat-2',
        label: 'Continue',
      },
    ],
    metadata: {
      lastModified: new Date().toISOString(),
    },
  };

  const applyResult = await handleApplyStoryChanges({
    projectId: testProject.id,
    changes,
  });

  if (applyResult.success) {
    console.log('✅ Changes applied successfully');
    console.log('   Beats added:', applyResult.data.beatsAdded);
    console.log('   Connections created:', applyResult.data.connectionsCreated);
  } else {
    console.log('❌ Failed to apply changes:', applyResult.error);
  }
  console.log();

  // Test 6: Verify changes were applied
  console.log('Test 6: Verify Changes');
  const verifyResult = await handleGetStoryContext({ projectId: testProject.id });
  if (verifyResult.success) {
    console.log('✅ Verified changes');
    console.log('   Beat count:', verifyResult.data.beatCount);
    console.log('   Beats:', verifyResult.data.beats.map((b: any) => b.label || b.id).join(', '));
    console.log('   Connections:', verifyResult.data.connections.length);
  } else {
    console.log('❌ Failed to verify changes:', verifyResult.error);
  }
  console.log();

  // Test 7: Test createIfNotExists feature
  console.log('Test 7: Create Project via applyStoryChanges');
  const newProjectId = 'auto-created-' + Date.now();
  const autoCreateResult = await handleApplyStoryChanges({
    projectId: newProjectId,
    createIfNotExists: true,
    changes: {
      beats: [
        {
          id: 'start',
          type: 'TitleScreen',
          label: 'Start',
          parameters: { title: 'Auto-Created Story' },
        },
      ],
      metadata: {
        title: 'Auto-Created Project',
        description: 'Created automatically by applyStoryChanges',
      },
    },
  });

  if (autoCreateResult.success) {
    console.log('✅ Project auto-created and changes applied');
    console.log('   Project ID:', newProjectId);
    console.log('   Beats added:', autoCreateResult.data.beatsAdded);
  } else {
    console.log('❌ Failed to auto-create project:', autoCreateResult.error);
  }
  console.log();

  console.log('='.repeat(60));
  console.log('All tests completed!');
  console.log('='.repeat(60));
}

runTests().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
