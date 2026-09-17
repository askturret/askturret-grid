#!/usr/bin/env node
import { statSync } from 'node:fs';

const WASM_PATH = 'wasm/pkg/askturret_grid_wasm_bg.wasm';
const LIMIT_KB = 100;

try {
  const stats = statSync(WASM_PATH);
  const sizeKB = Math.round(stats.size / 1024);

  console.log(`WASM binary size: ${sizeKB} KB`);

  if (sizeKB > LIMIT_KB) {
    console.error(`❌ WASM size exceeds limit: ${sizeKB} KB > ${LIMIT_KB} KB`);
    process.exit(1);
  }

  console.log(`✓ WASM size within limit: ${sizeKB} KB <= ${LIMIT_KB} KB`);
} catch (err) {
  console.error(`Failed to check WASM size: ${err.message}`);
  process.exit(1);
}
