#!/usr/bin/env node
/**
 * ASAPS Builder API Server - CLI Entry Point
 *
 * Start the HTTP API server standalone for MCP integration.
 *
 * Usage:
 *   npm run api:start
 *   node dist/api/cli.js
 */

import { getAPIServer } from './server';

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = 'localhost';

async function main() {
  console.log('='.repeat(60));
  console.log('ASAPS Builder API Server');
  console.log('='.repeat(60));
  console.log('');

  // Parse command line arguments
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
  const host = process.env.HOST || DEFAULT_HOST;
  const storageType = (process.env.STORAGE_TYPE || 'filesystem') as 'memory' | 'filesystem';
  const storagePath = process.env.STORAGE_PATH;

  console.log('Configuration:');
  console.log(`  Port: ${port}`);
  console.log(`  Host: ${host}`);
  console.log(`  Storage: ${storageType}`);
  if (storagePath) {
    console.log(`  Storage Path: ${storagePath}`);
  }
  console.log('');

  // Create and start server
  const server = getAPIServer({
    port,
    host,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    enableWebSocket: process.env.ENABLE_WS !== 'false',
    storageType,
    storagePath,
  });

  try {
    await server.start();

    console.log('');
    console.log('API Endpoints:');
    console.log(`  GET    http://${host}:${port}/health`);
    console.log(`  GET    http://${host}:${port}/api`);
    console.log(`  GET    http://${host}:${port}/api/projects`);
    console.log(`  POST   http://${host}:${port}/api/projects`);
    console.log(`  GET    http://${host}:${port}/api/projects/:id`);
    console.log(`  PUT    http://${host}:${port}/api/projects/:id`);
    console.log(`  DELETE http://${host}:${port}/api/projects/:id`);
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nShutting down server...');
    await server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
