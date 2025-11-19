/**
 * Apply Story Changes Tool
 *
 * MCP tool for applying AI-generated changes to the story
 */
import { getProject, updateProject, addBeat, createProject } from '../utils/apiClient.js';
export const applyStoryChangesTool = {
    name: 'apply_story_changes',
    description: 'Apply AI-generated beats and changes to the active project. Requires a projectId to apply changes to.',
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID to apply changes to. Required.',
            },
            changes: {
                type: 'object',
                description: 'Story changes to apply',
                properties: {
                    beats: {
                        type: 'array',
                        description: 'Beats to add',
                    },
                    connections: {
                        type: 'array',
                        description: 'Connections to create',
                    },
                    metadata: {
                        type: 'object',
                        description: 'Project metadata to update',
                    },
                },
            },
            createIfNotExists: {
                type: 'boolean',
                description: 'If true, creates a new project if projectId does not exist',
            },
        },
        required: ['projectId', 'changes'],
    },
};
export async function handleApplyStoryChanges(args) {
    const { projectId, changes, createIfNotExists = false } = args;
    if (!projectId) {
        return {
            success: false,
            error: 'projectId is required',
            message: 'You must specify a projectId to apply changes to',
        };
    }
    if (!changes || typeof changes !== 'object') {
        return {
            success: false,
            error: 'Changes object is required',
            message: 'The changes parameter must be an object',
        };
    }
    console.error(`[applyStoryChanges] Applying changes to project: ${projectId}`, changes);
    try {
        // Get the current project
        let projectResponse = await getProject(projectId);
        let project = null;
        // Extract project from API response
        if (projectResponse.success && projectResponse.data) {
            project = projectResponse.data.project;
        }
        // If project doesn't exist and createIfNotExists is true, create it
        if (!project && createIfNotExists) {
            console.error(`[applyStoryChanges] Project not found, creating new project: ${projectId}`);
            const newProject = {
                id: projectId,
                name: changes.metadata?.title || projectId,
                description: changes.metadata?.description || 'AI-generated story',
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
                metadata: changes.metadata || {},
                rootBeatId: 'start',
                beats: [],
                connections: [],
            };
            const createResponse = await createProject(newProject);
            if (!createResponse.success || !createResponse.data) {
                return {
                    success: false,
                    error: createResponse.error || 'Failed to create project',
                    message: `Could not create project: ${createResponse.error}`,
                };
            }
            project = createResponse.data.project;
        }
        if (!project) {
            return {
                success: false,
                error: 'Project not found',
                message: `Failed to get project: ${projectId}`,
            };
        }
        let beatsAdded = 0;
        let connectionsCreated = 0;
        // Add beats to the project
        if (changes.beats && Array.isArray(changes.beats)) {
            for (const beat of changes.beats) {
                const beatResponse = await addBeat(projectId, beat);
                if (beatResponse.success) {
                    beatsAdded++;
                }
                else {
                    console.error(`[applyStoryChanges] Failed to add beat:`, beatResponse.error);
                }
            }
        }
        // Add connections to the project
        if (changes.connections && Array.isArray(changes.connections)) {
            const existingConnections = Array.isArray(project.connections) ? project.connections : [];
            const updatedConnections = [...existingConnections, ...changes.connections];
            const updateResponse = await updateProject(projectId, {
                connections: updatedConnections,
            });
            if (updateResponse.success) {
                connectionsCreated = changes.connections.length;
            }
            else {
                console.error(`[applyStoryChanges] Failed to add connections:`, updateResponse.error);
            }
        }
        // Update metadata if provided
        if (changes.metadata) {
            const updateResponse = await updateProject(projectId, {
                metadata: { ...project.metadata, ...changes.metadata },
                name: changes.metadata.title || project.name,
                description: changes.metadata.description || project.description,
            });
            if (!updateResponse.success) {
                console.error(`[applyStoryChanges] Failed to update metadata:`, updateResponse.error);
            }
        }
        return {
            success: true,
            data: {
                projectId,
                beatsAdded,
                connectionsCreated,
                metadataUpdated: !!changes.metadata,
            },
            message: `Applied ${beatsAdded} beats and ${connectionsCreated} connections to project: ${project.name}`,
        };
    }
    catch (error) {
        console.error('[applyStoryChanges] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to apply story changes',
        };
    }
}
//# sourceMappingURL=applyStoryChanges.js.map