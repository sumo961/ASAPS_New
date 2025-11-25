/**
 * Tests for SaveStatus component - Save Project Feature
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveStatus } from './SaveStatus';
import type { SaveStatus as SaveStatusType } from '../hooks/useAutoSave';

describe('SaveStatus - Save Project Button', () => {
  test('should not show Save Project button when project is titled', () => {
    const onSaveProject = jest.fn();
    const { rerender } = render(
      <SaveStatus
        status="pending"
        lastSaved={null}
        onSaveProject={onSaveProject}
        isUntitledProject={false}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.queryByText('Save Project')).not.toBeInTheDocument();

    // Verify button doesn"t appear even with unsaved changes
    rerender(
      <SaveStatus
        status="saved"
        lastSaved={new Date()}
        onSaveProject={onSaveProject}
        isUntitledProject={false}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.queryByText('Save Project')).not.toBeInTheDocument();
  });

  test('should not show Save Project button when no unsaved changes', () => {
    const onSaveProject = jest.fn();
    const { rerender } = render(
      <SaveStatus
        status="idle"
        lastSaved={null}
        onSaveProject={onSaveProject}
        isUntitledProject={true}
        hasUnsavedChanges={false}
      />
    );

    expect(screen.queryByText('Save Project')).not.toBeInTheDocument();

    // Verify button doesn"t appear even for untitled project without changes
    rerender(
      <SaveStatus
        status="idle"
        lastSaved={new Date()}
        onSaveProject={onSaveProject}
        isUntitledProject={true}
        hasUnsavedChanges={false}
      />
    );

    expect(screen.queryByText('Save Project')).not.toBeInTheDocument();
  });

  test('should show Save Project button when untitled project has unsaved changes', () => {
    const onSaveProject = jest.fn();
    render(
      <SaveStatus
        status="pending"
        lastSaved={null}
        onSaveProject={onSaveProject}
        isUntitledProject={true}
        hasUnsavedChanges={true}
      />
    );

    const saveProjectButton = screen.getByText('Save Project');
    expect(saveProjectButton).toBeInTheDocument();
    expect(saveProjectButton).toHaveClass('bg-green-600', 'text-white');
  });

  test('should show Save Project button after auto-save completes (status=saved)', () => {
    const onSaveProject = jest.fn();
    render(
      <SaveStatus
        status="saved"
        lastSaved={new Date()}
        onSaveProject={onSaveProject}
        isUntitledProject={true}
        hasUnsavedChanges={true}
      />
    );

    const saveProjectButton = screen.getByText('Save Project');
    expect(saveProjectButton).toBeInTheDocument();
  });

  test('should call onSaveProject when Save Project button is clicked', () => {
    const onSaveProject = jest.fn();
    render(
      <SaveStatus
        status="pending"
        lastSaved={null}
        onSaveProject={onSaveProject}
        isUntitledProject={true}
        hasUnsavedChanges={true}
      />
    );

    const saveProjectButton = screen.getByText('Save Project');
    fireEvent.click(saveProjectButton);

    expect(onSaveProject).toHaveBeenCalledTimes(1);
  });

  test('Save Project button should not appear when onSaveProject is not provided', () => {
    render(
      <SaveStatus
        status="pending"
        lastSaved={null}
        isUntitledProject={true}
        hasUnsavedChanges={true}
        // onSaveProject not provided
      />
    );

    expect(screen.queryByText('Save Project')).not.toBeInTheDocument();
  });
});

describe('SaveStatus - Save Button Behavior', () => {
  test('should disable save button only when status is "saving"', () => {
    const onSave = jest.fn();
    const { rerender } = render(
      <SaveStatus
        status="saving"
        lastSaved={null}
        onSave={onSave}
        isUntitledProject={false}
        hasUnsavedChanges={true}
      />
    );

    const saveButton = screen.getByText('Saving…');
    expect(saveButton).toBeDisabled();

    // Should be enabled for idle
    rerender(
      <SaveStatus
        status="idle"
        lastSaved={new Date()}
        onSave={onSave}
        isUntitledProject={false}
        hasUnsavedChanges={false}
      />
    );

    expect(screen.getByText('Save')).not.toBeDisabled();

    // Should be enabled for pending
    rerender(
      <SaveStatus
        status="pending"
        lastSaved={null}
        onSave={onSave}
        isUntitledProject={false}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.getByText('Save')).not.toBeDisabled();

    // Should be enabled for saved
    rerender(
      <SaveStatus
        status="saved"
        lastSaved={new Date()}
        onSave={onSave}
        isUntitledProject={false}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.getByText('Saved')).not.toBeDisabled();
  });

  test('should call onSave when save button is clicked', () => {
    const onSave = jest.fn();
    render(
      <SaveStatus
        status="pending"
        lastSaved={null}
        onSave={onSave}
        isUntitledProject={false}
        hasUnsavedChanges={true}
      />
    );

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('SaveStatus - Status Display', () => {
  test('should show pending status with yellow warning', () => {
    render(
      <SaveStatus
        status="pending"
        lastSaved={null}
        isUntitledProject={true}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    const statusContainer = screen.getByText('Unsaved changes').closest('div');
    expect(statusContainer).toHaveClass('bg-yellow-50');
  });

  test('should show saving status with blue indicator', () => {
    render(
      <SaveStatus
        status="saving"
        lastSaved={null}
        isUntitledProject={true}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.getByText('Saving...')).toBeInTheDocument();
    const statusContainer = screen.getByText('Saving...').closest('div');
    expect(statusContainer).toHaveClass('bg-blue-50');
  });

  test('should show saved status with green indicator', () => {
    const savedTime = new Date(Date.now() - 5000); // 5 seconds ago
    render(
      <SaveStatus
        status="saved"
        lastSaved={savedTime}
        isUntitledProject={true}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.getByText(/Saved \d+s ago/)).toBeInTheDocument();
    const statusContainer = screen.getByText(/Saved \d+s ago/).closest('div');
    expect(statusContainer).toHaveClass('bg-green-50');
  });

  test('should not show status indicator when idle with no Save Project button', () => {
    const { container } = render(
      <SaveStatus
        status="idle"
        lastSaved={null}
        onSave={jest.fn()}
        isUntitledProject={false}
        hasUnsavedChanges={false}
      />
    );

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();

    // Should still show the Save button
    expect(screen.getByText('Save')).toBeInTheDocument();
  });
});

describe('SaveStatus - Props Validation', () => {
  test('should handle missing optional props gracefully', () => {
    const { container } = render(
      <SaveStatus
        status="idle"
        lastSaved={null}
        isUntitledProject={false}
        hasUnsavedChanges={false}
        // No onSave or onSaveProject
      />
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  test('compact mode should only show icon', () => {
    render(
      <SaveStatus
        status="pending"
        lastSaved={null}
        compact={true}
        isUntitledProject={false}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument();
  });
});

describe('SaveStatus - Error Handling', () => {
  test('should display error message when save fails', () => {
    const error = new Error('Save failed: Network error');
    render(
      <SaveStatus
        status="error"
        lastSaved={null}
        error={error}
        isUntitledProject={true}
        hasUnsavedChanges={true}
      />
    );

    expect(screen.getByText('Save failed: Network error')).toBeInTheDocument();
    const errorContainer = screen.getByText('Save failed: Network error').closest('div');
    expect(errorContainer).toHaveClass('bg-red-50');
  });
});
