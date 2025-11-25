/**
 * Tests for SaveProjectDialog component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveProjectDialog } from './SaveProjectDialog';

describe('SaveProjectDialog - Basic Rendering', () => {
  test('should not render when isOpen is false', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    const { container } = render(
      <SaveProjectDialog
        isOpen={false}
        onClose={onClose}
        onSave={onSave}
        currentName="Test Story"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  test('should render when isOpen is true', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        currentName="Test Story"
      />
    );

    expect(screen.getByText('Save Project')).toBeInTheDocument();
    expect(screen.getByText(/Save your current work as a named project/)).toBeInTheDocument();
  });

  test('should display current name in input field when provided', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        currentName="My Current Story"
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    expect(nameInput.value).toBe('My Current Story');
  });

  test('should have empty name field when no current name provided', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });
});

describe('SaveProjectDialog - Form Interactions', () => {
  test('should focus name input when dialog opens', async () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        currentName="Test"
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(nameInput);
    });
  });

  test('should select text in name input when dialog opens', async () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        currentName="Test Story Name"
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    await waitFor(() => {
      expect(nameInput.selectionStart).toBe(0);
      expect(nameInput.selectionEnd).toBe('Test Story Name'.length);
    });
  });

  test('should update name input when typing', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My New Project' } });

    expect(nameInput.value).toBe('My New Project');
  });

  test('should update description when typing', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const descriptionInput = screen.getByLabelText(/Description \(optional\)/) as HTMLTextAreaElement;
    fireEvent.change(descriptionInput, { target: { value: 'This is a test description' } });

    expect(descriptionInput.value).toBe('This is a test description');
  });
});

describe('SaveProjectDialog - Field Validations', () => {
  test('should show required indicator for project name', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameLabel = screen.getByText('Project Name');
    expect(nameLabel).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  test('should enforce 100 character limit on project name', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    expect(nameInput).toHaveAttribute('maxLength', '100');

    const charCounter = screen.getByText(/0\/100/);
    expect(charCounter).toBeInTheDocument();
  });

  test('should update character count for project name', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });

    expect(screen.getByText(/4\/100/)).toBeInTheDocument();
  });

  test('should enforce 500 character limit on description', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const descriptionInput = screen.getByLabelText(/Description \(optional\)/) as HTMLTextAreaElement;
    expect(descriptionInput).toHaveAttribute('maxLength', '500');

    const charCounter = screen.getByText(/0\/500/);
    expect(charCounter).toBeInTheDocument();
  });

  test('should update character count for description', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const descriptionInput = screen.getByLabelText(/Description \(optional\)/) as HTMLTextAreaElement;
    fireEvent.change(descriptionInput, { target: { value: 'This is a test' } });

    expect(screen.getByText(/14\/500/)).toBeInTheDocument();
  });
});

describe('SaveProjectDialog - Button Interactions', () => {
  test('should call onSave when Save button is clicked with valid name', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/);
    fireEvent.change(nameInput, { target: { value: 'Valid Project Name' } });

    const saveButton = screen.getByText('Save Project');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Valid Project Name', '');
    });
  });

  test('should call onSave with name and description when both provided', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/);
    fireEvent.change(nameInput, { target: { value: 'Project with Description' } });

    const descriptionInput = screen.getByLabelText(/Description \(optional\)/);
    fireEvent.change(descriptionInput, { target: { value: 'This project has a description' } });

    const saveButton = screen.getByText('Save Project');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Project with Description', 'This project has a description');
    });
  });

  test('should trim whitespace from name and description', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/);
    fireEvent.change(nameInput, { target: { value: '  Project with Spaces  ' } });

    const descriptionInput = screen.getByLabelText(/Description \(optional\)/);
    fireEvent.change(descriptionInput, { target: { value: '  Description with spaces  ' } });

    const saveButton = screen.getByText('Save Project');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Project with Spaces', 'Description with spaces');
    });
  });

  test('should show alert when saving with empty name', () => {
    const originalAlert = window.alert;
    window.alert = jest.fn();

    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const saveButton = screen.getByText('Save Project');
    fireEvent.click(saveButton);

    expect(window.alert).toHaveBeenCalledWith('Please enter a project name');
    expect(onSave).not.toHaveBeenCalled();

    window.alert = originalAlert;
  });

  test('should show alert when saving with whitespace-only name', () => {
    const originalAlert = window.alert;
    window.alert = jest.fn();

    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/);
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const saveButton = screen.getByText('Save Project');
    fireEvent.click(saveButton);

    expect(window.alert).toHaveBeenCalledWith('Please enter a project name');
    expect(onSave).not.toHaveBeenCalled();

    window.alert = originalAlert;
  });

  test('should disable Save button during saving', async () => {
    let resolveSave: () => void;
    const onSave = jest.fn().mockImplementation(() => new Promise(resolve => {
      resolveSave = () => resolve(undefined);
    }));
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/);
    fireEvent.change(nameInput, { target: { value: 'Async Test Project' } });

    const saveButton = screen.getByText('Save Project');
    fireEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
    expect(screen.getByText('Saving...')).toBeInTheDocument();

    // Complete the save
    act(() => resolveSave!());

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  test('should call onClose when Cancel button is clicked', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test('should clear form when dialog reopens after cancel', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    const { rerender } = render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test Project' } });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();

    // Reopen dialog
    rerender(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    await waitFor(() => {
      expect(nameInput.value).toBe('');
    });
  });
});

describe('SaveProjectDialog - Keyboard Interactions', () => {
  test('should close dialog on Escape key', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('should submit form on Enter key in name field', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Enter Key Test' } });

    fireEvent.keyDown(nameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Enter Key Test', '');
    });
  });

  test('should not submit on Shift+Enter in name field', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SaveProjectDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Shift Enter Test' } });

    fireEvent.keyDown(nameInput, { key: 'Enter', shiftKey: true });

    expect(onSave).not.toHaveBeenCalled();
  });
});
