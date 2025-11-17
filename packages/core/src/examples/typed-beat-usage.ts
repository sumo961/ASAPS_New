/**
 * Example usage of generated TypeScript types for beats
 *
 * This file demonstrates how to use the auto-generated types
 * for compile-time type safety when creating beat configurations.
 */

import type {
  BeatType,
  ParametersFor,
  TypedBeatConfig,
  InputTextParameters,
  TitleScreenParameters
} from '../generated/beat-types';

// Example 1: Type-safe beat configuration with explicit type
const inputTextBeat: TypedBeatConfig<'inputText'> = {
  id: 'beat_1',
  type: 'inputText',
  parameters: {
    prompt: 'What is your name?',
    saveToType: 'variable',
    variable: 'playerName',
    placeholder: 'Enter your name here',
    buttonText: 'Continue',
    required: true,
    validation: 'none',
    connection: {
      targetId: 'beat_2'
    }
    // TypeScript enforces that all required parameters are present!
  }
};

// Example 2: Using ParametersFor helper type
function createInputTextBeat(id: string, params: ParametersFor<'inputText'>): TypedBeatConfig<'inputText'> {
  return {
    id,
    type: 'inputText',
    parameters: params
  };
}

// Example 3: Using the specific parameter interface directly
const titleParams: TitleScreenParameters = {
  title: 'My Adventure',
  author: 'John Doe',
  buttonText: 'Start Game',
  connection: {
    targetId: 'beat_1'
  }
};

// Example 4: Generic function that works with any beat type
function createBeat<T extends BeatType>(
  id: string,
  type: T,
  parameters: ParametersFor<T>
): TypedBeatConfig<T> {
  return {
    id,
    type,
    parameters
  };
}

// Usage with full type inference and autocomplete
const myBeat = createBeat('beat_3', 'inputText', {
  prompt: 'Enter your age:',
  saveToType: 'variable',
  variable: 'playerAge',
  validation: 'numeric',
  required: true,
  buttonText: 'Next',
  connection: { targetId: 'beat_4' }
});

// Example 5: Type guard for beat configurations
function isInputTextBeat(beat: TypedBeatConfig<BeatType>): beat is TypedBeatConfig<'inputText'> {
  return beat.type === 'inputText';
}

// Example 6: Extracting parameters with type safety
function getPromptText(beat: TypedBeatConfig<BeatType>): string | undefined {
  if (isInputTextBeat(beat)) {
    return beat.parameters.prompt; // TypeScript knows this is a string
  }
  return undefined;
}

// Example 7: Array of typed beats
const storyBeats: TypedBeatConfig<BeatType>[] = [
  {
    id: 'beat_0',
    type: 'titleScreen',
    parameters: {
      title: 'The Lost City',
      author: 'Adventure Games Inc',
      buttonText: 'Begin',
      connection: { targetId: 'beat_1' }
    }
  },
  {
    id: 'beat_1',
    type: 'introText',
    parameters: {
      text: 'You wake up in a mysterious temple...',
      buttonText: 'Continue',
      connection: { targetId: 'beat_2' }
    }
  },
  {
    id: 'beat_2',
    type: 'inputText',
    parameters: {
      prompt: 'What is your name, adventurer?',
      saveToType: 'variable',
      variable: 'playerName',
      connection: { targetId: 'beat_3' }
    }
  }
];

export {
  inputTextBeat,
  createInputTextBeat,
  titleParams,
  createBeat,
  isInputTextBeat,
  getPromptText,
  storyBeats
};
