# Schema-Based Architecture Migration Plan

This document outlines the phased approach to migrating ASAPS Modern from hardcoded beat type handling to a schema-driven architecture.

## Overview

The goal is to eliminate duplication and hardcoded beat-specific logic by leveraging the existing `beat-definitions/core-beats.json` schema to drive UI generation and beat initialization.

## Current State

- **35 hardcoded parameter fields** in Inspector component
- **18 hardcoded location setup conditionals** in VisualWorkspace
- Beat definitions exist in JSON schema but are not used for UI generation
- All beat type classes manually implement parameter handling

## Migration Phases

### Phase 1: Inspector Parameter Generation (High Value, Low Risk)

**Goal**: Replace hardcoded parameter fields with schema-driven form generator

**Scope**:
- Replace 35 hard-coded parameter fields with schema-driven form generator
- Use beat-definitions.json to auto-generate input fields based on parameter types
- Keep beat classes unchanged
- Maintain backward compatibility with existing stories

**Implementation**:
- Create `SchemaFormGenerator` component that reads parameter definitions
- Generate appropriate input components based on parameter types:
  - `string` → text input
  - `number` → number input
  - `boolean` → checkbox
  - `array` → dynamic list editor
  - Custom types → specialized editors
- Handle required/optional fields
- Apply default values from schema
- Validate inputs against schema constraints

**Estimated Effort**: 2-3 days

**Impact**:
- 90% of Inspector becomes generic
- New beat types require zero Inspector changes
- Centralized parameter handling logic

**Success Criteria**:
- All existing beat types render correctly in Inspector
- Parameter changes persist correctly
- No regression in existing functionality
- Code reduction in Inspector.tsx

---

### Phase 2: VisualWorkspace Location Initialization (Medium Value, Medium Risk)

**Goal**: Replace hardcoded location setup with schema-driven logic

**Scope**:
- Replace 18 hard-coded location setup conditionals with schema-driven logic
- Use `locations` array from beat definitions
- Integrate with existing `beatLocationInitializer`
- Generate location elements dynamically based on schema

**Implementation**:
- Create `SchemaLocationInitializer` that reads locations from schema
- Map location names to visual element types:
  - `text` → text display element
  - `button` → button element
  - `input` → input field element
  - `choices` → choice container
  - etc.
- Handle default positioning and sizing from schema
- Integrate with existing drag-and-drop system
- Maintain WYSIWYG preview compatibility

**Estimated Effort**: 3-4 days

**Impact**:
- Eliminates most VisualWorkspace duplication
- Location setup becomes data-driven
- Easier to add new location types
- Consistent initialization across beat types

**Success Criteria**:
- All beat types initialize locations correctly
- Visual editor displays match expectations
- Preview mode shows correct layout
- No loss of existing location features

---

### Phase 3: TypeScript Type Generation (Optional Enhancement)

**Goal**: Generate TypeScript interfaces from schema for compile-time type safety

**Scope**:
- Generate TypeScript interfaces from beat-definitions.json at build time
- Provide compile-time type safety for parameters
- Create typed beat factory functions
- Optional: Generate Zod schemas for runtime validation

**Implementation**:
- Create build-time script to parse beat-definitions.json
- Generate TypeScript interface definitions
- Output to `packages/core/src/generated/beat-types.ts`
- Update beat classes to use generated interfaces
- Add to build pipeline

**Estimated Effort**: 2 days

**Impact**:
- Compile-time type checking for beat parameters
- IDE autocomplete for beat configurations
- Reduced runtime type errors
- Single source of truth (schema) for types

**Success Criteria**:
- Generated types match schema definitions
- TypeScript compilation succeeds
- No type errors in existing code
- Build pipeline includes type generation step

---

## Migration Strategy

### Approach: Incremental, Non-Breaking

1. **Parallel Implementation**: Build new schema-driven components alongside existing hardcoded logic
2. **Feature Flags**: Use flags to toggle between old and new implementations
3. **Beat-by-Beat Migration**: Test each beat type individually before moving to the next
4. **Rollback Safety**: Maintain ability to revert to hardcoded logic if issues arise

### Risk Mitigation

- Extensive testing of each phase before moving to next
- Maintain backward compatibility throughout migration
- Keep existing beat classes intact during Phase 1 & 2
- Document any behavior changes or edge cases

### Testing Strategy

- Unit tests for schema parsing and validation
- Integration tests for form generation
- Visual regression tests for Inspector and VisualWorkspace
- E2E tests for beat creation and editing workflows
- Test with existing story files to ensure compatibility

---

## Post-Migration Benefits

1. **Reduced Code Duplication**: ~90% reduction in beat-specific UI code
2. **Easier Extensibility**: New beat types require only schema updates
3. **Consistency**: All beats follow same patterns
4. **Maintainability**: Single source of truth for beat definitions
5. **Type Safety**: Generated TypeScript interfaces (Phase 3)
6. **Validation**: Schema-based parameter validation
7. **Documentation**: Schema serves as living documentation

---

## Dependencies

- `beat-definitions/core-beats.json` - Complete and accurate beat definitions
- Existing beat classes - Must continue to work during migration
- React form libraries - Consider react-hook-form or similar for complex forms
- TypeScript compiler - For type generation (Phase 3)

---

## Timeline

- **Phase 1**: Weeks 1-2 (Inspector parameter generation)
- **Phase 2**: Weeks 3-4 (VisualWorkspace location initialization)
- **Phase 3**: Week 5 (Optional type generation)
- **Testing & Refinement**: Week 6

**Total Estimated Duration**: 5-6 weeks for complete migration

---

## Next Steps

1. Review and approve migration plan
2. Set up feature branch for Phase 1
3. Create schema parsing infrastructure
4. Implement `SchemaFormGenerator` component
5. Begin beat-by-beat testing and migration

---

## Notes

- This migration is purely internal refactoring
- No changes to story file format required
- No impact on end users
- Existing stories remain compatible
- Beat functionality remains unchanged
