export default [
  {
    name: 'Main bundle (JS)',
    path: 'dist/index.js',
    limit: '30 KB',
    gzip: true,
  },
  {
    name: 'Styles (CSS)',
    path: 'dist/styles.css',
    limit: '5 KB',
    gzip: true,
  },
  {
    name: 'WASM binary',
    path: 'wasm/pkg/askturret_grid_wasm_bg.wasm',
    limit: '100 KB',
    // Use @size-limit/file plugin (no bundling - just measure file size)
    import: false,
  },
];
