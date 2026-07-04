#!/usr/bin/env bash

set -euxo pipefail
cd "$(git rev-parse --show-toplevel)"

npx -y prettier --write './**/*.md'

pnpm install --yes --force
pnpm audit --fix=override
pnpm run format
pnpm run lint:fix
pnpm run typecheck
pnpm run test
