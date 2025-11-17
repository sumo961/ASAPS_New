# Generated Types

This directory contains auto-generated TypeScript types from the beat schema.

**⚠️ DO NOT EDIT FILES IN THIS DIRECTORY MANUALLY**

These files are automatically generated from `beat-definitions/core-beats.json` during the build process.

## Regenerating Types

To regenerate the types after modifying the schema:

```bash
npm run generate:types
```

This command is automatically run as part of the build process:

```bash
npm run build
```

## What's Generated

- **`beat-types.ts`**: TypeScript interfaces for all beat parameter types
  - Individual parameter interfaces for each beat type (e.g., `TitleScreenParameters`, `InputTextParameters`)
  - `BeatType` union type of all valid beat type names
  - `BeatParameterMap` mapping beat types to their parameter interfaces
  - `ParametersFor<T>` helper type for type-safe parameter access
  - `TypedBeatConfig<T>` for type-safe beat configurations

## Usage Example

```typescript
import { BeatType, ParametersFor, TypedBeatConfig } from './generated/beat-types';

// Type-safe beat configuration
const config: TypedBeatConfig<'inputText'> = {
  id: 'beat_1',
  type: 'inputText',
  parameters: {
    prompt: 'Enter your name:',
    saveToType: 'variable',
    variable: 'playerName',
    buttonText: 'Continue',
    connection: { target: 'beat_2' }
    // TypeScript will enforce that all required parameters are present
    // and will provide autocomplete for available parameters
  }
};

// Get parameters for a specific beat type
type InputTextParams = ParametersFor<'inputText'>;
```

## Schema Version

Generated types are versioned according to the schema version in `beat-definitions/core-beats.json`.
The current schema version is included in the generated file header.
