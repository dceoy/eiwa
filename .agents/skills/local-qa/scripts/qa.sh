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
