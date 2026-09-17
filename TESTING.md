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

# Run cross-browser tests (Firefox via Playwright)
npm run test:browser

# Run tests with coverage report
npm run test:coverage

# Run tests with coverage in watch mode
npm run test:coverage:watch
```

### Cross-Browser Testing

Browser tests run a subset of the test suite in real browsers using Playwright. This validates that worker-based functionality works correctly across different JavaScript engines.

**Current Coverage:**
- **Browser**: Firefox (non-Chromium engine)
- **Test Scope**: Worker-related tests (`WorkerGridStore`, `useGridStore`)
- **CI**: Runs automatically on all PRs

**Rationale:**
- Firefox uses SpiderMonkey JavaScript engine (vs V8 in Chrome/Edge)
- Worker APIs can have subtle cross-browser differences
- Validates Web Worker communication patterns work universally

**Local Testing:**
```bash
# Install Playwright browsers first (one-time setup)
npx playwright install firefox

# Run browser tests
npm run test:browser
```

Browser tests use a separate config (`vitest.browser.config.ts`) to avoid conflicts with the faster jsdom-based unit tests.

### Coverage Thresholds

Current baseline thresholds (established in issue #41):

| Metric | Threshold |
|--------|-----------|
| Lines | 70% |
| Functions | 68% |
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

Vitest 2.x automatically installs the coverage provider (`@vitest/coverage-v8`) on demand when you run coverage scripts. No manual installation required.

### CI Integration

**Test Matrix:**
- **React Versions**: 18.x and 19.x (peerDependencies support both)
- **Browsers**: jsdom (main tests) + Firefox via Playwright (browser tests)
- **Node**: 20.x on Ubuntu

The CI pipeline runs:

1. **Matrix tests**: All tests against React 18 and React 19
2. **Browser tests**: Worker tests in Firefox (cross-engine validation)
3. **Build validation**: Ensures package builds successfully
4. **Format & type checks**: Prettier and TypeScript validation

Coverage reports are generated and can be:
- Uploaded as CI artifacts
- Parsed from `coverage/lcov.info` for PR comments
- Used to enforce thresholds (Vitest fails the build if not met)

### Future Improvements

Consider adding coverage for:
- `WorkerGridStore` (has basic tests, could use more edge cases)
- `useGridStore` hook (has basic tests for #34 regression, could use more state transition coverage)
- Additional trading components (PositionLadder, TimeSales)
- CSV utilities
- Additional WASM integration scenarios
