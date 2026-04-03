#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';
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
const saveDir = getArg('save'); // Directory to save responses for quality review

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

  // Save responses and generate HTML report
  if (saveDir) {
    fs.mkdirSync(saveDir, { recursive: true });

    // Save raw responses as JSON
    const responsesFile = path.join(saveDir, 'responses.json');
    fs.writeFileSync(responsesFile, JSON.stringify(allResults, null, 2));
    console.log(`\n📁 Responses saved to ${responsesFile}`);

    // Generate HTML report
    const htmlFile = path.join(saveDir, 'report.html');
    const html = generateHTMLReport(activeScenarios, allResults, allScores, models!);
    fs.writeFileSync(htmlFile, html);
    console.log(`📊 HTML report: ${htmlFile}`);
  }
}

function generateHTMLReport(
  scenarios: TestScenario[],
  results: TestResult[],
  scores: Map<string, ScoreReport[]>,
  models: string[],
): string {
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');

  let rows = '';
  for (const scenario of scenarios) {
    rows += `<tr class="scenario-header"><td colspan="${models.length + 1}"><strong>${escHtml(scenario.category)} / ${escHtml(scenario.id)}</strong> — ${escHtml(scenario.description)}</td></tr>\n`;
    rows += `<tr class="prompt-row"><td colspan="${models.length + 1}"><details><summary>Prompt</summary><pre>${escHtml(scenario.userPrompt)}</pre></details></td></tr>\n`;
    rows += '<tr>';
    rows += '<td class="label">Response</td>';
    for (const model of models) {
      const result = results.find(r => r.model === model && r.scenario === scenario.id);
      const report = scores.get(model)?.find(s => s.scenario === scenario.id);
      const pct = report && report.maxScore > 0 ? Math.round((report.totalScore / report.maxScore) * 100) : 0;
      const icon = report?.passed ? '✅' : pct >= 50 ? '⚠️' : '❌';
      const latency = result?.latencyMs ? `${(result.latencyMs / 1000).toFixed(1)}s` : '-';

      if (result?.error) {
        rows += `<td class="response error"><div class="score">${icon} ERROR</div><pre>${escHtml(result.error)}</pre></td>`;
      } else {
        rows += `<td class="response"><div class="score">${icon} ${pct}% · ${latency}</div><pre>${escHtml(result?.cleanResponse || '(empty)')}</pre></td>`;
      }
    }
    rows += '</tr>\n';
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ASAPS LLM Beat Eval — ${ts}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 20px; background: #f8f9fa; }
  h1 { font-size: 1.4em; }
  table { border-collapse: collapse; width: 100%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  th, td { border: 1px solid #dee2e6; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #343a40; color: white; position: sticky; top: 0; }
  .scenario-header { background: #e9ecef; }
  .prompt-row td { background: #f8f9fa; }
  .label { font-weight: 600; width: 80px; background: #f1f3f5; }
  .response { min-width: 300px; max-width: 500px; }
  .response pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; max-height: 400px; overflow-y: auto; margin: 4px 0 0; }
  .response.error pre { color: #c00; }
  .score { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  details summary { cursor: pointer; color: #666; font-size: 12px; }
  details pre { font-size: 11px; color: #555; max-height: 200px; overflow-y: auto; }
</style></head><body>
<h1>🧪 ASAPS LLM Beat Evaluation — ${ts}</h1>
<table>
<tr><th>Scenario</th>${models.map(m => `<th>${escHtml(m)}</th>`).join('')}</tr>
${rows}
</table></body></html>`;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
