/**
 * HTTP API Client for ASAPS Builder API
 *
 * Provides functions to interact with the ASAPS HTTP API server.
 * Default API URL: http://localhost:3001
 */
const API_BASE_URL = process.env.ASAPS_API_URL || 'http://localhost:3001';
/**
 * Fetch wrapper with error handling
 */
async function apiRequest(endpoint, options = {}) {
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
        const data = await response.json();
        return {
            success: true,
            data,
        };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Get all projects
 */
export async function listProjects() {
    return apiRequest('/api/projects', {
        method: 'GET',
    });
}
/**
 * Get a specific project by ID
 */
export async function getProject(projectId) {
    return apiRequest(`/api/projects/${projectId}`, {
        method: 'GET',
    });
}
/**
 * Create a new project
 */
export async function createProject(project) {
    return apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify(project),
    });
}
/**
 * Update an existing project
 */
export async function updateProject(projectId, project) {
    return apiRequest(`/api/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(project),
    });
}
/**
 * Delete a project
 */
export async function deleteProject(projectId) {
    return apiRequest(`/api/projects/${projectId}`, {
        method: 'DELETE',
    });
}
/**
 * Add a beat to a project
 */
export async function addBeat(projectId, beat) {
    return apiRequest(`/api/beats/${projectId}`, {
        method: 'POST',
        body: JSON.stringify(beat),
    });
}
/**
 * Add a connection to a project
 */
export async function addConnection(projectId, connection) {
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
export async function healthCheck() {
    return apiRequest('/health', {
        method: 'GET',
    });
}
/**
 * Check if the API server is available
 */
export async function isAPIAvailable() {
    const response = await healthCheck();
    return response.success && response.data?.status === 'ok';
}
//# sourceMappingURL=apiClient.js.map