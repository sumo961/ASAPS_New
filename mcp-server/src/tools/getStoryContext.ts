/**
 * Get Story Context Tool
 *
 * MCP tool for reading current story state
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { listProjects, getProject } from '../utils/apiClient.js';

export const getStoryContextTool: Tool = {
  name: 'get_story_context',
  description: 'Get the current story state including beats, variables, and metadata. Optionally specify a projectId to get a specific project, or leave empty to list all projects.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Optional project ID to retrieve. If not provided, lists all projects.',
      },
    },
  },
};

export async function handleGetStoryContext(args: any): Promise<any> {
  const { projectId } = args;

  console.error(`[getStoryContext] Retrieving story context${projectId ? ` for project: ${projectId}` : ''}`);

  try {
    // If projectId is provided, get that specific project
    if (projectId) {
      const response = await getProject(projectId);

      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Project not found',
          message: `Failed to retrieve project: ${response.error}`,
        };
      }

      // API returns { project: {...} }
      const project = (response.data as any).project;

      return {
        success: true,
        data: {
          projectId: project.id,
          metadata: {
            title: project.name,
            description: project.description,
            version: project.version,
            createdAt: project.createdAt,
            modifiedAt: project.modifiedAt,
            ...project.metadata,
          },
          rootBeatId: project.rootBeatId,
          beats: project.beats || [],
          connections: project.connections || [],
          beatCount: project.beats?.length || 0,
        },
        message: `Story context retrieved for project: ${project.name}`,
      };
    }

    // If no projectId, list all projects
    const response = await listProjects();

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || 'Failed to list projects',
        message: `Failed to retrieve projects: ${response.error}`,
      };
    }

    // API returns { projects: [...] }
    const projects = (response.data as any).projects || [];

    return {
      success: true,
      data: {
        projects: projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          version: p.version,
          beatCount: p.beats?.length || 0,
          createdAt: p.createdAt,
          modifiedAt: p.modifiedAt,
        })),
        totalProjects: projects.length,
      },
      message: `Retrieved ${projects.length} project(s)`,
    };
  } catch (error) {
    console.error('[getStoryContext] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to retrieve story context',
    };
  }
}
