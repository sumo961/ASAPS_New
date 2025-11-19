/**
 * HTTP API Client for ASAPS Builder API
 *
 * Provides functions to interact with the ASAPS HTTP API server.
 * Default API URL: http://localhost:3001
 */
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
    position?: {
        x: number;
        y: number;
    };
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
 * Get all projects
 */
export declare function listProjects(): Promise<APIResponse<Project[]>>;
/**
 * Get a specific project by ID
 */
export declare function getProject(projectId: string): Promise<APIResponse<Project>>;
/**
 * Create a new project
 */
export declare function createProject(project: Project): Promise<APIResponse<Project>>;
/**
 * Update an existing project
 */
export declare function updateProject(projectId: string, project: Partial<Project>): Promise<APIResponse<Project>>;
/**
 * Delete a project
 */
export declare function deleteProject(projectId: string): Promise<APIResponse<void>>;
/**
 * Add a beat to a project
 */
export declare function addBeat(projectId: string, beat: Beat): Promise<APIResponse<{
    project: Project;
    beat: Beat;
}>>;
/**
 * Add a connection to a project
 */
export declare function addConnection(projectId: string, connection: Connection): Promise<APIResponse<Project>>;
/**
 * Health check
 */
export declare function healthCheck(): Promise<APIResponse<{
    status: string;
    timestamp: string;
}>>;
/**
 * Check if the API server is available
 */
export declare function isAPIAvailable(): Promise<boolean>;
export {};
//# sourceMappingURL=apiClient.d.ts.map