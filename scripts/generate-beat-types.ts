#!/usr/bin/env tsx
/**
 * TypeScript Type Generator for Beat Definitions
 *
 * Generates TypeScript interfaces from beat-definitions/core-beats.json
 * providing compile-time type safety for beat parameters.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ParameterDef {
  type: string;
  required?: boolean;
  default?: any;
  description?: string;
  minItems?: number;
}

interface BeatDef {
  category: string;
  displayName: string;
  icon: string;
  description: string;
  connectionType: string;
  parameters: Record<string, ParameterDef>;
  locations?: string[];
  locationMapping?: Record<string, string>;
  transitions?: boolean;
  sound?: boolean;
  renderer: string;
}

interface BeatDefinitions {
  schema: string;
  version: string;
  description: string;
  customTypes: Record<string, any>;
  beatTypes: Record<string, BeatDef>;
}

/**
 * Map JSON schema types to TypeScript types
 */
function mapTypeToTS(paramType: string, isRequired: boolean): string {
  // Handle array types
  if (paramType.startsWith('array<')) {
    const innerType = paramType.match(/array<(.+)>/)?.[1] || 'any';
    const mappedInner = mapCustomType(innerType);
    return isRequired ? `${mappedInner}[]` : `${mappedInner}[] | undefined`;
  }

  // Handle basic types
  const typeMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'any': 'any',
    'connection': 'Connection',
  };

  const mappedType = typeMap[paramType] || mapCustomType(paramType);
  return isRequired ? mappedType : `${mappedType} | undefined`;
}

/**
 * Map custom types from schema
 */
function mapCustomType(typeName: string): string {
  const customTypeMap: Record<string, string> = {
    'dialogNode': 'DialogNode',
    'dialogChoice': 'DialogChoice',
    'movementOption': 'MovementOption',
    'propOption': 'PropOption',
    'condition': 'Condition',
    'effect': 'Effect',
    'connection': 'Connection',
  };

  return customTypeMap[typeName] || typeName;
}

/**
 * Generate TypeScript interface for a beat's parameters
 */
function generateBeatInterface(beatName: string, beatDef: BeatDef): string {
  const interfaceName = toPascalCase(beatName) + 'Parameters';
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * ${beatDef.displayName} - ${beatDef.description}`);
  lines.push(` * Category: ${beatDef.category}`);
  lines.push(` * Connection Type: ${beatDef.connectionType}`);
  lines.push(` */`);
  lines.push(`export interface ${interfaceName} {`);

  // Generate property for each parameter
  for (const [paramName, paramDef] of Object.entries(beatDef.parameters)) {
    if (paramDef.description) {
      lines.push(`  /** ${paramDef.description} */`);
    }

    const isRequired = paramDef.required ?? false;
    const tsType = mapTypeToTS(paramDef.type, isRequired);
    const optional = !isRequired ? '?' : '';

    lines.push(`  ${paramName}${optional}: ${tsType};`);
  }

  lines.push(`}`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * Generate union type of all beat type names
 */
function generateBeatTypeUnion(beatNames: string[]): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Union type of all valid beat type names`);
  lines.push(` */`);
  lines.push(`export type BeatType =`);

  beatNames.forEach((name, idx) => {
    const isLast = idx === beatNames.length - 1;
    lines.push(`  | '${name}'${isLast ? ';' : ''}`);
  });

  lines.push(``);

  return lines.join('\n');
}

/**
 * Generate map of beat type to parameter interface
 */
function generateBeatParameterMap(beatNames: string[]): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Map of beat type name to its parameter interface`);
  lines.push(` */`);
  lines.push(`export interface BeatParameterMap {`);

  beatNames.forEach(name => {
    const interfaceName = toPascalCase(name) + 'Parameters';
    lines.push(`  '${name}': ${interfaceName};`);
  });

  lines.push(`}`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * Generate helper type for getting parameters by beat type
 */
function generateHelperTypes(): string {
  return `/**
 * Get the parameter type for a specific beat type
 */
export type ParametersFor<T extends BeatType> = BeatParameterMap[T];

/**
 * Type-safe beat configuration object
 */
export interface TypedBeatConfig<T extends BeatType> {
  id: string;
  type: T;
  parameters: ParametersFor<T>;
}

`;
}

/**
 * Convert kebab-case or camelCase to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Generate base types from customTypes in schema
 */
function generateCustomTypes(customTypes: Record<string, any>): string {
  const lines: string[] = [];

  lines.push(`// ============================================`);
  lines.push(`// Custom Types from Schema`);
  lines.push(`// ============================================`);
  lines.push(``);

  // Import Connection from core (assuming it exists)
  lines.push(`import type { Connection, Condition, Effect } from '../types';`);
  lines.push(``);

  // Generate interfaces for custom types
  for (const [typeName, typeDef] of Object.entries(customTypes)) {
    if (!typeDef.schema) continue;

    const interfaceName = toPascalCase(typeName);

    // Skip if it's a core type we're importing
    if (['condition', 'effect', 'connection'].includes(typeName)) continue;

    lines.push(`/**`);
    lines.push(` * ${typeDef.description}`);
    lines.push(` */`);
    lines.push(`export interface ${interfaceName} {`);

    for (const [propName, propType] of Object.entries(typeDef.schema)) {
      const isOptional = String(propType).endsWith('?');
      const cleanType = String(propType).replace('?', '');
      const optional = isOptional ? '?' : '';

      // Map type
      let tsType: string;
      if (cleanType === 'string') tsType = 'string';
      else if (cleanType === 'number') tsType = 'number';
      else if (cleanType === 'boolean') tsType = 'boolean';
      else if (cleanType === 'any') tsType = 'any';
      else if (cleanType.includes('[]')) {
        const innerType = cleanType.replace('[]', '');
        tsType = `${mapCustomType(innerType)}[]`;
      } else if (cleanType.includes(' | ')) {
        const types = cleanType.split(' | ').map(t => `'${t.replace(/'/g, '')}'`);
        tsType = types.join(' | ');
      } else {
        tsType = mapCustomType(cleanType);
      }

      lines.push(`  ${propName}${optional}: ${tsType};`);
    }

    lines.push(`}`);
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Main generation function
 */
function generateTypes() {
  console.log('🔧 Generating TypeScript types from beat schema...\n');

  // Read beat definitions
  const schemaPath = path.join(__dirname, '../beat-definitions/core-beats.json');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const schema: BeatDefinitions = JSON.parse(schemaContent);

  // Prepare output
  const lines: string[] = [];

  // File header
  lines.push(`/**`);
  lines.push(` * Auto-generated TypeScript types from beat-definitions/core-beats.json`);
  lines.push(` * DO NOT EDIT MANUALLY - Run 'npm run generate:types' to regenerate`);
  lines.push(` * `);
  lines.push(` * Schema Version: ${schema.version}`);
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(` */`);
  lines.push(``);

  // Generate custom types
  lines.push(generateCustomTypes(schema.customTypes));

  lines.push(`// ============================================`);
  lines.push(`// Beat Parameter Interfaces`);
  lines.push(`// ============================================`);
  lines.push(``);

  // Generate interface for each beat type
  const beatNames = Object.keys(schema.beatTypes);
  for (const [beatName, beatDef] of Object.entries(schema.beatTypes)) {
    lines.push(generateBeatInterface(beatName, beatDef));
  }

  lines.push(`// ============================================`);
  lines.push(`// Beat Type Union and Maps`);
  lines.push(`// ============================================`);
  lines.push(``);

  // Generate union type
  lines.push(generateBeatTypeUnion(beatNames));

  // Generate parameter map
  lines.push(generateBeatParameterMap(beatNames));

  // Generate helper types
  lines.push(`// ============================================`);
  lines.push(`// Helper Types`);
  lines.push(`// ============================================`);
  lines.push(``);
  lines.push(generateHelperTypes());

  // Write to file
  const outputDir = path.join(__dirname, '../packages/core/src/generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'beat-types.ts');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

  console.log(`✅ Generated ${beatNames.length} beat type interfaces`);
  console.log(`📝 Output: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`\n✨ Type generation complete!`);
}

// Run generation
try {
  generateTypes();
} catch (error) {
  console.error('❌ Type generation failed:', error);
  process.exit(1);
}
