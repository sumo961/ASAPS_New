/**
 * Shared prompt fragments used by AI generation paths.
 *
 * Modules here author content that's intended to be embedded into
 * larger system prompts assembled by the in-app provider stack
 * (`packages/builder/src/services/prompts/`) and by the standalone
 * MCP server (`mcp-server-desktop/`), which keeps a manually-synced copy of
 * this content because it doesn't take a dependency on @asaps/core — the
 * source of truth lives here.
 */

export { buildAffectPromptSection, type AffectDepth } from './affectPrompt';
