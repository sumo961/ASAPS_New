#!/usr/bin/env npx tsx
/**
 * LLM Evaluation Harness for ASAPS Embedded Playback Engine
 *
 * Tests small LLMs against the AI beat generation tasks to determine
 * suitability for self-contained offline playback.
 *
 * Usage:
 *   npx tsx packages/core/tests/llm-eval/run-eval.ts --model gemma3:4b
 *   npx tsx packages/core/tests/llm-eval/run-eval.ts --model ministral-3:3b --endpoint http://localhost:11434
 *   npx tsx packages/core/tests/llm-eval/run-eval.ts --compare gemma3:4b,ministral-3:3b,lfm2.5-thinking
 */

import { scenarios, type TestScenario, type TestResult } from './scenarios.js';
import { score, type ScoreReport } from './scoring.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const endpoint = getArg('endpoint') || 'http://localhost:11434';
const singleModel = getArg('model');
const compareModels = getArg('compare')?.split(',').map(m => m.trim());
const filterCategory = getArg('category'); // e.g. "dialogTree"
const verbose = args.includes('--verbose');
const timeout = parseInt(getArg('timeout') || '120000', 10);
const numCtx = parseInt(getArg('context') || '0', 10);
const noThink = args.includes('--no-think');

const models = compareModels || (singleModel ? [singleModel] : null);

if (!models) {
  console.log(`
ASAPS LLM Evaluation Harness
=============================

Usage:
  npx tsx packages/core/tests/llm-eval/run-eval.ts --model <name> [options]
  npx tsx packages/core/tests/llm-eval/run-eval.ts --compare <model1>,<model2>,... [options]

Options:
  --model <name>       Single model to test
  --compare <models>   Comma-separated models for comparison
  --endpoint <url>     Ollama endpoint (default: http://localhost:11434)
  --category <name>    Only run tests in this category (dialogTree, conversation, textGen, classification, extraction, exitMessage)
  --timeout <ms>       Request timeout in ms (default: 120000)
  --verbose            Show full model responses

Example:
  npx tsx packages/core/tests/llm-eval/run-eval.ts --compare gemma3:4b,ministral-3:3b --verbose
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Ollama OpenAI-compatible API client
// ---------------------------------------------------------------------------
async function chatCompletion(
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<{ text: string; latencyMs: number; tokensPerSec?: number }> {
  // Use native Ollama API when context size is specified
  if (numCtx > 0) {
    const url = `${endpoint}/api/chat`;
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, messages,
          options: { num_ctx: numCtx, num_predict: maxTokens, temperature: 0.7 },
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json() as any;
      const latencyMs = Date.now() - start;
      const text = data.message?.content || '';
      const totalTokens = data.eval_count || 0;
      const tokensPerSec = totalTokens > 0 && data.eval_duration
        ? (totalTokens / (data.eval_duration / 1e9)) : undefined;
      return { text, latencyMs, tokensPerSec };
    } finally { clearTimeout(timer); }
  }

  const url = `${endpoint}/v1/chat/completions`;
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const latencyMs = Date.now() - start;
    const msg = data.choices?.[0]?.message;
    const text = msg?.content || msg?.reasoning || '';
    const totalTokens = data.usage?.completion_tokens || 0;
    const tokensPerSec = totalTokens > 0 ? (totalTokens / (latencyMs / 1000)) : undefined;

    return { text, latencyMs, tokensPerSec };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Strip thinking blocks (for models like lfm2.5-thinking)
// ---------------------------------------------------------------------------
function stripThinking(text: string): string {
  // Remove <think>...</think> blocks
  let stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove ```thinking...``` blocks
  stripped = stripped.replace(/```thinking[\s\S]*?```/gi, '');
  return stripped.trim();
}

// ---------------------------------------------------------------------------
// Run a single test scenario against a model
// ---------------------------------------------------------------------------
async function runTest(model: string, scenario: TestScenario): Promise<TestResult> {
  const messages = [
    { role: 'system', content: (noThink ? '/no_think\n' : '') + scenario.systemPrompt },
    { role: 'user', content: scenario.userPrompt },
  ];

  // For conversation tests that include history
  if (scenario.conversationHistory) {
    // Insert history between system and user prompt
    messages.splice(1, 0, ...scenario.conversationHistory);
  }

  try {
    const { text: rawText, latencyMs, tokensPerSec } = await chatCompletion(
      model,
      messages,
      scenario.maxTokens || 4096,
    );

    const text = stripThinking(rawText);

    return {
      scenario: scenario.id,
      category: scenario.category,
      model,
      rawResponse: rawText,
      cleanResponse: text,
      latencyMs,
      tokensPerSec,
      error: undefined,
    };
  } catch (err) {
    return {
      scenario: scenario.id,
      category: scenario.category,
      model,
      rawResponse: '',
      cleanResponse: '',
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const activeScenarios = filterCategory
    ? scenarios.filter(s => s.category === filterCategory)
    : scenarios;

  if (activeScenarios.length === 0) {
    console.error(`No scenarios found${filterCategory ? ` for category "${filterCategory}"` : ''}`);
    process.exit(1);
  }

  console.log(`\n🧪 ASAPS LLM Evaluation`);
  console.log(`   Models: ${models!.join(', ')}`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Scenarios: ${activeScenarios.length}`);
  console.log(`   Timeout: ${timeout}ms\n`);

  const allResults: TestResult[] = [];
  const allScores: Map<string, ScoreReport[]> = new Map();

  for (const model of models!) {
    console.log(`\n━━━ ${model} ━━━`);
    const modelScores: ScoreReport[] = [];

    for (const scenario of activeScenarios) {
      process.stdout.write(`  ${scenario.category}/${scenario.id} ... `);

      const result = await runTest(model, scenario);
      allResults.push(result);

      if (result.error) {
        console.log(`❌ ERROR: ${result.error.slice(0, 80)}`);
        modelScores.push({
          scenario: scenario.id,
          category: scenario.category,
          passed: false,
          totalScore: 0,
          maxScore: 0,
          details: [{ check: 'request', passed: false, message: result.error }],
          latencyMs: 0,
        });
        continue;
      }

      const report = score(scenario, result);
      modelScores.push(report);

      const pct = report.maxScore > 0 ? Math.round((report.totalScore / report.maxScore) * 100) : 0;
      const icon = report.passed ? '✅' : pct >= 50 ? '⚠️' : '❌';
      const latency = result.latencyMs > 0 ? ` (${(result.latencyMs / 1000).toFixed(1)}s` +
        (result.tokensPerSec ? `, ${result.tokensPerSec.toFixed(0)} tok/s` : '') + ')' : '';
      console.log(`${icon} ${report.totalScore}/${report.maxScore} (${pct}%)${latency}`);

      if (verbose) {
        const preview = result.cleanResponse.slice(0, 300).replace(/\n/g, '\\n');
        console.log(`     Response: ${preview}${result.cleanResponse.length > 300 ? '...' : ''}`);
      }

      // Show failed checks
      if (!report.passed || verbose) {
        for (const d of report.details) {
          if (!d.passed) {
            console.log(`     ✗ ${d.check}: ${d.message}`);
          }
        }
      }
    }

    allScores.set(model, modelScores);
  }

  // ---------------------------------------------------------------------------
  // Summary comparison table
  // ---------------------------------------------------------------------------
  if (models!.length > 1) {
    console.log(`\n\n═══ COMPARISON TABLE ═══\n`);

    // Header
    const catWidth = 20;
    const modelWidth = 16;
    const header = 'Category/Test'.padEnd(catWidth) + models!.map(m => m.slice(0, modelWidth).padStart(modelWidth)).join('');
    console.log(header);
    console.log('─'.repeat(header.length));

    // Group by category
    const categories = [...new Set(activeScenarios.map(s => s.category))];
    for (const cat of categories) {
      const catScenarios = activeScenarios.filter(s => s.category === cat);
      for (const scenario of catScenarios) {
        let row = `${scenario.id}`.slice(0, catWidth - 1).padEnd(catWidth);
        for (const model of models!) {
          const scores = allScores.get(model)!;
          const report = scores.find(s => s.scenario === scenario.id);
          if (!report) {
            row += '-'.padStart(modelWidth);
          } else {
            const pct = report.maxScore > 0 ? Math.round((report.totalScore / report.maxScore) * 100) : 0;
            const icon = report.passed ? '✅' : pct >= 50 ? '⚠️' : '❌';
            row += `${icon}${pct}%`.padStart(modelWidth);
          }
        }
        console.log(row);
      }
    }

    // Totals
    console.log('─'.repeat(header.length));
    let totalsRow = 'TOTAL'.padEnd(catWidth);
    for (const model of models!) {
      const scores = allScores.get(model)!;
      const total = scores.reduce((s, r) => s + r.totalScore, 0);
      const max = scores.reduce((s, r) => s + r.maxScore, 0);
      const pct = max > 0 ? Math.round((total / max) * 100) : 0;
      totalsRow += `${pct}%`.padStart(modelWidth);
    }
    console.log(totalsRow);

    // Avg latency
    let latencyRow = 'Avg Latency'.padEnd(catWidth);
    for (const model of models!) {
      const results = allResults.filter(r => r.model === model && !r.error);
      const avg = results.length > 0
        ? results.reduce((s, r) => s + r.latencyMs, 0) / results.length
        : 0;
      latencyRow += `${(avg / 1000).toFixed(1)}s`.padStart(modelWidth);
    }
    console.log(latencyRow);

    // Avg tokens/sec
    let tpsRow = 'Avg tok/s'.padEnd(catWidth);
    for (const model of models!) {
      const results = allResults.filter(r => r.model === model && r.tokensPerSec);
      const avg = results.length > 0
        ? results.reduce((s, r) => s + (r.tokensPerSec || 0), 0) / results.length
        : 0;
      tpsRow += `${avg > 0 ? avg.toFixed(0) : '-'}`.padStart(modelWidth);
    }
    console.log(tpsRow);
  }

  // Overall summary
  console.log(`\n`);
  for (const model of models!) {
    const scores = allScores.get(model)!;
    const passed = scores.filter(s => s.passed).length;
    const total = scores.length;
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    console.log(`${model}: ${passed}/${total} passed (${pct}%)`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
