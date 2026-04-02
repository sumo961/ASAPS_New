# LLM Evaluation Harness

Automated test suite for evaluating small LLMs for the ASAPS embedded self-contained playback engine. Tests whether a model can handle the various AI beat generation tasks (dialog trees, conversations, classification, etc.) reliably enough for offline use.

## Prerequisites

- [Ollama](https://ollama.com/) running locally (default: `http://localhost:11434`)
- One or more models pulled (e.g. `ollama pull gemma3:4b`)

## Usage

```bash
# Test a single model
npx tsx packages/core/tests/llm-eval/run-eval.ts --model gemma3:4b

# Compare multiple models side-by-side
npx tsx packages/core/tests/llm-eval/run-eval.ts --compare gemma3:4b,ministral-3:3b

# Show full responses for debugging
npx tsx packages/core/tests/llm-eval/run-eval.ts --model gemma3:4b --verbose

# Test only one category
npx tsx packages/core/tests/llm-eval/run-eval.ts --model gemma3:4b --category dialogTree

# Custom endpoint (e.g. LM Studio)
npx tsx packages/core/tests/llm-eval/run-eval.ts --model my-model --endpoint http://localhost:1234
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--model <name>` | Single model to test | — |
| `--compare <m1,m2,...>` | Comma-separated models for comparison | — |
| `--endpoint <url>` | OpenAI-compatible API endpoint | `http://localhost:11434` |
| `--category <name>` | Run only one category (see below) | all |
| `--timeout <ms>` | Request timeout | `120000` |
| `--verbose` | Show full model responses | off |

## Test Categories

| Category | Tests | What it checks |
|----------|-------|----------------|
| `dialogTree` | 3 | JSON structure, nested nodes, personalization with player context |
| `conversation` | 3 | NPC opening lines, multi-turn responses, language matching |
| `textGen` | 2 | Concise narrative text, personalization with variables |
| `classification` | 3 | Player personality classification, game state routing, direction evaluation |
| `extraction` | 1 | Variable extraction from conversation history |
| `exitMessage` | 2 | Contextual NPC farewells acknowledging player's last choice |

## Scoring

Each test is scored automatically on multiple dimensions:

- **JSON validity** — can the model produce parseable JSON?
- **Schema conformance** — are required fields present?
- **Word/sentence limits** — does the model respect length constraints?
- **Personalization** — does the response use player details (name, location)?
- **Classification accuracy** — does it return a valid category?
- **Language compliance** — does it respond in the requested language?
- **No format leakage** — does text output avoid JSON artifacts?

A test passes at ≥70% of possible points. The comparison table shows pass/fail per test per model, plus average latency and tokens/second.

## Baseline Results (Apple M1, 2026-04)

| Model | Score | Avg Latency | Avg tok/s |
|-------|-------|-------------|-----------|
| gemma3:4b | **100%** (14/14) | 3.4s | 27 |
| ministral-3:3b | 76% (11/14) | 6.8s | 33 |
| lfm2.5-thinking | 29% (4/14) | 6.6s | 127 |

## Adding Tests

Add new scenarios to `scenarios.ts`. Each scenario needs:
- `id` / `category` — for grouping and filtering
- `systemPrompt` / `userPrompt` — the actual prompts sent to the model
- `expectedFormat` — `'json'`, `'text'`, or `'json-array'`
- `validation` — rules for automated scoring (see `ValidationRules` type)

The scoring logic in `scoring.ts` handles all validation rules automatically.
