/**
 * Tests for InputTextBeat - text input from player
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputTextBeat } from '../../src/beats/InputTextBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function createMockRenderer(): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(''),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue('test input'),
    renderHyperText: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

describe('InputTextBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Text Input',
        type: 'inputText',
      });

      expect(beat.prompt).toBe('Please enter your response:');
      expect(beat.saveToType).toBe('variable');
      expect(beat.variable).toBe('userInput');
      expect(beat.required).toBe(true);
      expect(beat.buttonText).toBe('Continue');
    });

    it('should create with custom values', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Name Input',
        type: 'inputText',
        prompt: 'What is your name?',
        variable: 'playerName',
        placeholder: 'Enter name...',
        buttonText: 'Submit',
      });

      expect(beat.prompt).toBe('What is your name?');
      expect(beat.variable).toBe('playerName');
      expect(beat.placeholder).toBe('Enter name...');
      expect(beat.buttonText).toBe('Submit');
    });

    it('should support parameters object format', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Code Input',
        type: 'inputText',
        parameters: {
          prompt: 'Enter the code:',
          variable: 'userCode',
          validation: 'numeric',
          minLength: 4,
          maxLength: 4,
        },
      });

      expect(beat.prompt).toBe('Enter the code:');
      expect(beat.variable).toBe('userCode');
      expect(beat.validation).toBe('numeric');
      expect(beat.minLength).toBe(4);
      expect(beat.maxLength).toBe(4);
    });

    it('should support variableName as alias for variable', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        parameters: {
          variableName: 'myVar',
        } as any,
      });

      expect(beat.variable).toBe('myVar');
    });

    it('should support counter saveToType', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        saveToType: 'counter',
        counter: 'score',
        counterOperation: 'set',
      });

      expect(beat.saveToType).toBe('counter');
      expect(beat.counter).toBe('score');
      expect(beat.counterOperation).toBe('set');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        prompt: 'Enter name:',
        variable: 'name',
        placeholder: 'Name...',
        validation: 'alphanumeric',
        minLength: 2,
        maxLength: 20,
        required: true,
        buttonText: 'OK',
        node: 'input_bg',
      });

      const params = beat.getParameters();
      expect(params.prompt).toBe('Enter name:');
      expect(params.variable).toBe('name');
      expect(params.placeholder).toBe('Name...');
      expect(params.validation).toBe('alphanumeric');
      expect(params.minLength).toBe(2);
      expect(params.maxLength).toBe(20);
      expect(params.required).toBe(true);
      expect(params.buttonText).toBe('OK');
      expect(params.node).toBe('input_bg');
    });
  });

  describe('updateParameters', () => {
    it('should update prompt and variable', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
      });

      beat.updateParameters({ prompt: 'New prompt?', variable: 'newVar' });
      expect(beat.prompt).toBe('New prompt?');
      expect(beat.variable).toBe('newVar');
    });

    it('should update validation settings', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
      });

      beat.updateParameters({ validation: 'email', minLength: 5, maxLength: 50 });
      expect(beat.validation).toBe('email');
      expect(beat.minLength).toBe(5);
      expect(beat.maxLength).toBe(50);
    });

    it('should handle variableName as alias', () => {
      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
      });

      beat.updateParameters({ variableName: 'aliasVar' });
      expect(beat.variable).toBe('aliasVar');
    });
  });

  describe('performAction', () => {
    it('should render input text and store result in variable', async () => {
      (renderer.renderInputText as any).mockResolvedValue('Alice');

      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Name Input',
        type: 'inputText',
        prompt: 'What is your name?',
        variable: 'playerName',
      });

      beat.addConnection({ targetId: 'next_beat' });

      const result = await beat.execute(context, renderer);

      expect(renderer.renderInputText).toHaveBeenCalled();
      expect(context.getVariable('playerName')).toBe('Alice');
      expect(result).toBe('next_beat');
    });

    it('should process prompt with variable interpolation', async () => {
      context.setVariable('npcName', 'Wizard');
      (renderer.renderInputText as any).mockResolvedValue('42');

      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        prompt: 'The $npcName$ asks for the secret number:',
        variable: 'answer',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderInputText as any).mock.calls[0];
      expect(callArgs[0]).toBe('The Wizard asks for the secret number:');
    });

    it('should auto-convert numeric input when validation is numeric', async () => {
      (renderer.renderInputText as any).mockResolvedValue('42');

      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        variable: 'answer',
        validation: 'numeric',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      expect(context.getVariable('answer')).toBe(42); // Number, not string
    });

    it('should store as string when not numeric validation', async () => {
      (renderer.renderInputText as any).mockResolvedValue('42');

      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        variable: 'answer',
        validation: 'none',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      expect(context.getVariable('answer')).toBe('42'); // String
    });

    it('should save to counter when saveToType is counter', async () => {
      (renderer.renderInputText as any).mockResolvedValue('75');

      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        saveToType: 'counter',
        counter: 'score',
        counterOperation: 'set',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      expect(context.getCounter('score')).toBe(75);
    });

    it('should add to counter when counterOperation is change', async () => {
      context.setCounter('score', 50);
      (renderer.renderInputText as any).mockResolvedValue('25');

      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        saveToType: 'counter',
        counter: 'score',
        counterOperation: 'change',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      expect(context.getCounter('score')).toBe(75);
    });

    it('should pass validation options to renderer', async () => {
      (renderer.renderInputText as any).mockResolvedValue('test@email.com');

      const beat = new InputTextBeat({
        id: 'input1',
        name: 'Input',
        type: 'inputText',
        prompt: 'Email:',
        variable: 'email',
        validation: 'email',
        minLength: 5,
        maxLength: 100,
        required: true,
        placeholder: 'you@example.com',
        buttonText: 'Submit',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderInputText as any).mock.calls[0];
      expect(callArgs[0]).toBe('Email:');
      expect(callArgs[1]).toBe('you@example.com');
      expect(callArgs[2]).toBe('Submit');
      expect(callArgs[3]).toEqual({
        validation: 'email',
        minLength: 5,
        maxLength: 100,
        required: true,
      });
    });
  });
});
