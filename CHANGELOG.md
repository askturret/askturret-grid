# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-12

### Added
- `adaptiveFlash` opt-in prop and `useAdaptiveFlash(enabled)` gate for automatic FPS-adaptive flash throttling (#16)
- `rowClass` and `rowExitDuration` props for animated row removal / exit transitions (#15)

### Changed
- Project license switched from MIT to Apache License 2.0, with a new NOTICE file (#17)

## [0.1.6] - 2024-12-23

### Added
- **Three-engine architecture**: Choose between Worker, WASM, or pure JS
  - `WorkerGridStore`: Web Worker for non-blocking real-time updates
  - `WasmGridStore`: WASM-accelerated filtering with trigram indexing
  - `JsGridStore`: Zero-dependency JavaScript fallback
- **`useGridStore` hook**: Unified API for selecting and using grid stores
- **Interactive benchmarks page**: Test different workload patterns on your machine
  - Real-time streaming (200 updates/frame)
  - Large batch updates (10k/frame)
  - Filter + updates combined
  - Mixed workload scenarios

### Changed
- Repositioned marketing from "WASM-first" to "pick your architecture"
- Landing page now emphasizes architecture choice over specific benchmark numbers
- Benchmark page removes hardcoded results in favor of live testing

## [0.1.5] - 2024-12-22

### Added
- **PositionLadder component**: DOM-style price ladder with click-to-trade
- **TimeSales component**: Trade tape with large trade highlighting
- Header with AskTurret logo and navigation

### Changed
- Updated favicon and theme color to AskTurret brand (#22c55e)

## [0.1.4] - 2024-12-20

### Added
- **Column resizing**: Drag column borders to resize with min/max limits
- **Column reordering**: Drag & drop column headers to reorder
- **CSV export**: `exportToCSV()` utility with proper escaping and BOM

## [0.1.3] - 2024-12-18

### Added
- **TopMovers component**: Gainers/losers display with periodic ranking
- **OrderBook component**: Level 2 market depth with bid/ask depth bars

### Fixed
- Flash highlighting performance on large datasets

## [0.1.2] - 2024-12-15

### Added
- WASM GridCore with trigram indexing for instant filtering
- Adaptive flash highlighting (auto-disables when FPS drops)

### Changed
- Virtualization now auto-enables at 100+ rows

## [0.1.1] - 2024-12-12

### Fixed
- TypeScript type exports
- CSS bundle path in package exports

## [0.1.0] - 2024-12-10

### Added
- Initial release
- **DataGrid component** with virtualization
- Flash highlighting for numeric value changes
- Sorting and filtering
- TypeScript support with full type inference
- Dark theme with CSS variables

[0.2.0]: https://github.com/askturret/askturret-grid/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/alprimak/askturret-grid/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/alprimak/askturret-grid/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/alprimak/askturret-grid/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/alprimak/askturret-grid/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/alprimak/askturret-grid/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/alprimak/askturret-grid/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/alprimak/askturret-grid/releases/tag/v0.1.0
