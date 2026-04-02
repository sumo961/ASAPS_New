# Story Generation LLM Evaluation

Automated test suite for evaluating whether small LLMs can generate structurally valid ASAPS stories from natural language prompts. Tests the full story generation pipeline: JSON output, beat structure, connections, reachability, and content rules.

## Prerequisites

- [Ollama](https://ollama.com/) running locally (default: `http://localhost:11434`)
- One or more models pulled (e.g. `ollama pull gemma3:4b`)

## Usage

```bash
# Test a single model
npx tsx packages/core/tests/llm-eval-story/run-eval.ts --model gemma3:4b

# Compare multiple models
npx tsx packages/core/tests/llm-eval-story/run-eval.ts --compare gemma3:4b,ministral-3:3b

# Run one scenario with full output
npx tsx packages/core/tests/llm-eval-story/run-eval.ts --model gemma3:4b --scenario story-dialog --verbose

# Custom endpoint
npx tsx packages/core/tests/llm-eval-story/run-eval.ts --model my-model --endpoint http://localhost:1234
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--model <name>` | Single model to test | — |
| `--compare <m1,m2,...>` | Comma-separated models for comparison | — |
| `--endpoint <url>` | OpenAI-compatible API endpoint | `http://localhost:11434` |
| `--scenario <id>` | Run only one scenario | all |
| `--timeout <ms>` | Request timeout | `180000` (3 min) |
| `--verbose` | Show all check details and response preview | off |

## Test Scenarios

| ID | Description | Required Beats | Complexity |
|----|-------------|---------------|------------|
| `story-linear` | Linear story with two endings | titleScreen, endScreen | linear |
| `story-dialog` | Story with NPC dialog tree | titleScreen, dialogTree, endScreen | moderate |
| `story-inventory` | Item selection and inventory | titleScreen, pickProp, endScreen | moderate |
| `story-movement` | Location choices | titleScreen, movementChoice, endScreen | moderate |
| `story-condition` | Variables + conditional branching | titleScreen, dialogTree, conditionBeat, endScreen | moderate |
| `story-medium` | Medium-length mixed beat types | titleScreen, movementChoice, dialogTree, endScreen | moderate |

## Structural Checks (16 total)

| Check | Weight | What it validates |
|-------|--------|-------------------|
| `json-valid` | 5 | Response is parseable JSON |
| `beats-array` | 3 | Has non-empty beats array |
| `beat0-titlescreen` | 3 | beat_0 exists and is titleScreen |
| `no-dangling-targets` | 5 | All target IDs reference existing beats — dangling targets break navigation |
| `all-reachable` | 5 | All beats reachable from beat_0 via BFS — unreachable beats are dead content |
| `valid-types` | 2 | All beat types are recognized ASAPS types |
| `endscreen` | 2 | Has endScreen with showRestart: true |
| `required-types` | 2 | Scenario-specific required beat types present |
| `single-connection` | 3 | Single-connection beats have ≤1 connection — breaks story flow |
| `param-targets` | 3 | Multi-connection beats use parameter targets, not connections array |
| `id-type` | 2 | Every beat has id and type fields |
| `dialogtree-structure` | 3 | DialogTree has id, speaker, text, choices — missing fields break rendering |
| `metadata` | 1 | Has metadata with title |
| `beat-count` | 1 | Beat count in expected range for story length |
| `multiple-endings` | 1 | Multiple endScreens when scenario expects them |
| `characters` | 1 | Has characters array |

A test passes at ≥70% of weighted points.

## Adding Scenarios

Add new scenarios to `scenarios.ts`. Each needs:
- `prompt` — the story description (what the user would type)
- `length` / `complexity` — controls expected beat count
- `requiredBeatTypes` — types that must appear
- Optional flags: `multipleEndings`, `expectCounters`, `expectInventory`

The scoring in `scoring.ts` validates structural rules automatically — no scenario-specific scoring needed.
