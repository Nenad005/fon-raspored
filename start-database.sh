#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/docker.mjs database
