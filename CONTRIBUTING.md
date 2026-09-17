# Contributing to AskTurret Grid

Thank you for your interest in contributing! This document provides guidelines for development setup and contributions.

## Development Setup

### Prerequisites

- Node.js 20.x or later
- npm 10.x or later

### Initial Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
   This will automatically set up Git hooks via Husky.

3. Build the package:
   ```bash
   npm run build
   ```

## Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) to automatically format code before commits.

### Pre-commit Hook

When you commit changes, the pre-commit hook will:
- Run Prettier on staged `.ts`, `.tsx`, and `.css` files
- Automatically format and re-stage the files
- Only process files you've actually changed (fast, typically < 2 seconds)

This prevents formatting issues from being caught late in CI, saving round-trip time.

### Manual Formatting

You can also format files manually:

```bash
# Format all source files
npm run format

# Check formatting without making changes
npm run format:check
```

## Testing

```bash
# Run tests in watch mode
npm test

# Run all tests once
npm run test:run

# Run cross-browser tests (Firefox)
npm run test:browser

# Run tests with coverage
npm run test:coverage
```

## Code Style

- TypeScript for all source code
- Prettier for formatting (configured in `.prettierrc`)
- Single quotes, 2-space indentation, 110-character line width
- The pre-commit hook ensures consistency automatically

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass: `npm run test:run`
4. Ensure types check: `npm run lint`
5. The pre-commit hook will format your code automatically
6. Push your branch and create a pull request
7. Wait for CI checks to pass (formatting, tests, bundle size)

## Bundle Size

This project enforces bundle size limits via `size-limit`:
- Main bundle (JS): 30 KB gzipped
- Styles (CSS): 5 KB gzipped

Check bundle size locally:
```bash
npm run size
```

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
