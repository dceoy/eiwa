#!/usr/bin/env bash

set -euxo pipefail
cd "$(git rev-parse --show-toplevel)"

COOLDOWN_DAYS=1
export UV_EXCLUDE_NEWER="${COOLDOWN_DAYS} days"
export NPM_CONFIG_MIN_RELEASE_AGE="${COOLDOWN_DAYS}"
export PNPM_CONFIG_MINIMUM_RELEASE_AGE=$((COOLDOWN_DAYS * 24 * 60))

pnpm dlx oxfmt --write './**/*.md'

pnpm install --yes --force
pnpm audit --fix=override
pnpm run format
pnpm run lint:fix
pnpm run typecheck
pnpm run test

# Semgrep static analysis (same rule set as gha-for-devops).
if [[ -n "$(git ls-files -- '*.py' '*.go' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.ts' '*.tsx' '*.mts' '*.cts')" ]]; then
  uvx semgrep scan --x-parmap --jobs 2 --config p/default \
    --exclude-rule package_managers.bun.bun-missing-minimum-release-age.bun-missing-minimum-release-age \
    --exclude-rule package_managers.dependabot.dependabot-missing-cooldown.dependabot-missing-cooldown \
    --exclude-rule package_managers.npm.npm-missing-minimum-release-age.npm-missing-minimum-release-age \
    --exclude-rule package_managers.pnpm.pnpm-missing-minimum-release-age.pnpm-minimum-release-age \
    --exclude-rule package_managers.poetry.poetry-missing-solver-min-release-age.poetry-missing-solver-min-release-age \
    --exclude-rule package_managers.renovate.renovate-missing-minimum-release-age.renovate-missing-minimum-release-age \
    --exclude-rule package_managers.ruby.bundler-gemfile-missing-cooldown.bundler-gemfile-missing-cooldown \
    --exclude-rule package_managers.uv.uv-missing-dependency-cooldown.uv-missing-dependency-cooldown \
    --exclude-rule package_managers.yarn.yarn-missing-minimal-age-gate.yarn-missing-minimal-age-gate \
    --metrics off --error .
fi
