/**
 * Apply Story Changes Tool
 *
 * MCP tool for applying AI-generated changes to the story
 */
import { getProject, updateProject, addBeat, createProject } from '../utils/apiClient.js';
/**
 * Extract target ID from various formats
 * Handles: string, { next: "id" }, { target: "id" }
 */
function extractTargetId(target) {
    if (!target)
        return null;
    if (typeof target === 'string')
        return target;
    if (typeof target === 'object') {
        if (target.next)
            return target.next;
        if (typeof target.target === 'string')
            return target.target;
    }
    return null;
}
/**
 * Extract connections from multi-connection beat parameters
 * This normalizes AI-generated beats by deriving connections from parameters
 */
function extractConnectionsFromBeat(beat) {
    const connections = [];
    const params = beat.parameters || {};
    const beatId = beat.id;
    // movementChoice - choices[].target
    if (beat.type === 'movementChoice' && params.choices) {
        params.choices.forEach((choice, index) => {
            const target = extractTargetId(choice.target) || extractTargetId(choice);
            if (target) {
                connections.push({
                    id: `${beatId}-movement-${index}`,
                    sourceId: beatId,
                    targetId: target,
                    label: choice.text || choice.location || `Choice ${index + 1}`,
                });
            }
        });
    }
    // dialogTree - recursively extract targets from choices and nested dialogNodes
    if (beat.type === 'dialogTree' && params.dialogTree) {
        let connIndex = 0;
        const processChoices = (choices) => {
            if (!Array.isArray(choices))
                return;
            choices.forEach((choice) => {
                const target = extractTargetId(choice.target);
                if (target && target !== '__self__') {
                    connections.push({
                        id: `${beatId}-dialog-${connIndex++}`,
                        sourceId: beatId,
                        targetId: target,
                        label: choice.text || `Choice ${connIndex}`,
                    });
                }
                // Recurse into nested dialogNode (NPC response with further choices)
                if (choice.dialogNode?.choices) {
                    processChoices(choice.dialogNode.choices);
                }
            });
        };
        // Current format: direct choices on dialogTree root
        if (params.dialogTree.choices) {
            processChoices(params.dialogTree.choices);
        }
        // Legacy format: entries array with nested choices
        if (params.dialogTree.entries) {
            params.dialogTree.entries.forEach((entry) => {
                if (entry.choices) {
                    processChoices(entry.choices);
                }
            });
        }
    }
    // pickProp - props[].target
    if (beat.type === 'pickProp' && params.props) {
        params.props.forEach((prop, index) => {
            const target = extractTargetId(prop.target);
            if (target) {
                connections.push({
                    id: `${beatId}-prop-${index}`,
                    sourceId: beatId,
                    targetId: target,
                    label: prop.name || `Prop ${index + 1}`,
                });
            }
        });
    }
    // hyperText - hyperlinks[].targetBeatId
    if (beat.type === 'hyperText' && params.hyperlinks) {
        params.hyperlinks.forEach((link, index) => {
            if (link.targetBeatId) {
                connections.push({
                    id: `${beatId}-hyperlink-${index}`,
                    sourceId: beatId,
                    targetId: link.targetBeatId,
                    label: link.word || `Link ${index + 1}`,
                });
            }
        });
    }
    // conditionBeat - trueConnection.target, falseConnection.target (nested format)
    // Also supports legacy flat format: trueTarget, falseTarget
    // IMPORTANT: Labels must be lowercase 'true'/'false' to match Inspector.tsx expectations
    if (beat.type === 'conditionBeat') {
        const trueTarget = params.trueConnection?.target || params.trueTarget;
        const falseTarget = params.falseConnection?.target || params.falseTarget;
        if (trueTarget) {
            connections.push({
                id: `${beatId}-true`,
                sourceId: beatId,
                targetId: trueTarget,
                label: 'true',
            });
        }
        if (falseTarget) {
            connections.push({
                id: `${beatId}-false`,
                sourceId: beatId,
                targetId: falseTarget,
                label: 'false',
            });
        }
    }
    // randomTarget - choices[].target
    if (beat.type === 'randomTarget' && params.choices) {
        params.choices.forEach((choice, index) => {
            const target = typeof choice === 'string' ? choice : extractTargetId(choice.target) || extractTargetId(choice);
            if (target) {
                connections.push({
                    id: `${beatId}-random-${index}`,
                    sourceId: beatId,
                    targetId: target,
                    label: `Random ${index + 1}`,
                });
            }
        });
    }
    // setTimer - timerTarget
    if (beat.type === 'setTimer' && params.timerTarget) {
        connections.push({
            id: `${beatId}-timer`,
            sourceId: beatId,
            targetId: params.timerTarget,
            label: 'Timer Target',
        });
    }
    return connections;
}
export const applyStoryChangesTool = {
    name: 'apply_story_changes',
    description: `Apply AI-generated beats and changes to the active project.

BEAT STRUCTURE:
Each beat must have: { id, type, label, parameters, position: {x, y} }

BEAT TYPES AND CONNECTION RULES:

SINGLE CONNECTION beats (only ONE target in connections array):
- titleScreen: Start screen. Parameters: { title, author, buttonText }
- infoText: Narrative text with Continue. Parameters: { text }
- endScreen: Story ending. Parameters: { message, showRestart (ALWAYS true), showCredits }
- durScreen: Timed auto-advance. Parameters: { text, duration }
- videoBeat: Video playback. Parameters: { videoFile (NOT "videoUrl" or "videoAssetId"), autoplay, controls, skipButton }
- inputText: Text input. Parameters: { prompt, variable (NOT "variableName"), saveToType: "variable" (REQUIRED), submitButtonText }
- setVariable: Set ONE variable per beat. IMPORTANT: Two "name" fields - beat.name is display label, beat.parameters.name is the VARIABLE name! Parameters: { type: "variable"|"counter"|"fictionalTime", name (variable name), value, operation: "set"|"add"|"subtract"|"multiply"|"divide" }. Chain multiple setVariable beats for multiple changes.
- addRemoveInventory: Modify inventory. Parameters: { action: "add"|"remove"|"transfer" (REQUIRED), item (REQUIRED, NOT "itemName"), character (REQUIRED, default "player"), quantity (optional), fromChar/toChar (for transfer) }
- setTimer: Timer control. Parameters: { name (NOT "timerName"), value in seconds (NOT "duration"), timerTarget }

MULTIPLE CONNECTION beats (targets in PARAMETERS, NOT connections array):
- dialogTree: Branching dialogue. Parameters: { dialogTree: { id: "root", speaker, text, choices: [{ id, text, target | dialogNode: { id, speaker, text, choices } }] } }. Choice text IS the player's line. Use __self__ target for loops (interrogation, shopping).
- movementChoice: Location/action choices. Parameters: { choices: [{ id, text, location, target }] }
- pickProp: Prop selection. Parameters: { question, props: [{ id, name, description, target }] }. pickProp AUTOMATICALLY adds selected item to inventory - do NOT follow with addRemoveInventory add!
- hyperText: Clickable text. Parameters: { text, hyperlinks: [{ word, targetBeatId }] }
- conditionBeat: Conditional branch. ONLY 3 parameters allowed: { condition: { type, variable/item, operator, value, compareTime? }, trueConnection: { target }, falseConnection: { target } }. Condition types: variable, inventory, counter, counterCompare, timer, visitedBeat, fictionalTime. Use "target" NOT "targetId" in connections!
- randomTarget: Random branch. Parameters: { choices: [{ id, target, weight }] }

DEFAULT TARGET (Timed Auto-Advance):
Most visible beats (EXCEPT durScreen) support optional defaultTarget and defaultTargetDelay (seconds) parameters for auto-advance if user doesn't interact within timeout.

FICTIONAL TIME:
setVariable with type "fictionalTime" can set/advance/subtract in-story date/time. conditionBeat with type "fictionalTime" can branch based on date/time comparison.

CONNECTION FORMAT:
{ id, sourceId, targetId, label? }
ONLY use for single-connection beats. For branching beats, put targets in their parameters.`,
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
                        description: 'Beats to add. Each beat: { id, type, label, parameters, position: {x, y} }',
                    },
                    connections: {
                        type: 'array',
                        description: 'Connections for SINGLE CONNECTION beats only: { id, sourceId, targetId, label? }',
                    },
                    metadata: {
                        type: 'object',
                        description: 'Project metadata: { title, author, description }',
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
        let connectionsDerived = 0;
        // Collect all derived connections from beats
        const derivedConnections = [];
        // Add beats to the project
        if (changes.beats && Array.isArray(changes.beats)) {
            for (const beat of changes.beats) {
                const beatResponse = await addBeat(projectId, beat);
                if (beatResponse.success) {
                    beatsAdded++;
                    // Extract and collect connections from multi-connection beat parameters
                    const beatConnections = extractConnectionsFromBeat(beat);
                    if (beatConnections.length > 0) {
                        console.error(`[applyStoryChanges] Derived ${beatConnections.length} connections from beat ${beat.id} (${beat.type})`);
                        derivedConnections.push(...beatConnections);
                    }
                }
                else {
                    console.error(`[applyStoryChanges] Failed to add beat:`, beatResponse.error);
                }
            }
        }
        // Merge explicit connections with derived connections
        const explicitConnections = Array.isArray(changes.connections) ? changes.connections : [];
        const allNewConnections = [...explicitConnections, ...derivedConnections];
        // Add connections to the project (both explicit and derived)
        if (allNewConnections.length > 0) {
            const existingConnections = Array.isArray(project.connections) ? project.connections : [];
            // Deduplicate: avoid adding connections that already exist (by sourceId + targetId)
            const existingConnectionKeys = new Set(existingConnections.map((c) => `${c.sourceId}->${c.targetId}`));
            const uniqueNewConnections = allNewConnections.filter((c) => !existingConnectionKeys.has(`${c.sourceId}->${c.targetId}`));
            if (uniqueNewConnections.length > 0) {
                const updatedConnections = [...existingConnections, ...uniqueNewConnections];
                const updateResponse = await updateProject(projectId, {
                    connections: updatedConnections,
                });
                if (updateResponse.success) {
                    connectionsCreated = explicitConnections.length;
                    connectionsDerived = derivedConnections.filter((c) => !existingConnectionKeys.has(`${c.sourceId}->${c.targetId}`)).length;
                    console.error(`[applyStoryChanges] Added ${uniqueNewConnections.length} connections (${connectionsCreated} explicit, ${connectionsDerived} derived)`);
                }
                else {
                    console.error(`[applyStoryChanges] Failed to add connections:`, updateResponse.error);
                }
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
                connectionsDerived,
                metadataUpdated: !!changes.metadata,
            },
            message: `Applied ${beatsAdded} beats, ${connectionsCreated} explicit connections, and ${connectionsDerived} derived connections to project: ${project.name}`,
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