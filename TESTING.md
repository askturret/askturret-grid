# Testing & Coverage Guide

## Test Coverage Baseline

This document establishes the test coverage baseline for the engine layer modules added in issue #41.

### Covered Modules

The following modules now have comprehensive test coverage:

#### Utils
- **formatters** (`src/utils/formatters.ts`) - Pure formatting functions for price, quantity, time, P&L, percentage, and compact notation
  - Edge case coverage: null/undefined/NaN handling, boundary values, sign handling
  - Tests: `src/utils/formatters.test.ts`

#### WASM Engine Layer
- **GridCore** (`src/wasm/GridCore.ts`) - WASM/JS hybrid grid state manager
  - State transition coverage: setData, setSort, setFilter
  - JS fallback logic testing (WASM mocked in tests)
  - View computation and cache invalidation
  - Tests: `src/wasm/GridCore.test.ts`

- **WasmGridStore** (`src/wasm/WasmGridStore.ts`) - WASM-backed data store
  - Initialization and error handling
  - Listener management and cleanup
  - API contract validation
  - Tests: `src/wasm/WasmGridStore.test.ts`

#### Trading Components
- **OrderBook** (`src/OrderBook.tsx`) - Level 2 order book display
  - Flash state transitions on quantity changes
  - Spread calculation logic
  - Depth bar scaling
  - Price level click callbacks
  - Tests: `src/OrderBook.test.tsx`

- **TopMovers** (`src/TopMovers.tsx`) - Top gainers/losers widget
  - Gainer/loser classification logic
  - Interval-based ranking updates (not real-time)
  - Rank change detection and flash state
  - Previous rank tracking
  - Tests: `src/TopMovers.test.tsx`

### Running Tests

```bash
# Run all tests in watch mode
npm test

# Run all tests once
npm run test:run

# Run tests with coverage report
npm run test:coverage

# Run tests with coverage in watch mode
npm run test:coverage:watch
```

### Coverage Thresholds

Current baseline thresholds (established in issue #41):

| Metric | Threshold |
|--------|-----------|
| Lines | 70% |
| Functions | 70% |
| Branches | 60% |
| Statements | 70% |

These thresholds apply to the `src/**/*.{ts,tsx}` codebase (excluding tests and mocks).

### Coverage Reports

Coverage reports are generated in the following formats:
- **Text**: Console output showing coverage summary
- **HTML**: Interactive report at `coverage/index.html`
- **JSON**: Machine-readable data at `coverage/coverage-final.json`
- **LCOV**: Standard format at `coverage/lcov.info` (for CI integration)

### Test Quality Standards

Based on lessons from QA on #34/#35, all tests must meet these criteria:

1. **Meaningful assertions**: Tests must include real `expect()` calls that verify behavior
2. **State transition coverage**: Tests must exercise actual state changes, not just happy-path rendering
3. **Edge case coverage**: Tests must include boundary values, null/undefined/NaN handling, and error cases
4. **Dependency/ordering coverage**: Tests must verify ordering logic, concurrent operations, and timing-sensitive behavior

❌ **Avoid:**
- Tests with zero `expect()` calls (unconditional passes)
- Tests that never toggle the state they claim to exercise
- Pure rendering smoke tests without state verification
- Tests that only verify a component renders without errors

✅ **Prefer:**
- Tests that verify specific output values match expected results
- Tests that verify state transitions occur correctly
- Tests that verify callbacks are invoked with correct arguments
- Tests that exercise edge cases and error paths

### Dependencies

Coverage requires the `@vitest/coverage-v8` package:

```bash
npm install --save-dev @vitest/coverage-v8
```

This should be installed automatically when running coverage scripts.

### CI Integration

The coverage report can be integrated into CI pipelines by:

1. Running `npm run test:coverage` in CI
2. Uploading the `coverage/` directory as artifacts
3. Parsing `coverage/lcov.info` for PR comments or status checks
4. Failing the build if thresholds are not met (enforced by Vitest config)

### Future Improvements

Consider adding coverage for:
- `WorkerGridStore` (has basic tests, could use more edge cases)
- `useGridStore` hook (has basic tests for #34 regression, could use more state transition coverage)
- Additional trading components (PositionLadder, TimeSales)
- CSV utilities
- Additional WASM integration scenarios
