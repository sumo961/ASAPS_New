import { useState, useCallback, useRef } from 'react';
import { useProject } from '../contexts/PersistenceContext';
import { Beat } from '@asaps/core';

/**
 * Hook that manages project naming prompt logic
 * Intercepts first user actions and prompts for project name before completing the action
 */
export function useProjectNaming() {
  const { project, create } = useProject();
  const [showPrompt, setShowPrompt] = useState(false);
  const pendingActionRef = useRef< (() => Promise<Beat | null>) | null>(null);
  const pendingResolverRef = useRef< ((value: Beat | null) => void) | null>(null);
  const isWaitingForProjectCreation = useRef(false);

  // Check if we need to prompt for project name
  const shouldPromptForName = useCallback(() => {
    const shouldPrompt = !project || !project.name;
    console.log('[useProjectNaming.shouldPromptForName] Checking if project needs name:', {
      project: project,
      projectName: project?.name,
      shouldPrompt
    });
    return shouldPrompt;
  }, [project]);

  // Handle the project naming prompt
  const promptForProjectName = useCallback(async (action: () => Promise<Beat | null>) => {
    const shouldPrompt = shouldPromptForName();
    console.log('[useProjectNaming.promptForProjectName] PROMPT FUNCTION CALLED', {
      shouldPrompt,
      isWaitingForProjectCreation: isWaitingForProjectCreation.current,
      action
    });

    if (!shouldPrompt || isWaitingForProjectCreation.current) {
      // If project has name, execute immediately
      console.log('[useProjectNaming.promptForProjectName] Not prompting, executing action immediately');
      return action();
    }

    // Store the action to execute later
    console.log('[useProjectNaming.promptForProjectName] PROMPTING FOR NAME - SETTING UP PROMISE');
    pendingActionRef.current = action;
    setShowPrompt(true);

    // Return a promise that will resolve when the action is eventually executed
    return new Promise<Beat | null>((resolve) => {
      console.log('[useProjectNaming.promptForProjectName] PROMISE CREATED - STORING RESOLVER');
      // Store the resolver in its own ref
      pendingResolverRef.current = resolve;
    });
  }, [shouldPromptForName]);

  // Handle creating a project and then executing the pending action
  const handleProjectCreated = useCallback(async (name: string, description?: string) => {
    try {
      isWaitingForProjectCreation.current = true;
      console.log('[useProjectNaming] Creating project:', name);
      await create(name, description || `New project created from '${name}'`);
      console.log('[useProjectNaming] Project created, executing pending action');

      // Execute the pending action if there is one
      if (pendingActionRef.current && pendingResolverRef.current) {
        const action = pendingActionRef.current;
        const result = await action();
        console.log('[useProjectNaming] Pending action completed, result:', result);

        // Resolve the promise that was returned to the caller
        pendingResolverRef.current(result);

        pendingActionRef.current = null;
        pendingResolverRef.current = null;
      }

      setShowPrompt(false);
    } catch (error) {
      console.error('Failed to create project:', error);
      // Reject the promise if there was an error
      if (pendingResolverRef.current) {
        pendingResolverRef.current(null);
      }
      throw error;
    } finally {
      isWaitingForProjectCreation.current = false;
      pendingActionRef.current = null;
      pendingResolverRef.current = null;
    }
  }, [create]);

  // Cancel the project creation
  const handleCancel = useCallback(() => {
    console.log('[useProjectNaming] Canceling project creation');
    setShowPrompt(false);

    // Reject the promise with null if there's a pending action
    if (pendingResolverRef.current) {
      pendingResolverRef.current(null);
    }

    pendingActionRef.current = null;
    pendingResolverRef.current = null;
    isWaitingForProjectCreation.current = false;
  }, []);

  return {
    shouldPromptForName,
    promptForProjectName,
    handleProjectCreated,
    handleCancel,
    showPrompt
  };
}