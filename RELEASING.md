# Release Process

This document outlines the release process for @askturret/grid and @askturret/grid-wasm.

## Versioning Strategy

Both packages follow [Semantic Versioning](https://semver.org/) and are **versioned in sync**:
- Root `package.json` version is the single source of truth
- `wasm/package.json` and `wasm/Cargo.toml` versions match the root version
- Breaking changes → MAJOR bump
- New features → MINOR bump  
- Bug fixes → PATCH bump

## Pre-Release Checklist

Before creating a release:

- [ ] All tests passing on main branch
- [ ] No blocking bugs for this release
- [ ] CHANGELOG updated (if maintained)
- [ ] Breaking changes documented (if any)

## Release Steps

### 1. Update Version Numbers

Update the version in ALL of the following files in a single commit:

- [ ] **Root `package.json`** - bump `version` field
- [ ] **`wasm/package.json`** - bump `version` field to match root
- [ ] **`wasm/Cargo.toml`** - bump `version` field to match root
- [ ] Verify all three versions match exactly

### 2. Commit Version Bump

```bash
git checkout -b chore/release-vX.Y.Z origin/main
# After editing the three files above:
git add package.json wasm/package.json wasm/Cargo.toml
git commit -m "chore(release): bump version to X.Y.Z"
git push origin chore/release-vX.Y.Z
```

### 3. Create and Merge PR

- Open a PR for the version bump branch
- Wait for CI to pass
- Get PR review and approval
- Merge the PR to main

### 4. Create Release Tag

After the version bump PR merges:

```bash
git checkout main
git pull origin main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

### 5. Verify Release Workflows

Monitor the following workflows triggered by the tag:

- [ ] **Publish package** (`publish.yml`) - publishes @askturret/grid to npm
- [ ] **Publish WASM** (`publish-wasm.yml`) - publishes @askturret/grid-wasm to npm
- [ ] Both workflows should complete successfully with provenance attestation

### 6. Verify on npm Registry

After workflows complete:

- [ ] Check [@askturret/grid on npm](https://www.npmjs.com/package/@askturret/grid)
  - Verify version matches release tag
  - Verify license shows "Apache-2.0"
  - Verify repository URL points to askturret/askturret-grid
- [ ] Check [@askturret/grid-wasm on npm](https://www.npmjs.com/package/@askturret/grid-wasm)
  - Verify version matches release tag
  - Verify license shows "Apache-2.0"
  - Verify repository URL points to askturret/askturret-grid
  - Run `npm audit signatures @askturret/grid-wasm@X.Y.Z` to verify provenance

## Hotfix Process

For urgent fixes to a released version:

1. Branch from the release tag:
   ```bash
   git checkout -b hotfix/issue-NNN vX.Y.Z
   ```

2. Make the fix and test thoroughly

3. Bump the patch version in all three files (package.json, wasm/package.json, wasm/Cargo.toml)

4. Open a PR, get it reviewed and merged

5. Tag the new version:
   ```bash
   git checkout main
   git pull origin main
   git tag -a vX.Y.Z+1 -m "Hotfix: description"
   git push origin vX.Y.Z+1
   ```

## Fixing a Failed Release

If a release workflow fails:

1. **DO NOT delete published releases** - check with the team first
2. **DO NOT re-use version numbers** - npm won't allow republishing the same version
3. **Fix the issue** on a new branch
4. **Bump to the next patch version** in all three files
5. **Follow the normal release process** above

## CI Guards

The following CI checks enforce version/license/repository parity:

- `test-wasm` job in `ci.yml` verifies:
  - `wasm/package.json.version == root package.json.version`
  - `wasm/Cargo.toml.version == root package.json.version`
  - Both wasm files have `license = "Apache-2.0"`
  - Both wasm files point to `askturret/askturret-grid` repository

These checks run on every PR to prevent drift.

## Notes

- The first Apache-2.0 WASM release is v0.2.2 (earlier versions on npm have stale MIT license text)
- Both packages are published with npm provenance attestation for supply chain security
- WASM package version has historically lagged behind the main package - this is now synchronized
