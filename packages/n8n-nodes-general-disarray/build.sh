#!/usr/bin/env sh
# Dockerized build for n8n-nodes-general-disarray — no host node/npm needed.
# Works on arm64 (DGX Spark / GB10). Runs from the monorepo root (npm workspaces)
# so hoisted deps resolve; output lands in ./dist owned by the host user.
set -eu
cd "$(dirname "$0")/../.."
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -v "$PWD":/repo -w /repo \
  node:22-alpine \
  sh -c "npm install --no-audit --no-fund --ignore-scripts && npm run build -w n8n-nodes-general-disarray"
echo "Built:"
ls packages/n8n-nodes-general-disarray/dist/nodes/*/*.node.js packages/n8n-nodes-general-disarray/dist/credentials/*.credentials.js
