#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load WASM module
const wasmPath = join(__dirname, 'pkg-node', 'askturret_grid_wasm_bg.wasm');
const wasmBuffer = await readFile(wasmPath);
const wasmModule = await WebAssembly.instantiate(wasmBuffer);

// Import the module
const pkgPath = join(__dirname, 'pkg-node', 'askturret_grid_wasm.js');
const wasm = await import(pkgPath);

// Helper to run benchmark multiple times and get average
function runBench(name, fn, iterations = 5) {
    const times = [];

    // Warmup
    fn();
    fn();

    // Measure
    for (let i = 0; i < iterations; i++) {
        const time = fn();
        times.push(time);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(`\n${name}:`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms`);
    console.log(`  Samples: ${times.map(t => t.toFixed(2)).join(', ')}ms`);

    return avg;
}

console.log('='.repeat(60));
console.log('WASM Trigram Performance Benchmarks');
console.log('='.repeat(60));

// Benchmark 1: Intersect-heavy filter (sorted-vec optimization)
console.log('\n1. INTERSECT-HEAVY FILTER (Multi-trigram query)');
console.log('   Tests: Sorted Vec posting list intersection');
console.log('   Data: 10,000 rows with overlapping trigrams');
console.log('   Query: "performance optimization" (2 trigrams)');
runBench('   10K rows', () => wasm.bench_intersect_heavy_filter(10000));

// Benchmark 2: Row matching (case-insensitive contains)
console.log('\n2. ROW MATCHING (Case-insensitive contains)');
console.log('   Tests: Zero-allocation lowercase comparison');
console.log('   Data: 10,000 rows with mixed-case text');
console.log('   Query: "quick" (matches many rows)');
runBench('   10K rows', () => wasm.bench_row_matching(10000));

console.log('\n' + '='.repeat(60));
console.log('Benchmark complete');
console.log('='.repeat(60) + '\n');
