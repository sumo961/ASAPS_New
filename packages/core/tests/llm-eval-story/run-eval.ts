#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';
/**
 * Story Generation LLM Evaluation Harness
 *
 * Tests whether small LLMs can generate structurally valid ASAPS stories.
 *
 * Usage:
 *   npx tsx packages/core/tests/llm-eval-story/run-eval.ts --model gemma3:4b
 *   npx tsx packages/core/tests/llm-eval-story/run-eval.ts --compare gemma3:4b,ministral-3:3b
 */

import { storyScenarios, STORY_GENERATION_SYSTEM, type StoryScenario, type StoryResult } from './scenarios.js';
import { scoreStory, type StoryScoreReport } from './scoring.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const endpoint = getArg('endpoint') || 'http://localhost:11434';
const singleModel = getArg('model');
const compareModels = getArg('compare')?.split(',').map(m => m.trim());
const filterScenario = getArg('scenario');
const verbose = args.includes('--verbose');
const timeout = parseInt(getArg('timeout') || '180000', 10);
const numCtx = parseInt(getArg('context') || '0', 10); // Ollama context window size (0 = default)
const noThink = args.includes('--no-think'); // Prepend /no_think to disable thinking mode
const saveDir = getArg('save'); // Directory to save responses for quality review

const models = compareModels || (singleModel ? [singleModel] : null);

if (!models) {
  console.log(`
ASAPS Story Generation LLM Evaluation
=======================================

Usage:
  npx tsx packages/core/tests/llm-eval-story/run-eval.ts --model <name> [options]
  npx tsx packages/core/tests/llm-eval-story/run-eval.ts --compare <model1>,<model2>,... [options]

Options:
  --model <name>       Single model to test
  --compare <models>   Comma-separated models for comparison
  --endpoint <url>     Ollama endpoint (default: http://localhost:11434)
  --scenario <id>      Only run one scenario (story-linear, story-dialog, etc.)
  --timeout <ms>       Request timeout (default: 180000 — story gen is slower)
  --verbose            Show response previews and all check details

Scenarios:
${storyScenarios.map(s => `  ${s.id.padEnd(20)} ${s.description}`).join('\n')}
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Ollama client
// ---------------------------------------------------------------------------
async function chatCompletion(
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<{ text: string; latencyMs: number; tokensPerSec?: number }> {
  // Use native Ollama API when context size is specified
  // (the OpenAI-compatible endpoint ignores num_ctx)
  if (numCtx > 0) {
    return chatCompletionNative(model, messages, maxTokens);
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
    // Some thinking models (qwen3.5, etc.) put output in 'reasoning' with empty 'content'
    const text = msg?.content || msg?.reasoning || '';
    const totalTokens = data.usage?.completion_tokens || 0;
    const tokensPerSec = totalTokens > 0 ? (totalTokens / (latencyMs / 1000)) : undefined;

    return { text, latencyMs, tokensPerSec };
  } finally {
    clearTimeout(timer);
  }
}

/** Native Ollama API — supports num_ctx for custom context window */
async function chatCompletionNative(
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<{ text: string; latencyMs: number; tokensPerSec?: number }> {
  const url = `${endpoint}/api/chat`;
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
        options: { num_ctx: numCtx, num_predict: maxTokens, temperature: 0.7 },
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
    const text = data.message?.content || '';
    const totalTokens = data.eval_count || 0;
    const tokensPerSec = totalTokens > 0 && data.eval_duration
      ? (totalTokens / (data.eval_duration / 1e9))
      : undefined;

    return { text, latencyMs, tokensPerSec };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip thinking blocks */
function stripThinking(text: string): string {
  let stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  stripped = stripped.replace(/```thinking[\s\S]*?```/gi, '');
  return stripped.trim();
}

// ---------------------------------------------------------------------------
// Run a scenario
// ---------------------------------------------------------------------------
async function runScenario(model: string, scenario: StoryScenario): Promise<StoryResult> {
  const lengthGuide = scenario.length === 'short'
    ? 'Create a SHORT story (5-10 beats).'
    : 'Create a MEDIUM story (10-20 beats).';

  const userPrompt = `${scenario.prompt}\n\nGenre: ${scenario.genre || 'adventure'}\n${lengthGuide}\nComplexity: ${scenario.complexity}`;

  try {
    const { text: rawText, latencyMs, tokensPerSec } = await chatCompletion(
      model,
      [
        { role: 'system', content: (noThink ? '/no_think\n' : '') + STORY_GENERATION_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      // Thinking models need more output tokens (thinking counts toward num_predict)
      scenario.length === 'short' ? (numCtx > 0 ? 16384 : 4096) : (numCtx > 0 ? 32768 : 8192),
    );

    return {
      scenario: scenario.id,
      model,
      rawResponse: rawText,
      cleanResponse: stripThinking(rawText),
      latencyMs,
      tokensPerSec,
    };
  } catch (err) {
    return {
      scenario: scenario.id,
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
  const active = filterScenario
    ? storyScenarios.filter(s => s.id === filterScenario)
    : storyScenarios;

  if (active.length === 0) {
    console.error(`No scenario found${filterScenario ? ` with id "${filterScenario}"` : ''}`);
    process.exit(1);
  }

  console.log(`\n📖 ASAPS Story Generation Evaluation`);
  console.log(`   Models: ${models!.join(', ')}`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Scenarios: ${active.length}`);
  console.log(`   Timeout: ${timeout}ms\n`);

  const allResults: StoryResult[] = [];
  const allScores = new Map<string, StoryScoreReport[]>();

  for (const model of models!) {
    console.log(`\n━━━ ${model} ━━━`);
    const modelScores: StoryScoreReport[] = [];

    for (const scenario of active) {
      process.stdout.write(`  ${scenario.id} ... `);

      const result = await runScenario(model, scenario);
      allResults.push(result);

      if (result.error) {
        console.log(`❌ ERROR: ${result.error.slice(0, 80)}`);
        modelScores.push({
          scenario: scenario.id, model, passed: false,
          totalScore: 0, maxScore: 0,
          details: [{ check: 'request', passed: false, message: result.error, weight: 5 }],
          latencyMs: 0, beatCount: 0, beatTypes: [],
        });
        continue;
      }

      const report = scoreStory(scenario, result);
      modelScores.push(report);

      const pct = report.maxScore > 0 ? Math.round((report.totalScore / report.maxScore) * 100) : 0;
      const icon = report.passed ? '✅' : pct >= 50 ? '⚠️' : '❌';
      const latency = `(${(result.latencyMs / 1000).toFixed(1)}s`;
      const tps = result.tokensPerSec ? `, ${result.tokensPerSec.toFixed(0)} tok/s` : '';
      console.log(`${icon} ${report.totalScore}/${report.maxScore} (${pct}%) ${latency}${tps}) [${report.beatCount} beats: ${report.beatTypes.join(', ')}]`);

      // Show failed checks
      if (!report.passed || verbose) {
        for (const d of report.details) {
          if (!d.passed || verbose) {
            const mark = d.passed ? '✓' : '✗';
            console.log(`     ${mark} ${d.check}: ${d.message}`);
          }
        }
      }

      if (verbose && result.cleanResponse) {
        const preview = result.cleanResponse.slice(0, 200).replace(/\n/g, '\\n');
        console.log(`     Preview: ${preview}...`);
      }
    }

    allScores.set(model, modelScores);
  }

  // ---------------------------------------------------------------------------
  // Comparison table
  // ---------------------------------------------------------------------------
  if (models!.length > 1) {
    console.log(`\n\n═══ COMPARISON TABLE ═══\n`);

    const colW = 16;
    const nameW = 22;
    const header = 'Scenario'.padEnd(nameW) + models!.map(m => m.slice(0, colW).padStart(colW)).join('');
    console.log(header);
    console.log('─'.repeat(header.length));

    for (const scenario of active) {
      let row = scenario.id.slice(0, nameW - 1).padEnd(nameW);
      for (const model of models!) {
        const report = allScores.get(model)!.find(r => r.scenario === scenario.id);
        if (!report) {
          row += '-'.padStart(colW);
        } else {
          const pct = report.maxScore > 0 ? Math.round((report.totalScore / report.maxScore) * 100) : 0;
          const icon = report.passed ? '✅' : pct >= 50 ? '⚠️' : '❌';
          row += `${icon}${pct}%`.padStart(colW);
        }
      }
      console.log(row);
    }

    console.log('─'.repeat(header.length));

    // Totals
    let totalsRow = 'TOTAL'.padEnd(nameW);
    for (const model of models!) {
      const scores = allScores.get(model)!;
      const total = scores.reduce((s, r) => s + r.totalScore, 0);
      const max = scores.reduce((s, r) => s + r.maxScore, 0);
      totalsRow += `${max > 0 ? Math.round((total / max) * 100) : 0}%`.padStart(colW);
    }
    console.log(totalsRow);

    // Latency
    let latRow = 'Avg Latency'.padEnd(nameW);
    for (const model of models!) {
      const results = allResults.filter(r => r.model === model && !r.error);
      const avg = results.length > 0 ? results.reduce((s, r) => s + r.latencyMs, 0) / results.length : 0;
      latRow += `${(avg / 1000).toFixed(1)}s`.padStart(colW);
    }
    console.log(latRow);
  }

  // Summary
  console.log(`\n`);
  for (const model of models!) {
    const scores = allScores.get(model)!;
    const passed = scores.filter(s => s.passed).length;
    console.log(`${model}: ${passed}/${scores.length} passed (${Math.round((passed / scores.length) * 100)}%)`);
  }

  // Save responses and generate HTML report
  if (saveDir) {
    fs.mkdirSync(saveDir, { recursive: true });

    const responsesFile = path.join(saveDir, 'responses.json');
    fs.writeFileSync(responsesFile, JSON.stringify(allResults, null, 2));
    console.log(`\n📁 Responses saved to ${responsesFile}`);

    const htmlFile = path.join(saveDir, 'report.html');
    const html = generateStoryHTMLReport(active, allResults, allScores, models!);
    fs.writeFileSync(htmlFile, html);
    console.log(`📊 HTML report: ${htmlFile}`);
  }
}

function generateStoryHTMLReport(
  scenarios: StoryScenario[],
  results: StoryResult[],
  scores: Map<string, StoryScoreReport[]>,
  models: string[],
): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');

  let rows = '';
  for (const scenario of scenarios) {
    rows += `<tr class="scenario-header"><td colspan="${models.length + 1}"><strong>${esc(scenario.id)}</strong> — ${esc(scenario.description)}<br><em>${esc(scenario.prompt.slice(0, 120))}...</em></td></tr>\n`;
    rows += '<tr><td class="label">Response</td>';
    for (const model of models) {
      const result = results.find(r => r.model === model && r.scenario === scenario.id);
      const report = scores.get(model)?.find(s => s.scenario === scenario.id);
      const pct = report && report.maxScore > 0 ? Math.round((report.totalScore / report.maxScore) * 100) : 0;
      const icon = report?.passed ? '✅' : pct >= 50 ? '⚠️' : '❌';
      const latency = result?.latencyMs ? `${(result.latencyMs / 1000).toFixed(1)}s` : '-';
      const beats = report ? `${report.beatCount} beats: ${report.beatTypes.join(', ')}` : '';

      if (result?.error) {
        rows += `<td class="response error"><div class="score">${icon} ERROR · ${latency}</div><pre>${esc(result.error)}</pre></td>`;
      } else {
        // Pretty-print JSON if possible
        let display = result?.cleanResponse || '(empty)';
        try { display = JSON.stringify(JSON.parse(display), null, 2); } catch {}
        rows += `<td class="response"><div class="score">${icon} ${pct}% · ${latency} · ${beats}</div>`;
        // Show failed checks
        if (report) {
          const fails = report.details.filter(d => !d.passed);
          if (fails.length > 0) {
            rows += `<div class="fails">${fails.map(f => `✗ ${esc(f.check)}: ${esc(f.message)}`).join('<br>')}</div>`;
          }
        }
        rows += `<pre>${esc(display)}</pre></td>`;
      }
    }
    rows += '</tr>\n';
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ASAPS Story Gen Eval — ${ts}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 20px; background: #f8f9fa; }
  h1 { font-size: 1.4em; }
  table { border-collapse: collapse; width: 100%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  th, td { border: 1px solid #dee2e6; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #343a40; color: white; position: sticky; top: 0; }
  .scenario-header { background: #e9ecef; }
  .label { font-weight: 600; width: 80px; background: #f1f3f5; }
  .response { min-width: 400px; }
  .response pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; max-height: 600px; overflow-y: auto; margin: 4px 0 0; }
  .response.error pre { color: #c00; }
  .score { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .fails { font-size: 11px; color: #c00; margin: 4px 0; }
</style></head><body>
<h1>📖 ASAPS Story Generation Evaluation — ${ts}</h1>
<table>
<tr><th>Scenario</th>${models.map(m => `<th>${esc(m)}</th>`).join('')}</tr>
${rows}
</table></body></html>`;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
