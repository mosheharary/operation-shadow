#!/bin/sh
# Keeps the node_modules volume in sync with pnpm-lock.yaml before running the command.
set -e
marker=/app/node_modules/.lockfile-hash
current=$(sha256sum /app/pnpm-lock.yaml | cut -d' ' -f1)
if [ ! -f "$marker" ] || [ "$(cat "$marker")" != "$current" ]; then
  echo "[dev-entrypoint] pnpm-lock.yaml changed; installing dependencies"
  pnpm install --frozen-lockfile --store-dir /pnpm/store
  echo "$current" > "$marker"
fi
exec "$@"
