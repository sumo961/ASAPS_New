/**
 * HTTP API Client for ASAPS Builder API
 *
 * Provides functions to interact with the ASAPS HTTP API server.
 * Default API URL: http://localhost:3001
 */

const API_BASE_URL = process.env.ASAPS_API_URL || 'http://localhost:3001';

/**
 * Project interface matching the API schema
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: Date | string;
  modifiedAt: Date | string;
  metadata: Record<string, any>;
  rootBeatId: string;
  beats: Beat[];
  connections: Connection[];
}

/**
 * Beat interface
 */
export interface Beat {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  parameters?: Record<string, any>;
}

/**
 * Connection interface
 */
export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  condition?: string;
}

/**
 * API response wrapper
 */
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Fetch wrapper with error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<APIResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json() as T;
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get all projects
 */
export async function listProjects(): Promise<APIResponse<Project[]>> {
  return apiRequest<Project[]>('/api/projects', {
    method: 'GET',
  });
}

/**
 * Get a specific project by ID
 */
export async function getProject(projectId: string): Promise<APIResponse<Project>> {
  return apiRequest<Project>(`/api/projects/${projectId}`, {
    method: 'GET',
  });
}

/**
 * Create a new project
 */
export async function createProject(project: Project): Promise<APIResponse<Project>> {
  return apiRequest<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(project),
  });
}

/**
 * Update an existing project
 */
export async function updateProject(
  projectId: string,
  project: Partial<Project>
): Promise<APIResponse<Project>> {
  return apiRequest<Project>(`/api/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(project),
  });
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<APIResponse<void>> {
  return apiRequest<void>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });
}

/**
 * Add a beat to a project
 */
export async function addBeat(
  projectId: string,
  beat: Beat
): Promise<APIResponse<{ project: Project; beat: Beat }>> {
  return apiRequest<{ project: Project; beat: Beat }>(`/api/beats/${projectId}`, {
    method: 'POST',
    body: JSON.stringify(beat),
  });
}

/**
 * Add a connection to a project
 */
export async function addConnection(
  projectId: string,
  connection: Connection
): Promise<APIResponse<Project>> {
  // Get the current project
  const projectResponse = await getProject(projectId);
  if (!projectResponse.success || !projectResponse.data) {
    return {
      success: false,
      error: projectResponse.error || 'Failed to get project',
    };
  }

  // Add the connection and update
  const project = projectResponse.data;
  const connections = [...project.connections, connection];

  return updateProject(projectId, { connections });
}

/**
 * Health check
 */
export async function healthCheck(): Promise<APIResponse<{ status: string; timestamp: string }>> {
  return apiRequest<{ status: string; timestamp: string }>('/health', {
    method: 'GET',
  });
}

/**
 * Check if the API server is available
 */
export async function isAPIAvailable(): Promise<boolean> {
  const response = await healthCheck();
  return response.success && response.data?.status === 'ok';
}
