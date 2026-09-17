module.exports = [
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
];
