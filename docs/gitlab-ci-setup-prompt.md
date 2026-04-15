# GitLab CI/CD Setup Prompt

Copy the prompt below and give it to your AI coding agent. Replace the placeholder values marked with `[CHANGE]` before running.

---

## Prompt

Set up a comprehensive GitLab CI/CD pipeline with security scanning for my project. This is a Node.js/TypeScript project. Here's exactly what I need:

### 1. GitLab CI Pipeline (`.gitlab-ci.yml`)

Create a 7-stage pipeline with these stages in order:

1. **install** — `npm ci` with node_modules cached by `package-lock.json` hash. Export node_modules as an artifact (1 hour expiry) so downstream jobs don't re-install.
2. **security** — Three parallel jobs:
   - **gitleaks**: Secret scanning using `zricethezav/gitleaks:latest` image. Run `gitleaks detect --source . --verbose --redact`. Needs `before_script: []` and `entrypoint: [""]` since it's not a Node image.
   - **semgrep**: SAST scanning using `semgrep/semgrep:latest` image. Scan with configs: `p/typescript`, `p/react`, `p/owasp-top-ten`, `p/security-audit`. Same non-Node overrides as gitleaks. Adjust the configs if the project doesn't use React/TypeScript.
   - **audit**: `npm audit --omit=dev --audit-level=critical`. Depends on install job.
3. **quality** — Two parallel jobs:
   - **lint**: `npm run lint` (project must have this script)
   - **typecheck**: `npm run typecheck` (project must have this script — usually `tsc --noEmit`)
4. **test** — Run `npm run test:ci` (should run vitest/jest with coverage). Add Cobertura coverage report artifact.
5. **build** — `npm run build`. Depends on lint, typecheck, and test passing. Save `dist/` as artifact.
6. **deploy** — Only runs on `main` branch. Install Vercel CLI, pull environment, build, and deploy with `$VERCEL_TOKEN`. Set the environment name and production URL. `[CHANGE: Update the URL and deployment method for your project. Remove this stage entirely if you don't use Vercel.]`
7. **post-deploy** — Only runs on `main` branch after deploy. Health check with curl retries (3 attempts, 15s apart) against the production URL. `[CHANGE: Update URLs to match your production site, or remove if not deploying.]`

Configuration details:
- Default image: `node:20-alpine`
- Default `before_script`: `'[ -d node_modules ] || npm ci'` (fallback for cache misses)
- Cache key based on `package-lock.json` hash
- Use YAML anchors for DRY rules: `.default-rules` triggers on MRs and pushes to `main`, `master`, `dev`, `dev-refactor`, `feature/*` branches. `.production-rules` triggers only on `main`.

### 2. Gitleaks Configuration (`.gitleaks.toml`)

```toml
[extend]
useDefault = true

[allowlist]
description = "Project-specific allowlist"
paths = [
  '''package-lock\.json''',
  '''\.env\.example''',
]

# If your tests use fake JWT tokens, add a rule like this:
# [[rules]]
# id = "generic-api-key"
# description = "generic-api-key"
# [rules.allowlist]
# description = "Fake test tokens"
# regexTarget = "match"
# regexes = ['''eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.test''']
```

Create an empty `.gitleaksignore` file for future per-commit fingerprint exclusions.

### 3. Pre-commit Hooks (Husky + lint-staged)

Install and configure:
- `husky` (dev dependency) — add `"prepare": "husky"` to package.json scripts
- `lint-staged` (dev dependency)

Create `.husky/pre-commit`:
```sh
if command -v gitleaks &> /dev/null; then
  gitleaks protect --staged --verbose --redact
else
  echo "⚠ gitleaks not installed — skipping secret scan (install: brew install gitleaks)"
fi

npx lint-staged
```

Create `.lintstagedrc.json`:
```json
{
  "src/**/*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "src/**/*.{json,css,md}": ["prettier --write"]
}
```

### 4. Package.json Scripts

Ensure these scripts exist (add any that are missing):
- `"lint"` — ESLint on src
- `"typecheck"` — `tsc --noEmit`
- `"test:ci"` — `vitest run --coverage` (or equivalent for jest)
- `"format"` — Prettier write
- `"format:check"` — Prettier check
- `"prepare"` — `husky`

Add these dev dependencies if not already present:
- `husky`
- `lint-staged`
- `@vitest/coverage-v8` (or `@jest/coverage` if using jest)
- `prettier` (if not already installed)

### 5. GitLab Project Settings

After pushing, the user needs to manually:
1. Go to **Settings > CI/CD > Runners** and enable **shared runners** (Instance tab)
2. If deploying with Vercel, add `VERCEL_TOKEN` as a CI/CD variable under **Settings > CI/CD > Variables** (masked and protected)

### Important Notes

- Do NOT blanket-exclude all test files from gitleaks — only exclude specific known false-positive patterns
- The gitleaks and semgrep jobs use non-Node Docker images, so they need `before_script: []` and `entrypoint: [""]` to override the default Node before_script
- The install job should override before_script with `[]` since it IS the install
- Run `npm install` after adding husky/lint-staged to regenerate `package-lock.json`
- Commit the lockfile — `npm ci` in the pipeline requires it to be in sync

---

*Based on the Matrix Portal CI/CD pipeline configuration — battle-tested in production.*
