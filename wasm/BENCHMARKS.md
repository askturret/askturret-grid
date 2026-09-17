# WASM Performance Benchmarks

## Overview

This directory contains performance benchmarks for the WASM trigram filter optimizations.

## Benchmarks

### 1. `bench_intersect_heavy_filter`
Tests sorted-vec posting list intersection performance.
- Creates 10K rows with overlapping trigrams
- Executes multi-trigram query: "performance optimization"
- Measures time to intersect multiple posting lists

### 2. `bench_row_matching`
Tests case-insensitive substring matching performance.
- Creates 10K rows with mixed-case text
- Executes query: "quick" (matches many rows)
- Measures time for row verification with case-insensitive matching

## Running Benchmarks

### Prerequisites
```bash
# Install wasm-pack
cargo install wasm-pack

# Or via npm
npm install -g wasm-pack
```

### Build and Run
```bash
# Build WASM for Node.js
npm run build:nodejs

# Run benchmarks
node bench.mjs
```

### Expected Output
```
============================================================
WASM Trigram Performance Benchmarks
============================================================

1. INTERSECT-HEAVY FILTER (Multi-trigram query)
   Tests: Sorted Vec posting list intersection
   Data: 10,000 rows with overlapping trigrams
   Query: "performance optimization" (2 trigrams)
   Average: XX.XXms
   Min: XX.XXms
   Max: XX.XXms

2. ROW MATCHING (Case-insensitive contains)
   Tests: Zero-allocation lowercase comparison
   Data: 10,000 rows with mixed-case text
   Query: "quick" (matches many rows)
   Average: XX.XXms
   Min: XX.XXms
   Max: XX.XXms
============================================================
```

## Performance Notes

Actual performance numbers depend on:
- CPU architecture and speed
- Available memory
- JavaScript engine (V8, SpiderMonkey, etc.)
- System load

Benchmarks are designed to show **relative** improvements between implementations,
not absolute performance.

## Optimizations Tested

### Sorted Vec Posting Lists
- **Before**: `HashMap<String, HashSet<u32>>`
- **After**: `HashMap<String, Vec<u32>>` (sorted)
- **Benefit**: Merge-based intersection O(n+m) vs clone+intersect

### Case-Insensitive Matching
- **Before**: `text.to_lowercase().contains(filter)` (allocates String per row)
- **After**: Iterator-based with ASCII fast path
- **Benefit**: Minimal allocation for ASCII, proper Unicode handling for non-ASCII
