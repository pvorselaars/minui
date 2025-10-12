// Comprehensive benchmark for MinUI component mounting and updates
// Run with: bun bench/benchmark.js

import { component, __minui_profiler__ } from '../component';
import { Window } from 'happy-dom';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// Setup happy-dom environment
const window = new Window();
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLInputElement = window.HTMLInputElement;
globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
globalThis.HTMLSelectElement = window.HTMLSelectElement;
globalThis.customElements = window.customElements;
globalThis.Node = window.Node;
globalThis.CustomEvent = window.CustomEvent;
globalThis.document = window.document;
globalThis.window = window;

function now() {
  return (globalThis.performance && typeof globalThis.performance.now === 'function')
    ? globalThis.performance.now()
    : Date.now();
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function statsFromSamples(samples) {
  const n = samples.length;
  if (n === 0) return null;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  return { n, mean, std, min, max };
}

function printStats(label, samples) {
  const s = statsFromSamples(samples);
  if (!s) return console.log(`${label}: no samples`);
  console.log(`${label}: n=${s.n} mean=${s.mean.toFixed(3)}ms std=${s.std.toFixed(3)}ms min=${s.min.toFixed(3)}ms max=${s.max.toFixed(3)}ms`);
}

async function runOnce({ N, UPDATES, BATCH, factory }) {
  const items = Array.from({ length: N }, (_, i) => `Item ${i}`);
  const instance = factory({ items });

  // mount
  const t0 = now();
  instance.mount(document.body);
  await flushMicrotasks();
  const t1 = now();
  const mountMs = t1 - t0;

  // updates: random selects
  const updateSamples = [];
  for (let i = 0; i < UPDATES; i++) {
    const idx = Math.floor(Math.random() * N);
    const s = now();
    instance.state.selected = idx;
    await flushMicrotasks();
    const e = now();
    updateSamples.push(e - s);
  }

  // batch updates
  const batchSamples = [];
  for (let k = 0; k < 5; k++) {
    const s = now();
    for (let i = 0; i < BATCH; i++) instance.state.items[i] = `Updated ${k}-${i}`;
    await flushMicrotasks();
    const e = now();
    batchSamples.push(e - s);
  }

  // push/pop single
  const pushStart = now();
  instance.state.items.push('new item');
  await flushMicrotasks();
  const pushEnd = now();
  const pushMs = pushEnd - pushStart;

  const popStart = now();
  instance.state.items.pop();
  await flushMicrotasks();
  const popEnd = now();
  const popMs = popEnd - popStart;

  // batch push/pop
  const batchPushSamples = [];
  for (let k = 0; k < 5; k++) {
    const s = now();
    for (let i = 0; i < BATCH; i++) instance.state.items.push(`batch ${k}-${i}`);
    await flushMicrotasks();
    const e = now();
    batchPushSamples.push(e - s);
    for (let i = 0; i < BATCH; i++) instance.state.items.pop();
    await flushMicrotasks();
  }

  // unmount
  const unmountStart = now();
  instance.unmount();
  await flushMicrotasks();
  const unmountEnd = now();
  const unmountMs = unmountEnd - unmountStart;

  return { mountMs, updateSamples, batchSamples, pushMs, popMs, batchPushSamples, unmountMs };
}

async function runBenchmark() {
  const N = Number(process.env.BENCH_N ?? 1000);
  const UPDATES = Number(process.env.BENCH_UPDATES ?? 200);
  const RUNS = Number(process.env.BENCH_RUNS ?? 5);
  const WARMUP = Number(process.env.BENCH_WARMUP ?? 1);
  const BATCH = Number(process.env.BENCH_BATCH ?? Math.max(10, Math.floor(N / 100)));

  console.log(`Benchmark config: N=${N} UPDATES=${UPDATES} RUNS=${RUNS} WARMUP=${WARMUP} BATCH=${BATCH}`);

  const template = `
    <div>
      <div for="item, i in items" class="{i === selected ? 'selected' : ''}">{item}</div>
    </div>
  `;

  const factory = component('bench-list', template, (input) => ({ items: input?.items ?? [], selected: -1 }));

  // warmup
  for (let w = 0; w < WARMUP; w++) await runOnce({ N, UPDATES: Math.max(10, Math.floor(UPDATES / 10)), BATCH, factory });

  const mountSamples = [];
  const updateMeans = [];
  const batchMeans = [];
  const pushSamples = [];
  const popSamples = [];
  const batchPushMeans = [];
  const unmountSamples = [];

  for (let r = 0; r < RUNS; r++) {
    const res = await runOnce({ N, UPDATES, BATCH, factory });
    mountSamples.push(res.mountMs);
    updateMeans.push(res.updateSamples.reduce((a, b) => a + b, 0) / res.updateSamples.length);
    batchMeans.push(res.batchSamples.reduce((a, b) => a + b, 0) / res.batchSamples.length);
    pushSamples.push(res.pushMs);
    popSamples.push(res.popMs);
    batchPushMeans.push(res.batchPushSamples.reduce((a, b) => a + b, 0) / res.batchPushSamples.length);
    unmountSamples.push(res.unmountMs);
  }

  console.log('\n=== Aggregated results ===');
  printStats('mount', mountSamples);
  printStats('updates (mean per-select)', updateMeans);
  printStats('batch updates (mean per-batch)', batchMeans);
  printStats('push single', pushSamples);
  printStats('pop single', popSamples);
  printStats('batch push (mean per-batch)', batchPushMeans);
  printStats('unmount', unmountSamples);

  try {
    if (__minui_profiler__ && __minui_profiler__.enabled) {
      console.log('\n--- profiler snapshot ---');
      console.log(JSON.stringify(__minui_profiler__.snapshot(), null, 2));
    }
  } catch (e) {
    console.error('Profiler snapshot failed', e && e.stack ? e.stack : e);
  }

  // return aggregated data for persistence
  return {
    config: { N, UPDATES, RUNS, WARMUP, BATCH },
    mountSamples,
    updateMeans,
    batchMeans,
    pushSamples,
    popSamples,
    batchPushMeans,
    unmountSamples,
    // include profiler snapshot data if available for later persistence
    __profiler__: (__minui_profiler__ && typeof __minui_profiler__.snapshot === 'function')
      ? (__minui_profiler__.enabled ? __minui_profiler__.snapshot() : null)
      : null
  };
}

try { if (__minui_profiler__) __minui_profiler__.enabled = !!process.env.MINUI_PROFILER || __minui_profiler__.enabled; } catch (e) {}

const results = await runBenchmark();

  // Persist aggregated results

  function makeSummaryObject(config, metrics) {
    return {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      config,
      metrics
    };
  }

  function persistResults(filePath, summary) {
    try {
      let current = [];
      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath, 'utf8');
          current = JSON.parse(raw) || [];
        } catch (e) {
          // if the file is corrupt, overwrite
          current = [];
        }
      }
      current.push(summary);
      writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf8');
      console.log(`Persisted results to ${filePath}`);
    } catch (e) {
      console.error('Failed to persist benchmark results', e && e.stack ? e.stack : e);
    }
  }

  // Build and persist final summary
  try {
    const resultsFile = process.env.BENCH_RESULTS_FILE ?? 'bench/results.json';
    const config = results.config;
    const metrics = {
      mount: statsFromSamples(results.mountSamples || []) || null,
      updates_mean_ms: statsFromSamples(results.updateMeans || []) || null,
      batch_mean_ms: statsFromSamples(results.batchMeans || []) || null,
      push_single: statsFromSamples(results.pushSamples || []) || null,
      pop_single: statsFromSamples(results.popSamples || []) || null,
      batch_push_mean_ms: statsFromSamples(results.batchPushMeans || []) || null,
      unmount: statsFromSamples(results.unmountSamples || []) || null
    };

    // attach profiler snapshot if present
    const profiler = results.__profiler__ ?? null;

  const summary = makeSummaryObject(config, { ...metrics, profiler });
    persistResults(resultsFile, summary);
  } catch (e) {
    console.error('Error while persisting benchmark results', e && e.stack ? e.stack : e);
  }
